import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';
import { createLogger } from '../../utils/logger.js';
import { createMetadataEnricher } from '../../indexer/metadata-enricher.js';

const log = createLogger('route:collections');

export function collectionRoutes(): Router {
    const router = Router();
    const db = getDb();
    const enricher = createMetadataEnricher(db);

    /** GET /api/collections?verified=1&creator=...&page=1&limit=50 */
    router.get('/collections', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.verified != null) {
            conditions.push('verified = @verified');
            params.verified = Number(req.query.verified);
        }
        if (req.query.creator) {
            conditions.push('creator = @creator');
            params.creator = req.query.creator as string;
        }
        if (req.query.marketplace_registered != null) {
            conditions.push('marketplace_registered = @marketplaceRegistered');
            params.marketplaceRegistered = Number(req.query.marketplace_registered);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM collections ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM collections ${where}
            ORDER BY created_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    /** GET /api/collections/:address */
    router.get('/collections/:address', (req, res) => {
        const db = getDb();
        const row = db.prepare('SELECT * FROM collections WHERE collection_address = ?').get(req.params.address);
        if (!row) return res.status(404).json({ error: 'Collection not found' });
        res.json({ data: row });
    });

    /** GET /api/collections/:address/registration-status */
    router.get('/collections/:address/registration-status', (req, res) => {
        const db = getDb();
        const row = db.prepare(
            'SELECT marketplace_registered FROM collections WHERE collection_address = ?',
        ).get(req.params.address) as { marketplace_registered: number } | undefined;
        res.json({
            data: {
                registered: row?.marketplace_registered === 1,
                exists: !!row,
            },
        });
    });

    /**
     * POST /api/collections/register — Register a directly-deployed collection.
     *
     * @deprecated The 2-TX deploy flow now emits a CollectionConfigured event
     * on-chain during initialize(), which the indexer auto-discovers from block
     * scanning. This endpoint is kept for backward compatibility only.
     *
     * Body: { address: string, creator: string, txHash?: string }
     */
    router.post('/collections/register', (req, res) => {
        const db = getDb();
        const { address, creator, txHash } = req.body as {
            address?: string;
            creator?: string;
            txHash?: string;
        };

        if (!address || !creator) {
            return res.status(400).json({ error: 'Missing required fields: address, creator' });
        }

        // Validate address format (should be bech32m opt1s… address)
        if (!address.startsWith('opt1') && !address.startsWith('bcrt1')) {
            return res.status(400).json({ error: 'Invalid address format — expected bech32m (opt1s…)' });
        }

        // Check if already registered
        const existing = db.prepare(
            'SELECT collection_address FROM collections WHERE collection_address = ?',
        ).get(address);

        if (existing) {
            log.info(`Collection ${address} already registered — skipping insert`);
            return res.json({ data: { registered: true, existed: true } });
        }

        // Insert with collection_id = -1 (no factory-assigned ID for direct deploys)
        // The metadata enricher will fill in name, symbol, supply, etc.
        try {
            db.prepare(`
                INSERT OR IGNORE INTO collections
                    (collection_address, collection_id, creator, created_at_block)
                VALUES (@address, @collectionId, @creator, @block)
            `).run({
                address,
                collectionId: -1,
                creator,
                block: 0, // Will be updated when we see the first event
            });

            // Also insert an activity record if txHash provided
            if (txHash) {
                db.prepare(`
                    INSERT OR IGNORE INTO activity
                        (event_type, collection_address, from_address, block_number, tx_hash, log_index)
                    VALUES ('collection_deployed', @address, @creator, 0, @txHash, 0)
                `).run({ address, creator, txHash });
            }

            log.info(`Registered directly-deployed collection: ${address} by ${creator}`);
            res.json({ data: { registered: true, existed: false } });
        } catch (err) {
            log.error(`Failed to register collection ${address}:`, err);
            res.status(500).json({ error: 'Failed to register collection' });
        }
    });

    /**
     * POST /api/collections/:address/enrich — Force-enrich a collection immediately.
     *
     * If the collection doesn't exist in DB yet, inserts a placeholder row first.
     * Then calls enricher.enrichOne() to fetch metadata from chain right away.
     *
     * Body: { creator?: string }
     */
    router.post('/collections/:address/enrich', async (req, res) => {
        const { address } = req.params;
        const { creator } = req.body as { creator?: string };

        if (!address || !address.startsWith('opt1')) {
            return res.status(400).json({ error: 'Invalid address format — expected bech32m (opt1…)' });
        }

        try {
            // Ensure the collection row exists (insert if missing)
            const existing = db.prepare(
                'SELECT collection_address FROM collections WHERE collection_address = ?',
            ).get(address);

            if (!existing) {
                db.prepare(`
                    INSERT OR IGNORE INTO collections
                        (collection_address, collection_id, creator, created_at_block)
                    VALUES (@address, @collectionId, @creator, @block)
                `).run({
                    address,
                    collectionId: -1,
                    creator: creator || '',
                    block: 0,
                });
                log.info(`Inserted placeholder for ${address} before force-enrich`);
            }

            // Force-enrich from chain
            const success = await enricher.enrichOne(address);

            if (success) {
                // Return the enriched collection data
                const row = db.prepare(
                    'SELECT * FROM collections WHERE collection_address = ?',
                ).get(address);
                log.info(`Force-enriched ${address}`);
                res.json({ data: row });
            } else {
                // enrichOne returned false — contract may not be ready yet
                log.warn(`Force-enrich failed for ${address} — contract may not be deployed yet`);
                res.json({ data: null, message: 'Enrichment failed — contract may not be deployed yet. Try again later.' });
            }
        } catch (err) {
            log.error(`Force-enrich error for ${address}:`, err);
            res.status(500).json({ error: 'Failed to enrich collection' });
        }
    });

    return router;
}
