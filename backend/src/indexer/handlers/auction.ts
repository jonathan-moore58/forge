/* ------------------------------------------------------------------ */
/*  Auction handler: AuctionCreated, BidPlaced, AuctionSettled         */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:auction');

export function createAuctionHandler(db: DatabaseSync) {
    const insertAuction = db.prepare(`
        INSERT OR IGNORE INTO auctions
            (auction_id, seller, collection_address, token_id, start_price, end_block, status, created_at_block)
        VALUES (@auctionId, @seller, @collectionAddress, @tokenId, @startPrice, @endBlock, 0, @blockNumber)
    `);

    const insertBid = db.prepare(`
        INSERT INTO bids
            (auction_id, bidder, amount, new_end_block, block_number)
        VALUES (@auctionId, @bidder, @amount, @newEndBlock, @blockNumber)
    `);

    const updateAuctionBid = db.prepare(`
        UPDATE auctions
        SET highest_bid = @amount,
            highest_bidder = @bidder,
            bid_count = bid_count + 1,
            end_block = @newEndBlock
        WHERE auction_id = @auctionId
    `);

    const updateAuctionSettled = db.prepare(`
        UPDATE auctions
        SET status = 1,
            winner = @winner,
            final_price = @finalPrice,
            settled_at_block = @blockNumber
        WHERE auction_id = @auctionId
    `);

    // B-C4: Update token owner on settlement
    const updateTokenOwner = db.prepare(`
        UPDATE tokens SET owner = @newOwner
        WHERE collection_address = @collectionAddress AND token_id = @tokenId
    `);

    // B-H8: Look up auction to populate NULL activity fields
    const getAuctionById = db.prepare(`
        SELECT collection_address, token_id, seller FROM auctions WHERE auction_id = @auctionId
    `);

    // B-H7: INSERT OR IGNORE for dedup
    const insertActivity = db.prepare(`
        INSERT OR IGNORE INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        handleAuctionCreated(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const auctionId = Number(params['auctionId'] as bigint);
            const seller = normalizeAddress(params['seller'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const startPrice = (params['startPrice'] as bigint).toString();
            const endBlock = Number(params['endBlock'] as bigint);

            log.info(`AuctionCreated #${auctionId}: ${collectionAddress}:${tokenId} start=${startPrice} end_block=${endBlock}`);

            insertAuction.run({
                auctionId,
                seller,
                collectionAddress,
                tokenId,
                startPrice,
                endBlock,
                blockNumber,
            });

            insertActivity.run({
                eventType: 'auction_created',
                collectionAddress,
                tokenId,
                fromAddress: seller,
                toAddress: null,
                price: startPrice,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleBidPlaced(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const auctionId = Number(params['auctionId'] as bigint);
            const bidder = normalizeAddress(params['bidder'] as string);
            const amount = (params['amount'] as bigint).toString();
            const newEndBlock = Number(params['newEndBlock'] as bigint);

            log.info(`BidPlaced auction #${auctionId}: ${bidder} bid ${amount} sats`);

            insertBid.run({ auctionId, bidder, amount, newEndBlock, blockNumber });
            updateAuctionBid.run({ auctionId, bidder, amount, newEndBlock });

            // B-H8: Look up auction to populate activity fields
            const bidAuction = getAuctionById.get({ auctionId }) as {
                collection_address: string; token_id: number; seller: string;
            } | undefined;

            insertActivity.run({
                eventType: 'bid',
                collectionAddress: bidAuction?.collection_address ?? null,
                tokenId: bidAuction?.token_id ?? null,
                fromAddress: bidder,
                toAddress: null,
                price: amount,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleAuctionSettled(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const auctionId = Number(params['auctionId'] as bigint);
            const winner = normalizeAddress(params['winner'] as string);
            const finalPrice = (params['finalPrice'] as bigint).toString();

            log.info(`AuctionSettled #${auctionId}: winner=${winner} price=${finalPrice}`);

            updateAuctionSettled.run({ auctionId, winner, finalPrice, blockNumber });

            // B-H8: Look up auction to populate activity fields
            const settledAuction = getAuctionById.get({ auctionId }) as {
                collection_address: string; token_id: number; seller: string;
            } | undefined;

            // B-C4: Update token owner to winner
            if (settledAuction) {
                updateTokenOwner.run({
                    newOwner: winner,
                    collectionAddress: settledAuction.collection_address,
                    tokenId: settledAuction.token_id,
                });
            }

            insertActivity.run({
                eventType: 'auction_settled',
                collectionAddress: settledAuction?.collection_address ?? null,
                tokenId: settledAuction?.token_id ?? null,
                fromAddress: settledAuction?.seller ?? null,
                toAddress: winner,
                price: finalPrice,
                blockNumber,
                txHash,
                logIndex,
            });
        },
    };
}
