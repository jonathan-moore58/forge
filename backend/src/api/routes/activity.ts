import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';

export function activityRoutes(): Router {
    const router = Router();

    /**
     * GET /api/activity?collection=...&address=...&type=sale&page=1&limit=50
     *
     * address: matches from_address OR to_address
     * type: event_type filter (mint, list, sale, transfer, bid, etc.)
     */
    router.get('/activity', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }
        if (req.query.address) {
            conditions.push('(from_address = @address OR to_address = @address)');
            params.address = req.query.address as string;
        }
        if (req.query.type) {
            conditions.push('event_type = @eventType');
            params.eventType = req.query.type as string;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM activity ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM activity ${where}
            ORDER BY block_number DESC, id DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    return router;
}
