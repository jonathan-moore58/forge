/**
 * useLaunchpadDrops — Composite hook for the Launchpad page.
 *
 * Backed by the FORGE indexer REST API — single HTTP call replaces
 * the old O(N×M) on-chain loop (registry iteration + per-collection RPC).
 *
 * The indexer already stores name, symbol, supply, mint_price, sale_phase
 * from metadata enrichment, so we don't need separate on-chain calls.
 */

import { useQuery } from '@tanstack/react-query';
import { IndexerAPI, type IndexerCollection } from '@/services/IndexerAPI';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LaunchpadDrop {
    readonly id: string;
    readonly address: string;
    readonly name: string;
    readonly symbol: string;
    readonly description: string;
    readonly supply: number;
    readonly minted: number;
    readonly mintPrice: number;
    /** Raw price in sats (for contract calls) */
    readonly mintPriceSats: bigint;
    readonly status: 'live' | 'upcoming' | 'ended';
    readonly featured: boolean;
    readonly verified: boolean;
    readonly creator: string;
    readonly salePhase: bigint;
    /** IPFS base URI for token metadata (e.g. "ipfs://QmXyz/") */
    readonly baseUri: string;
    /** Collection icon/avatar URI (IPFS recommended) */
    readonly icon: string;
    /** Collection banner/header URI (IPFS recommended) */
    readonly banner: string;
    /** Collection description */
    readonly collectionDescription: string;
    /** Collection website URL */
    readonly website: string;
    readonly dutchAuction: {
        readonly startPrice: number;
        readonly endPrice: number;
        readonly decayPerBlock: number;
    } | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive display status from numeric sale phase */
function deriveStatus(phase: number | null): 'live' | 'upcoming' | 'ended' {
    if (phase === 1 || phase === 2) return 'live';
    if (phase === 3) return 'ended';
    return 'upcoming';
}

/** Map IndexerCollection → LaunchpadDrop */
function mapDrop(c: IndexerCollection): LaunchpadDrop {
    const mintPriceSats = c.mint_price ? Number(c.mint_price) : 0;
    const status = deriveStatus(c.sale_phase);

    return {
        id: c.collection_id.toString(),
        address: c.collection_address,
        name: (c.name && c.name !== '(unknown)') ? c.name : 'Unnamed Collection',
        symbol: c.symbol ?? '???',
        description: c.description ?? '',
        supply: c.max_supply ?? 0,
        minted: c.total_supply ?? 0,
        mintPrice: mintPriceSats / 1e8,
        mintPriceSats: BigInt(c.mint_price ?? '0'),
        status,
        featured: c.verified === 1,
        verified: c.verified === 1,
        creator: c.creator,
        salePhase: BigInt(c.sale_phase ?? 0),
        baseUri: c.base_uri ?? '',
        icon: c.icon ?? '',
        banner: c.banner ?? '',
        collectionDescription: c.description ?? '',
        website: c.website ?? '',
        dutchAuction: null, // Dutch params not in indexer yet — enrich on-chain if needed
    };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useLaunchpadDrops(network: ForgeNetwork) {
    return useQuery({
        queryKey: ['launchpad', 'drops', network],
        queryFn: async (): Promise<LaunchpadDrop[]> => {
            const res = await IndexerAPI.collections();
            return res.data.map(mapDrop);
        },
        staleTime: 15_000, // 15 seconds
        refetchInterval: 30_000, // Refresh every 30 seconds
    });
}
