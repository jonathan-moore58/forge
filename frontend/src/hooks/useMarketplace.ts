/**
 * useMarketplace — React Query hooks for the Marketplace contract.
 *
 * - useAllListings: backed by indexer REST API (single HTTP call).
 * - Single listing/offer: still on-chain (getContract → simulate).
 * - Stats: still on-chain (marketplace contract).
 */

import { useQuery } from '@tanstack/react-query';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { IndexerAPI, type IndexerListing } from '@/services/IndexerAPI';
import { resolveAddress } from '@/utils/address';
import type { ListingData, OfferData, MarketStats, CollectionStatsData } from '@/contracts/abis';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const marketKeys = {
    all: (network: ForgeNetwork) => ['marketplace', network] as const,
    stats: (network: ForgeNetwork) => [...marketKeys.all(network), 'stats'] as const,
    collectionStats: (network: ForgeNetwork, collection: string) => [...marketKeys.all(network), 'collectionStats', collection] as const,
    listing: (network: ForgeNetwork, id: string) => [...marketKeys.all(network), 'listing', id] as const,
    offer: (network: ForgeNetwork, id: string) => [...marketKeys.all(network), 'offer', id] as const,
    listings: (network: ForgeNetwork) => [...marketKeys.all(network), 'listings'] as const,
    listingForNFT: (network: ForgeNetwork, collection: string, tokenId: string) => [...marketKeys.all(network), 'listingForNFT', collection, tokenId] as const,
};

function isMarketDeployed(network: ForgeNetwork): boolean {
    return !!CONTRACT_ADDRESSES[network].marketplace;
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get global marketplace stats (totalListings, totalSales, totalVolume, totalFees).
 */
export function useMarketStats(network: ForgeNetwork) {
    return useQuery({
        queryKey: marketKeys.stats(network),
        queryFn: async (): Promise<MarketStats> => {
            const market = ContractService.getMarketplace(network);
            const result = await market.marketplaceStats();
            return result.properties;
        },
        enabled: isMarketDeployed(network),
    });
}

/**
 * Get per-collection stats (volume, salesCount, floorPrice).
 */
export function useCollectionStats(network: ForgeNetwork, collection: string | undefined) {
    return useQuery({
        queryKey: marketKeys.collectionStats(network, collection ?? ''),
        queryFn: async (): Promise<CollectionStatsData> => {
            const market = ContractService.getMarketplace(network);
            const collectionAddr = await resolveAddress(collection!, network);
            const result = await market.collectionStats(collectionAddr);
            return result.properties;
        },
        enabled: isMarketDeployed(network) && !!collection,
    });
}

/* ------------------------------------------------------------------ */
/*  Single listing / offer                                            */
/* ------------------------------------------------------------------ */

/**
 * Get a single listing by ID.
 */
export function useListing(network: ForgeNetwork, listingId: bigint | undefined) {
    return useQuery({
        queryKey: marketKeys.listing(network, listingId?.toString() ?? ''),
        queryFn: async (): Promise<ListingData> => {
            const market = ContractService.getMarketplace(network);
            const result = await market.getListing(listingId!);
            return result.properties;
        },
        enabled: isMarketDeployed(network) && listingId !== undefined,
    });
}

/**
 * Get a single offer by ID.
 */
export function useOffer(network: ForgeNetwork, offerId: bigint | undefined) {
    return useQuery({
        queryKey: marketKeys.offer(network, offerId?.toString() ?? ''),
        queryFn: async (): Promise<OfferData> => {
            const market = ContractService.getMarketplace(network);
            const result = await market.getOffer(offerId!);
            return result.properties;
        },
        enabled: isMarketDeployed(network) && offerId !== undefined,
    });
}

/**
 * Look up the active listing for a specific NFT.
 */
export function useListingForNFT(network: ForgeNetwork, collection: string | undefined, tokenId: bigint | undefined) {
    return useQuery({
        queryKey: marketKeys.listingForNFT(network, collection ?? '', tokenId?.toString() ?? ''),
        queryFn: async () => {
            const market = ContractService.getMarketplace(network);
            const collectionAddr = await resolveAddress(collection!, network);
            const result = await market.getListingForNFT(collectionAddr, tokenId!);
            return result.properties.listingId;
        },
        enabled: isMarketDeployed(network) && !!collection && tokenId !== undefined,
    });
}

/* ------------------------------------------------------------------ */
/*  All active listings — backed by indexer                            */
/* ------------------------------------------------------------------ */

/** Listing item from the indexer, with field names matching old consumers. */
export interface ListingWithId {
    id: bigint;
    seller: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
    status: bigint;
    blockListed: bigint;
}

/** Map IndexerListing → ListingWithId */
function mapListing(l: IndexerListing): ListingWithId {
    return {
        id: BigInt(l.listing_id),
        seller: l.seller,
        collection: l.collection_address,
        tokenId: BigInt(l.token_id),
        price: BigInt(l.price),
        status: BigInt(l.status),
        blockListed: BigInt(l.created_at_block),
    };
}

/**
 * Fetch all active marketplace listings from the indexer.
 * Single HTTP call — replaces O(N) on-chain loop.
 */
export function useAllListings(network: ForgeNetwork) {
    return useQuery({
        queryKey: marketKeys.listings(network),
        queryFn: async (): Promise<ListingWithId[]> => {
            const res = await IndexerAPI.listings({ status: 0 });
            return res.data.map(mapListing);
        },
        staleTime: 30_000,
    });
}
