/**
 * useAuctions — React Query hooks for the AuctionHouse contract.
 *
 * - useAllAuctions: backed by indexer REST API (single HTTP call).
 * - Single auction / Dutch price: still on-chain (real-time accuracy).
 * - Stats: still on-chain (AuctionHouse contract).
 */

import { useQuery } from '@tanstack/react-query';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { IndexerAPI, type IndexerAuction } from '@/services/IndexerAPI';
import type { AuctionData, AuctionStatsData } from '@/contracts/abis';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const auctionKeys = {
    all: (network: ForgeNetwork) => ['auctions', network] as const,
    stats: (network: ForgeNetwork) => [...auctionKeys.all(network), 'stats'] as const,
    auction: (network: ForgeNetwork, id: string) => [...auctionKeys.all(network), 'auction', id] as const,
    dutchPrice: (network: ForgeNetwork, id: string) => [...auctionKeys.all(network), 'dutchPrice', id] as const,
    list: (network: ForgeNetwork) => [...auctionKeys.all(network), 'list'] as const,
};

function isAuctionDeployed(network: ForgeNetwork): boolean {
    return !!CONTRACT_ADDRESSES[network].auctionHouse;
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get global auction stats (totalAuctions, totalSettled, totalVolume).
 */
export function useAuctionStats(network: ForgeNetwork) {
    return useQuery({
        queryKey: auctionKeys.stats(network),
        queryFn: async (): Promise<AuctionStatsData> => {
            const house = ContractService.getAuctionHouse(network);
            const result = await house.auctionStats();
            return result.properties;
        },
        enabled: isAuctionDeployed(network),
    });
}

/* ------------------------------------------------------------------ */
/*  Single auction                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get a single auction by ID.
 */
export function useAuction(network: ForgeNetwork, auctionId: bigint | undefined) {
    return useQuery({
        queryKey: auctionKeys.auction(network, auctionId?.toString() ?? ''),
        queryFn: async (): Promise<AuctionData> => {
            const house = ContractService.getAuctionHouse(network);
            const result = await house.getAuction(auctionId!);
            return result.properties;
        },
        enabled: isAuctionDeployed(network) && auctionId !== undefined,
        refetchInterval: 30_000, // Refresh for bid updates
    });
}

/**
 * Get the current price for a Dutch auction.
 * Refreshes frequently because price changes every block.
 */
export function useDutchPrice(network: ForgeNetwork, auctionId: bigint | undefined) {
    return useQuery({
        queryKey: auctionKeys.dutchPrice(network, auctionId?.toString() ?? ''),
        queryFn: async () => {
            const house = ContractService.getAuctionHouse(network);
            const result = await house.getCurrentDutchPrice(auctionId!);
            return result.properties.price;
        },
        enabled: isAuctionDeployed(network) && auctionId !== undefined,
        refetchInterval: 10_000, // Every 10s — price drops per block
    });
}

/* ------------------------------------------------------------------ */
/*  All active auctions — backed by indexer                            */
/* ------------------------------------------------------------------ */

/** Auction item from the indexer, with field names matching old consumers. */
export interface AuctionWithId {
    id: bigint;
    seller: string;
    collection: string;
    tokenId: bigint;
    auctionType: bigint;
    status: bigint;
    startBlock: bigint;
    endBlock: bigint;
    startPrice: bigint;
    endPrice: bigint;
    reservePrice: bigint;
    highestBid: bigint;
    highestBidder: string;
    bidCount: bigint;
}

/** Map IndexerAuction → AuctionWithId */
function mapAuction(a: IndexerAuction): AuctionWithId {
    return {
        id: BigInt(a.auction_id),
        seller: a.seller,
        collection: a.collection_address,
        tokenId: BigInt(a.token_id),
        auctionType: BigInt(a.auction_type),
        status: BigInt(a.status),
        startBlock: BigInt(a.start_block ?? 0),
        endBlock: BigInt(a.end_block),
        startPrice: BigInt(a.start_price),
        endPrice: BigInt(a.end_price ?? '0'),
        reservePrice: BigInt(a.reserve_price ?? '0'),
        highestBid: BigInt(a.highest_bid ?? '0'),
        highestBidder: a.highest_bidder ?? '',
        bidCount: BigInt(a.bid_count),
    };
}

/**
 * Fetch all active auctions from the indexer.
 * Single HTTP call — replaces O(N) on-chain loop.
 */
export function useAllAuctions(network: ForgeNetwork) {
    return useQuery({
        queryKey: auctionKeys.list(network),
        queryFn: async (): Promise<AuctionWithId[]> => {
            const res = await IndexerAPI.auctions({ status: 0 });
            return res.data.map(mapAuction);
        },
        staleTime: 30_000,
    });
}
