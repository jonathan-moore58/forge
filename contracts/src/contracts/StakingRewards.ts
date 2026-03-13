import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    StoredBoolean,
    AddressMemoryMap,
    StoredMapU256,
    ReentrancyGuard,
    ReentrancyLevel,
    EMPTY_POINTER,
    encodeSelector,
    SELECTOR_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

import {
    NFTStakedEvent,
    NFTUnstakedEvent,
    RewardsClaimedEvent,
} from '../lib/events';

/**
 * StakingRewards — Stake NFTs to earn token rewards on FORGE.
 *
 * Features:
 * - Stake NFTs to earn PILL/BTC rewards
 * - Collection-specific staking pools
 * - Rarity-based reward multipliers
 * - Lock periods for bonus rewards
 * - Creators set reward tokens and amounts per pool
 * - Block-based reward accrual
 * - Full reentrancy protection
 */
@final
export class StakingRewards extends ReentrancyGuard {
    protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    /** Core state */
    private nextPoolIdPointer: u16 = Blockchain.nextPointer;
    private totalPoolsPointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;

    /** Pool config: poolId → field */
    private poolCollectionPointer: u16 = Blockchain.nextPointer;
    private poolRewardTokenPointer: u16 = Blockchain.nextPointer;
    private poolRewardPerBlockPointer: u16 = Blockchain.nextPointer;
    private poolStartBlockPointer: u16 = Blockchain.nextPointer;
    private poolEndBlockPointer: u16 = Blockchain.nextPointer;
    private poolTotalStakedPointer: u16 = Blockchain.nextPointer;
    private poolCreatorPointer: u16 = Blockchain.nextPointer;
    private poolActivePointer: u16 = Blockchain.nextPointer;

    /** Stake info: composite key (poolId + user hash) → field */
    private stakeCountPointer: u16 = Blockchain.nextPointer;
    private stakeLastClaimBlockPointer: u16 = Blockchain.nextPointer;
    private stakeLockEndBlockPointer: u16 = Blockchain.nextPointer;
    private stakeMultiplierPointer: u16 = Blockchain.nextPointer;
    private stakePendingRewardsPointer: u16 = Blockchain.nextPointer;

    /** NFT staking status: composite key (collection + tokenId) → staker address */
    private nftStakerPointer: u16 = Blockchain.nextPointer;
    private nftPoolPointer: u16 = Blockchain.nextPointer;

    /** Rarity multipliers: composite key (poolId + rarity tier) → multiplier BPS */
    private rarityMultiplierPointer: u16 = Blockchain.nextPointer;

    /** Lock period bonuses: lock duration (blocks) → bonus BPS */
    private lockBonusPointer: u16 = Blockchain.nextPointer;

    /** Global reward tracking */
    private totalRewardsDistributedPointer: u16 = Blockchain.nextPointer;

    /** Stored values */
    private _nextPoolId!: StoredU256;
    private _totalPools!: StoredU256;
    private _paused!: StoredBoolean;

    private _poolCollection!: StoredMapU256;
    private _poolRewardToken!: StoredMapU256;
    private _poolRewardPerBlock!: StoredMapU256;
    private _poolStartBlock!: StoredMapU256;
    private _poolEndBlock!: StoredMapU256;
    private _poolTotalStaked!: StoredMapU256;
    private _poolCreator!: StoredMapU256;
    private _poolActive!: StoredMapU256;

    private _stakeCount!: StoredMapU256;
    private _stakeLastClaimBlock!: StoredMapU256;
    private _stakeLockEndBlock!: StoredMapU256;
    private _stakeMultiplier!: StoredMapU256;
    private _stakePendingRewards!: StoredMapU256;

    private _nftStaker!: StoredMapU256;
    private _nftPool!: StoredMapU256;

    private _rarityMultiplier!: StoredMapU256;
    private _lockBonus!: StoredMapU256;

    private _totalRewardsDistributed!: StoredU256;

