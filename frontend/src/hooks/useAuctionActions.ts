/**
 * useAuctionActions — Write hooks for the AuctionHouse contract.
 *
 * Provides: createEnglishAuction, createDutchAuction, placeBid,
 *           buyDutchAuction, settleAuction, cancelAuction.
 *
 * placeBid and buyDutchAuction are payable — they send sats to the AuctionHouse.
 */

import { useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { toSatoshi } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { auctionKeys } from './useAuctions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseAuctionActionsOptions extends UseTransactionOptions {
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAuctionActions(options: UseAuctionActionsOptions) {
    const { network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // F-H1: Keep a ref to avoid stale closures after wallet reconnect
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    const auctionHouseAddress = CONTRACT_ADDRESSES[network].auctionHouse;

    // Auto-invalidate auction caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        auctionKeys.list(network),
        auctionKeys.stats(network),
    ];

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Create an English (ascending bid) auction.
     * NOTE: The NFT must be approved for the AuctionHouse contract first.
     *
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID to auction
     * @param startPrice Starting price in sats
     * @param reservePrice Reserve price in sats (min price to settle)
     * @param durationBlocks Duration in blocks
     */
    const createEnglishAuction = useCallback(async (
        collection: string,
        tokenId: bigint,
        startPrice: bigint,
        reservePrice: bigint,
        durationBlocks: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            return await house.createEnglishAuction(collectionAddr, tokenId, startPrice, reservePrice, durationBlocks);
        });
    }, [walletAddr, network, tx]);

    /**
     * Create a Dutch (descending price) auction.
     * NOTE: The NFT must be approved for the AuctionHouse contract first.
     *
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID to auction
     * @param startPrice Starting (highest) price in sats
     * @param endPrice Ending (lowest) price in sats
     * @param durationBlocks Duration in blocks
     */
    const createDutchAuction = useCallback(async (
        collection: string,
        tokenId: bigint,
        startPrice: bigint,
        endPrice: bigint,
        durationBlocks: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            return await house.createDutchAuction(collectionAddr, tokenId, startPrice, endPrice, durationBlocks);
        });
    }, [walletAddr, network, tx]);

    /**
     * Place a bid on an English auction.
     * Payable — sends the bid amount to the AuctionHouse.
     *
     * @param auctionId The auction ID
     * @param bidAmount Bid amount in sats (must exceed current highest bid)
     */
    const placeBid = useCallback(async (auctionId: bigint, bidAmount: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        if (!auctionHouseAddress) throw new Error('AuctionHouse not deployed');

        const extraOutputs = [{ address: auctionHouseAddress, value: toSatoshi(bidAmount) }];

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);

            // Send bid amount to auction house (for simulation)
            house.setTransactionDetails({
                inputs: [],
                outputs: [{
                    index: 1,
                    to: auctionHouseAddress,
                    value: bidAmount,
                    flags: 0,
                }],
            });

            return await house.placeBid(auctionId, bidAmount);
        }, undefined, extraOutputs);
    }, [walletAddr, network, auctionHouseAddress, tx]);

    /**
     * Buy at the current Dutch auction price.
     * Payable — sends the current price to the AuctionHouse.
     *
     * @param auctionId The auction ID
     * @param currentPrice Current Dutch price in sats (from useDutchPrice)
     */
    const buyDutchAuction = useCallback(async (auctionId: bigint, currentPrice: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        if (!auctionHouseAddress) throw new Error('AuctionHouse not deployed');

        const extraOutputs = [{ address: auctionHouseAddress, value: toSatoshi(currentPrice) }];

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);

            house.setTransactionDetails({
                inputs: [],
                outputs: [{
                    index: 1,
                    to: auctionHouseAddress,
                    value: currentPrice,
                    flags: 0,
                }],
            });

            return await house.buyDutchAuction(auctionId);
        }, undefined, extraOutputs);
    }, [walletAddr, network, auctionHouseAddress, tx]);

    /**
     * Settle an ended English auction (anyone can call).
     * @param auctionId The auction ID
     */
    const settleAuction = useCallback(async (auctionId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            return await house.settleAuction(auctionId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Cancel an auction (seller only, before any bids).
     * @param auctionId The auction ID
     */
    const cancelAuction = useCallback(async (auctionId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            return await house.cancelAuction(auctionId);
        });
    }, [walletAddr, network, tx]);

    return {
        ...tx,
        createEnglishAuction,
        createDutchAuction,
        placeBid,
        buyDutchAuction,
        settleAuction,
        cancelAuction,
    };
}
