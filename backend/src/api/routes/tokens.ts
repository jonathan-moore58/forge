import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';

export function tokenRoutes(): Router {
    const router = Router();

    /** GET /api/collections/:address/tokens?page=1&limit=50 */
    router.get('/collections/:address/tokens', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
        const collectionAddress = req.params.address;

        const total = (db.prepare(
            'SELECT COUNT(*) as c FROM tokens WHERE collection_address = @addr',
        ).get({ addr: collectionAddress }) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM tokens
            WHERE collection_address = @addr
            ORDER BY token_id ASC
            LIMIT @limit OFFSET @offset
        `).all({ addr: collectionAddress, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    /** GET /api/tokens/owner/:owner?collection=...&page=1&limit=50 */
    router.get('/tokens/owner/:owner', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
        const owner = req.params.owner;

        const conditions = ['owner = @owner'];
        const params: Record<string, string | number | null> = { owner };

        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const total = (db.prepare(`SELECT COUNT(*) as c FROM tokens ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM tokens ${where}
            ORDER BY collection_address, token_id ASC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    return router;
}
