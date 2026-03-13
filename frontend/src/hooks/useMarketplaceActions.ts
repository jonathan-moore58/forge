/**
 * useMarketplaceActions — Write hooks for the Marketplace contract.
 *
 * Provides: listNFT, buyNFT, cancelListing, makeOffer, acceptOffer, cancelOffer.
 *
 * buyNFT is payable — it sends sats to the marketplace contract.
 * makeOffer is NOT payable — it just records the offer on-chain.
 * Payment outputs:
 *   Simulation: flags=hasTo (1) + hex address (contract matches via toHex())
 *   PSBT:       P2TR scriptPubKey { script } (creates P2TR output on Bitcoin)
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { resolveAddress } from '@/utils/address';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { marketKeys } from './useMarketplace';
import { resolveContractPaymentInfo, buildSimulationOutput, buildPaymentOutputs } from '@/utils/p2tr';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseMarketplaceActionsOptions extends UseTransactionOptions {
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMarketplaceActions(options: UseMarketplaceActionsOptions) {
    const { network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // F-H1: Keep a ref to avoid stale closures after wallet reconnect
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    const marketplaceAddress = CONTRACT_ADDRESSES[network].marketplace;

    // Auto-invalidate marketplace caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        marketKeys.listings(network),
        marketKeys.stats(network),
    ];

    const tx = useTransaction({ label: 'Marketplace', ...txOptions, invalidateKeys });

    /**
     * List an NFT for sale on the marketplace.
     * NOTE: The NFT must be approved for the marketplace contract first.
     *
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID to list
     * @param price Listing price in sats
     */
    const listNFT = useCallback(async (collection: string, tokenId: bigint, price: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);
            const collectionAddr = await resolveAddress(collection, network);
            return await market.listNFT(collectionAddr, tokenId, price);
        });
    }, [walletAddr, network, tx]);

    /**
     * Buy a listed NFT.
     * Payable — sends the listing price to the marketplace contract.
     *
     * @param listingId The listing ID
     * @param price The listing price in sats
     */
    const buyNFT = useCallback(async (listingId: bigint, price: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        if (!marketplaceAddress) throw new Error('Marketplace not deployed');

        console.log('[FORGE][buyNFT] Starting', {
            listingId: listingId.toString(),
            price: price.toString(),
            buyer: walletAddrRef.current,
            marketplaceAddress,
        });

        // Resolve contract payment info (hex address + P2TR script)
        const market = ContractService.getMarketplace(network);
        const paymentInfo = await resolveContractPaymentInfo(market, 'marketplace-buy');

        if (!paymentInfo) {
            console.error('[FORGE][buyNFT] Failed to resolve payment info');
            throw new Error('Failed to resolve marketplace payment info');
        }

        const simOutput = buildSimulationOutput(paymentInfo.p2trScript, marketplaceAddress, price, paymentInfo.hexAddress);
        console.log('[FORGE][buyNFT] Simulation output', {
            to: simOutput.to,
            value: simOutput.value.toString(),
            flags: simOutput.flags,
            scriptPubKeyLen: simOutput.scriptPubKey?.length,
            hexAddress: paymentInfo.hexAddress,
        });

        const extraOutputs = buildPaymentOutputs(paymentInfo.p2trScript, marketplaceAddress, price);

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);

            market.setTransactionDetails({
                inputs: [],
                outputs: [simOutput],
            });

            console.log('[FORGE][buyNFT] Calling market.buyNFT with listingId:', listingId.toString());
            return await market.buyNFT(listingId);
        }, undefined, extraOutputs);
    }, [walletAddr, network, marketplaceAddress, tx]);

    /**
     * Cancel a listing (seller only).
     * @param listingId The listing ID to cancel
     */
    const cancelListing = useCallback(async (listingId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);
            return await market.cancelListing(listingId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Make an offer on an NFT.
     * Payable — sends the offer amount to the marketplace.
     *
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID (0n for collection-wide offers)
     * @param price Offer price in sats
     * @param expiryBlock Block number when offer expires
     * @param isCollectionWide Whether this is a collection-wide offer
     */
    const makeOffer = useCallback(async (
        collection: string,
        tokenId: bigint,
        price: bigint,
        expiryBlock: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);

            const collectionAddr = await resolveAddress(collection, network);
            return await market.makeOffer(collectionAddr, tokenId, price, expiryBlock);
        });
    }, [walletAddr, network, tx]);

    /**
     * Accept an offer (NFT owner only).
     * @param offerId The offer ID to accept
     * @param tokenId The token ID to sell
     */
    const acceptOffer = useCallback(async (offerId: bigint, tokenId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);
            return await market.acceptOffer(offerId, tokenId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Cancel an offer (offerer only).
     * @param offerId The offer ID to cancel
     */
    const cancelOffer = useCallback(async (offerId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);
            return await market.cancelOffer(offerId);
        });
    }, [walletAddr, network, tx]);

    return {
        ...tx,
        listNFT,
        buyNFT,
        cancelListing,
        makeOffer,
        acceptOffer,
        cancelOffer,
    };
}
