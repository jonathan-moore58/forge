/**
 * useRegisterCollection — Register an external NFT collection on the Marketplace.
 *
 * Wraps the marketplace's registerCollection(collectionAddress) call.
 * Also provides isCollectionRegistered() for pre-check.
 */

import { useState, useCallback } from 'react';
import { Address } from '@btc-vision/transaction';
import { toSatoshi } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { type ForgeNetwork, CONTRACT_ADDRESSES } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { marketKeys } from './useMarketplace';

/** Registration fee: 0.01 BTC = 1,000,000 sats */
export const REGISTRATION_FEE_SATS = 1_000_000n;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseRegisterCollectionOptions extends UseTransactionOptions {
    network: ForgeNetwork;
}

export interface CollectionPreview {
    name: string;
    symbol: string;
    supply: bigint;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useRegisterCollection(options: UseRegisterCollectionOptions) {
    const { network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    const [preview, setPreview] = useState<CollectionPreview | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);

    // Invalidate marketplace/collection caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        marketKeys.stats(network),
    ];

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Validate that the address is a real NFT collection contract.
     * Tries to call name(), symbol(), and totalSupply().
     */
    const validateCollection = useCallback(async (collectionHex: string) => {
        setIsValidating(true);
        setValidationError(null);
        setPreview(null);
        setIsAlreadyRegistered(false);

        try {
            // Check if already registered on marketplace
            const market = ContractService.getMarketplace(network);
            if (walletAddr) market.setSender(walletAddr);
            const collectionAddr = Address.fromString(collectionHex);
            const regResult = await market.isCollectionRegistered(collectionAddr);

            if (regResult.properties.registered) {
                setIsAlreadyRegistered(true);
                setValidationError('This collection is already registered on the marketplace.');
                setIsValidating(false);
                return false;
            }

            // Try to read name/symbol/supply from the collection contract
            const collection = ContractService.getCollection(collectionHex, network);
            if (walletAddr) collection.setSender(walletAddr);

            const [nameResult, symbolResult, supplyResult] = await Promise.all([
                collection.name(),
                collection.symbol(),
                collection.totalSupply(),
            ]);

            setPreview({
                name: nameResult.properties.name,
                symbol: symbolResult.properties.symbol,
                supply: supplyResult.properties.totalSupply,
            });

            setIsValidating(false);
            return true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setValidationError(`Invalid collection contract: ${msg}`);
            setIsValidating(false);
            return false;
        }
    }, [network, walletAddr]);

    /**
     * Register the collection on-chain via marketplace.registerCollection().
     * Payable — sends the registration fee (0.01 BTC) to the marketplace contract.
     */
    const registerCollection = useCallback(async (collectionHex: string) => {
        if (!walletAddr) throw new Error('Wallet not connected');

        const marketplaceAddress = CONTRACT_ADDRESSES[network].marketplace;
        if (!marketplaceAddress) throw new Error('Marketplace not deployed');

        const extraOutputs = [{ address: marketplaceAddress, value: toSatoshi(REGISTRATION_FEE_SATS) }];

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddr);

            // Set transaction details for simulation (payable call)
            market.setTransactionDetails({
                inputs: [],
                outputs: [{
                    index: 1,
                    to: marketplaceAddress,
                    value: REGISTRATION_FEE_SATS,
                    flags: 0,
                }],
            });

            const collectionAddr = Address.fromString(collectionHex);
            return await market.registerCollection(collectionAddr);
        }, undefined, extraOutputs);
    }, [walletAddr, network, tx]);

    return {
        ...tx,
        preview,
        isValidating,
        validationError,
        isAlreadyRegistered,
        validateCollection,
        registerCollection,
    };
}
