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
