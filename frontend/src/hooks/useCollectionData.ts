/**
 * useCollectionData — React Query hooks for individual CollectionTemplate contracts.
 *
 * v11 lean contract: metadata, pricing, supply, owner, mint status,
 * royalty, and token-level queries.
 */

import { useQuery } from '@tanstack/react-query';
import { Address } from '@btc-vision/transaction';
import { ContractService } from '@/services/ContractService';
import { MetadataService, type TokenMetadata } from '@/services/MetadataService';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const collectionKeys = {
    all: (network: ForgeNetwork, address: string) => ['collection', network, address] as const,
    metadata: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'metadata'] as const,
    currentPrice: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'currentPrice'] as const,
    supply: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'supply'] as const,
    mintOpen: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'mintOpen'] as const,
    tokenURI: (network: ForgeNetwork, address: string, tokenId: string) => [...collectionKeys.all(network, address), 'tokenURI', tokenId] as const,
    tokenMeta: (network: ForgeNetwork, address: string, tokenId: string) => [...collectionKeys.all(network, address), 'tokenMeta', tokenId] as const,
    ownerOf: (network: ForgeNetwork, address: string, tokenId: string) => [...collectionKeys.all(network, address), 'ownerOf', tokenId] as const,
    balanceOf: (network: ForgeNetwork, address: string, owner: string) => [...collectionKeys.all(network, address), 'balanceOf', owner] as const,
    ownedTokens: (network: ForgeNetwork, address: string, owner: string) => [...collectionKeys.all(network, address), 'ownedTokens', owner] as const,
    owner: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'owner'] as const,
    royaltyInfo: (network: ForgeNetwork, address: string) => [...collectionKeys.all(network, address), 'royalty'] as const,
};

/* ------------------------------------------------------------------ */
/*  Collection-level metadata (name, symbol, totalSupply, icon, etc.) */
/* ------------------------------------------------------------------ */

export interface CollectionMetadata {
    name: string;
    symbol: string;
    icon: string;
    banner: string;
    description: string;
    website: string;
    totalSupply: bigint;
}

/**
 * Fetch on-chain collection metadata (name, symbol, icon, banner, description, website, totalSupply).
 */
export function useCollectionMetadata(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.metadata(network, address ?? ''),
        queryFn: async (): Promise<CollectionMetadata> => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.metadata();
            const p = result.properties;
            return {
                name: p.name,
                symbol: p.symbol,
                icon: p.icon,
                banner: p.banner,
                description: p.description,
                website: p.website,
                totalSupply: p.totalSupply,
            };
        },
        enabled: !!address,
    });
}

/* ------------------------------------------------------------------ */
/*  Mint status & pricing                                              */
/* ------------------------------------------------------------------ */

/**
 * Check if minting is currently open.
 */
export function useIsMintOpen(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.mintOpen(network, address ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.isMintOpen();
            return result.properties.open;
        },
        enabled: !!address,
        refetchInterval: 30_000,
    });
}

/**
 * Get current mint price.
 */
export function useCurrentPrice(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.currentPrice(network, address ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.currentPrice();
            return result.properties.price;
        },
        enabled: !!address,
        refetchInterval: 30_000,
    });
}

/**
 * Get current total supply.
 */
export function useTotalSupply(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.supply(network, address ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.totalSupply();
            return result.properties.totalSupply;
        },
        enabled: !!address,
        refetchInterval: 15_000,
    });
}

/**
 * Get the collection owner address.
 */
export function useCollectionOwner(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.owner(network, address ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.collectionOwner();
            return result.properties.owner;
        },
        enabled: !!address,
    });
}

/**
 * Get royalty info (bps + recipient).
 */
export function useRoyaltyInfo(network: ForgeNetwork, address: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.royaltyInfo(network, address ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.royaltyInfo();
            return result.properties;
        },
        enabled: !!address,
    });
}

/* ------------------------------------------------------------------ */
/*  Token-level data                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get the token URI for a specific token.
 */
export function useTokenURI(network: ForgeNetwork, address: string | undefined, tokenId: bigint | undefined) {
    return useQuery({
        queryKey: collectionKeys.tokenURI(network, address ?? '', tokenId?.toString() ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.tokenURI(tokenId!);
            return result.properties.uri;
        },
        enabled: !!address && tokenId !== undefined,
        staleTime: 300_000,
    });
}

/**
 * Fetch full token metadata (name, description, image, attributes)
 * by first getting the URI on-chain, then fetching from IPFS.
 */
export function useTokenMetadata(network: ForgeNetwork, address: string | undefined, tokenId: bigint | undefined) {
    return useQuery({
        queryKey: collectionKeys.tokenMeta(network, address ?? '', tokenId?.toString() ?? ''),
        queryFn: async (): Promise<TokenMetadata> => {
            const contract = ContractService.getCollection(address!, network);
            const uriResult = await contract.tokenURI(tokenId!);
            const uri = uriResult.properties.uri;
            return MetadataService.fetchMetadata(uri);
        },
        enabled: !!address && tokenId !== undefined,
        staleTime: 300_000,
    });
}

/**
 * Get the owner of a specific token.
 */
export function useOwnerOf(network: ForgeNetwork, address: string | undefined, tokenId: bigint | undefined) {
    return useQuery({
        queryKey: collectionKeys.ownerOf(network, address ?? '', tokenId?.toString() ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const result = await contract.ownerOf(tokenId!);
            return result.properties.owner;
        },
        enabled: !!address && tokenId !== undefined,
    });
}

/**
 * Get the balance (number of tokens owned) for an owner in a collection.
 */
export function useBalanceOf(network: ForgeNetwork, address: string | undefined, owner: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.balanceOf(network, address ?? '', owner ?? ''),
        queryFn: async () => {
            const contract = ContractService.getCollection(address!, network);
            const ownerAddr = Address.fromString(owner!);
            const result = await contract.balanceOf(ownerAddr);
            return result.properties.balance;
        },
        enabled: !!address && !!owner,
    });
}

/**
 * Enumerate all tokens owned by an address in a collection.
 * Uses tokenOfOwnerByIndex to iterate.
 */
export function useOwnedTokens(network: ForgeNetwork, address: string | undefined, owner: string | undefined) {
    return useQuery({
        queryKey: collectionKeys.ownedTokens(network, address ?? '', owner ?? ''),
        queryFn: async (): Promise<bigint[]> => {
            const contract = ContractService.getCollection(address!, network);
            const ownerAddr = Address.fromString(owner!);

            // First get balance
            const balResult = await contract.balanceOf(ownerAddr);
            const balance = balResult.properties.balance;

            if (balance === 0n) return [];

            // Enumerate tokens by index
            const tokenIds: bigint[] = [];
            for (let i = 0n; i < balance; i++) {
                try {
                    const result = await contract.tokenOfOwnerByIndex(ownerAddr, i);
                    tokenIds.push(result.properties.tokenId);
                } catch {
                    break;
                }
            }
            return tokenIds;
        },
        enabled: !!address && !!owner,
        staleTime: 30_000,
    });
}
