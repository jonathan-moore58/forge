import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';
import { addressToRawHex } from '../../utils/address.js';

export function listingRoutes(): Router {
    const router = Router();

    /**
     * GET /api/listings?status=0&collection=...&seller=...&minPrice=...&maxPrice=...&page=1&limit=50
     *
     * status: 0=ACTIVE, 1=SOLD, 2=CANCELLED (defaults to all)
     */
    router.get('/listings', (req, res) => {
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
        if (req.query.seller) {
            conditions.push('seller = @seller');
            // Convert bech32m → hex to match DB format
            params.seller = addressToRawHex(req.query.seller as string);
        }
        // B-C3: Use string-length + lexicographic comparison for BigInt-safe price filtering
        if (req.query.minPrice) {
            conditions.push('(LENGTH(price) > LENGTH(@minPrice) OR (LENGTH(price) = LENGTH(@minPrice) AND price >= @minPrice))');
            params.minPrice = req.query.minPrice as string;
        }
        if (req.query.maxPrice) {
            conditions.push('(LENGTH(price) < LENGTH(@maxPrice) OR (LENGTH(price) = LENGTH(@maxPrice) AND price <= @maxPrice))');
            params.maxPrice = req.query.maxPrice as string;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM listings ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM listings ${where}
            ORDER BY created_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    /** GET /api/listings/:id */
    router.get('/listings/:id', (req, res) => {
        const db = getDb();
        const row = db.prepare('SELECT * FROM listings WHERE listing_id = ?').get(Number(req.params.id));
        if (!row) return res.status(404).json({ error: 'Listing not found' });
        res.json({ data: row });
    });

    return router;
}
