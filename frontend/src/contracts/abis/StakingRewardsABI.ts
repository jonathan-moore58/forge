import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import { Address } from '@btc-vision/transaction';

export const STAKING_REWARDS_ABI: BitcoinInterfaceAbi = [
    // --- Write methods ---
    {
        name: 'createPool',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
            { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'stake',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'unstake',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'rewardsClaimed', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'claimRewards',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'setRarityMultiplier',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'rarityTier', type: ABIDataTypes.UINT256 },
            { name: 'multiplierBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'setLockBonus',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'bonusBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'pause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'unpause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },

    // --- Read methods ---
    {
        name: 'getPool',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
            { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'totalStaked', type: ABIDataTypes.UINT256 },
            { name: 'active', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'getUserStakeInfo',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'stakedCount', type: ABIDataTypes.UINT256 },
            { name: 'pendingRewards', type: ABIDataTypes.UINT256 },
            { name: 'lockEndBlock', type: ABIDataTypes.UINT256 },
            { name: 'multiplier', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'stakingStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalPools', type: ABIDataTypes.UINT256 },
            { name: 'totalRewardsDistributed', type: ABIDataTypes.UINT256 },
        ],
    },

    // --- Events ---
    {
        name: 'NFTStaked',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'NFTUnstaked',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'rewardsClaimed', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'RewardsClaimed',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

export interface PoolData {
    [key: string]: DecodedCallResult;
    collection: string;
    rewardToken: string;
    rewardPerBlock: bigint;
    startBlock: bigint;
    endBlock: bigint;
    totalStaked: bigint;
    active: boolean;
}

export interface UserStakeData {
    [key: string]: DecodedCallResult;
    stakedCount: bigint;
    pendingRewards: bigint;
    lockEndBlock: bigint;
    multiplier: bigint;
}

export interface StakingStatsData {
    [key: string]: DecodedCallResult;
    totalPools: bigint;
    totalRewardsDistributed: bigint;
}

export interface IStakingRewardsContract extends BaseContractProperties {
    createPool(collection: Address, rewardToken: Address, rewardPerBlock: bigint, startBlock: bigint, endBlock: bigint): Promise<CallResult<{ poolId: bigint }>>;
    stake(poolId: bigint, tokenId: bigint, lockDurationBlocks: bigint): Promise<CallResult<{ success: boolean }>>;
    unstake(poolId: bigint, tokenId: bigint): Promise<CallResult<{ rewardsClaimed: bigint }>>;
    claimRewards(poolId: bigint): Promise<CallResult<{ amount: bigint }>>;
    setRarityMultiplier(poolId: bigint, rarityTier: bigint, multiplierBps: bigint): Promise<CallResult<{ success: boolean }>>;
    setLockBonus(lockDurationBlocks: bigint, bonusBps: bigint): Promise<CallResult<{ success: boolean }>>;
    getPool(poolId: bigint): Promise<CallResult<PoolData>>;
    getUserStakeInfo(user: Address, poolId: bigint): Promise<CallResult<UserStakeData>>;
    stakingStats(): Promise<CallResult<StakingStatsData>>;
}
