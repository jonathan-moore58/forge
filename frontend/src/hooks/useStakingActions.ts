/**
 * useStakingActions — Write hooks for the StakingRewards contract.
 *
 * Provides: stake, unstake, claimRewards.
 * Admin: createPool, setRarityMultiplier, setLockBonus.
 *
 * Staking requires NFT approval for the StakingRewards contract first.
 */

import { useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import type { ForgeNetwork } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { stakingKeys } from './useStaking';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseStakingActionsOptions extends UseTransactionOptions {
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useStakingActions(options: UseStakingActionsOptions) {
    const { network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // F-H1: Keep a ref to avoid stale closures after wallet reconnect
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    // Auto-invalidate staking caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        stakingKeys.all(network),
    ];

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Stake an NFT into a pool.
     * NOTE: The NFT must be approved for the StakingRewards contract first.
     *
     * @param poolId Pool ID to stake into
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID to stake
     * @param lockDurationBlocks Lock duration in blocks (0 for no lock)
     * @param rarityTier Rarity tier for multiplier (0 if none)
     */
    const stake = useCallback(async (
        poolId: bigint,
        collection: string,
        tokenId: bigint,
        lockDurationBlocks: bigint = 0n,
        rarityTier: bigint = 0n,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            return await staking.stake(poolId, collectionAddr, tokenId, lockDurationBlocks, rarityTier);
        });
    }, [walletAddr, network, tx]);

    /**
     * Unstake an NFT from a pool.
     * Lock period must have ended.
     *
     * @param poolId Pool ID
     * @param collection Collection contract address (hex)
     * @param tokenId Token ID to unstake
     */
    const unstake = useCallback(async (
        poolId: bigint,
        collection: string,
        tokenId: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            return await staking.unstake(poolId, collectionAddr, tokenId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Claim accumulated staking rewards.
     * @param poolId Pool ID to claim from
     */
    const claimRewards = useCallback(async (poolId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            return await staking.claimRewards(poolId);
        });
    }, [walletAddr, network, tx]);

    /* ------------------------------------------------------------------ */
    /*  Admin methods (contract owner only)                                */
    /* ------------------------------------------------------------------ */

    /**
     * Create a new staking pool.
     * @param collection Collection address (hex)
     * @param rewardToken Reward token address (hex)
     * @param rewardPerBlock Rewards distributed per block
     * @param startBlock Block to start distributing rewards
     * @param endBlock Block to stop distributing rewards
     */
    const createPool = useCallback(async (
        collection: string,
        rewardToken: string,
        rewardPerBlock: bigint,
        startBlock: bigint,
        endBlock: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            const rewardAddr = Address.fromString(rewardToken);
            return await staking.createPool(collectionAddr, rewardAddr, rewardPerBlock, startBlock, endBlock);
        });
    }, [walletAddr, network, tx]);

    /**
     * Set rarity multiplier for a pool tier.
     * @param poolId Pool ID
     * @param rarityTier Tier index
     * @param multiplierBps Multiplier in basis points (10000 = 1x)
     */
    const setRarityMultiplier = useCallback(async (
        poolId: bigint,
        rarityTier: bigint,
        multiplierBps: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            return await staking.setRarityMultiplier(poolId, rarityTier, multiplierBps);
        });
    }, [walletAddr, network, tx]);

    /**
     * Set lock bonus for a lock duration.
     * @param lockDurationBlocks Lock duration in blocks
     * @param bonusBps Bonus in basis points
     */
    const setLockBonus = useCallback(async (
        lockDurationBlocks: bigint,
        bonusBps: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const staking = ContractService.getStaking(network);
            staking.setSender(walletAddrRef.current!);
            return await staking.setLockBonus(lockDurationBlocks, bonusBps);
        });
    }, [walletAddr, network, tx]);

    return {
        ...tx,
        // User actions
        stake,
        unstake,
        claimRewards,
        // Admin actions
        createPool,
        setRarityMultiplier,
        setLockBonus,
    };
}
