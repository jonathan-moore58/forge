/* ------------------------------------------------------------------ */
/*  Block poller: fetch new blocks, extract receipts, process events   */
/*                                                                     */
/*  Uses raw JSON-RPC fetch so we keep `contractAddress` on events     */
/*  (the SDK's TransactionReceipt strips it during parsing).           */
/* ------------------------------------------------------------------ */

import { config } from '../config.js';
import { getDb, dbTransaction } from '../db/connection.js';
import { createLogger } from '../utils/logger.js';
import { createReceiptProcessor } from './receipt-processor.js';
import { createMetadataEnricher } from './metadata-enricher.js';

const log = createLogger('poller');

/**
 * How many blocks to fetch per batch during catchup.
 * Light blocks (< 3300): large batches. Heavy blocks (3300+): smaller batches.
 */
const CATCHUP_BATCH_LIGHT = 20;
const CATCHUP_BATCH_HEAVY = 5;
const HEAVY_BLOCK_THRESHOLD = 3300;

// ── Raw RPC types (subset we need) ──────────────────────────────────

interface RpcTx {
    hash: string;
    OPNetType?: string;
}

interface RpcBlock {
    height: string | number;
    hash: string;
    txCount: number;
    transactions?: RpcTx[];
}

interface RpcReceipt {
    events?: unknown;
    receipt?: string;
    revert?: string;
    gasUsed?: string;
}

// ── JSON-RPC helper ─────────────────────────────────────────────────

async function rpcCall<T = unknown>(method: string, params: unknown[] = [], timeoutMs = 60_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: controller.signal,
    });
    clearTimeout(timer);

    const json = (await res.json()) as { result?: T; error?: { message: string; code?: number } };
    if (json.error) {
        throw new Error(`RPC ${method}: ${json.error.message} (code ${json.error.code ?? '?'})`);
    }
    return json.result as T;
}

/** Convert an RPC block height (hex like "0xb5c" or number) to a JS number */
function toBlockNum(raw: string | number): number {
    if (typeof raw === 'number') return raw;
    if (raw.startsWith('0x')) return parseInt(raw, 16);
    return Number(raw);
}

/** Small delay to avoid hammering the RPC during catchup */
function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Poller ───────────────────────────────────────────────────────────

