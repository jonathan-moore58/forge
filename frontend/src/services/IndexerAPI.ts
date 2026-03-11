/**
 * IndexerAPI — Typed client for the FORGE backend indexer REST API.
 *
 * Replaces on-chain O(N) loops with single HTTP calls.
 * All BigInt values come as strings from the backend (JSON-safe).
 */

import { API_BASE_URL } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Response envelope                                                  */
/* ------------------------------------------------------------------ */

interface ApiResponse<T> {
    data: T;
    meta?: {
        total: number;
        page: number;
        limit: number;
    };
}

/* ------------------------------------------------------------------ */
/*  Data types matching backend schema                                 */
/* ------------------------------------------------------------------ */

export interface IndexerCollection {
    collection_address: string;
    collection_id: number;
    creator: string;
    name: string | null;
    symbol: string | null;
    max_supply: number | null;
    total_supply: number | null;
    mint_price: string | null;
    royalty_bps: number | null;
    sale_phase: number | null;
    verified: number;
    marketplace_registered: number;
    base_uri: string | null;
    icon: string | null;
    banner: string | null;
    description: string | null;
    website: string | null;
    created_at_block: number;
}

export interface RegistrationStatus {
    registered: boolean;
    exists: boolean;
}

export interface IndexerToken {
    collection_address: string;
    token_id: number;
    owner: string;
    minter: string;
    metadata_uri: string | null;
    minted_at_block: number;
}

export interface IndexerListing {
    listing_id: number;
    seller: string;
    collection_address: string;
    token_id: number;
    price: string;
    status: number;
    buyer: string | null;
    sold_price: string | null;
    created_at_block: number;
}

export interface IndexerOffer {
    offer_id: number;
    offerer: string;
    collection_address: string;
    token_id: number;
    price: string;
    expiry_block: number;
    status: number;
}

export interface IndexerAuction {
    auction_id: number;
    seller: string;
    collection_address: string;
    token_id: number;
    auction_type: number;
    start_price: string;
    reserve_price: string;
    end_price: string;
    start_block: number;
    end_block: number;
    highest_bid: string | null;
    highest_bidder: string | null;
    bid_count: number;
    status: number;
    winner: string | null;
    final_price: string | null;
    created_at_block: number;
    settled_at_block: number | null;
}

export interface IndexerActivity {
    id: number;
    event_type: string;
    collection_address: string;
    token_id: number;
    from_address: string | null;
    to_address: string | null;
    price: string | null;
    block_number: number;
    tx_hash: string;
}

export interface CollectionStats {
    floor_price: string | null;
    total_volume: string | null;
    listed_count: number;
    sales_count: number;
    owner_count: number;
}

export interface GlobalStats {
    totalCollections: number;
    totalTokens: number;
    activeListings: number;
    totalSales: number;
    totalVolume: string;
    activeAuctions: number;
    stakedNfts: number;
}

export interface HealthStatus {
    status: string;
    lastBlock: number;
    chainTip: number;
    lag: number;
    network: string;
}

export interface IndexerLoan {
    loan_id: number;
    borrower: string;
    lender: string | null;
    collection_address: string;
    token_id: number;
    payment_token: string;
    amount: string;
    interest_bps: number;
    duration_blocks: number;
    start_block: number | null;
    status: number;
    created_at_block: number;
    updated_at_block: number | null;
}

export interface IndexerLendingStats {
    totalCreated: number;
    totalActive: number;
    totalRepaid: number;
    totalDefaulted: number;
    totalVolume: string;
}

