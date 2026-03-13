/**
 * useCollectionActions — Write hooks for CollectionTemplate admin operations.
 *
 * Actions:
 * - setMintOpen: toggle minting on/off
 * - setMintPrice: update mint price
 * - setSalePhase: set sale phase (0=inactive, 2=public, 3=ended)
 * - airdrop: owner mints to any recipient
 * - changeMetadata: update collection branding (icon, banner, description, website)
 * - setBaseUri: set the base URI for token metadata (needed for NFT images)
 * - approveNFT: approve operator for a specific token
 *
 * Owner-only operations pre-check collectionOwner() via a view call
 * before simulating the write. This avoids the opaque "Revert error
 * too long" VM error on older WASM contracts and gives users clear
 * error messages instead.
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import type { Address } from '@btc-vision/transaction';
import { ContractService } from '@/services/ContractService';
import type { ICollectionTemplateContract } from '@/contracts/abis/CollectionTemplateABI';
import type { ForgeNetwork } from '@/config/contracts';
import { resolveAddress } from '@/utils/address';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { collectionKeys } from './useCollectionData';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseCollectionActionsOptions extends UseTransactionOptions {
    /** Collection contract address */
    collectionAddress: string;
    /** Network to use */
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useCollectionActions(options: UseCollectionActionsOptions) {
    const { collectionAddress, network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // Use ref so callbacks always read the latest wallet address,
    // not a stale closure capture from a previous render.
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    // Auto-invalidate collection caches
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        collectionKeys.all(network, collectionAddress),
    ];

    const tx = useTransaction({ label: 'Collection', ...txOptions, invalidateKeys });

    /**
     * Helper: get a fresh contract instance with sender set.
     * Clears cache first to avoid stale getPublicKeyInfo.
     */
    const getContract = useCallback((addr: Address) => {
        ContractService.clearCacheFor(collectionAddress, network);
        const contract = ContractService.getCollection(collectionAddress, network);
        contract.setSender(addr);
        return contract;
    }, [collectionAddress, network]);

    /**
     * Pre-check: verify the connected wallet is the collection owner.
     * Uses a view call (always works, even on old WASM with long-message abort).
     * Throws a clear error message instead of the opaque "Revert error too long".
     */
    const verifyOwnership = useCallback(async (contract: ICollectionTemplateContract, walletAddr: Address) => {
        try {
            const ownerResult = await contract.collectionOwner();
            const ownerHex = ownerResult?.properties?.owner;
            if (ownerHex) {
                // Compare lowercase hex — wallet address may be in different format
                const ownerNorm = String(ownerHex).toLowerCase().replace(/^0x/, '');
                const walletNorm = String(walletAddr).toLowerCase().replace(/^0x/, '');
                if (ownerNorm !== walletNorm) {
                    throw new Error('You are not the owner of this collection. Only the deployer can perform this action.');
                }
            }
        } catch (e) {
            // Re-throw our clear error, swallow others (older contracts may not have collectionOwner)
            if (e instanceof Error && e.message.includes('not the owner')) throw e;
        }
    }, []);

    /**
     * Toggle minting on/off. Owner only.
     */
    const setMintOpen = useCallback(async (open: boolean) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            return await contract.setMintOpen(open);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Update mint price. Owner only.
     */
    const setMintPrice = useCallback(async (price: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            return await contract.setMintPrice(price);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Airdrop — owner mints to any recipient. No price, no limits.
     */
    const airdrop = useCallback(async (recipient: string, quantity: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            const recipientAddr = await resolveAddress(recipient, network);
            return await contract.airdrop(recipientAddr, quantity);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Set sale phase. Owner only.
     * 0=INACTIVE, 1=WHITELIST, 2=PUBLIC, 3=ENDED
     */
    const setSalePhase = useCallback(async (phase: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            return await contract.setSalePhase(phase);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Update collection branding (icon, banner, description, website). Deployer only.
     */
    const changeMetadata = useCallback(async (
        icon: string,
        banner: string,
        description: string,
        website: string,
    ) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            return await contract.changeMetadata(icon, banner, description, website);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Set the base URI for token metadata. Owner only.
     * e.g. "ipfs://QmXyz/" → tokenURI(1) returns "ipfs://QmXyz/1.json"
     */
    const setBaseUri = useCallback(async (baseUri: string) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            await verifyOwnership(contract, addr);
            return await contract.setBaseURI(baseUri);
        });
    }, [collectionAddress, network, tx, getContract, verifyOwnership]);

    /**
     * Approve an operator for a specific token (needed before listing/staking/auctioning).
     */
    const approveNFT = useCallback(async (operator: string, tokenId: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const contract = getContract(addr);
            const operatorAddr = await resolveAddress(operator, network);
            return await contract.approve(operatorAddr, tokenId);
        });
    }, [collectionAddress, network, tx, getContract]);

    return {
        ...tx,
        setMintOpen,
        setMintPrice,
        setSalePhase,
        airdrop,
        changeMetadata,
        setBaseUri,
        approveNFT,
    };
}
