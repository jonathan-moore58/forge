/**
 * useForgeData — Data adapter hooks that bridge contract/indexer data
 * to the shapes the UI pages expect.
 *
 * Each function takes real data (from indexer or on-chain) and maps it
 * to the format that page components were originally designed with.
 */

import { useMemo } from 'react';
import { useNetwork } from './useNetwork';
import { useMarketStats, useAllListings, type ListingWithId } from './useMarketplace';
import { useAllCollections, useTotalCollections, type CollectionItem } from './useRegistry';
import { useAllAuctions, useAuctionStats, type AuctionWithId } from './useAuctions';
import { useAllPools, useStakingStats, type PoolWithId } from './useStaking';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function satsToBTC(sats: bigint): number {
    return Number(sats) / 1e8;
}

function shortenAddress(hex: string): string {
    if (!hex || hex.length < 12) return hex;
    return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Homepage stats                                                     */
/* ------------------------------------------------------------------ */

export interface HomeStats {
    totalVolume: number;
    totalSales: number;
    numCollections: number;
    totalFees: number;
    isLoading: boolean;
}

export function useHomeStats(): HomeStats {
    const { network } = useNetwork();
    const { data: marketStats, isLoading: marketLoading } = useMarketStats(network);
    const { data: totalCollections, isLoading: collectionsLoading } = useTotalCollections(network);

    return useMemo(() => ({
        totalVolume: marketStats ? satsToBTC(marketStats.totalVolume) : 0,
        totalSales: marketStats ? Number(marketStats.totalSales) : 0,
        numCollections: totalCollections ? Number(totalCollections) : 0,
        totalFees: marketStats ? satsToBTC(marketStats.totalFees) : 0,
        isLoading: marketLoading || collectionsLoading,
    }), [marketStats, totalCollections, marketLoading, collectionsLoading]);
}

/* ------------------------------------------------------------------ */
/*  Marketplace listing shape (maps to existing NFTListing type)       */
/* ------------------------------------------------------------------ */

export interface MarketNFTItem {
    id: string;
    listingId: bigint;
    tokenId: number;
    name: string;
    collection: string;
    collectionAddress: string;
    price: number;
    priceSats: bigint;
    seller: string;
}

export function useMarketListings(network: ForgeNetwork) {
    const { data: listings, isLoading, error } = useAllListings(network);

    const items = useMemo((): MarketNFTItem[] => {
        if (!listings) return [];
        return listings.map((listing: ListingWithId) => ({
            id: `listing-${listing.id.toString()}`,
            listingId: listing.id,
            tokenId: Number(listing.tokenId),
            name: `NFT #${listing.tokenId.toString()}`,
            collection: shortenAddress(String(listing.collection)),
            collectionAddress: String(listing.collection),
            price: satsToBTC(listing.price),
            priceSats: listing.price,
            seller: shortenAddress(String(listing.seller)),
        }));
    }, [listings]);

    return { items, isLoading, error };
}

/* ------------------------------------------------------------------ */
/*  Auction shape                                                      */
/* ------------------------------------------------------------------ */

export interface AuctionItem {
    id: string;
    auctionId: bigint;
    name: string;
    collection: string;
    collectionAddress: string;
    tokenId: number;
    type: 'english' | 'dutch';
    startBlock: number;
    endBlock: number;
    startPrice: number;
    reservePrice: number;
    currentBid: number;
    highestBidder: string;
    bidCount: number;
    status: number;
}

export function useAuctionItems(network: ForgeNetwork) {
    const { data: auctions, isLoading, error } = useAllAuctions(network);
    const { data: stats } = useAuctionStats(network);

    const items = useMemo((): AuctionItem[] => {
        if (!auctions) return [];
        return auctions.map((auction: AuctionWithId) => ({
            id: `auction-${auction.id.toString()}`,
            auctionId: auction.id,
            name: `Auction #${auction.id.toString()}`,
            collection: shortenAddress(String(auction.collection)),
            collectionAddress: String(auction.collection),
            tokenId: Number(auction.tokenId),
            type: auction.auctionType === 0n ? 'english' : 'dutch',
            startBlock: Number(auction.startBlock),
            endBlock: Number(auction.endBlock),
            startPrice: satsToBTC(auction.startPrice),
            reservePrice: satsToBTC(auction.reservePrice),
            currentBid: satsToBTC(auction.highestBid),
            highestBidder: shortenAddress(String(auction.highestBidder)),
            bidCount: Number(auction.bidCount),
            status: Number(auction.status),
        }));
    }, [auctions]);

    return {
        items,
        isLoading,
        error,
        totalAuctions: stats ? Number(stats.totalAuctions) : 0,
        totalSettled: stats ? Number(stats.totalSettled) : 0,
        totalVolume: stats ? satsToBTC(stats.totalVolume) : 0,
    };
}

/* ------------------------------------------------------------------ */
/*  Staking pool shape                                                 */
/* ------------------------------------------------------------------ */

export interface StakingPoolItem {
    id: string;
    poolId: bigint;
    collection: string;
    collectionAddress: string;
    rewardToken: string;
    rewardPerBlock: number;
    startBlock: number;
    endBlock: number;
    totalStaked: number;
    active: boolean;
}

export function useStakingPools(network: ForgeNetwork) {
    const { data: pools, isLoading, error } = useAllPools(network);
    const { data: stats } = useStakingStats(network);

    const items = useMemo((): StakingPoolItem[] => {
        if (!pools) return [];
        return pools.map((pool: PoolWithId) => ({
            id: `pool-${pool.id.toString()}`,
            poolId: pool.id,
            collection: shortenAddress(String(pool.collection)),
            collectionAddress: String(pool.collection),
            rewardToken: shortenAddress(String(pool.rewardToken)),
            rewardPerBlock: satsToBTC(pool.rewardPerBlock),
            startBlock: Number(pool.startBlock),
            endBlock: Number(pool.endBlock),
            totalStaked: Number(pool.totalStaked),
            active: pool.active,
        }));
    }, [pools]);

    return {
        items,
        isLoading,
        error,
        totalPools: stats ? Number(stats.totalPools) : 0,
        totalRewardsDistributed: stats ? satsToBTC(stats.totalRewardsDistributed) : 0,
    };
}

/* ------------------------------------------------------------------ */
/*  Collection shape (from indexer via useRegistry)                     */
/* ------------------------------------------------------------------ */

export interface CollectionRegistryItem {
    id: bigint;
    collectionAddress: string;
    creator: string;
    verified: boolean;
    name: string | null;
    symbol: string | null;
}

export function useCollectionRegistry(network: ForgeNetwork) {
    const { data: collections, isLoading, error } = useAllCollections(network);

    const items = useMemo((): CollectionRegistryItem[] => {
        if (!collections) return [];
        return collections.map((col: CollectionItem) => ({
            id: col.id,
            collectionAddress: col.collectionAddress,
            creator: shortenAddress(col.creator),
            verified: col.verified,
            name: col.name,
            symbol: col.symbol,
        }));
    }, [collections]);

    return { items, isLoading, error };
}