export interface RegisterCollectionResult {
    registered: boolean;
    existed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Generic fetch helper                                               */
/* ------------------------------------------------------------------ */

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = new URL(path, API_BASE_URL);
    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Indexer API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
    const url = new URL(path, API_BASE_URL);

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, String(value));
            }
        }
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error(`Indexer API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/* ------------------------------------------------------------------ */
/*  API methods                                                        */
/* ------------------------------------------------------------------ */

export const IndexerAPI = {
    /* ─── Health ──────────────────────────────────────────────────── */

    health: () => apiFetch<HealthStatus>('/api/health'),

    /* ─── Collections ─────────────────────────────────────────────── */

    collections: (params?: {
        verified?: number;
        creator?: string;
        marketplace_registered?: number;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerCollection[]>('/api/collections', params),

    collection: (address: string) =>
        apiFetch<IndexerCollection>(`/api/collections/${address}`),

    registrationStatus: (address: string) =>
        apiFetch<RegistrationStatus>(`/api/collections/${address}/registration-status`),

    /**
     * Register a directly-deployed collection with the backend indexer.
     * Required for 1-TX direct WASM deploys (no factory event to auto-detect).
     * The enricher will fill in metadata on the next poll cycle.
     */
    registerCollection: (address: string, creator: string, txHash?: string) =>
        apiPost<RegisterCollectionResult>('/api/collections/register', { address, creator, txHash }),

    /**
     * Force-enrich a collection immediately after deployment.
     * Inserts a placeholder row if missing, then fetches metadata from chain.
     * Returns the enriched collection data (or null if contract isn't ready yet).
     */
    enrichCollection: (address: string, creator?: string) =>
        apiPost<IndexerCollection | null>(`/api/collections/${address}/enrich`, { creator }),

    /* ─── Tokens ──────────────────────────────────────────────────── */

    collectionTokens: (address: string, params?: {
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerToken[]>(`/api/collections/${address}/tokens`, params),

    tokensByOwner: (owner: string, params?: {
        collection?: string;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerToken[]>(`/api/tokens/owner/${owner}`, params),

    /* ─── Listings ────────────────────────────────────────────────── */

    listings: (params?: {
        status?: number;
        collection?: string;
        seller?: string;
        minPrice?: string;
        maxPrice?: string;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerListing[]>('/api/listings', params),

    /* ─── Offers ──────────────────────────────────────────────────── */

    offers: (params?: {
        status?: number;
        offerer?: string;
        collection?: string;
        tokenId?: number;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerOffer[]>('/api/offers', params),

    /* ─── Auctions ────────────────────────────────────────────────── */

    auctions: (params?: {
        status?: number;
        collection?: string;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerAuction[]>('/api/auctions', params),

    auctionBids: (auctionId: number, params?: {
        page?: number;
        limit?: number;
    }) => apiFetch<{ bidder: string; amount: string; block_number: number }[]>(
        `/api/auctions/${auctionId}/bids`, params,
    ),

    /* ─── Activity ────────────────────────────────────────────────── */

    activity: (params?: {
        collection?: string;
        address?: string;
        type?: string;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerActivity[]>('/api/activity', params),

    /* ─── Stats ───────────────────────────────────────────────────── */

    collectionStats: (address: string) =>
        apiFetch<CollectionStats>(`/api/stats/collection/${address}`),

    globalStats: () => apiFetch<GlobalStats>('/api/stats/global'),

    /* ─── Lending ─────────────────────────────────────────────────── */

    loans: (params?: {
        status?: number;
        borrower?: string;
        lender?: string;
        collection?: string;
        page?: number;
        limit?: number;
    }) => apiFetch<IndexerLoan[]>('/api/loans', params),

    loan: (id: number) =>
        apiFetch<IndexerLoan>(`/api/loans/${id}`),

    lendingStats: () =>
        apiFetch<IndexerLendingStats>('/api/lending/stats'),

    /* ─── Staking ─────────────────────────────────────────────────── */

    stakingPositions: (params?: {
        staker?: string;
        collection?: string;
        status?: number;
        page?: number;
        limit?: number;
    }) => apiFetch<{ staker: string; collection_address: string; token_id: number; pool_id: number; status: number; rewards_claimed: string }[]>(
        '/api/staking/positions', params,
    ),
};
