/**
 * useRegistry — React Query hooks for collection discovery.
 *
 * Backed by the FORGE indexer REST API (replaces on-chain CollectionRegistry).
 * The indexer discovers collections from Factory CollectionCreated events.
 *
 * API: single HTTP call per query — no O(N) loops.
 */

import { useQuery } from '@tanstack/react-query';
import { IndexerAPI, type IndexerCollection } from '@/services/IndexerAPI';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Mapped collection item — compatible with old RegistryCollectionData consumers */
export interface CollectionItem {
    /** Sequential ID from factory */
    id: bigint;
    /** OPNet contract address */
    collectionAddress: string;
    /** Deployer address */
    creator: string;
    /** Block when collection was created */
    registeredAt: bigint;
    /** Whether the collection is verified */
    verified: boolean;
    /** Collection display name (from indexer metadata enrichment) */
    name: string | null;
    /** Token symbol */
    symbol: string | null;
    /** Maximum supply */
    maxSupply: number | null;
    /** Current total supply */
    totalSupply: number | null;
    /** Mint price in sats (string for BigInt safety) */
    mintPrice: string | null;
    /** Royalty basis points */
    royaltyBps: number | null;
    /** Current sale phase (0=inactive, 1=whitelist, 2=public, 3=ended) */
    salePhase: number | null;
    /** Base URI (set on reveal) */
    baseUri: string | null;
    /** Collection icon/avatar URI (IPFS recommended) */
    icon: string | null;
    /** Collection banner/header URI (IPFS recommended) */
    banner: string | null;
    /** Collection description */
    description: string | null;
    /** Collection website URL */
    website: string | null;
    /** Whether the collection is registered on the marketplace for trading */
    marketplaceRegistered: boolean;
}

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const registryKeys = {
    all: (network: ForgeNetwork) => ['registry', network] as const,
    totalCollections: (network: ForgeNetwork) => [...registryKeys.all(network), 'totalCollections'] as const,
    collection: (network: ForgeNetwork, address: string) => [...registryKeys.all(network), 'collection', address] as const,
    collectionByAddress: (network: ForgeNetwork, address: string) => [...registryKeys.all(network), 'byAddress', address] as const,
    collections: (network: ForgeNetwork) => [...registryKeys.all(network), 'collections'] as const,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map IndexerCollection to our local CollectionItem shape */
export function mapCollection(c: IndexerCollection): CollectionItem {
    return {
        id: BigInt(c.collection_id),
        collectionAddress: c.collection_address,
        creator: c.creator,
        registeredAt: BigInt(c.created_at_block),
        verified: c.verified === 1,
        name: (c.name && c.name !== '(unknown)') ? c.name : null,
        symbol: c.symbol,
        maxSupply: c.max_supply,
        totalSupply: c.total_supply,
        mintPrice: c.mint_price,
        royaltyBps: c.royalty_bps,
        salePhase: c.sale_phase,
        baseUri: c.base_uri,
        icon: c.icon || null,
        banner: c.banner || null,
        description: c.description || null,
        website: c.website || null,
        marketplaceRegistered: c.marketplace_registered === 1,
    };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get total number of collections from the indexer.
 */
export function useTotalCollections(network: ForgeNetwork) {
    return useQuery({
        queryKey: registryKeys.totalCollections(network),
        queryFn: async () => {
            const res = await IndexerAPI.globalStats();
            return BigInt(res.data.totalCollections);
        },
        staleTime: 30_000,
    });
}

/**
 * Get a single collection by ID from the indexer.
 * Falls back to fetching all and filtering (indexer has no get-by-ID endpoint).
 */
export function useRegistryCollection(network: ForgeNetwork, collectionId: bigint | undefined) {
    return useQuery({
        queryKey: registryKeys.collection(network, collectionId?.toString() ?? ''),
        queryFn: async (): Promise<CollectionItem> => {
            const res = await IndexerAPI.collections();
            const match = res.data.find((c) => c.collection_id === Number(collectionId));
            if (!match) throw new Error(`Collection #${collectionId} not found`);
            return mapCollection(match);
        },
        enabled: collectionId !== undefined,
    });
}

/**
 * Look up a collection ID by its contract address.
 */
export function useCollectionByAddress(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: registryKeys.collectionByAddress(network, address ?? ''),
        queryFn: async () => {
            const res = await IndexerAPI.collection(address!);
            return BigInt(res.data.collection_id);
        },
        enabled: !!address,
    });
}

/**
 * Fetch ALL collections from the indexer.
 * Single HTTP call — replaces O(N) on-chain loop.
 */
export function useAllCollections(network: ForgeNetwork) {
    return useQuery({
        queryKey: registryKeys.collections(network),
        queryFn: async (): Promise<CollectionItem[]> => {
            const res = await IndexerAPI.collections();
            return res.data.map(mapCollection);
        },
        staleTime: 60_000, // 1 min — collection list doesn't change often
    });
}
