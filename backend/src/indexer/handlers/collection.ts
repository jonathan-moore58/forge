/* ------------------------------------------------------------------ */
/*  Collection handler: Minted, Transfer, PhaseChanged, Revealed       */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:collection');

export function createCollectionHandler(db: DatabaseSync) {
    // ── Prepared statements ──
    const insertToken = db.prepare(`
        INSERT OR IGNORE INTO tokens
            (collection_address, token_id, owner, minter, minted_at_block)
        VALUES (@collectionAddress, @tokenId, @owner, @minter, @blockNumber)
    `);

    const updateSupply = db.prepare(`
        UPDATE collections
        SET total_supply = total_supply + @quantity
        WHERE collection_address = @collectionAddress
    `);

    const updateOwner = db.prepare(`
        UPDATE tokens
        SET owner = @newOwner
        WHERE collection_address = @collectionAddress AND token_id = @tokenId
    `);

    const updatePhase = db.prepare(`
        UPDATE collections
        SET sale_phase = @phase
        WHERE collection_address = @collectionAddress
    `);

    const updateRevealed = db.prepare(`
        UPDATE collections
        SET is_revealed = 1, base_uri = @baseURI
        WHERE collection_address = @collectionAddress
    `);

    const insertActivity = db.prepare(`
        INSERT INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        /**
         * Minted(minter, quantity, startTokenId)
         * contractAddress = the collection that emitted this event.
         */
        handleMinted(
            contractAddress: string,
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionAddress = normalizeAddress(contractAddress);
            const minter = normalizeAddress(params['minter'] as string);
            const quantity = Number(params['quantity'] as bigint);
            const startTokenId = Number(params['startTokenId'] as bigint);

            log.info(`Minted ${quantity} tokens [${startTokenId}..${startTokenId + quantity - 1}] in ${collectionAddress}`);

            for (let i = 0; i < quantity; i++) {
                const tokenId = startTokenId + i;
                insertToken.run({
                    collectionAddress,
                    tokenId,
                    owner: minter,
                    minter,
                    blockNumber,
                });
            }

            updateSupply.run({ collectionAddress, quantity });

            insertActivity.run({
                eventType: 'mint',
                collectionAddress,
                tokenId: startTokenId,
                fromAddress: null,
                toAddress: minter,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /**
         * Transfer(from, to, tokenId)
         * contractAddress = the collection that emitted this event.
         */
        handleTransfer(
            contractAddress: string,
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionAddress = normalizeAddress(contractAddress);
            const from = normalizeAddress(params['from'] as string);
            const to = normalizeAddress(params['to'] as string);
            const tokenId = Number(params['tokenId'] as bigint);

            log.debug(`Transfer token #${tokenId} in ${collectionAddress}: ${from} → ${to}`);

            updateOwner.run({
                newOwner: to,
                collectionAddress,
                tokenId,
            });

            insertActivity.run({
                eventType: 'transfer',
                collectionAddress,
                tokenId,
                fromAddress: from,
                toAddress: to,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /**
         * PhaseChanged(newPhase)
         */
        handlePhaseChanged(
            contractAddress: string,
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionAddress = normalizeAddress(contractAddress);
            const phase = Number(params['newPhase'] as bigint);

            log.info(`PhaseChanged → ${phase} for ${collectionAddress}`);
            updatePhase.run({ phase, collectionAddress });

            insertActivity.run({
                eventType: 'phase_changed',
                collectionAddress,
                tokenId: null,
                fromAddress: null,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /**
         * Revealed(baseURI)
         */
        handleRevealed(
            contractAddress: string,
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const collectionAddress = normalizeAddress(contractAddress);
            const baseURI = params['baseURI'] as string;

            log.info(`Revealed ${collectionAddress}: ${baseURI}`);
            updateRevealed.run({ baseURI, collectionAddress });

            insertActivity.run({
                eventType: 'revealed',
                collectionAddress,
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
