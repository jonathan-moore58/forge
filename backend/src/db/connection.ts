/* ------------------------------------------------------------------ */
/*  SQLite connection using Node 22+ built-in node:sqlite              */
/*  (zero native dependencies — no Python / node-gyp needed)           */
/* ------------------------------------------------------------------ */

import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
    if (_db) return _db;

    log.info(`Opening database at ${config.dbPath}`);
    _db = new DatabaseSync(config.dbPath);

    // WAL mode for concurrent reads during Express serving
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA synchronous = NORMAL');
    _db.exec('PRAGMA foreign_keys = ON');

    return _db;
}

export function closeDb(): void {
    if (_db) {
        _db.close();
        _db = null;
        log.info('Database closed');
    }
}

/**
 * Wrap a function in a SQLite transaction (BEGIN / COMMIT / ROLLBACK).
 * node:sqlite doesn't have db.transaction(), so we roll our own.
 *
 * Usage:
 *   const run = dbTransaction(db, () => { ... });
 *   run();
 */
export function dbTransaction<T>(db: DatabaseSync, fn: () => T): () => T {
    return () => {
        db.exec('BEGIN');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    };
}
