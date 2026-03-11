import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';

export function stakingRoutes(): Router {
    const router = Router();

    /**
     * GET /api/staking/positions?staker=...&collection=...&status=0&page=1&limit=50
     *
     * status: 0=STAKED, 1=UNSTAKED
     */
    router.get('/staking/positions', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.staker) {
            conditions.push('staker = @staker');
            params.staker = req.query.staker as string;
        }
        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }
        if (req.query.status != null) {
            conditions.push('status = @status');
            params.status = Number(req.query.status);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM staking_positions ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM staking_positions ${where}
            ORDER BY staked_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    return router;
}
