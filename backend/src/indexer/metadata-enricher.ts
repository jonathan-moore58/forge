/* ------------------------------------------------------------------ */
/*  Metadata enricher: fetch name, symbol, supply, etc. from chain     */
/*                                                                     */
/*  After CollectionCreated fires, the DB row has only the address,    */
/*  creator, and block number.  This module uses the OPNet SDK to      */
/*  call view functions on each collection contract and fill in the    */
/*  remaining columns (name, symbol, maxSupply, mintPrice, etc.).      */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import {
    JSONRpcProvider,
    getContract,
    OP_721_ABI,
    type IOP721Contract,
    ABIDataTypes,
    BitcoinAbiTypes,
    type BitcoinInterfaceAbi,
} from 'opnet';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { resolveContractHex, getNetwork } from '../utils/address.js';

const log = createLogger('metadata-enricher');

/** How many collections to enrich per poll cycle */
const ENRICH_BATCH_SIZE = 5;

/** Delay between RPC calls to avoid rate limiting (ms) */
const RPC_DELAY_MS = 200;

// ── FORGE-specific ABI extensions (appended to OP_721_ABI) ──────────

const FORGE_COLLECTION_EXTENSIONS: BitcoinInterfaceAbi = [
    {
        name: 'currentPrice',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'isMintOpen',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'open', type: ABIDataTypes.BOOL }],
    },
];

/** Combined ABI: standard OP721 + FORGE-specific methods */
const COLLECTION_ABI: BitcoinInterfaceAbi = [
    ...OP_721_ABI,
    ...FORGE_COLLECTION_EXTENSIONS,
];

// ── Provider singleton ──────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;

