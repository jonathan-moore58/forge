/**
 * useMint — Write hook for minting NFTs from a CollectionTemplate contract.
 *
 * v7 lean contract: publicMint only (no whitelist phase).
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { toSatoshi } from '@btc-vision/bitcoin';
import { ContractService } from '@/services/ContractService';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { collectionKeys } from './useCollectionData';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseMintOptions extends UseTransactionOptions {
    /** Collection contract address */
    collectionAddress: string;
    /** Network to use */
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMint(options: UseMintOptions) {
    const { collectionAddress, network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // Use ref so callback always reads the latest wallet address,
    // not a stale closure capture from a previous render.
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    // Auto-invalidate supply caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        collectionKeys.supply(network, collectionAddress),
    ];

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Public mint — requires minting to be open (isMintOpen = true).
     * @param quantity Number of NFTs to mint
     * @param pricePerToken Price per token in sats
     */
    const publicMint = useCallback(async (quantity: bigint, pricePerToken: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        const totalPrice = pricePerToken * quantity;

        // Build extra PSBT outputs for the payable call (sends sats to contract)
        const extraOutputs = totalPrice > 0n
            ? [{ address: collectionAddress, value: toSatoshi(totalPrice) }]
            : undefined;

        return tx.execute(async () => {
            // Clear cached instance — SDK caches a null Address from
            // getPublicKeyInfo permanently if first call fails (e.g. newly deployed contract)
            ContractService.clearCacheFor(collectionAddress, network);
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);

            // Tell the simulator about the payment
            if (totalPrice > 0n) {
                contract.setTransactionDetails({
                    inputs: [],
                    outputs: [{
                        index: 1,
                        to: collectionAddress,
                        value: totalPrice,
                        flags: 0,
                    }],
                });
            }

            return await contract.publicMint(quantity);
        }, undefined, extraOutputs);
    }, [collectionAddress, network, tx]);

    return {
        ...tx,
        publicMint,
    };
}