export function startPoller(): { stop: () => void } {
    const db = getDb();
    const enricher = createMetadataEnricher(db);

    // ── Sync-state helpers ──
    const getSyncState = db.prepare('SELECT last_block FROM sync_state WHERE id = 1');
    const setSyncState = db.prepare('UPDATE sync_state SET last_block = @block, updated_at = datetime(\'now\') WHERE id = 1');

    let running = true;
    let processor: Awaited<ReturnType<typeof createReceiptProcessor>> | null = null;

    async function poll(): Promise<void> {
        // Resolve bech32m → hex contract addresses before processing
        processor = await createReceiptProcessor(db);
        while (running) {
            try {
                await pollOnce();
            } catch (err) {
                log.error('Poll cycle error:', err);
            }

            // After each poll cycle, enrich any collections missing metadata
            try {
                await enricher.enrichPending();
            } catch (err) {
                log.warn('Metadata enrichment error (non-fatal):', err);
            }

            // Refresh live state (sale_phase, totalSupply) for all collections
            // since setMintOpen() and mint() don't emit events
            try {
                await enricher.refreshLiveState();
            } catch (err) {
                log.warn('Live state refresh error (non-fatal):', err);
            }

            // Reload collection addresses from DB — picks up directly-deployed
            // collections registered via POST /api/collections/register
            try {
                await processor!.reloadCollectionAddresses();
            } catch (err) {
                log.warn('Collection address reload error (non-fatal):', err);
            }

            if (running) await delay(config.pollIntervalMs);
        }
    }

    async function pollOnce(): Promise<void> {
        // 1. Where did we leave off?
        const state = getSyncState.get() as { last_block: number } | undefined;
        let lastBlock = state?.last_block ?? config.startBlock;

        // 2. What's the chain tip?
        const tipRaw = await rpcCall<string | number>('btc_blockNumber');
        const tip = toBlockNum(tipRaw);

        if (tip <= lastBlock) {
            log.debug(`At tip (block ${tip}), sleeping…`);
            return;
        }

        const blocksToProcess = tip - lastBlock;
        log.info(`${blocksToProcess} new block(s): ${lastBlock + 1} → ${tip}`);

        // 3. Process blocks — in batches during catchup, one-by-one at tip
        while (lastBlock < tip && running) {
            const remaining = tip - lastBlock;
            const batchStart = lastBlock + 1;
            // Adaptive batch size: heavy blocks (3300+) get small batches
            const maxBatch = batchStart >= HEAVY_BLOCK_THRESHOLD ? CATCHUP_BATCH_HEAVY : CATCHUP_BATCH_LIGHT;
            const batchSize = remaining > maxBatch ? maxBatch : remaining;
            const batchEnd = lastBlock + batchSize;

            if (remaining > maxBatch) {
                if (batchStart % 100 < maxBatch || batchStart === lastBlock + 1) {
                    log.info(`Catchup: blocks ${batchStart}–${batchEnd} / ${tip} (${remaining} remaining, batch=${batchSize})`);
                }
            } else {
                log.info(`Processing block ${batchStart}/${tip}…`);
            }

            // Fetch blocks in parallel (longer timeout for heavy blocks)
            const heights = Array.from({ length: batchSize }, (_, i) => batchStart + i);
            const fetchTimeout = batchStart >= HEAVY_BLOCK_THRESHOLD ? 120_000 : 60_000;
            const blocks = await Promise.all(
                heights.map((h) => rpcCall<RpcBlock | null>('btc_getBlockByNumber', [h, true], fetchTimeout).catch((err) => {
                    log.warn(`Failed to fetch block ${h}:`, err);
                    return null;
                })),
            );

            // Process sequentially (DB writes must be ordered)
            // B-C1: Track the last successfully processed block (null blocks stop the batch)
            let lastSuccessful = lastBlock;
            for (let i = 0; i < blocks.length; i++) {
                if (!running) break;
                if (!blocks[i]) {
                    // Null block — stop batch here, will retry next cycle
                    log.warn(`Block ${heights[i]} returned null — stopping batch, will retry`);
                    break;
                }
                await processBlockData(heights[i]!, blocks[i]);
                lastSuccessful = heights[i]!;
            }

            lastBlock = lastSuccessful;

            // Minimal pause between batches
            if (remaining > maxBatch) await delay(100);
        }
    }

    /**
     * Process a single block's data — either from a prefetched RpcBlock
     * or null (block was unreachable, just advance sync state).
     */
    async function processBlockData(height: number, block: RpcBlock | null): Promise<void> {
        if (!block) {
            // B-C1: Do NOT advance sync_state when block is null — will retry next cycle
            log.warn(`Block ${height} returned null — will retry next cycle`);
            return;
        }

        const txCount = block.transactions?.length ?? 0;
        if (txCount === 0) {
            setSyncState.run({ block: height });
            return;
        }

        // Collect all events from prefetched txs
        const allTxEvents: Array<{ events: unknown; hash: string }> = [];

        for (const tx of block.transactions ?? []) {
            if (tx.OPNetType === 'Generic') continue;
            const txEvents = (tx as any).events;
            if (txEvents) {
                allTxEvents.push({ events: txEvents, hash: tx.hash });
            }
        }

        // Fetch receipts in parallel for txs that didn't have inline events
        const needReceipt = (block.transactions ?? []).filter(
            (tx) => tx.OPNetType !== 'Generic' && !(tx as any).events,
        );
        const RECEIPT_BATCH = 50;
        for (let i = 0; i < needReceipt.length; i += RECEIPT_BATCH) {
            const batch = needReceipt.slice(i, i + RECEIPT_BATCH);
            const results = await Promise.all(
                batch.map((tx) =>
                    rpcCall<RpcReceipt>('btc_getTransactionReceipt', [tx.hash])
                        .then((r) => (r?.events ? { events: r.events, hash: tx.hash } : null))
                        .catch(() => null),
                ),
            );
            for (const r of results) {
                if (r) allTxEvents.push(r);
            }
        }

        // Process everything inside a single DB transaction
        try {
            dbTransaction(db, () => {
                for (const { events, hash } of allTxEvents) {
                    processor!.processReceipt(events, height, hash);
                }
                processor!.expireStaleOffers(height);
                setSyncState.run({ block: height });
            })();

            if (allTxEvents.length > 0) {
                log.info(`Block ${height}: processed ${allTxEvents.length} tx(s) with events`);
            }

            // Resolve any newly-discovered collection addresses (async RPC calls)
            await processor!.resolvePendingCollections();
        } catch (err) {
            log.error(`Failed to process block ${height}:`, err);
            throw err;
        }
    }

    // Kick off the loop
    poll().catch((err) => {
        log.error('Fatal poller error:', err);
    });

    return {
        stop() {
            log.info('Stopping poller…');
            running = false;
        },
    };
}
