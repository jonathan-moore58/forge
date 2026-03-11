import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type NFTStakedEvent = {
    readonly staker: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly poolId: bigint;
};
export type NFTUnstakedEvent = {
    readonly staker: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly rewardsClaimed: bigint;
};
export type RewardsClaimedEvent = {
    readonly staker: Address;
    readonly amount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createPool function call.
 */
export type CreatePool = CallResult<
    {
        poolId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the stake function call.
 */
export type Stake = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<NFTStakedEvent>[]
>;

/**
 * @description Represents the result of the unstake function call.
 */
export type Unstake = CallResult<
    {
        rewardsClaimed: bigint;
    },
    OPNetEvent<NFTUnstakedEvent>[]
>;

/**
 * @description Represents the result of the claimRewards function call.
 */
export type ClaimRewards = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<RewardsClaimedEvent>[]
>;

/**
 * @description Represents the result of the setRarityMultiplier function call.
 */
export type SetRarityMultiplier = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setLockBonus function call.
 */
export type SetLockBonus = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPool function call.
 */
export type GetPool = CallResult<
    {
        collection: Address;
        rewardToken: Address;
        rewardPerBlock: bigint;
        startBlock: bigint;
        endBlock: bigint;
        totalStaked: bigint;
        active: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getUserStakeInfo function call.
 */
export type GetUserStakeInfo = CallResult<
    {
        stakedCount: bigint;
        pendingRewards: bigint;
        lockEndBlock: bigint;
        multiplier: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the stakingStats function call.
 */
export type StakingStats = CallResult<
    {
        totalPools: bigint;
        totalRewardsDistributed: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the pause function call.
 */
export type Pause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the unpause function call.
 */
export type Unpause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IStakingRewards
// ------------------------------------------------------------------
export interface IStakingRewards extends IOP_NETContract {
    createPool(
        collection: Address,
        rewardToken: Address,
        rewardPerBlock: bigint,
        startBlock: bigint,
        endBlock: bigint,
    ): Promise<CreatePool>;
    stake(poolId: bigint, tokenId: bigint, lockDurationBlocks: bigint): Promise<Stake>;
    unstake(poolId: bigint, tokenId: bigint): Promise<Unstake>;
    claimRewards(poolId: bigint): Promise<ClaimRewards>;
    setRarityMultiplier(poolId: bigint, rarityTier: bigint, multiplierBps: bigint): Promise<SetRarityMultiplier>;
    setLockBonus(lockDurationBlocks: bigint, bonusBps: bigint): Promise<SetLockBonus>;
    getPool(poolId: bigint): Promise<GetPool>;
    getUserStakeInfo(user: Address, poolId: bigint): Promise<GetUserStakeInfo>;
    stakingStats(): Promise<StakingStats>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
}
