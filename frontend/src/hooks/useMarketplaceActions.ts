/**
 * useMarketplaceActions — Write hooks for the Marketplace contract.
 *
 * Provides: listNFT, buyNFT, cancelListing, makeOffer, acceptOffer, cancelOffer.
 *
 * buyNFT and makeOffer are payable — they require setTransactionDetails
 * with the purchase/offer amount sent to the marketplace contract.
 */

import { useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { toSatoshi } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { marketKeys } from './useMarketplace';

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

    const tx = useTransaction({ ...txOptions, invalidateKeys });

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
            const collectionAddr = Address.fromString(collection);
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

        const extraOutputs = [{ address: marketplaceAddress, value: toSatoshi(price) }];

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);

            // Send payment to marketplace contract (for simulation)
            market.setTransactionDetails({
                inputs: [],
                outputs: [{
                    index: 1,
                    to: marketplaceAddress,
                    value: price,
                    flags: 0,
                }],
            });

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
        isCollectionWide: boolean = false,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        if (!marketplaceAddress) throw new Error('Marketplace not deployed');

        const extraOutputs = [{ address: marketplaceAddress, value: toSatoshi(price) }];

        return tx.execute(async () => {
            const market = ContractService.getMarketplace(network);
            market.setSender(walletAddrRef.current!);

            // Send offer amount to marketplace (held in escrow — for simulation)
            market.setTransactionDetails({
                inputs: [],
                outputs: [{
                    index: 1,
                    to: marketplaceAddress,
                    value: price,
                    flags: 0,
                }],
            });

            const collectionAddr = Address.fromString(collection);
            return await market.makeOffer(collectionAddr, tokenId, price, expiryBlock, isCollectionWide);
        }, undefined, extraOutputs);
    }, [walletAddr, network, marketplaceAddress, tx]);

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