function getProvider(): JSONRpcProvider {
    if (!_provider) {
        const net = getNetwork();
        // SDK auto-appends /api/v1/json-rpc if not present
        _provider = new JSONRpcProvider({
            url: config.rpcUrl,
            network: net,
        });
    }
    return _provider;
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Enrichment result ───────────────────────────────────────────────

interface CollectionMetadata {
    name: string;
    symbol: string;
    maxSupply: number;
    totalSupply: number;
    mintPrice: string;
    royaltyBps: number;
    salePhase: number;
    baseUri: string;
    icon: string;
    banner: string;
    description: string;
    website: string;
}

// ── Core enrichment function ────────────────────────────────────────

/**
 * Fetch metadata for a single collection from on-chain.
 * Returns null if the RPC calls fail (contract may not be a valid OP721).
 */
async function fetchCollectionMetadata(address: string): Promise<CollectionMetadata | null> {
    try {
        const provider = getProvider();
        const net = getNetwork();

        // Resolve the bech32m address to the 32-byte contract public key hex
        // via btc_getCode(). The SDK's getContract() needs this public key,
        // NOT the 21-byte witness program that bech32m encodes.
        const resolved = await resolveContractHex(address);
        if (!resolved) {
            log.warn(`Could not resolve contract public key for ${address}`);
            return null;
        }
        const contractAddr = resolved.startsWith('0x') ? resolved : '0x' + resolved;
        const contract = getContract<IOP721Contract>(contractAddr, COLLECTION_ABI, provider, net);

        // 1. Call metadata() — standard OP721 method
        //    Returns: name, symbol, icon, banner, description, website, totalSupply, domainSeparator
        const metaResult = await contract.metadata();
        const meta = metaResult.properties;

        await delay(RPC_DELAY_MS);

        // 2. Call maxSupply() — standard OP721 method
        let maxSupply = 0;
        try {
            const maxResult = await contract.maxSupply();
            maxSupply = Number(maxResult.properties.maxSupply);
        } catch {
            // Some contracts may not implement maxSupply
            log.debug(`maxSupply() not available for ${address}`);
        }

        await delay(RPC_DELAY_MS);

        // 3. Call currentPrice() — FORGE CollectionTemplate method
        let mintPrice = '0';
        try {
            const priceResult = await (contract as any).currentPrice();
            mintPrice = String(priceResult.properties.price ?? 0n);
        } catch {
            log.debug(`currentPrice() not available for ${address}`);
        }

        await delay(RPC_DELAY_MS);

        // 4. Call isMintOpen() — FORGE CollectionTemplate method
        //    Map to sale_phase for the frontend:
        //      _mintOpen = true  → phase 2 (public sale / live)
        //      _mintOpen = false → phase 0 (inactive / upcoming)
        let salePhase = 0;
        let royaltyBps = 0;
        try {
            const mintOpenResult = await (contract as any).isMintOpen();
            const isOpen = mintOpenResult.properties.open;
            salePhase = isOpen ? 2 : 0;
        } catch {
            log.debug(`isMintOpen() not available for ${address}`);
        }

        await delay(RPC_DELAY_MS);

        // 5. Call tokenURI(1) to derive base_uri (strips trailing "1")
        //    Falls back to empty string if no tokens minted yet.
        let baseUri = '';
        try {
            const uriResult = await contract.tokenURI(1n);
            const fullUri = uriResult.properties.uri ?? '';
            if (fullUri) {
                // Strip trailing token ID to get the base URI
                // e.g. "ipfs://QmXyz/1" → "ipfs://QmXyz/"
                //      "ipfs://QmXyz/1.json" → "ipfs://QmXyz/"  (strip "1.json")
                baseUri = fullUri.replace(/1(\.json)?$/, '');
            }
        } catch {
            log.debug(`tokenURI(1) not available for ${address}`);
        }

        return {
            name: meta.name || '',
            symbol: meta.symbol || '',
            maxSupply,
            totalSupply: Number(meta.totalSupply ?? 0n),
            mintPrice,
            royaltyBps,
            salePhase,
            baseUri,
            icon: meta.icon || '',
            banner: meta.banner || '',
            description: meta.description || '',
            website: meta.website || '',
        };
    } catch (err) {
        log.warn(`Failed to fetch metadata for ${address}:`, err instanceof Error ? err.message : err);
        return null;
    }
}

// ── Public API ──────────────────────────────────────────────────────

export function createMetadataEnricher(db: DatabaseSync) {
    // Prepared statements
    const findUnenriched = db.prepare(`
        SELECT collection_address FROM collections
        WHERE name = '' OR name IS NULL OR name = '(unknown)'
        LIMIT @limit
    `);

    const updateMetadata = db.prepare(`
        UPDATE collections SET
            name = @name,
            symbol = @symbol,
            max_supply = @maxSupply,
            total_supply = @totalSupply,
            mint_price = @mintPrice,
            royalty_bps = @royaltyBps,
            sale_phase = @salePhase,
            base_uri = CASE WHEN @baseUri != '' THEN @baseUri ELSE base_uri END,
            icon = CASE WHEN @icon != '' THEN @icon ELSE icon END,
            banner = CASE WHEN @banner != '' THEN @banner ELSE banner END,
            description = CASE WHEN @description != '' THEN @description ELSE description END,
            website = CASE WHEN @website != '' THEN @website ELSE website END
        WHERE collection_address = @collectionAddress
    `);

    /** B-H9: Batch refresh — only 10 oldest-refreshed collections per cycle */
    const findAllEnriched = db.prepare(`
        SELECT collection_address, sale_phase, base_uri, icon, banner, description, website
        FROM collections
        WHERE name IS NOT NULL AND name != '' AND name != '(unknown)'
        ORDER BY COALESCE(last_refreshed, 0) ASC
        LIMIT 10
    `);

    /** B-H9: Update last_refreshed timestamp after refresh */
    const markRefreshed = db.prepare(`
        UPDATE collections SET last_refreshed = unixepoch('now')
        WHERE collection_address = @collectionAddress
    `);

    /** Lightweight update: sale_phase + total_supply + optionally base_uri + branding */
    const updateLiveState = db.prepare(`
        UPDATE collections SET
            sale_phase = @salePhase,
            total_supply = @totalSupply,
            base_uri = CASE WHEN @baseUri != '' THEN @baseUri ELSE base_uri END,
            icon = CASE WHEN @icon != '' THEN @icon ELSE icon END,
            banner = CASE WHEN @banner != '' THEN @banner ELSE banner END,
            description = CASE WHEN @description != '' THEN @description ELSE description END,
            website = CASE WHEN @website != '' THEN @website ELSE website END
        WHERE collection_address = @collectionAddress
    `);

    return {
        /**
         * Enrich collections that are missing metadata.
         * Call this after each poll cycle — it processes a small batch
         * so it doesn't block the poller.
         *
         * @returns Number of collections enriched
         */
        async enrichPending(): Promise<number> {
            const rows = findUnenriched.all({ limit: ENRICH_BATCH_SIZE }) as {
                collection_address: string;
            }[];

            if (rows.length === 0) return 0;

            log.info(`Enriching metadata for ${rows.length} collection(s)…`);
            let enriched = 0;

            for (const row of rows) {
                const addr = row.collection_address;
                const meta = await fetchCollectionMetadata(addr);

                if (meta) {
                    updateMetadata.run({
                        name: meta.name,
                        symbol: meta.symbol,
                        maxSupply: meta.maxSupply,
                        totalSupply: meta.totalSupply,
                        mintPrice: meta.mintPrice,
                        royaltyBps: meta.royaltyBps,
                        salePhase: meta.salePhase,
                        baseUri: meta.baseUri,
                        icon: meta.icon,
                        banner: meta.banner,
                        description: meta.description,
                        website: meta.website,
                        collectionAddress: addr,
                    });
                    log.info(`  ${addr} → "${meta.name}" (${meta.symbol}) supply=${meta.totalSupply}/${meta.maxSupply} icon=${meta.icon ? 'yes' : 'no'} banner=${meta.banner ? 'yes' : 'no'}`);
                    enriched++;
                } else {
                    // Mark as attempted so we don't retry forever
                    // Set name to a placeholder that indicates fetch failed
                    updateMetadata.run({
                        name: '(unknown)',
                        symbol: '',
                        maxSupply: 0,
                        totalSupply: 0,
                        mintPrice: '0',
                        royaltyBps: 0,
                        salePhase: 0,
                        baseUri: '',
                        icon: '',
                        banner: '',
                        description: '',
                        website: '',
                        collectionAddress: addr,
                    });
                    log.warn(`  ${addr} → metadata fetch failed, marked as (unknown)`);
                }

                await delay(RPC_DELAY_MS);
            }

            return enriched;
        },

        /**
         * Re-enrich a single collection by address.
         * Useful for manual refresh or after Revealed event.
         */
        async enrichOne(address: string): Promise<boolean> {
            const meta = await fetchCollectionMetadata(address);
            if (!meta) return false;

            updateMetadata.run({
                name: meta.name,
                symbol: meta.symbol,
                maxSupply: meta.maxSupply,
                totalSupply: meta.totalSupply,
                mintPrice: meta.mintPrice,
                royaltyBps: meta.royaltyBps,
                salePhase: meta.salePhase,
                baseUri: meta.baseUri,
                icon: meta.icon,
                banner: meta.banner,
                description: meta.description,
                website: meta.website,
                collectionAddress: address,
            });
            return true;
        },

        /**
         * Lightweight refresh of live state (sale_phase + total_supply) for
         * ALL enriched collections.
         *
         * Why: setMintOpen() / mint() don't emit events, so the only way to
         * detect changes is to poll the contract.  This runs each cycle and
         * only issues 2 RPC calls per collection (isMintOpen + metadata for
         * totalSupply), then writes a single row if anything changed.
         */
        async refreshLiveState(): Promise<number> {
            const rows = findAllEnriched.all() as {
                collection_address: string;
                sale_phase: number | null;
                base_uri: string | null;
                icon: string | null;
                banner: string | null;
                description: string | null;
                website: string | null;
            }[];

            if (rows.length === 0) return 0;

            let updated = 0;

            for (const row of rows) {
                const addr = row.collection_address;
                try {
                    const provider = getProvider();
                    const net = getNetwork();

                    const resolved = await resolveContractHex(addr);
                    if (!resolved) continue;
                    const contractAddr = resolved.startsWith('0x') ? resolved : '0x' + resolved;
                    const contract = getContract<IOP721Contract>(contractAddr, COLLECTION_ABI, provider, net);

                    // Check isMintOpen
                    let salePhase = 0;
                    try {
                        const mintOpenResult = await (contract as any).isMintOpen();
                        const isOpen = mintOpenResult.properties.open;
                        salePhase = isOpen ? 2 : 0;
                    } catch {
                        // Contract may not support isMintOpen
                        continue;
                    }

                    await delay(RPC_DELAY_MS);

                    // Check totalSupply + branding via metadata()
                    let totalSupply = 0;
                    let icon = '';
                    let banner = '';
                    let description = '';
                    let website = '';
                    try {
                        const metaResult = await contract.metadata();
                        const meta = metaResult.properties;
                        totalSupply = Number(meta.totalSupply ?? 0n);
                        icon = meta.icon || '';
                        banner = meta.banner || '';
                        description = meta.description || '';
                        website = meta.website || '';
                    } catch {
                        // If metadata fails, just update sale_phase
                    }

                    // Fetch base_uri if missing and tokens exist
                    let baseUri = '';
                    if (!row.base_uri && totalSupply > 0) {
                        try {
                            await delay(RPC_DELAY_MS);
                            const uriResult = await contract.tokenURI(1n);
                            const fullUri = uriResult.properties.uri ?? '';
                            if (fullUri) {
                                baseUri = fullUri.replace(/1(\.json)?$/, '');
                            }
                        } catch {
                            // tokenURI not available
                        }
                    }

                    // Detect branding updates (new branding when DB had none)
                    const brandingChanged =
                        (icon && !row.icon) ||
                        (banner && !row.banner) ||
                        (description && !row.description) ||
                        (website && !row.website);

                    // Only write if something changed
                    const oldPhase = row.sale_phase ?? 0;
                    if (salePhase !== oldPhase || totalSupply > 0 || baseUri || brandingChanged) {
                        updateLiveState.run({
                            salePhase,
                            totalSupply,
                            baseUri,
                            icon,
                            banner,
                            description,
                            website,
                            collectionAddress: addr,
                        });

                        if (salePhase !== oldPhase) {
                            log.info(`  ${addr} → sale_phase changed: ${oldPhase} → ${salePhase}`);
                        }
                        if (brandingChanged) {
                            log.info(`  ${addr} → branding updated: icon=${icon ? 'yes' : 'no'} banner=${banner ? 'yes' : 'no'}`);
                        }
                        updated++;
                    }

                    // B-H9: Mark as refreshed so it goes to the back of the queue
                    markRefreshed.run({ collectionAddress: addr });

                    await delay(RPC_DELAY_MS);
                } catch (err) {
                    log.warn(`refreshLiveState failed for ${addr}:`, err instanceof Error ? err.message : err);
                }
            }

            if (updated > 0) {
                log.info(`Refreshed live state for ${updated} collection(s)`);
            }

            return updated;
        },
    };
}
