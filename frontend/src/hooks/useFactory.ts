/**
 * useFactory — React Query hooks for the NFTFactory v6 (Registry).
 *
 * The v6 Factory is a collection registry:
 *   - registerCollection(address) → records + emits CollectionCreated
 *   - isRegistered(address) → check if registered
 *   - collectionCount() → total registered collections
 *
 * Collection enumeration and metadata are provided by the backend
 * indexer API (see useCollections hook), NOT by the Factory contract.
 */

import { useQuery } from '@tanstack/react-query';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const factoryKeys = {
    all: (network: ForgeNetwork) => ['factory', network] as const,
    collectionCount: (network: ForgeNetwork) => [...factoryKeys.all(network), 'collectionCount'] as const,
};

/** Check if the factory contract is deployed on this network */
function isFactoryDeployed(network: ForgeNetwork): boolean {
    return !!CONTRACT_ADDRESSES[network].factory;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get total number of registered collections.
 */
export function useCollectionCount(network: ForgeNetwork) {
    return useQuery({
        queryKey: factoryKeys.collectionCount(network),
        queryFn: async () => {
            const factory = ContractService.getFactory(network);
            const result = await factory.collectionCount();
            return result.properties.count;
        },
        enabled: isFactoryDeployed(network),
    });
}
