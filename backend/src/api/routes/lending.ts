import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { parsePagination } from '../../types/api.js';

export function lendingRoutes(): Router {
    const router = Router();

    /**
     * GET /api/loans?status=0&borrower=...&lender=...&collection=...&page=1&limit=50
     *
     * status: 0=PENDING, 1=ACTIVE, 2=REPAID, 3=DEFAULTED, 4=CANCELLED
     */
    router.get('/loans', (req, res) => {
        const db = getDb();
        const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);

        const conditions: string[] = [];
        const params: Record<string, string | number | null> = {};

        if (req.query.status != null) {
            conditions.push('status = @status');
            params.status = Number(req.query.status);
        }
        if (req.query.borrower) {
            conditions.push('borrower = @borrower');
            params.borrower = req.query.borrower as string;
        }
        if (req.query.lender) {
            conditions.push('lender = @lender');
            params.lender = req.query.lender as string;
        }
        if (req.query.collection) {
            conditions.push('collection_address = @collection');
            params.collection = req.query.collection as string;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const total = (db.prepare(`SELECT COUNT(*) as c FROM loans ${where}`).get(params) as { c: number }).c;

        const rows = db.prepare(`
            SELECT * FROM loans ${where}
            ORDER BY created_at_block DESC
            LIMIT @limit OFFSET @offset
        `).all({ ...params, limit, offset });

        res.json({ data: rows, meta: { total, page, limit } });
    });

    /** GET /api/loans/:id */
    router.get('/loans/:id', (req, res) => {
        const db = getDb();
        const row = db.prepare('SELECT * FROM loans WHERE loan_id = ?').get(Number(req.params.id));
        if (!row) return res.status(404).json({ error: 'Loan not found' });
        res.json({ data: row });
    });

    /**
     * GET /api/lending/stats
     *
     * Overall lending platform stats.
     */
    router.get('/lending/stats', (_req, res) => {
        const db = getDb();

        const totalCreated = (db.prepare('SELECT COUNT(*) as c FROM loans').get() as { c: number }).c;
        const totalActive = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE status = 1').get() as { c: number }).c;
        const totalRepaid = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE status = 2').get() as { c: number }).c;
        const totalDefaulted = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE status = 3').get() as { c: number }).c;

        // Compute total volume using app-side BigInt
        const volumeRows = db.prepare('SELECT amount FROM loans WHERE status IN (1, 2, 3)').all() as { amount: string }[];
        let totalVolume = 0n;
        for (const row of volumeRows) {
            try { totalVolume += BigInt(row.amount); } catch { /* skip bad data */ }
        }

        res.json({
            data: {
                totalCreated,
                totalActive,
                totalRepaid,
                totalDefaulted,
                totalVolume: totalVolume.toString(),
            },
        });
    });

    return router;
}
