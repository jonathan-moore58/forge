/* ------------------------------------------------------------------ */
/*  Factory handler: CollectionCreated, CollectionVerified             */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:factory');

export function createFactoryHandler(db: DatabaseSync) {
    // ── Prepared statements ──
    const insertCollection = db.prepare(`
        INSERT OR IGNORE INTO collections
            (collection_address, collection_id, creator, created_at_block)
        VALUES (@collectionAddress, @collectionId, @creator, @blockNumber)
    `);

    const updateVerified = db.prepare(`
        UPDATE collections SET verified = 1
        WHERE collection_id = @collectionId
    `);

    const insertActivity = db.prepare(`
        INSERT INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        /**
         * CollectionCreated(creator, collectionId, collectionAddress)
         * Returns the new collection address so the poller can add it to the watch set.
         */
        handleCollectionCreated(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): string {
            const creator = normalizeAddress(params['creator'] as string);
            const collectionId = Number(params['collectionId'] as bigint);
            const collectionAddress = normalizeAddress(params['collectionAddress'] as string);

            log.info(`CollectionCreated #${collectionId} → ${collectionAddress} by ${creator}`);

            insertCollection.run({
                collectionAddress,
                collectionId,
                creator,
                blockNumber,
            });

            insertActivity.run({
                eventType: 'collection_created',
                collectionAddress,
                tokenId: null,
                fromAddress: creator,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });

            return collectionAddress;
        },

        /**
         * CollectionConfigured — emitted by CollectionTemplate.initialize().
         * Auto-registers the collection in the DB (on-chain, survives DB wipe).
         */
        handleCollectionConfigured(
            collectionAddress: string,
            creator: string,
            maxSupply: number,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            log.info(`CollectionConfigured → ${collectionAddress} by ${creator} (supply=${maxSupply})`);

            // Use collection_id = 0 for directly-deployed collections (not from factory)
            insertCollection.run({
                collectionAddress,
                collectionId: 0,
                creator,
                blockNumber,
            });

            insertActivity.run({
                eventType: 'collection_configured',
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

        /**
         * CollectionVerified(collectionId)
         */
        handleCollectionVerified(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionId = Number(params['collectionId'] as bigint);

            log.info(`CollectionVerified #${collectionId}`);
            updateVerified.run({ collectionId });

            insertActivity.run({
                eventType: 'collection_verified',
                collectionAddress: null,
                tokenId: null,
                fromAddress: null,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },
    };
}
