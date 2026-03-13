/**
 * useStaking — React Query hooks for the StakingRewards contract.
 *
 * Provides staking pool data, user stake info, and global stats.
 */

import { useQuery } from '@tanstack/react-query';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { resolveAddress } from '@/utils/address';
import type { PoolData, UserStakeData, StakingStatsData } from '@/contracts/abis';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const stakingKeys = {
    all: (network: ForgeNetwork) => ['staking', network] as const,
    stats: (network: ForgeNetwork) => [...stakingKeys.all(network), 'stats'] as const,
    pool: (network: ForgeNetwork, id: string) => [...stakingKeys.all(network), 'pool', id] as const,
    userStake: (network: ForgeNetwork, poolId: string, user: string) => [...stakingKeys.all(network), 'userStake', poolId, user] as const,
    pools: (network: ForgeNetwork) => [...stakingKeys.all(network), 'pools'] as const,
};

function isStakingDeployed(network: ForgeNetwork): boolean {
    return !!CONTRACT_ADDRESSES[network].staking;
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get global staking stats (totalPools, totalRewardsDistributed).
 */
export function useStakingStats(network: ForgeNetwork) {
    return useQuery({
        queryKey: stakingKeys.stats(network),
        queryFn: async (): Promise<StakingStatsData> => {
            const staking = ContractService.getStaking(network);
            const result = await staking.stakingStats();
            return result.properties;
        },
        enabled: isStakingDeployed(network),
    });
}

/* ------------------------------------------------------------------ */
/*  Single pool                                                       */
/* ------------------------------------------------------------------ */

/**
 * Get a single staking pool by ID.
 */
export function usePool(network: ForgeNetwork, poolId: bigint | undefined) {
    return useQuery({
        queryKey: stakingKeys.pool(network, poolId?.toString() ?? ''),
        queryFn: async (): Promise<PoolData> => {
            const staking = ContractService.getStaking(network);
            const result = await staking.getPool(poolId!);
            return result.properties;
        },
        enabled: isStakingDeployed(network) && poolId !== undefined,
    });
}

/* ------------------------------------------------------------------ */
/*  User stake info                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get a user's stake info for a specific pool.
 * Returns stakedCount, pendingRewards, lockEndBlock, multiplier.
 */
export function useUserStake(network: ForgeNetwork, poolId: bigint | undefined, user: string | undefined) {
    return useQuery({
        queryKey: stakingKeys.userStake(network, poolId?.toString() ?? '', user ?? ''),
        queryFn: async (): Promise<UserStakeData> => {
            const staking = ContractService.getStaking(network);
            const userAddr = await resolveAddress(user!, network);
            const result = await staking.getUserStakeInfo(userAddr, poolId!);
            return result.properties;
        },
        enabled: isStakingDeployed(network) && poolId !== undefined && !!user,
        refetchInterval: 30_000, // Rewards accumulate per block
    });
}

/* ------------------------------------------------------------------ */
/*  All pools (iterate)                                               */
/* ------------------------------------------------------------------ */

export interface PoolWithId extends PoolData {
    id: bigint;
}

/**
 * Fetch all staking pools by iterating from ID 1 to totalPools.
 * Pool IDs are 1-based (_nextPoolId starts at 1 in the contract).
 */
export function useAllPools(network: ForgeNetwork) {
    return useQuery({
        queryKey: stakingKeys.pools(network),
        queryFn: async (): Promise<PoolWithId[]> => {
            const staking = ContractService.getStaking(network);
            const statsResult = await staking.stakingStats();
            const total = statsResult.properties.totalPools;

            if (total === 0n) return [];

            const pools: PoolWithId[] = [];

            // Pool IDs are 1-based (contract._nextPoolId starts at 1)
            for (let i = 1n; i <= total; i++) {
                try {
                    const result = await staking.getPool(i);
                    pools.push({ ...result.properties, id: i });
                } catch {
                    // Skip failed lookups
                }
            }

            return pools;
        },
        enabled: isStakingDeployed(network),
        staleTime: 60_000,
    });
}
