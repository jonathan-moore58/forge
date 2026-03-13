/**
 * useRegisterCollection — Register an external NFT collection on the Marketplace.
 *
 * Wraps the marketplace's registerCollection(collectionAddress) call.
 * Also provides isCollectionRegistered() for pre-check.
 *
 * Accepts both hex (0x...) and bech32m (opt1sq...) address formats.
 *
 * IMPORTANT: P2OP bech32m addresses encode a 21-byte witness program (hash160),
 * NOT the full 32-byte contract address. We CANNOT reverse bech32m → 32 bytes.
 * Instead, we use the SDK's `contractAddress` property which calls getPublicKeyInfo
 * RPC to resolve the real 32-byte Address from the bech32m string.
 */

import { useState, useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { ProviderService } from '@/services/ProviderService';
import { type ForgeNetwork, CONTRACT_ADDRESSES } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { marketKeys } from './useMarketplace';
import { resolveContractPaymentInfo, buildSimulationOutput, buildPaymentOutputs } from '@/utils/p2tr';

/** Registration fee: 0.01 BTC = 1,000,000 sats */
export const REGISTRATION_FEE_SATS = 1_000_000n;

/* ------------------------------------------------------------------ */
/*  Address Helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert user input to a bech32m address string for SDK getContract() calls.
 * Does NOT resolve the 32-byte Address — that requires an async SDK call.
 *
 * Accepts:
 *   - bech32m: opt1sq..., bc1..., tb1... → returned as-is
 *   - hex: 0x... or raw 64 hex chars → converted via Address.fromString().p2op()
 */
function toBech32m(input: string, network: ForgeNetwork): string {
    const trimmed = input.trim();

    // Already bech32m
    if (trimmed.startsWith('opt') || trimmed.startsWith('bc1') || trimmed.startsWith('tb1')) {
        return trimmed;
    }

    // Hex address — strip 0x prefix, validate, convert to bech32m
    const hex = trimmed.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error('Invalid address format. Enter a 64-char hex (with or without 0x) or a bech32m address (opt1sq...).');
    }
    const address = Address.fromString(hex);
    const net = network === 'testnet' ? networks.opnetTestnet
        : network === 'mainnet' ? networks.bitcoin
        : networks.regtest;
    return address.p2op(net);
}

/**
 * For hex input, we can directly create the 32-byte Address object.
 * For bech32m input, returns null — must use SDK to resolve.
 */
function tryDirectAddress(input: string): Address | null {
    const trimmed = input.trim();
    if (trimmed.startsWith('opt') || trimmed.startsWith('bc1') || trimmed.startsWith('tb1')) {
        return null; // Can't reverse bech32m → 32-byte address
    }
    const hex = trimmed.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        return Address.fromString(hex);
    }
    return null;
}

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

    // Store the resolved 32-byte Address from validation step
    // so registerCollection() can use it without re-resolving
    const resolvedAddressRef = useRef<Address | null>(null);

    // Invalidate marketplace/collection caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        marketKeys.stats(network),
    ];

    const tx = useTransaction({ label: 'Register Collection', ...txOptions, invalidateKeys });

    /**
     * Validate that the address is a real NFT collection contract.
     * Tries to call name(), symbol(), and totalSupply().
     *
     * Also resolves the 32-byte Address via SDK and stores it for registerCollection().
     */
    const validateCollection = useCallback(async (rawInput: string) => {
        setIsValidating(true);
        setValidationError(null);
        setPreview(null);
        setIsAlreadyRegistered(false);
        resolvedAddressRef.current = null;

        try {
            // Convert to bech32m for SDK calls
            const bech32mAddr = toBech32m(rawInput, network);

            // Create collection contract instance via SDK
            const collection = ContractService.getCollection(bech32mAddr, network);
            if (walletAddr) collection.setSender(walletAddr);

            // Resolve the real 32-byte Address.
            // For hex input, use Address.fromString directly (faster, no RPC).
            // For bech32m input, use provider.getPublicKeyInfo() to resolve via RPC.
            const directAddr = tryDirectAddress(rawInput);
            const collectionAddr: Address = directAddr
                ?? await ProviderService.getProvider(network).getPublicKeyInfo(bech32mAddr, true);

            // Store for registerCollection()
            resolvedAddressRef.current = collectionAddr;

            // Check if already registered on marketplace
            const market = ContractService.getMarketplace(network);
            if (walletAddr) market.setSender(walletAddr);
            const regResult = await market.isCollectionRegistered(collectionAddr);

            if (regResult.properties.registered) {
                setIsAlreadyRegistered(true);
                setValidationError('This collection is already registered on the marketplace.');
                setIsValidating(false);
                return false;
            }

            // Try to read name/symbol/supply from the collection contract
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
     *
     * Uses the 32-byte Address resolved during validateCollection().
     * If not validated yet, resolves it here.
     */
    const registerCollection = useCallback(async (rawInput: string) => {
        if (!walletAddr) throw new Error('Wallet not connected');

        const marketplaceAddress = CONTRACT_ADDRESSES[network].marketplace;
        if (!marketplaceAddress) throw new Error('Marketplace not deployed');

        // Get the 32-byte Address — prefer cached from validation, else resolve
        const cachedAddr = resolvedAddressRef.current;
        const collectionAddr: Address = cachedAddr
            ?? tryDirectAddress(rawInput)
            ?? await ProviderService.getProvider(network)
                .getPublicKeyInfo(toBech32m(rawInput, network), true);

        // Resolve marketplace contract payment info (P2TR script)
        const market = ContractService.getMarketplace(network);
        const paymentInfo = await resolveContractPaymentInfo(market, 'marketplace-register');
        const extraOutputs = buildPaymentOutputs(paymentInfo?.p2trScript, marketplaceAddress, REGISTRATION_FEE_SATS);

        // Capture collectionAddr in closure (avoid stale ref)
        const addrForTx = collectionAddr;

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddr);

            // Set payment details for simulation (flags=hasScriptPubKey with P2TR bytes)
            market.setTransactionDetails({
                inputs: [],
                outputs: [buildSimulationOutput(paymentInfo?.p2trScript, marketplaceAddress, REGISTRATION_FEE_SATS)],
            });

            return await market.registerCollection(addrForTx);
        }, undefined, extraOutputs);
    }, [walletAddr, network, tx]);

    const reset = useCallback(() => {
        resolvedAddressRef.current = null;
        tx.reset();
    }, [tx]);

    return {
        ...tx,
        reset,
        preview,
        isValidating,
        validationError,
        isAlreadyRegistered,
        validateCollection,
        registerCollection,
    };
}
