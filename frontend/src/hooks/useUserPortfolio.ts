/**
 * useUserPortfolio — Aggregate a user's NFT holdings across all collections.
 *
 * Backed by the FORGE indexer REST API:
 * - /api/tokens/owner/:address → all tokens the user owns (single HTTP call)
 * - /api/listings?seller=:address → all user's active listings
 * - /api/stats/collection/:address → floor price per collection
 *
 * Replaces the old O(N×M) on-chain approach (iterate collections × balanceOf × tokenOfOwnerByIndex).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IndexerAPI, type IndexerToken } from '@/services/IndexerAPI';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PortfolioHolding {
    /** Collection contract address */
    collectionAddress: string;
    /** Collection registry ID (0 if unknown) */
    collectionId: bigint;
    /** Creator address (empty if unknown) */
    creator: string;
    /** Number of tokens owned in this collection */
    count: number;
    /** Token IDs owned */
    tokenIds: bigint[];
    /** Floor price (sats) from marketplace stats — 0 if no data */
    floorPrice: bigint;
    /** Total estimated value (count * floor) in sats */
    totalValue: bigint;
    /** Whether the collection is verified */
    verified: boolean;
}

export interface UserPortfolio {
    holdings: PortfolioHolding[];
    /** Total estimated portfolio value in sats */
    totalValueSats: bigint;
    /** Total NFTs owned across all collections */
    nftsOwned: number;
    /** Number of user's NFTs currently listed on marketplace */
    nftsListed: number;
    isLoading: boolean;
    error: Error | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useUserPortfolio(
    network: ForgeNetwork,
    walletAddress: string | undefined,
): UserPortfolio {
    const {
        data: portfolio,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['userPortfolio', network, walletAddress],
        queryFn: async (): Promise<{ holdings: PortfolioHolding[]; nftsListed: number }> => {
            if (!walletAddress) return { holdings: [], nftsListed: 0 };

            // 1. Fetch all tokens owned by this wallet (single HTTP call)
            const tokensRes = await IndexerAPI.tokensByOwner(walletAddress);
            const tokens = tokensRes.data;

            if (tokens.length === 0) return { holdings: [], nftsListed: 0 };

            // 2. Group tokens by collection
            const byCollection = new Map<string, IndexerToken[]>();
            for (const token of tokens) {
                const addr = token.collection_address;
                if (!byCollection.has(addr)) byCollection.set(addr, []);
                byCollection.get(addr)!.push(token);
            }

            // 3. Fetch collection info + stats in parallel
            const collectionAddrs = [...byCollection.keys()];

            const [collectionsRes, listingsRes, ...statsResults] = await Promise.all([
                IndexerAPI.collections(),
                IndexerAPI.listings({ seller: walletAddress, status: 0 }),
                ...collectionAddrs.map((addr) =>
                    IndexerAPI.collectionStats(addr).catch(() => ({
                        data: { floorPrice: null, total_volume: null, listed_count: 0, sales_count: 0, owner_count: 0 },
                    })),
                ),
            ]);

            // Build collection info lookup
            const collectionInfoMap = new Map(
                collectionsRes.data.map((c) => [c.collection_address, c]),
            );

            // 4. Build holdings
            const holdings: PortfolioHolding[] = [];

            for (let i = 0; i < collectionAddrs.length; i++) {
                const addr = collectionAddrs[i]!;
                const collTokens = byCollection.get(addr) ?? [];
                const info = collectionInfoMap.get(addr);
                const stats = statsResults[i]?.data;

                const floorPrice = stats?.floorPrice ? BigInt(stats.floorPrice) : 0n;

                holdings.push({
                    collectionAddress: addr as string,
                    collectionId: info ? BigInt(info.collection_id) : 0n,
                    creator: info?.creator ?? '',
                    count: collTokens.length,
                    tokenIds: collTokens.map((t) => BigInt(t.token_id)),
                    floorPrice,
                    totalValue: floorPrice * BigInt(collTokens.length),
                    verified: info ? info.verified === 1 : false,
                });
            }

            // 5. Count listed NFTs
            const nftsListed = listingsRes.data.length;

            return { holdings, nftsListed };
        },
        enabled: !!walletAddress,
        staleTime: 30_000,
    });

    return useMemo(() => {
        const safeHoldings = portfolio?.holdings ?? [];
        return {
            holdings: safeHoldings,
            totalValueSats: safeHoldings.reduce((sum, h) => sum + h.totalValue, 0n),
            nftsOwned: safeHoldings.reduce((sum, h) => sum + h.count, 0),
            nftsListed: portfolio?.nftsListed ?? 0,
            isLoading,
            error: error as Error | null,
        };
    }, [portfolio, isLoading, error]);
}
