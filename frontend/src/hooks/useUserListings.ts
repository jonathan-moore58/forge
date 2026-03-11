/**
 * useUserListings — Filter marketplace listings by seller === walletAddress.
 *
 * Uses the existing useAllListings hook and filters client-side.
 * Short-term approach (no indexer). At scale, replace with an indexed query.
 */

import { useMemo } from 'react';
import { useAllListings, type ListingWithId } from './useMarketplace';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UserListings {
    /** Active listings where seller === walletAddress */
    listings: ListingWithId[];
    isLoading: boolean;
    error: Error | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useUserListings(
    network: ForgeNetwork,
    walletAddress: string | undefined,
): UserListings {
    const { data: allListings, isLoading, error } = useAllListings(network);

    const listings = useMemo((): ListingWithId[] => {
        if (!allListings || !walletAddress) return [];
        const normalised = walletAddress.toLowerCase();
        return allListings.filter(
            (listing) => String(listing.seller).toLowerCase() === normalised,
        );
    }, [allListings, walletAddress]);

    return useMemo(
        () => ({
            listings,
            isLoading,
            error: error as Error | null,
        }),
        [listings, isLoading, error],
    );
}