    public constructor() {
        super();

        this._nextPoolId = new StoredU256(this.nextPoolIdPointer, EMPTY_POINTER);
        this._totalPools = new StoredU256(this.totalPoolsPointer, EMPTY_POINTER);
        this._paused = new StoredBoolean(this.pausedPointer, false);

        this._poolCollection = new StoredMapU256(this.poolCollectionPointer);
        this._poolRewardToken = new StoredMapU256(this.poolRewardTokenPointer);
        this._poolRewardPerBlock = new StoredMapU256(this.poolRewardPerBlockPointer);
        this._poolStartBlock = new StoredMapU256(this.poolStartBlockPointer);
        this._poolEndBlock = new StoredMapU256(this.poolEndBlockPointer);
        this._poolTotalStaked = new StoredMapU256(this.poolTotalStakedPointer);
        this._poolCreator = new StoredMapU256(this.poolCreatorPointer);
        this._poolActive = new StoredMapU256(this.poolActivePointer);

        this._stakeCount = new StoredMapU256(this.stakeCountPointer);
        this._stakeLastClaimBlock = new StoredMapU256(this.stakeLastClaimBlockPointer);
        this._stakeLockEndBlock = new StoredMapU256(this.stakeLockEndBlockPointer);
        this._stakeMultiplier = new StoredMapU256(this.stakeMultiplierPointer);
        this._stakePendingRewards = new StoredMapU256(this.stakePendingRewardsPointer);

        this._nftStaker = new StoredMapU256(this.nftStakerPointer);
        this._nftPool = new StoredMapU256(this.nftPoolPointer);

        this._rarityMultiplier = new StoredMapU256(this.rarityMultiplierPointer);
        this._lockBonus = new StoredMapU256(this.lockBonusPointer);

        this._totalRewardsDistributed = new StoredU256(this.totalRewardsDistributedPointer, EMPTY_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        this._nextPoolId.value = u256.One;
        this._totalPools.value = u256.Zero;
        this._totalRewardsDistributed.value = u256.Zero;
    }

    /**
     * Create a new staking pool.
     * Only the contract owner can create pools to prevent spam/phishing.
     */
    @onlyOwner
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
        { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'poolId', type: ABIDataTypes.UINT256 })
    public createPool(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Staking is paused');
        }

        const collection: Address = calldata.readAddress();
        const rewardToken: Address = calldata.readAddress();
        const rewardPerBlock: u256 = calldata.readU256();
        const startBlock: u256 = calldata.readU256();
        const endBlock: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        if (rewardPerBlock.isZero()) {
            throw new Revert('Reward per block must be > 0');
        }
        if (endBlock <= startBlock) {
            throw new Revert('End block must be after start block');
        }

        const poolId: u256 = this._nextPoolId.value;

        this._poolCollection.set(poolId, this.addressToU256(collection));
        this._poolRewardToken.set(poolId, this.addressToU256(rewardToken));
        this._poolRewardPerBlock.set(poolId, rewardPerBlock);
        this._poolStartBlock.set(poolId, startBlock);
        this._poolEndBlock.set(poolId, endBlock);
        this._poolTotalStaked.set(poolId, u256.Zero);
        this._poolCreator.set(poolId, this.addressToU256(sender));
        this._poolActive.set(poolId, u256.One);

