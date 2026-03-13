/**
 * useAuctionActions — Write hooks for the AuctionHouse contract.
 *
 * Provides: createEnglishAuction, createDutchAuction, placeBid,
 *           buyDutchAuction, settleAuction, cancelAuction.
 *
 * placeBid and buyDutchAuction are payable — they send sats to the AuctionHouse.
 * Payment outputs:
 *   Simulation: flags=hasTo (1) + hex address (contract matches via toHex())
 *   PSBT:       P2TR scriptPubKey { script } (creates P2TR output on Bitcoin)
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { resolveAddress } from '@/utils/address';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { auctionKeys } from './useAuctions';
import { resolveContractPaymentInfo, buildSimulationOutput, buildPaymentOutputs } from '@/utils/p2tr';

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

    const tx = useTransaction({ label: 'Auction', ...txOptions, invalidateKeys });

    /**
     * Create an English (ascending bid) auction.
     * NOTE: The NFT must be approved for the AuctionHouse contract first.
     *
     * Includes preflight checks (ownership, approval) that give specific error
     * messages, since the contract's abort handler strips all revert reasons.
     *
     * @param collection Collection contract address (bech32m or hex)
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
        if (!auctionHouseAddress) throw new Error('AuctionHouse not deployed on this network');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            const collectionAddr = await resolveAddress(collection, network);

            // --- Preflight checks (give specific errors before opaque VM revert) ---

            // 1. Verify ownership — contract does cross-contract ownerOf check
            const collectionContract = ContractService.getCollection(collection, network);
            try {
                const ownerResult = await collectionContract.ownerOf(tokenId);
                const nftOwner = String(ownerResult.properties.owner).toLowerCase();
                const wallet = String(walletAddrRef.current!).toLowerCase();
                if (nftOwner !== wallet) {
                    throw new Error(
                        `You do not own token #${tokenId}. The on-chain owner does not match your connected wallet.`,
                    );
                }
            } catch (err) {
                if (err instanceof Error && err.message.includes('do not own')) throw err;
                throw new Error(
                    `Could not verify NFT ownership for token #${tokenId}. The collection may not support ownerOf(). ` +
                    `Details: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

            // 2. Verify approval — needed for settlement (transferFrom)
            try {
                const ownerAddr = await resolveAddress(String(walletAddrRef.current!), network);
                const operatorAddr = await resolveAddress(auctionHouseAddress, network);
                const approvalResult = await collectionContract.isApprovedForAll(ownerAddr, operatorAddr);
                if (!approvalResult.properties.approved) {
                    throw new Error(
                        'The AuctionHouse is not approved to transfer NFTs from this collection. Go back and approve first.',
                    );
                }
            } catch (err) {
                // Re-throw our own specific errors
                if (err instanceof Error && (err.message.includes('not approved') || err.message.includes('AuctionHouse'))) throw err;
                // Don't block on approval check failure — contract may still accept
                console.warn('[FORGE][auction] Approval preflight check failed (non-critical):', err);
            }

            // 3. Param validation (mirrors contract checks)
            if (startPrice <= 0n) throw new Error('Start price must be greater than 0.');
            if (reservePrice > startPrice) throw new Error('Reserve price cannot exceed start price.');
            if (durationBlocks <= 0n) throw new Error('Duration must be at least 1 block.');
            if (durationBlocks > 52560n) throw new Error('Maximum duration is 52,560 blocks (~1 year).');

            return await house.createEnglishAuction(collectionAddr, tokenId, startPrice, reservePrice, durationBlocks);
        });
    }, [walletAddr, network, auctionHouseAddress, tx]);

    /**
     * Create a Dutch (descending price) auction.
     * NOTE: The NFT must be approved for the AuctionHouse contract first.
     *
     * Includes preflight checks — same rationale as createEnglishAuction.
     *
     * @param collection Collection contract address (bech32m or hex)
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
        if (!auctionHouseAddress) throw new Error('AuctionHouse not deployed on this network');

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);
            const collectionAddr = await resolveAddress(collection, network);

            // --- Preflight checks ---

            // 1. Verify ownership
            const collectionContract = ContractService.getCollection(collection, network);
            try {
                const ownerResult = await collectionContract.ownerOf(tokenId);
                const nftOwner = String(ownerResult.properties.owner).toLowerCase();
                const wallet = String(walletAddrRef.current!).toLowerCase();
                if (nftOwner !== wallet) {
                    throw new Error(
                        `You do not own token #${tokenId}. The on-chain owner does not match your connected wallet.`,
                    );
                }
            } catch (err) {
                if (err instanceof Error && err.message.includes('do not own')) throw err;
                throw new Error(
                    `Could not verify NFT ownership for token #${tokenId}. ` +
                    `Details: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

            // 2. Verify approval
            try {
                const ownerAddr = await resolveAddress(String(walletAddrRef.current!), network);
                const operatorAddr = await resolveAddress(auctionHouseAddress, network);
                const approvalResult = await collectionContract.isApprovedForAll(ownerAddr, operatorAddr);
                if (!approvalResult.properties.approved) {
                    throw new Error(
                        'The AuctionHouse is not approved to transfer NFTs from this collection. Go back and approve first.',
                    );
                }
            } catch (err) {
                if (err instanceof Error && (err.message.includes('not approved') || err.message.includes('AuctionHouse'))) throw err;
                console.warn('[FORGE][auction] Approval preflight check failed (non-critical):', err);
            }

            // 3. Param validation
            if (startPrice <= endPrice) throw new Error('Start price must be greater than end price.');
            if (durationBlocks <= 0n) throw new Error('Duration must be at least 1 block.');
            if (durationBlocks > 52560n) throw new Error('Maximum duration is 52,560 blocks (~1 year).');

            return await house.createDutchAuction(collectionAddr, tokenId, startPrice, endPrice, durationBlocks);
        });
    }, [walletAddr, network, auctionHouseAddress, tx]);

    /**
     * Place a bid on an English auction.
     * Payable — sends the bid amount to the AuctionHouse.
     *
     * Includes preflight checks that give specific error messages,
     * since the contract's abort handler strips all revert reasons.
     *
     * @param auctionId The auction ID
     * @param bidAmount Bid amount in sats (must exceed current highest bid)
     */
    const placeBid = useCallback(async (auctionId: bigint, bidAmount: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        if (!auctionHouseAddress) throw new Error('AuctionHouse not deployed');

        // --- Preflight checks (give specific errors before opaque VM revert) ---
        const house = ContractService.getAuctionHouse(network);
        try {
            const auctionResult = await house.getAuction(auctionId);
            const a = auctionResult.properties;

            // Check: auction is active (status = 1)
            if (a.status !== 1n) {
                throw new Error(`Auction #${auctionId} is not active (status: ${a.status}). It may have ended, been cancelled, or already settled.`);
            }

            // Check: auction type is English (0), not Dutch (1)
            if (a.auctionType !== 0n) {
                throw new Error(`Auction #${auctionId} is a Dutch auction. Use "Buy" instead of bidding.`);
            }

            // Check: not bidding on own auction
            const sellerStr = String(a.seller).toLowerCase();
            const walletStr = String(walletAddrRef.current!).toLowerCase();
            if (sellerStr === walletStr) {
                throw new Error('You cannot bid on your own auction.');
            }

            // Check: bid meets minimum
            if (a.highestBid === 0n) {
                // First bid must meet start price
                if (bidAmount < a.startPrice) {
                    const startBtc = Number(a.startPrice) / 1e8;
                    throw new Error(`First bid must be at least ${startBtc.toFixed(4)} BTC (the starting price). You entered ${(Number(bidAmount) / 1e8).toFixed(4)} BTC.`);
                }
            } else {
                // Subsequent bids: 5% above current highest
                const minIncrement = (a.highestBid * 500n) / 10000n;
                const minBid = a.highestBid + minIncrement;
                if (bidAmount < minBid) {
                    const minBtc = Number(minBid) / 1e8;
                    throw new Error(`Bid must be at least ${minBtc.toFixed(4)} BTC (5% above current highest bid of ${(Number(a.highestBid) / 1e8).toFixed(4)} BTC).`);
                }
            }
        } catch (err) {
            // Re-throw our own specific errors
            if (err instanceof Error && (
                err.message.includes('not active') ||
                err.message.includes('Dutch auction') ||
                err.message.includes('own auction') ||
                err.message.includes('must be at least')
            )) throw err;
            // If getAuction fails, log but continue — let the contract handle it
            console.warn('[FORGE][bid] Preflight check failed (non-critical):', err);
        }

        // Resolve contract payment info (hex address + P2TR script)
        const paymentInfo = await resolveContractPaymentInfo(house, 'auction-bid');
        const extraOutputs = buildPaymentOutputs(paymentInfo?.p2trScript, auctionHouseAddress, bidAmount);

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);

            house.setTransactionDetails({
                inputs: [],
                outputs: [buildSimulationOutput(paymentInfo?.p2trScript, auctionHouseAddress, bidAmount, paymentInfo?.hexAddress)],
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

        // Resolve contract payment info (hex address + P2TR script)
        const house = ContractService.getAuctionHouse(network);
        const paymentInfo = await resolveContractPaymentInfo(house, 'auction-dutch');
        const extraOutputs = buildPaymentOutputs(paymentInfo?.p2trScript, auctionHouseAddress, currentPrice);

        return tx.execute(async () => {
            const house = ContractService.getAuctionHouse(network);
            house.setSender(walletAddrRef.current!);

            // Simulation: flags=hasTo (1) + hex address
            house.setTransactionDetails({
                inputs: [],
                outputs: [buildSimulationOutput(paymentInfo?.p2trScript, auctionHouseAddress, currentPrice, paymentInfo?.hexAddress)],
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
