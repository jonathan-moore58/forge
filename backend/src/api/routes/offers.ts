import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';
import { addressToRawHex } from '../../utils/address.js';

export function offerRoutes(): Router {
    const router = Router();

    /**
     * GET /api/offers?status=0&offerer=...&collection=...&tokenId=...&page=1&limit=50
     */
    router.get('/offers', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.status != null) {
            conditions.push('status = @status');
            params.status = Number(req.query.status);
        }
        if (req.query.offerer) {
            conditions.push('offerer = @offerer');
            // Convert bech32m → hex to match DB format
            params.offerer = addressToRawHex(req.query.offerer as string);
        }
        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }
        if (req.query.tokenId != null) {
            conditions.push('token_id = @tokenId');
            params.tokenId = Number(req.query.tokenId);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM offers ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM offers ${where}
            ORDER BY created_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    return router;
}
