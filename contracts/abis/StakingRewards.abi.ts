import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const StakingRewardsEvents = [
    {
        name: 'NFTStaked',
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'poolId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'NFTUnstaked',
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'rewardsClaimed', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'RewardsClaimed',
        values: [
            { name: 'staker', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const StakingRewardsAbi = [
    {
        name: 'createPool',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
            { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'poolId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'stake',
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unstake',
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'rewardsClaimed', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimRewards',
        inputs: [{ name: 'poolId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setRarityMultiplier',
        inputs: [
            { name: 'poolId', type: ABIDataTypes.UINT256 },
            { name: 'rarityTier', type: ABIDataTypes.UINT256 },
            { name: 'multiplierBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setLockBonus',
        inputs: [
            { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'bonusBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPool',
        constant: true,
        inputs: [{ name: 'poolId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
            { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'totalStaked', type: ABIDataTypes.UINT256 },
            { name: 'active', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserStakeInfo',
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
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'stakingStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalPools', type: ABIDataTypes.UINT256 },
            { name: 'totalRewardsDistributed', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unpause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...StakingRewardsEvents,
    ...OP_NET_ABI,
];

export default StakingRewardsAbi;
