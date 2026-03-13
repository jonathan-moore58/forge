/* ------------------------------------------------------------------ */
/*  FORGE Light Indexer — Entry point                                  */
/*                                                                     */
/*  Starts the block poller + Express API server.                      */
/*  Usage:   npm run dev       (tsx watch)                             */
/*           npm run build     (tsc → dist/)                           */
/*           npm start         (node dist/index.js)                    */
/*  Marketplace v3: opt1sqryshl02q9g2cnhvnuqmx3s8luhp6kt8au4qy800     */
/*  AuctionHouse v2: opt1sqzxvvkhrgk0wnvk7mhcuukn6essrdkhgny3tuka0    */
/* ------------------------------------------------------------------ */

// VPN workaround: Node.js native fetch uses bundled OpenSSL which
// bypasses Hotspot Shield VPN adapter. curl uses Windows Schannel
// which routes through VPN correctly.
import './utils/curl-fetch.js';

import { config } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { initSchema } from './db/schema.js';
import { initAddressNetwork } from './utils/address.js';
import { createLogger } from './utils/logger.js';
import { startPoller } from './indexer/poller.js';
import { startApiServer } from './api/server.js';

const log = createLogger('main');

// ── Bootstrap ───────────────────────────────────────────────────────

log.info('╔══════════════════════════════════════╗');
log.info('║   FORGE Light Indexer  v0.1.0        ║');
log.info('╚══════════════════════════════════════╝');
log.info(`Network:  ${config.network}`);
log.info(`RPC:      ${config.rpcUrl}`);
log.info(`DB:       ${config.dbPath}`);
log.info(`Port:     ${config.port}`);

// Initialise address encoding for the configured network
initAddressNetwork();

// Open DB + ensure schema exists
const db = getDb();
initSchema(db);

// ── Cleanup: purge data from before START_BLOCK ─────────────────────
// On HF Spaces (or any restart), old test collections from earlier
// indexer runs may persist. Purge them so only data >= START_BLOCK shows.
// Also fast-forward sync_state if it's behind START_BLOCK to avoid
// re-processing thousands of old blocks on restart.
if (config.startBlock > 0) {
    // Fast-forward sync_state to START_BLOCK if behind
    const state = db.prepare('SELECT last_block FROM sync_state WHERE id = 1').get() as { last_block: number } | undefined;
    if (state && state.last_block < config.startBlock) {
        log.info(`Fast-forwarding sync_state from block ${state.last_block} → ${config.startBlock}`);
        db.prepare('UPDATE sync_state SET last_block = @block WHERE id = 1').run({ block: config.startBlock });
    }

    // Purge old collections and their related data
    const stale = db.prepare(`
        SELECT collection_address FROM collections
        WHERE created_at_block > 0 AND created_at_block < @startBlock
    `).all({ startBlock: config.startBlock }) as { collection_address: string }[];

    if (stale.length > 0) {
        log.info(`Purging ${stale.length} collection(s) from before START_BLOCK (${config.startBlock})…`);
        for (const { collection_address: addr } of stale) {
            db.prepare('DELETE FROM tokens WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM listings WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM offers WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM auctions WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM staking_positions WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM loans WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM activity WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM collection_stats_snapshots WHERE collection_address = ?').run(addr);
            db.prepare('DELETE FROM collections WHERE collection_address = ?').run(addr);
            log.info(`  Purged: ${addr}`);
        }
    }
}

// Start block poller (background async loop)
const poller = startPoller();

// Start Express API server
startApiServer();

// ── Graceful shutdown ───────────────────────────────────────────────

function shutdown(signal: string) {
    log.info(`Received ${signal}, shutting down…`);
    poller.stop();
    closeDb();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
