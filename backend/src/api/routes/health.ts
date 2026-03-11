import { Router } from 'express';
import { getDb } from '../../db/connection.js';
import { config } from '../../config.js';

export function healthRoutes(): Router {
    const router = Router();

    router.get('/health', async (_req, res) => {
        try {
            const db = getDb();
            const state = db.prepare('SELECT last_block, updated_at FROM sync_state WHERE id = 1').get() as
                { last_block: number; updated_at: string } | undefined;

            // Try to get chain tip for lag calculation
            let chainTip: number | null = null;
            try {
                const rpcRes = await fetch(config.rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'btc_blockNumber', params: [] }),
                });
                const json = (await rpcRes.json()) as { result?: string | number };
                if (json.result != null) {
                    const raw = json.result;
                    chainTip = typeof raw === 'number' ? raw : parseInt(String(raw), raw.toString().startsWith('0x') ? 16 : 10);
                }
            } catch { /* non-critical */ }

            const lastBlock = state?.last_block ?? 0;

            res.json({
                data: {
                    status: 'ok',
                    lastBlock,
                    chainTip,
                    lag: chainTip != null ? chainTip - lastBlock : null,
                    updatedAt: state?.updated_at ?? null,
                    network: config.network,
                },
            });
        } catch (err) {
            res.status(500).json({ error: 'Health check failed' });
        }
    });

    return router;
}
