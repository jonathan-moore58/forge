/* ------------------------------------------------------------------ */
/*  Staking handler: NFTStaked, NFTUnstaked, RewardsClaimed            */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:staking');

export function createStakingHandler(db: DatabaseSync) {
    const insertPosition = db.prepare(`
        INSERT OR IGNORE INTO staking_positions
            (staker, collection_address, token_id, pool_id, status, staked_at_block)
        VALUES (@staker, @collectionAddress, @tokenId, @poolId, 0, @blockNumber)
    `);

    const updateUnstaked = db.prepare(`
        UPDATE staking_positions
        SET status = 1,
            rewards_claimed = @rewardsClaimed,
            unstaked_at_block = @blockNumber
        WHERE staker = @staker
          AND collection_address = @collectionAddress
          AND token_id = @tokenId
          AND status = 0
    `);

    const insertActivity = db.prepare(`
        INSERT INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        handleNFTStaked(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const staker = normalizeAddress(params['staker'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const poolId = Number(params['poolId'] as bigint);

            log.info(`NFTStaked: ${collectionAddress}:${tokenId} by ${staker} in pool ${poolId}`);

            insertPosition.run({ staker, collectionAddress, tokenId, poolId, blockNumber });

            insertActivity.run({
                eventType: 'stake',
                collectionAddress,
                tokenId,
                fromAddress: staker,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleNFTUnstaked(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const staker = normalizeAddress(params['staker'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId'] as bigint);
            const rewardsClaimed = (params['rewardsClaimed'] as bigint).toString();

            log.info(`NFTUnstaked: ${collectionAddress}:${tokenId} by ${staker}, rewards=${rewardsClaimed}`);

            updateUnstaked.run({ staker, collectionAddress, tokenId, rewardsClaimed, blockNumber });

            insertActivity.run({
                eventType: 'unstake',
                collectionAddress,
                tokenId,
                fromAddress: staker,
                toAddress: null,
                price: rewardsClaimed,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        handleRewardsClaimed(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const staker = normalizeAddress(params['staker'] as string);
            const amount = (params['amount'] as bigint).toString();

            log.info(`RewardsClaimed: ${staker} claimed ${amount}`);

            insertActivity.run({
                eventType: 'rewards_claimed',
                collectionAddress: null,
                tokenId: null,
                fromAddress: staker,
                toAddress: null,
                price: amount,
                blockNumber,
                txHash,
                logIndex,
            });
        },
    };
}
