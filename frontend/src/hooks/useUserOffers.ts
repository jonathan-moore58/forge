/**
 * useUserOffers — Gather offers sent by and received by the wallet.
 *
 * Backed by the FORGE indexer REST API:
 * - /api/offers?offerer=address → sent offers
 * - /api/tokens/owner/address + /api/offers?collection=X&tokenId=Y → received offers
 *
 * Replaces the old O(N) on-chain approach.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IndexerAPI, type IndexerOffer } from '@/services/IndexerAPI';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OfferWithId {
    id: bigint;
    offerer: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
    expiryBlock: bigint;
    status: bigint;
}

export interface UserOffers {
    /** Offers the user has sent (offerer === wallet) */
    sent: OfferWithId[];
    /** Offers targeting NFTs the user owns */
    received: OfferWithId[];
    isLoading: boolean;
    error: Error | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapOffer(o: IndexerOffer): OfferWithId {
    return {
        id: BigInt(o.offer_id),
        offerer: o.offerer,
        collection: o.collection_address,
        tokenId: BigInt(o.token_id),
        price: BigInt(o.price),
        expiryBlock: BigInt(o.expiry_block),
        status: BigInt(o.status),
    };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useUserOffers(
    network: ForgeNetwork,
    walletAddress: string | undefined,
): UserOffers {
    const {
        data: categorised,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['userOffers', network, walletAddress],
        queryFn: async () => {
            if (!walletAddress) return { sent: [], received: [] };

            // 1. Fetch offers sent by user (single HTTP call)
            const sentRes = await IndexerAPI.offers({ offerer: walletAddress, status: 0 });
            const sent = sentRes.data.map(mapOffer);

            // 2. Fetch user's owned tokens to find received offers
            const tokensRes = await IndexerAPI.tokensByOwner(walletAddress);
            const ownedTokens = tokensRes.data;

            // 3. For each unique collection the user owns tokens in, fetch active offers
            const received: OfferWithId[] = [];
            const ownedSet = new Set(
                ownedTokens.map((t) => `${t.collection_address}:${t.token_id}`),
            );

            // Get unique collections
            const collections = [...new Set(ownedTokens.map((t) => t.collection_address))];

            for (const collAddr of collections) {
                try {
                    const offersRes = await IndexerAPI.offers({
                        collection: collAddr,
                        status: 0,
                    });
                    for (const offer of offersRes.data) {
                        const key = `${offer.collection_address}:${offer.token_id}`;
                        if (ownedSet.has(key)) {
                            received.push(mapOffer(offer));
                        }
                    }
                } catch {
                    // Skip failed collection offer lookups
                }
            }

            return { sent, received };
        },
        enabled: !!walletAddress,
        staleTime: 30_000,
    });

    return useMemo(
        () => ({
            sent: categorised?.sent ?? [],
            received: categorised?.received ?? [],
            isLoading,
            error: error as Error | null,
        }),
        [categorised, isLoading, error],
    );
}
