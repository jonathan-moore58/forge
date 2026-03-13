import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './connection.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('schema');

const TABLES = `
-- Sync state: tracks last indexed block for crash recovery
CREATE TABLE IF NOT EXISTS sync_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_block  INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO sync_state (id, last_block) VALUES (1, 0);

-- Collections: from Factory/Registry CollectionCreated + RPC metadata
CREATE TABLE IF NOT EXISTS collections (
    collection_address  TEXT    PRIMARY KEY,
    collection_id       INTEGER NOT NULL,
    creator             TEXT    NOT NULL,
    name                TEXT    NOT NULL DEFAULT '',
    symbol              TEXT    NOT NULL DEFAULT '',
    max_supply          INTEGER NOT NULL DEFAULT 0,
    total_supply        INTEGER NOT NULL DEFAULT 0,
    mint_price          TEXT    NOT NULL DEFAULT '0',
    royalty_bps         INTEGER NOT NULL DEFAULT 0,
    sale_phase          INTEGER NOT NULL DEFAULT 0,
    is_revealed         INTEGER NOT NULL DEFAULT 0,
    verified            INTEGER NOT NULL DEFAULT 0,
    base_uri            TEXT    NOT NULL DEFAULT '',
    icon                TEXT    NOT NULL DEFAULT '',
    banner              TEXT    NOT NULL DEFAULT '',
    description         TEXT    NOT NULL DEFAULT '',
    website             TEXT    NOT NULL DEFAULT '',
    marketplace_registered INTEGER NOT NULL DEFAULT 0,
    created_at_block    INTEGER NOT NULL,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Tokens: from Minted + Transfer events
CREATE TABLE IF NOT EXISTS tokens (
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    owner               TEXT    NOT NULL,
    minter              TEXT    NOT NULL,
    metadata_uri        TEXT    NOT NULL DEFAULT '',
    minted_at_block     INTEGER NOT NULL,
    PRIMARY KEY (collection_address, token_id)
);

-- Listings: from NFTListed/NFTSold/ListingCancelled
CREATE TABLE IF NOT EXISTS listings (
    listing_id          INTEGER PRIMARY KEY,
    seller              TEXT    NOT NULL,
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    price               TEXT    NOT NULL,
    status              INTEGER NOT NULL DEFAULT 0,
    buyer               TEXT,
    sold_price          TEXT,
    created_at_block    INTEGER NOT NULL,
    updated_at_block    INTEGER
);

-- Offers: from OfferMade/OfferAccepted/OfferCancelled
CREATE TABLE IF NOT EXISTS offers (
    offer_id            INTEGER PRIMARY KEY,
    offerer             TEXT    NOT NULL,
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    price               TEXT    NOT NULL,
    expiry_block        INTEGER NOT NULL,
    status              INTEGER NOT NULL DEFAULT 0,
    seller              TEXT,
    buyer               TEXT,
    accepted_price      TEXT,
    created_at_block    INTEGER NOT NULL,
    updated_at_block    INTEGER
);

-- Auctions: from AuctionCreated/AuctionSettled
CREATE TABLE IF NOT EXISTS auctions (
    auction_id          INTEGER PRIMARY KEY,
    seller              TEXT    NOT NULL,
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    auction_type        INTEGER NOT NULL DEFAULT 0,
    start_price         TEXT    NOT NULL,
    reserve_price       TEXT    NOT NULL DEFAULT '0',
    end_price           TEXT    NOT NULL DEFAULT '0',
    start_block         INTEGER NOT NULL DEFAULT 0,
    end_block           INTEGER NOT NULL,
    highest_bid         TEXT    NOT NULL DEFAULT '0',
    highest_bidder      TEXT,
    bid_count           INTEGER NOT NULL DEFAULT 0,
    status              INTEGER NOT NULL DEFAULT 0,
    winner              TEXT,
    final_price         TEXT,
    created_at_block    INTEGER NOT NULL,
    settled_at_block    INTEGER
);

-- Bids: from BidPlaced
CREATE TABLE IF NOT EXISTS bids (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id      INTEGER NOT NULL,
    bidder          TEXT    NOT NULL,
    amount          TEXT    NOT NULL,
    new_end_block   INTEGER NOT NULL,
    block_number    INTEGER NOT NULL,
    FOREIGN KEY (auction_id) REFERENCES auctions(auction_id)
);

-- Staking positions: from NFTStaked/NFTUnstaked
CREATE TABLE IF NOT EXISTS staking_positions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    staker              TEXT    NOT NULL,
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    pool_id             INTEGER NOT NULL,
    status              INTEGER NOT NULL DEFAULT 0,
    rewards_claimed     TEXT    NOT NULL DEFAULT '0',
    staked_at_block     INTEGER NOT NULL,
    unstaked_at_block   INTEGER,
    UNIQUE(collection_address, token_id, pool_id, staked_at_block)
);

-- Activity: unified event feed
CREATE TABLE IF NOT EXISTS activity (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type          TEXT    NOT NULL,
    collection_address  TEXT,
    token_id            INTEGER,
    from_address        TEXT,
    to_address          TEXT,
    price               TEXT,
    block_number        INTEGER NOT NULL,
    tx_hash             TEXT    NOT NULL,
    log_index           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Collection stats snapshots
CREATE TABLE IF NOT EXISTS collection_stats_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_address  TEXT    NOT NULL,
    floor_price         TEXT    NOT NULL DEFAULT '0',
    total_volume        TEXT    NOT NULL DEFAULT '0',
    listed_count        INTEGER NOT NULL DEFAULT 0,
    sales_count         INTEGER NOT NULL DEFAULT 0,
    owner_count         INTEGER NOT NULL DEFAULT 0,
    block_number        INTEGER NOT NULL,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Loans: from LoanRequestCreated/LoanFunded/LoanRepaid/LoanDefaulted/LoanCancelled
CREATE TABLE IF NOT EXISTS loans (
    loan_id             INTEGER PRIMARY KEY,
    borrower            TEXT    NOT NULL,
    lender              TEXT,
    collection_address  TEXT    NOT NULL,
    token_id            INTEGER NOT NULL,
    payment_token       TEXT    NOT NULL,
    amount              TEXT    NOT NULL,
    interest_bps        INTEGER NOT NULL,
    duration_blocks     INTEGER NOT NULL,
    start_block         INTEGER,
    status              INTEGER NOT NULL DEFAULT 0,
    created_at_block    INTEGER NOT NULL,
    updated_at_block    INTEGER
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_collections_creator ON collections(creator);
CREATE INDEX IF NOT EXISTS idx_collections_verified ON collections(verified);
CREATE INDEX IF NOT EXISTS idx_collections_marketplace_reg ON collections(marketplace_registered);

CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens(owner);
CREATE INDEX IF NOT EXISTS idx_tokens_collection ON tokens(collection_address);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_collection ON listings(collection_address, status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller, status);
CREATE INDEX IF NOT EXISTS idx_listings_token ON listings(collection_address, token_id);

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_offerer ON offers(offerer, status);
CREATE INDEX IF NOT EXISTS idx_offers_collection ON offers(collection_address, status);
CREATE INDEX IF NOT EXISTS idx_offers_token ON offers(collection_address, token_id);

CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_collection ON auctions(collection_address, status);

CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auction_id);

CREATE INDEX IF NOT EXISTS idx_staking_staker ON staking_positions(staker, status);
CREATE INDEX IF NOT EXISTS idx_staking_collection ON staking_positions(collection_address);

CREATE INDEX IF NOT EXISTS idx_activity_collection ON activity(collection_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_activity_address ON activity(from_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(event_type, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_activity_block ON activity(block_number DESC);

CREATE INDEX IF NOT EXISTS idx_stats_collection_block ON collection_stats_snapshots(collection_address, block_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_dedup ON activity(tx_hash, event_type, COALESCE(collection_address, ''), COALESCE(token_id, -1));

CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower, status);
CREATE INDEX IF NOT EXISTS idx_loans_lender ON loans(lender, status);
CREATE INDEX IF NOT EXISTS idx_loans_collection ON loans(collection_address, status);
`;

