/* ------------------------------------------------------------------ */
/*  Marketplace handler: listings + offers                             */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:marketplace');

export function createMarketplaceHandler(db: DatabaseSync) {
    // ── Listings ──
    const insertListing = db.prepare(`
        INSERT OR IGNORE INTO listings
            (listing_id, seller, collection_address, token_id, price, status, created_at_block)
        VALUES (@listingId, @seller, @collectionAddress, @tokenId, @price, 0, @blockNumber)
    `);

    const updateListingSold = db.prepare(`
        UPDATE listings
        SET status = 1, buyer = @buyer, sold_price = @price, updated_at_block = @blockNumber
        WHERE listing_id = @listingId
    `);

    const updateListingCancelled = db.prepare(`
        UPDATE listings
        SET status = 2, updated_at_block = @blockNumber
        WHERE listing_id = @listingId
    `);

    // ── Offers ──
    const insertOffer = db.prepare(`
        INSERT OR IGNORE INTO offers
            (offer_id, offerer, collection_address, token_id, price, expiry_block, status, created_at_block)
        VALUES (@offerId, @offerer, @collectionAddress, @tokenId, @price, @expiryBlock, 0, @blockNumber)
    `);

    const updateOfferAccepted = db.prepare(`
        UPDATE offers
        SET status = 1, seller = @seller, buyer = @buyer, accepted_price = @price, updated_at_block = @blockNumber
        WHERE offer_id = @offerId
    `);

    const updateOfferCancelled = db.prepare(`
        UPDATE offers
        SET status = 2, updated_at_block = @blockNumber
        WHERE offer_id = @offerId
    `);

    // ── Collection registration ──
    const insertRegisteredCollection = db.prepare(`
        INSERT OR IGNORE INTO collections
            (collection_address, collection_id, creator, created_at_block)
        VALUES (@collectionAddress, @collectionId, @creator, @blockNumber)
    `);

    const getMaxCollectionId = db.prepare(`
        SELECT COALESCE(MAX(collection_id), 0) AS maxId FROM collections
    `);

    const markCollectionRegistered = db.prepare(`
        UPDATE collections SET marketplace_registered = 1
        WHERE collection_address = @collectionAddress
    `);

    // ── Token owner update (B-C2) ──
    const updateTokenOwner = db.prepare(`
        UPDATE tokens SET owner = @newOwner
        WHERE collection_address = @collectionAddress AND token_id = @tokenId
    `);

    // ── Lookup helpers for NULL activity fields (B-H8) ──
    const getListingById = db.prepare(`
        SELECT collection_address, token_id, seller FROM listings WHERE listing_id = @listingId
    `);
    const getOfferById = db.prepare(`
        SELECT collection_address, token_id, offerer FROM offers WHERE offer_id = @offerId
    `);

    // ── Activity (INSERT OR IGNORE for dedup — B-H7) ──
    const insertActivity = db.prepare(`
        INSERT OR IGNORE INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        /* ── Listings ──────────────────────────────────────────── */

        handleNFTListed(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const listingId = Number(params['listingId'] as bigint);
            const seller = normalizeAddress(params['seller'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const price = (params['price'] as bigint).toString();

            log.info(`NFTListed #${listingId}: token ${collectionAddress}:${tokenId} @ ${price} sats`);
            insertListing.run({ listingId, seller, collectionAddress, tokenId, price, blockNumber });

            insertActivity.run({
                eventType: 'list',
                collectionAddress,
                tokenId,
                fromAddress: seller,
                toAddress: null,
                price,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleNFTSold(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const listingId = Number(params['listingId'] as bigint);
            const buyer = normalizeAddress(params['buyer'] as string);
            const seller = normalizeAddress(params['seller'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const price = (params['price'] as bigint).toString();

            log.info(`NFTSold #${listingId}: ${collectionAddress}:${tokenId} → ${buyer} @ ${price} sats`);
            updateListingSold.run({ listingId, buyer, price, blockNumber });

            // B-C2: Update token owner to buyer
            updateTokenOwner.run({ newOwner: buyer, collectionAddress, tokenId });

            insertActivity.run({
                eventType: 'sale',
                collectionAddress,
                tokenId,
                fromAddress: seller,
                toAddress: buyer,
                price,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleListingCancelled(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const listingId = Number(params['listingId'] as bigint);

            log.info(`ListingCancelled #${listingId}`);
            updateListingCancelled.run({ listingId, blockNumber });

            // B-H8: Look up listing to populate activity fields
            const listing = getListingById.get({ listingId }) as {
                collection_address: string; token_id: number; seller: string;
            } | undefined;

            insertActivity.run({
                eventType: 'cancel_listing',
                collectionAddress: listing?.collection_address ?? null,
                tokenId: listing?.token_id ?? null,
                fromAddress: listing?.seller ?? null,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── Offers ────────────────────────────────────────────── */

        handleOfferMade(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const offerId = Number(params['offerId'] as bigint);
            const offerer = normalizeAddress(params['offerer'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const price = (params['price'] as bigint).toString();
            const expiryBlock = Number(params['expiryBlock'] as bigint);

            log.info(`OfferMade #${offerId}: ${collectionAddress}:${tokenId} @ ${price} sats`);
            insertOffer.run({ offerId, offerer, collectionAddress, tokenId, price, expiryBlock, blockNumber });

            insertActivity.run({
                eventType: 'offer',
                collectionAddress,
                tokenId,
                fromAddress: offerer,
                toAddress: null,
                price,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleOfferAccepted(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const offerId = Number(params['offerId'] as bigint);
            const seller = normalizeAddress(params['seller'] as string);
            const buyer = normalizeAddress(params['buyer'] as string);
            const price = (params['price'] as bigint).toString();

            log.info(`OfferAccepted #${offerId}: seller=${seller} buyer=${buyer} @ ${price}`);
            updateOfferAccepted.run({ offerId, seller, buyer, price, blockNumber });

            // B-H8: Look up offer to populate collection/token activity fields
            const offer = getOfferById.get({ offerId }) as {
                collection_address: string; token_id: number;
            } | undefined;

            // B-C2: Update token owner to buyer (offerer)
            if (offer) {
                updateTokenOwner.run({
                    newOwner: buyer,
                    collectionAddress: offer.collection_address,
                    tokenId: offer.token_id,
                });
            }

            insertActivity.run({
                eventType: 'offer_accepted',
                collectionAddress: offer?.collection_address ?? null,
                tokenId: offer?.token_id ?? null,
                fromAddress: seller,
                toAddress: buyer,
                price,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleOfferCancelled(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const offerId = Number(params['offerId'] as bigint);

            log.info(`OfferCancelled #${offerId}`);
            updateOfferCancelled.run({ offerId, blockNumber });

            // B-H8: Look up offer to populate activity fields
            const cancelledOffer = getOfferById.get({ offerId }) as {
                collection_address: string; token_id: number; offerer: string;
            } | undefined;

            insertActivity.run({
                eventType: 'offer_cancelled',
                collectionAddress: cancelledOffer?.collection_address ?? null,
                tokenId: cancelledOffer?.token_id ?? null,
                fromAddress: cancelledOffer?.offerer ?? null,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── Collection Registration ──────────────────────────── */

        handleCollectionRegistered(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const creator = normalizeAddress(params['creator'] as string);

            // Get next collection ID
            const row = getMaxCollectionId.get() as { maxId: number } | undefined;
            const collectionId = (row?.maxId ?? 0) + 1;

            log.info(`CollectionRegistered: ${collectionAddress} by ${creator} (id=${collectionId})`);
            insertRegisteredCollection.run({ collectionAddress, collectionId, creator, blockNumber });

            // Mark as marketplace-registered (handles both new external and existing factory collections)
            markCollectionRegistered.run({ collectionAddress });

            insertActivity.run({
                eventType: 'collection_registered',
                collectionAddress,
                tokenId: null,
                fromAddress: creator,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },
    };
}
