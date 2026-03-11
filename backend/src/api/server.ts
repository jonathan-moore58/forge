/* ------------------------------------------------------------------ */
/*  Express API server                                                 */
/* ------------------------------------------------------------------ */

import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { bigintReplacer } from '../utils/bigint-json.js';

// Route imports
import { healthRoutes } from './routes/health.js';
import { collectionRoutes } from './routes/collections.js';
import { tokenRoutes } from './routes/tokens.js';
import { listingRoutes } from './routes/listings.js';
import { offerRoutes } from './routes/offers.js';
import { auctionRoutes } from './routes/auctions.js';
import { activityRoutes } from './routes/activity.js';
import { stakingRoutes } from './routes/staking.js';
import { statsRoutes } from './routes/stats.js';
import { lendingRoutes } from './routes/lending.js';

const log = createLogger('api');

export function startApiServer(): void {
    const app = express();

    // ── Middleware ──
    // B-H10: Configurable CORS origins via env var
    const defaultOrigins = 'http://localhost:5173,http://localhost:5192,http://localhost:5193,http://localhost:5195,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5192,http://127.0.0.1:5193,http://127.0.0.1:5195';
    const corsOrigins = (process.env.CORS_ORIGINS || defaultOrigins)
        .split(',').map(s => s.trim()).filter(Boolean);
    app.use(cors({
        origin: corsOrigins,
        credentials: true,
    }));
    app.use(express.json());

    // BigInt-safe JSON serialisation
    app.set('json replacer', bigintReplacer);

    // ── Routes ──
    app.use('/api', healthRoutes());
    app.use('/api', collectionRoutes());
    app.use('/api', tokenRoutes());
    app.use('/api', listingRoutes());
    app.use('/api', offerRoutes());
    app.use('/api', auctionRoutes());
    app.use('/api', activityRoutes());
    app.use('/api', stakingRoutes());
    app.use('/api', statsRoutes());
    app.use('/api', lendingRoutes());

    // ── 404 ──
    app.use((_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    // ── Error handler ──
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        log.error('Unhandled API error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    // ── Start ──
    app.listen(config.port, () => {
        log.info(`API server listening on http://localhost:${config.port}`);
    });
}