export function initSchema(db?: DatabaseSync): void {
    const conn = db ?? getDb();
    log.info('Initializing database schema...');

    // Execute table creation (split by semicolons, skip empty)
    for (const stmt of TABLES.split(';')) {
        const trimmed = stmt.trim();
        if (trimmed) conn.exec(trimmed);
    }

    // Migrations for existing databases (run BEFORE indexes, since indexes may reference new columns)
    try {
        conn.exec('ALTER TABLE collections ADD COLUMN marketplace_registered INTEGER NOT NULL DEFAULT 0');
        log.info('Migration: added marketplace_registered column');
    } catch {
        // Column already exists — ignore
    }
    for (const col of ['icon', 'banner', 'description', 'website'] as const) {
        try {
            conn.exec(`ALTER TABLE collections ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
            log.info(`Migration: added ${col} column`);
        } catch {
            // Column already exists — ignore
        }
    }

    // B-H9: Add last_refreshed column for batched live state refresh
    try {
        conn.exec('ALTER TABLE collections ADD COLUMN last_refreshed INTEGER DEFAULT 0');
        log.info('Migration: added last_refreshed column');
    } catch {
        // Column already exists — ignore
    }

    // Dedup: contract_hex stores the canonical 32-byte contract public key hex.
    // Both the indexer (hex) and the enrichCollection endpoint (bech32m) resolve
    // to the same hex. A UNIQUE index on this column prevents duplicate rows.
    try {
        conn.exec('ALTER TABLE collections ADD COLUMN contract_hex TEXT');
        log.info('Migration: added contract_hex column');
    } catch {
        // Column already exists — ignore
    }
    try {
        conn.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_contract_hex ON collections(contract_hex) WHERE contract_hex IS NOT NULL');
        log.info('Migration: added contract_hex unique index');
    } catch {
        // Index already exists — ignore
    }

    // Execute index creation (after migrations so new columns are available)
    for (const stmt of INDEXES.split(';')) {
        const trimmed = stmt.trim();
        if (trimmed) conn.exec(trimmed);
    }

    log.info('Schema initialized (11 tables)');
}

export function resetSchema(db?: DatabaseSync): void {
    const conn = db ?? getDb();
    log.warn('Dropping all tables...');
    const tables = [
        'collection_stats_snapshots', 'activity', 'staking_positions',
        'loans', 'bids', 'auctions', 'offers', 'listings', 'tokens', 'collections', 'sync_state',
    ];
    for (const t of tables) {
        conn.exec(`DROP TABLE IF EXISTS ${t}`);
    }
    initSchema(conn);
}
