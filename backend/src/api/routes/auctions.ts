import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';

export function auctionRoutes(): Router {
    const router = Router();

    /**
     * GET /api/auctions?status=0&collection=...&page=1&limit=50
     */
    router.get('/auctions', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.status != null) {
            conditions.push('status = @status');
            params.status = Number(req.query.status);
        }
        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM auctions ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM auctions ${where}
            ORDER BY created_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    /** GET /api/auctions/:id */
    router.get('/auctions/:id', (req, res) => {
        const db = getDb();
        const row = db.prepare('SELECT * FROM auctions WHERE auction_id = ?').get(Number(req.params.id));
        if (!row) return res.status(404).json({ error: 'Auction not found' });
        res.json({ data: row });
    });

    /** GET /api/auctions/:id/bids?page=1&limit=50 */
    router.get('/auctions/:id/bids', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
        const auctionId = Number(req.params.id);

        const total = (db.prepare(
            'SELECT COUNT(*) as c FROM bids WHERE auction_id = @auctionId',
        ).get({ auctionId }) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM bids
            WHERE auction_id = @auctionId
            ORDER BY block_number DESC, id DESC
            LIMIT @limit OFFSET @offset
        `).all({ auctionId, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    return router;
}
