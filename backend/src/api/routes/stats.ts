import { Router } from 'express';
import { getDb } from '../../db/connection.js';

export function statsRoutes(): Router {
    const router = Router();

    /** GET /api/stats/collection/:address */
    router.get('/stats/collection/:address', (req, res) => {
        const db = getDb();
        const addr = req.params.address;

        // B-C3: BigInt-safe floor price — fetch all active prices, compute MIN in JS
        const activePrices = db.prepare(`
            SELECT price FROM listings
            WHERE collection_address = @addr AND status = 0
        `).all({ addr }) as { price: string }[];

        let floorPrice = '0';
        if (activePrices.length > 0) {
            floorPrice = activePrices.reduce((min, r) => {
                const p = BigInt(r.price);
                return p < BigInt(min) ? r.price : min;
            }, activePrices[0]!.price);
        }

        // B-C3: BigInt-safe total volume — compute SUM in JS
        const salePrices = db.prepare(`
            SELECT price FROM activity
            WHERE collection_address = @addr AND event_type = 'sale'
        `).all({ addr }) as { price: string }[];

        const totalVolume = salePrices.reduce((sum, r) => sum + BigInt(r.price), 0n);

        // Active listings count
        const listed = db.prepare(`
            SELECT COUNT(*) as c FROM listings
            WHERE collection_address = @addr AND status = 0
        `).get({ addr }) as { c: number };

        // Total sales count
        const sales = db.prepare(`
            SELECT COUNT(*) as c FROM activity
            WHERE collection_address = @addr AND event_type = 'sale'
        `).get({ addr }) as { c: number };

        // Unique owner count
        const owners = db.prepare(`
            SELECT COUNT(DISTINCT owner) as c FROM tokens
            WHERE collection_address = @addr
        `).get({ addr }) as { c: number };

        // Collection metadata
        const collection = db.prepare(`
            SELECT total_supply, max_supply FROM collections
            WHERE collection_address = @addr
        `).get({ addr }) as { total_supply: number; max_supply: number } | undefined;

        res.json({
            data: {
                collectionAddress: addr,
                floorPrice: floorPrice,
                totalVolume: totalVolume.toString(),
                listedCount: listed.c,
                salesCount: sales.c,
                ownerCount: owners.c,
                totalSupply: collection?.total_supply ?? 0,
                maxSupply: collection?.max_supply ?? 0,
            },
        });
    });

    /** GET /api/stats/global */
    router.get('/stats/global', (_req, res) => {
        const db = getDb();

        const collections = db.prepare('SELECT COUNT(*) as c FROM collections').get() as { c: number };
        const tokens = db.prepare('SELECT COUNT(*) as c FROM tokens').get() as { c: number };
        const activeListings = db.prepare('SELECT COUNT(*) as c FROM listings WHERE status = 0').get() as { c: number };
        const totalSales = db.prepare("SELECT COUNT(*) as c FROM activity WHERE event_type = 'sale'").get() as { c: number };

        // B-C3: BigInt-safe global volume — compute SUM in JS
        const globalSalePrices = db.prepare(`
            SELECT price FROM activity WHERE event_type = 'sale'
        `).all() as { price: string }[];
        const globalVolume = globalSalePrices.reduce((sum, r) => sum + BigInt(r.price), 0n);

        const activeAuctions = db.prepare('SELECT COUNT(*) as c FROM auctions WHERE status = 0').get() as { c: number };
        const stakedNfts = db.prepare('SELECT COUNT(*) as c FROM staking_positions WHERE status = 0').get() as { c: number };

        res.json({
            data: {
                totalCollections: collections.c,
                totalTokens: tokens.c,
                activeListings: activeListings.c,
                totalSales: totalSales.c,
                totalVolume: globalVolume.toString(),
                activeAuctions: activeAuctions.c,
                stakedNfts: stakedNfts.c,
            },
        });
    });

    return router;
}