        this._nextPoolId.value = SafeMath.add(poolId, u256.One);
        this._totalPools.value = SafeMath.add(this._totalPools.value, u256.One);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(poolId);
        return writer;
    }

    /**
     * Stake an NFT into a pool.
     * The NFT must be from the pool's collection and approved for this contract.
     */
    @method(
        { name: 'poolId', type: ABIDataTypes.UINT256 },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('NFTStaked')
    public stake(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Staking is paused');
        }

        const poolId: u256 = calldata.readU256();
        const tokenId: u256 = calldata.readU256();
        const lockDurationBlocks: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Validate pool
        if (this._poolActive.get(poolId).isZero()) {
            throw new Revert('Pool not active');
        }

        const poolStart: u256 = this._poolStartBlock.get(poolId);
        if (currentBlock < poolStart) {
            throw new Revert('Pool not started');
        }

        const poolEnd: u256 = this._poolEndBlock.get(poolId);
        if (currentBlock > poolEnd) {
            throw new Revert('Pool has ended');
        }

        // Check NFT is not already staked
        const collection: Address = this.u256ToAddress(this._poolCollection.get(poolId));
        const nftKey: u256 = this.computeNFTKey(collection, tokenId);
        if (!this._nftStaker.get(nftKey).isZero()) {
            throw new Revert('NFT already staked');
        }

        // Calculate lock end block
        const lockEndBlock: u256 = SafeMath.add(currentBlock, lockDurationBlocks);

        // Get multiplier based on lock duration
        const lockBonus: u256 = this._lockBonus.get(lockDurationBlocks);
        const baseMultiplier: u256 = u256.fromU64(10000); // 100% = 10000 BPS
        const totalMultiplier: u256 = SafeMath.add(baseMultiplier, lockBonus);

        // Compute user-pool key
        const userPoolKey: u256 = this.computeUserPoolKey(sender, poolId);

        // Update pending rewards before state change
        this.updatePendingRewards(userPoolKey, poolId);

        // CEI: Effects
        this._nftStaker.set(nftKey, this.addressToU256(sender));
        this._nftPool.set(nftKey, poolId);

        // Update user stake count
        const currentCount: u256 = this._stakeCount.get(userPoolKey);
        this._stakeCount.set(userPoolKey, SafeMath.add(currentCount, u256.One));
        this._stakeLastClaimBlock.set(userPoolKey, currentBlock);

        // Only extend lock period — never shorten (prevents lock bypass via re-stake)
        const existingLockEnd: u256 = this._stakeLockEndBlock.get(userPoolKey);
        if (lockEndBlock > existingLockEnd) {
            this._stakeLockEndBlock.set(userPoolKey, lockEndBlock);
        }

        // Only upgrade multiplier — never downgrade (prevents multiplier bypass)
        const existingMultiplier: u256 = this._stakeMultiplier.get(userPoolKey);
        if (totalMultiplier > existingMultiplier) {
            this._stakeMultiplier.set(userPoolKey, totalMultiplier);
        }

        // Update pool total
        this._poolTotalStaked.set(
            poolId,
            SafeMath.add(this._poolTotalStaked.get(poolId), u256.One),
        );

        // Interaction: Escrow NFT — transfer from staker to this contract
        const escrowCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        escrowCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        escrowCalldata.writeAddress(sender);
        escrowCalldata.writeAddress(Blockchain.contractAddress);
        escrowCalldata.writeU256(tokenId);

        const escrowResult = Blockchain.call(collection, escrowCalldata, false);
        if (!escrowResult.success) {
            throw new Revert('NFT escrow failed — ensure staking contract is approved');
        }

        Blockchain.emit(new NFTStakedEvent(sender, collection, tokenId, poolId));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Unstake an NFT from a pool.
     * Lock period must be over. Claims pending rewards automatically.
     */
    @method(
        { name: 'poolId', type: ABIDataTypes.UINT256 },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'rewardsClaimed', type: ABIDataTypes.UINT256 })
    @emit('NFTUnstaked')
    public unstake(calldata: Calldata): BytesWriter {
        const poolId: u256 = calldata.readU256();
        const tokenId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Verify ownership of stake
        const collection: Address = this.u256ToAddress(this._poolCollection.get(poolId));
        const nftKey: u256 = this.computeNFTKey(collection, tokenId);
        const stakerU256: u256 = this._nftStaker.get(nftKey);

        if (stakerU256 != this.addressToU256(sender)) {
            throw new Revert('Not the staker');
        }

        // Check lock period
        const userPoolKey: u256 = this.computeUserPoolKey(sender, poolId);
        const lockEndBlock: u256 = this._stakeLockEndBlock.get(userPoolKey);
        if (currentBlock < lockEndBlock) {
            throw new Revert('Lock period not over');
        }

        // Calculate and claim rewards
        this.updatePendingRewards(userPoolKey, poolId);
        const rewards: u256 = this._stakePendingRewards.get(userPoolKey);

        // CEI: Effects
        this._nftStaker.set(nftKey, u256.Zero);
        this._nftPool.set(nftKey, u256.Zero);

        const currentCount: u256 = this._stakeCount.get(userPoolKey);
        if (currentCount > u256.Zero) {
            this._stakeCount.set(userPoolKey, SafeMath.sub(currentCount, u256.One));
        }

        this._stakePendingRewards.set(userPoolKey, u256.Zero);
        this._stakeLastClaimBlock.set(userPoolKey, currentBlock);

        // Update pool total
        const poolTotal: u256 = this._poolTotalStaked.get(poolId);
        if (poolTotal > u256.Zero) {
            this._poolTotalStaked.set(poolId, SafeMath.sub(poolTotal, u256.One));
        }

        // Track distributed rewards
        this._totalRewardsDistributed.value = SafeMath.add(
            this._totalRewardsDistributed.value,
            rewards,
        );

        // Reset multiplier when no stakes remain (prevents gaming)
        const newCount: u256 = this._stakeCount.get(userPoolKey);
        if (newCount.isZero()) {
            this._stakeMultiplier.set(userPoolKey, u256.Zero);
        }

        // Interaction: Return NFT from contract to staker
        const returnCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        returnCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        returnCalldata.writeAddress(Blockchain.contractAddress);
        returnCalldata.writeAddress(sender);
        returnCalldata.writeU256(tokenId);

        const returnResult = Blockchain.call(collection, returnCalldata, false);
        if (!returnResult.success) {
            throw new Revert('NFT return failed');
        }

        // Interaction: Distribute reward tokens to staker
        if (!rewards.isZero()) {
            const rewardTokenAddr: Address = this.u256ToAddress(this._poolRewardToken.get(poolId));
            const rewardCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32);
            rewardCalldata.writeSelector(encodeSelector('transfer(address,uint256)'));
            rewardCalldata.writeAddress(sender);
            rewardCalldata.writeU256(rewards);

            const rewardResult = Blockchain.call(rewardTokenAddr, rewardCalldata, false);
            if (!rewardResult.success) {
                throw new Revert('Reward transfer failed — insufficient balance');
            }
        }

        Blockchain.emit(new NFTUnstakedEvent(sender, collection, tokenId, rewards));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(rewards);
        return writer;
    }

    /**
     * Claim accumulated rewards without unstaking.
     */
    @method({ name: 'poolId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    @emit('RewardsClaimed')
    public claimRewards(calldata: Calldata): BytesWriter {
        const poolId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;
        const currentBlock: u256 = Blockchain.block.numberU256;

        const userPoolKey: u256 = this.computeUserPoolKey(sender, poolId);

        // Must have staked NFTs
        const stakeCount: u256 = this._stakeCount.get(userPoolKey);
        if (stakeCount.isZero()) {
            throw new Revert('No NFTs staked in this pool');
        }

        // Update and claim
        this.updatePendingRewards(userPoolKey, poolId);
        const rewards: u256 = this._stakePendingRewards.get(userPoolKey);

        if (rewards.isZero()) {
            throw new Revert('No rewards to claim');
        }

        // CEI: Effects
        this._stakePendingRewards.set(userPoolKey, u256.Zero);
        this._stakeLastClaimBlock.set(userPoolKey, currentBlock);

        this._totalRewardsDistributed.value = SafeMath.add(
            this._totalRewardsDistributed.value,
            rewards,
        );

        // Interaction: Transfer reward tokens to staker
        const rewardTokenAddr: Address = this.u256ToAddress(this._poolRewardToken.get(poolId));
        const rewardCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32);
        rewardCalldata.writeSelector(encodeSelector('transfer(address,uint256)'));
        rewardCalldata.writeAddress(sender);
        rewardCalldata.writeU256(rewards);

        const rewardResult = Blockchain.call(rewardTokenAddr, rewardCalldata, false);
        if (!rewardResult.success) {
            throw new Revert('Reward transfer failed — insufficient balance');
        }

        Blockchain.emit(new RewardsClaimedEvent(sender, rewards));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(rewards);
        return writer;
    }

    /**
     * Set rarity multiplier for a pool (pool creator only).
     * Multiplier in BPS: 10000 = 1x, 15000 = 1.5x, 20000 = 2x
     */
    @method(
        { name: 'poolId', type: ABIDataTypes.UINT256 },
        { name: 'rarityTier', type: ABIDataTypes.UINT256 },
        { name: 'multiplierBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setRarityMultiplier(calldata: Calldata): BytesWriter {
        const poolId: u256 = calldata.readU256();
        const rarityTier: u256 = calldata.readU256();
        const multiplierBps: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Only pool creator
        if (this._poolCreator.get(poolId) != this.addressToU256(sender)) {
            throw new Revert('Only pool creator');
        }

        // Compute rarity key
        const rarityKey: u256 = this.computeRarityKey(poolId, rarityTier);
        this._rarityMultiplier.set(rarityKey, multiplierBps);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Set lock period bonus (admin only).
     * Bonus in BPS added to base multiplier.
     */
    @onlyOwner
    @method(
        { name: 'lockDurationBlocks', type: ABIDataTypes.UINT256 },
        { name: 'bonusBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setLockBonus(calldata: Calldata): BytesWriter {
        const lockDuration: u256 = calldata.readU256();
        const bonusBps: u256 = calldata.readU256();

        this._lockBonus.set(lockDuration, bonusBps);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Get pool info.
     */
    @view
    @method({ name: 'poolId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'rewardToken', type: ABIDataTypes.ADDRESS },
        { name: 'rewardPerBlock', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'totalStaked', type: ABIDataTypes.UINT256 },
        { name: 'active', type: ABIDataTypes.BOOL },
    )
    public getPool(calldata: Calldata): BytesWriter {
        const poolId: u256 = calldata.readU256();

        const writer: BytesWriter = new BytesWriter(225);
        writer.writeU256(this._poolCollection.get(poolId));
        writer.writeU256(this._poolRewardToken.get(poolId));
        writer.writeU256(this._poolRewardPerBlock.get(poolId));
        writer.writeU256(this._poolStartBlock.get(poolId));
        writer.writeU256(this._poolEndBlock.get(poolId));
        writer.writeU256(this._poolTotalStaked.get(poolId));
        writer.writeBoolean(!this._poolActive.get(poolId).isZero());
        return writer;
    }

    /**
     * Get user staking info for a pool.
     */
    @view
    @method(
        { name: 'user', type: ABIDataTypes.ADDRESS },
        { name: 'poolId', type: ABIDataTypes.UINT256 },
    )
    @returns(
        { name: 'stakedCount', type: ABIDataTypes.UINT256 },
        { name: 'pendingRewards', type: ABIDataTypes.UINT256 },
        { name: 'lockEndBlock', type: ABIDataTypes.UINT256 },
        { name: 'multiplier', type: ABIDataTypes.UINT256 },
    )
    public getUserStakeInfo(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();
        const poolId: u256 = calldata.readU256();

        const userPoolKey: u256 = this.computeUserPoolKey(user, poolId);

        // Calculate current pending
        const stakeCount: u256 = this._stakeCount.get(userPoolKey);
        let pendingRewards: u256 = this._stakePendingRewards.get(userPoolKey);

        if (!stakeCount.isZero()) {
            const lastClaim: u256 = this._stakeLastClaimBlock.get(userPoolKey);
            const currentBlock: u256 = Blockchain.block.numberU256;
            const poolEnd: u256 = this._poolEndBlock.get(poolId);
            const effectiveBlock: u256 = currentBlock < poolEnd ? currentBlock : poolEnd;

            if (effectiveBlock > lastClaim) {
                const blocksElapsed: u256 = SafeMath.sub(effectiveBlock, lastClaim);
                const rewardPerBlock: u256 = this._poolRewardPerBlock.get(poolId);
                const totalStaked: u256 = this._poolTotalStaked.get(poolId);

                if (!totalStaked.isZero()) {
                    const multiplier: u256 = this._stakeMultiplier.get(userPoolKey);
                    const baseReward: u256 = SafeMath.div(
                        SafeMath.mul(SafeMath.mul(rewardPerBlock, blocksElapsed), stakeCount),
                        totalStaked,
                    );
                    const boostedReward: u256 = SafeMath.div(
                        SafeMath.mul(baseReward, multiplier),
                        u256.fromU64(10000),
                    );
                    pendingRewards = SafeMath.add(pendingRewards, boostedReward);
                }
            }
        }

        const writer: BytesWriter = new BytesWriter(128);
        writer.writeU256(stakeCount);
        writer.writeU256(pendingRewards);
        writer.writeU256(this._stakeLockEndBlock.get(userPoolKey));
        writer.writeU256(this._stakeMultiplier.get(userPoolKey));
        return writer;
    }

    /**
     * Get staking stats.
     */
    @view
    @method()
    @returns(
        { name: 'totalPools', type: ABIDataTypes.UINT256 },
        { name: 'totalRewardsDistributed', type: ABIDataTypes.UINT256 },
    )
    public stakingStats(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(64);
        writer.writeU256(this._totalPools.value);
        writer.writeU256(this._totalRewardsDistributed.value);
        return writer;
    }

    /**
     * Pause/unpause (admin only).
     */
    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public pause(_calldata: Calldata): BytesWriter {
        this._paused.value = true;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public unpause(_calldata: Calldata): BytesWriter {
        this._paused.value = false;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Update pending rewards for a user-pool pair.
     * Called before any state change to ensure accurate reward accounting.
     */
    private updatePendingRewards(userPoolKey: u256, poolId: u256): void {
        const stakeCount: u256 = this._stakeCount.get(userPoolKey);
        if (stakeCount.isZero()) return;

        const lastClaim: u256 = this._stakeLastClaimBlock.get(userPoolKey);
        const currentBlock: u256 = Blockchain.block.numberU256;
        const poolEnd: u256 = this._poolEndBlock.get(poolId);
        const effectiveBlock: u256 = currentBlock < poolEnd ? currentBlock : poolEnd;

        if (effectiveBlock <= lastClaim) return;

        const blocksElapsed: u256 = SafeMath.sub(effectiveBlock, lastClaim);
        const rewardPerBlock: u256 = this._poolRewardPerBlock.get(poolId);
        const totalStaked: u256 = this._poolTotalStaked.get(poolId);

        if (totalStaked.isZero()) return;

        // Reward = (rewardPerBlock * blocksElapsed * userStaked) / totalStaked
        const multiplier: u256 = this._stakeMultiplier.get(userPoolKey);
        const baseReward: u256 = SafeMath.div(
            SafeMath.mul(SafeMath.mul(rewardPerBlock, blocksElapsed), stakeCount),
            totalStaked,
        );
        const boostedReward: u256 = SafeMath.div(
            SafeMath.mul(baseReward, multiplier),
            u256.fromU64(10000),
        );

        const currentPending: u256 = this._stakePendingRewards.get(userPoolKey);
        this._stakePendingRewards.set(userPoolKey, SafeMath.add(currentPending, boostedReward));
        this._stakeLastClaimBlock.set(userPoolKey, effectiveBlock);
    }

    private computeNFTKey(collection: Address, tokenId: u256): u256 {
        const tokenBytes: Uint8Array = tokenId.toUint8Array(true);
        const combined: Uint8Array = new Uint8Array(collection.length + tokenBytes.length);
        combined.set(collection, 0);
        combined.set(tokenBytes, collection.length);
        return u256.fromUint8ArrayBE(Blockchain.sha256(combined));
    }

    private computeUserPoolKey(user: Address, poolId: u256): u256 {
        const poolBytes: Uint8Array = poolId.toUint8Array(true);
        const combined: Uint8Array = new Uint8Array(user.length + poolBytes.length);
        combined.set(user, 0);
        combined.set(poolBytes, user.length);
        return u256.fromUint8ArrayBE(Blockchain.sha256(combined));
    }

    private computeRarityKey(poolId: u256, rarityTier: u256): u256 {
        const poolBytes: Uint8Array = poolId.toUint8Array(true);
        const rarityBytes: Uint8Array = rarityTier.toUint8Array(true);
        const combined: Uint8Array = new Uint8Array(poolBytes.length + rarityBytes.length);
        combined.set(poolBytes, 0);
        combined.set(rarityBytes, poolBytes.length);
        return u256.fromUint8ArrayBE(Blockchain.sha256(combined));
    }

    private addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private u256ToAddress(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    /**
     * Owner guard — called by the @onlyOwner decorator transform.
     */
    protected onlyOwner(_calldata: Calldata): void {
        this.onlyDeployer(Blockchain.tx.sender);
    }
}
