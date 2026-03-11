/**
 * useCollectionActions — Write hooks for CollectionTemplate v12 admin operations.
 *
 * Actions:
 * - setMintOpen: toggle minting on/off
 * - setMintPrice: update mint price
 * - setSalePhase: set sale phase (0=inactive, 2=public, 3=ended)
 * - airdrop: owner mints to any recipient
 * - changeMetadata: update collection branding (icon, banner, description, website)
 * - approveNFT: approve operator for a specific token
 */

import { useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import type { ForgeNetwork } from '@/config/contracts';
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

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Toggle minting on/off. Owner only.
     */
    const setMintOpen = useCallback(async (open: boolean) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            // Clear cached instance so getPublicKeyInfo is re-queried
            // (SDK caches a null/undefined Address permanently if the first
            //  RPC call for this contract fails, e.g. right after deploy)
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            return await contract.setMintOpen(open);
        });
    }, [collectionAddress, network, tx]);

    /**
     * Update mint price. Owner only.
     */
    const setMintPrice = useCallback(async (price: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            return await contract.setMintPrice(price);
        });
    }, [collectionAddress, network, tx]);

    /**
     * Airdrop — owner mints to any recipient. No price, no limits.
     */
    const airdrop = useCallback(async (recipient: string, quantity: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            const recipientAddr = Address.fromString(recipient);
            return await contract.airdrop(recipientAddr, quantity);
        });
    }, [collectionAddress, network, tx]);

    /**
     * Set sale phase. Owner only.
     * 0=INACTIVE, 1=WHITELIST, 2=PUBLIC, 3=ENDED
     */
    const setSalePhase = useCallback(async (phase: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            return await contract.setSalePhase(phase);
        });
    }, [collectionAddress, network, tx]);

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
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            return await contract.changeMetadata(icon, banner, description, website);
        });
    }, [collectionAddress, network, tx]);

    /**
     * Approve an operator for a specific token (needed before listing/staking/auctioning).
     */
    const approveNFT = useCallback(async (operator: string, tokenId: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);
            const operatorAddr = Address.fromString(operator);
            return await contract.approve(operatorAddr, tokenId);
        });
    }, [collectionAddress, network, tx]);

    return {
        ...tx,
        setMintOpen,
        setMintPrice,
        setSalePhase,
        airdrop,
        changeMetadata,
        approveNFT,
    };
}
