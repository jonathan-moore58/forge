import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { resolveAddress } from '@/utils/address';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { StatCard } from '@/components/common/StatCard';
import { TabBar } from '@/components/common/TabBar';
import { EmptyState } from '@/components/common/EmptyState';
import { FlashlightGrid } from '@/components/common/FlashlightGrid';
import { useNetwork } from '@/hooks/useNetwork';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useBlockNumber, blocksRemaining, estimateTimeRemaining } from '@/hooks/useBlockNumber';
import { useStakingPools, type StakingPoolItem } from '@/hooks/useForgeData';
import { useStakingActions } from '@/hooks/useStakingActions';
import { useUserPortfolio } from '@/hooks/useUserPortfolio';
import { useCollectionMetadata, useOwnedTokens } from '@/hooks/useCollectionData';
import { useApprovalCheck } from '@/hooks/useApprovalCheck';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { ContractService } from '@/services/ContractService';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StakingTab = 'pools' | 'my-stakes' | 'admin';

interface StakeModalState {
    readonly isOpen: boolean;
    readonly pool: StakingPoolItem | null;
}

interface UnstakeModalState {
    readonly isOpen: boolean;
    readonly pool: StakingPoolItem | null;
}

interface UserStakeInfo {
    readonly poolId: bigint;
    readonly pool: StakingPoolItem;
    readonly stakedCount: bigint;
    readonly pendingRewards: bigint;
    readonly lockEndBlock: bigint;
    readonly multiplier: bigint;
}

type StakeStep = 'select' | 'approve' | 'confirm' | 'success';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LOCK_PRESETS = [
    { blocks: 0n, label: 'No Lock', desc: 'Withdraw anytime' },
    { blocks: 144n, label: '~1 Day', desc: '144 blocks' },
    { blocks: 1008n, label: '~1 Week', desc: '1,008 blocks' },
    { blocks: 4320n, label: '~1 Month', desc: '4,320 blocks' },
] as const;

const ANIM_EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortenAddr(addr: string): string {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

/** Format a raw token amount (8-decimal precision) for display */
function formatTokenAmount(raw: bigint): string {
    const val = Number(raw) / 1e8;
    if (val === 0) return '0';
    if (val < 0.0001) return val.toFixed(8);
    if (val < 1) return val.toFixed(6);
    return val.toFixed(4);
}

/* ------------------------------------------------------------------ */
/*  CollectionName — Resolves address to collection name               */
/* ------------------------------------------------------------------ */

function CollectionName({ address, network }: { readonly address: string; readonly network: ForgeNetwork }): JSX.Element {
    const { data: meta } = useCollectionMetadata(network, address);
    return (
        <span style={{ fontWeight: 600, color: theme.colors.text.primary }}>
            {meta?.name ?? shortenAddr(address)}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/*  PoolCard — Single pool card for the Pools tab                      */
/* ------------------------------------------------------------------ */

function PoolCard({
    pool,
    index,
    currentBlock,
    userOwnsNFTs,
    onStake,
}: {
    readonly pool: StakingPoolItem;
    readonly index: number;
    readonly currentBlock: bigint | null;
    readonly userOwnsNFTs: boolean;
    readonly onStake: (pool: StakingPoolItem) => void;
}): JSX.Element {
    const { network } = useNetwork();
    const [isHovered, setIsHovered] = useState(false);

    const blockNum = currentBlock ? Number(currentBlock) : 0;
    const totalBlocks = pool.endBlock - pool.startBlock;
    const elapsed = Math.max(0, blockNum - pool.startBlock);
    const progressPct = totalBlocks > 0 ? Math.min(100, (elapsed / totalBlocks) * 100) : 0;
    const remaining = currentBlock ? blocksRemaining(currentBlock, BigInt(pool.endBlock)) : null;
    const timeRemaining = estimateTimeRemaining(remaining);
    const hasEnded = blockNum >= pool.endBlock;
    const hasStarted = blockNum >= pool.startBlock;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3, ease: ANIM_EASE }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: theme.colors.bg.card,
                border: `1px solid ${isHovered ? theme.colors.border.accent : theme.colors.border.subtle}`,
                borderRadius: theme.radii.xl,
                overflow: 'hidden',
                transition: `all ${theme.transitions.fast}`,
                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: isHovered ? '0 8px 32px rgba(255,107,0,0.06)' : 'none',
            }}
        >
            {/* Status strip */}
            <div style={{
                height: '4px',
                background: hasEnded
                    ? theme.colors.text.tertiary
                    : pool.active
                        ? `linear-gradient(90deg, ${theme.colors.brand.green}, ${theme.colors.brand.cyan})`
                        : theme.colors.brand.orange,
            }} />

            <div style={{ padding: '20px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CollectionName address={pool.collectionAddress} network={network} />
                        {userOwnsNFTs && (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: theme.radii.full,
                                background: 'rgba(0,209,140,0.1)',
                                border: '1px solid rgba(0,209,140,0.2)',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.brand.green,
                            }}>
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: theme.colors.brand.green }} />
                                Eligible
                            </span>
                        )}
                    </div>
                    <span style={{
                        padding: '3px 10px',
                        borderRadius: theme.radii.full,
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        background: hasEnded
                            ? 'rgba(85,85,112,0.15)'
                            : pool.active
                                ? 'rgba(0,209,140,0.1)'
                                : 'rgba(255,107,0,0.1)',
                        color: hasEnded
                            ? theme.colors.text.tertiary
                            : pool.active
                                ? theme.colors.brand.green
                                : theme.colors.brand.orange,
                        border: `1px solid ${hasEnded ? theme.colors.border.subtle : pool.active ? 'rgba(0,209,140,0.2)' : 'rgba(255,107,0,0.2)'}`,
                    }}>
                        {hasEnded ? 'Ended' : !hasStarted ? 'Upcoming' : pool.active ? 'Active' : 'Paused'}
                    </span>
                </div>

                {/* Stats grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '16px',
                }}>
                    {[
                        { label: 'Reward Rate', value: `${pool.rewardPerBlock.toFixed(6)} /blk` },
                        { label: 'Total Staked', value: `${pool.totalStaked} NFTs` },
                        { label: 'Time Left', value: hasEnded ? 'Ended' : timeRemaining || 'Calculating...' },
                        { label: 'Reward Token', value: pool.rewardToken },
                    ].map(({ label, value }) => (
                        <div key={label}>
                            <div style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: '4px',
                            }}>{label}</div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: theme.colors.text.primary,
                                fontFamily: theme.fonts.mono,
                                fontVariantNumeric: 'tabular-nums',
                            }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '10px',
                        color: theme.colors.text.tertiary,
                        marginBottom: '4px',
                    }}>
                        <span>Block {pool.startBlock.toLocaleString()}</span>
                        <span>Block {pool.endBlock.toLocaleString()}</span>
                    </div>
                    <div style={{
                        height: '4px',
                        borderRadius: '2px',
                        background: theme.colors.bg.interactive,
                        overflow: 'hidden',
                    }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                borderRadius: '2px',
                                background: `linear-gradient(90deg, ${theme.colors.brand.orange}, ${theme.colors.brand.green})`,
                            }}
                        />
                    </div>
                </div>

                {/* Stake button */}
                <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => onStake(pool)}
                    disabled={hasEnded || !pool.active}
                >
                    {hasEnded ? 'Pool Ended' : !pool.active ? 'Pool Paused' : 'Stake NFT'}
                </Button>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  UserStakeSummary — Batch query user stakes across all pools        */
/* ------------------------------------------------------------------ */

function UserStakeSummary({
    pools,
    network,
    walletAddress,
    currentBlock,
    onClaim,
    onUnstake,
}: {
    readonly pools: readonly StakingPoolItem[];
    readonly network: ForgeNetwork;
    readonly walletAddress: string;
    readonly currentBlock: bigint | null;
    readonly onClaim: (poolId: bigint) => void;
    readonly onUnstake: (pool: StakingPoolItem) => void;
}): JSX.Element {
    const stakingActions = useStakingActions({ network });

    const { data: userStakes, isLoading } = useQuery({
        queryKey: ['userStakesSummary', network, walletAddress, pools.map(p => p.poolId.toString()).join(',')],
        queryFn: async (): Promise<UserStakeInfo[]> => {
            const staking = ContractService.getStaking(network);
            const userAddr = await resolveAddress(walletAddress, network);
            const results: UserStakeInfo[] = [];
            for (const pool of pools) {
                try {
                    const result = await staking.getUserStakeInfo(userAddr, pool.poolId);
                    const props = result.properties;
                    if (props.stakedCount > 0n) {
                        results.push({
                            poolId: pool.poolId,
                            pool,
                            stakedCount: props.stakedCount,
                            pendingRewards: props.pendingRewards,
                            lockEndBlock: props.lockEndBlock,
                            multiplier: props.multiplier,
                        });
                    }
                } catch {
                    // Skip failed lookups
                }
            }
            return results;
        },
        enabled: !!walletAddress && pools.length > 0,
        refetchInterval: 30_000,
    });

    const totalStaked = useMemo(() =>
        (userStakes ?? []).reduce((sum, s) => sum + Number(s.stakedCount), 0),
        [userStakes],
    );
    const totalPending = useMemo(() =>
        (userStakes ?? []).reduce((sum, s) => sum + s.pendingRewards, 0n),
        [userStakes],
    );
    const poolsIn = userStakes?.length ?? 0;

    if (isLoading) {
        return (
            <div style={{ padding: '40px 0', textAlign: 'center', color: theme.colors.text.tertiary, fontSize: '14px' }}>
                Loading your stakes...
            </div>
        );
    }

    if (!userStakes || userStakes.length === 0) {
        return (
            <EmptyState
                icon="🎯"
                title="No Active Stakes"
                message="You haven't staked any NFTs yet. Browse pools to get started and earn rewards."
            />
        );
    }

    return (
        <div>
            {/* Summary bar */}
            <GlassCard glow="orange" style={{ marginBottom: theme.spacing.lg }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: theme.spacing.md,
                    padding: '20px',
                }}>
                    {[
                        { label: 'Your Staked NFTs', value: String(totalStaked), color: theme.colors.text.primary },
                        { label: 'Pending Rewards', value: `${formatTokenAmount(totalPending)} tokens`, color: theme.colors.brand.green },
                        { label: 'Active In', value: `${poolsIn} pool${poolsIn !== 1 ? 's' : ''}`, color: theme.colors.brand.cyan },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: '6px',
                            }}>{label}</div>
                            <div style={{
                                fontSize: '20px',
                                fontWeight: 700,
                                color,
                                fontFamily: theme.fonts.mono,
                                fontVariantNumeric: 'tabular-nums',
                            }}>{value}</div>
                        </div>
                    ))}
                </div>
            </GlassCard>

            {/* Individual stake cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                {userStakes.map((stake, i) => {
                    const isLocked = currentBlock !== null && currentBlock < stake.lockEndBlock;
                    const remaining = currentBlock ? blocksRemaining(currentBlock, stake.lockEndBlock) : null;
                    const lockTimeStr = estimateTimeRemaining(remaining);
                    const multiplier = (Number(stake.multiplier) / 10000).toFixed(2);

                    return (
                        <motion.div
                            key={stake.poolId.toString()}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <GlassCard hover>
                                <div style={{ padding: '20px' }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <CollectionName address={stake.pool.collectionAddress} network={network} />
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: theme.radii.full,
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                fontFamily: theme.fonts.mono,
                                                background: 'rgba(153,69,255,0.1)',
                                                border: '1px solid rgba(153,69,255,0.2)',
                                                color: theme.colors.brand.purple,
                                            }}>
                                                {multiplier}x
                                            </span>
                                        </div>
                                        {isLocked ? (
                                            <span style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: theme.colors.brand.orange,
                                            }}>
                                                <span>🔒</span> Locked {lockTimeStr}
                                            </span>
                                        ) : (
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: theme.colors.brand.green,
                                            }}>
                                                🔓 Unlocked
                                            </span>
                                        )}
                                    </div>

                                    {/* Stats */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                                        gap: '12px',
                                        marginBottom: '16px',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 600, color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Staked</div>
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: theme.colors.text.primary, fontFamily: theme.fonts.mono }}>{Number(stake.stakedCount)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 600, color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Pending Rewards</div>
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: theme.colors.brand.green, fontFamily: theme.fonts.mono }}>{formatTokenAmount(stake.pendingRewards)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 600, color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Reward Rate</div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.text.primary, fontFamily: theme.fonts.mono }}>{stake.pool.rewardPerBlock.toFixed(6)}/blk</div>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => onClaim(stake.poolId)}
                                            disabled={stake.pendingRewards === 0n || stakingActions.isPending}
                                            loading={stakingActions.isPending}
                                        >
                                            Claim Rewards
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => onUnstake(stake.pool)}
                                            disabled={isLocked}
                                        >
                                            Unstake
                                        </Button>
                                    </div>
                                    {/* Error display */}
                                    {stakingActions.error && (
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 12px',
                                            borderRadius: theme.radii.sm,
                                            background: 'rgba(255,59,48,0.08)',
                                            border: '1px solid rgba(255,59,48,0.2)',
                                            fontSize: '12px',
                                            color: theme.colors.status.error,
                                            lineHeight: 1.4,
                                        }}>
                                            {stakingActions.error}
                                            {/rejected by the contract/i.test(stakingActions.error) && (
                                                <div style={{ marginTop: '4px', color: theme.colors.text.tertiary, fontSize: '11px' }}>
                                                    Tip: Claims fail if the StakingRewards contract has not been funded with reward tokens.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  StakeModal — Multi-step staking flow                               */
/* ------------------------------------------------------------------ */

function StakeModal({
    pool,
    isOpen,
    onClose,
    network,
    walletAddress,
}: {
    readonly pool: StakingPoolItem | null;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly network: ForgeNetwork;
    readonly walletAddress: string;
}): JSX.Element | null {
    const [step, setStep] = useState<StakeStep>('select');
    const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
    const [lockDuration, setLockDuration] = useState<bigint>(0n);
    const [error, setError] = useState<string | null>(null);

    const stakingAddress = CONTRACT_ADDRESSES[network].staking;
    const stakingActions = useStakingActions({ network });

    const { data: ownedTokens, isLoading: tokensLoading } = useOwnedTokens(
        network,
        pool?.collectionAddress,
        walletAddress,
    );

    const approval = useApprovalCheck(
        pool?.collectionAddress,
        selectedTokenId ?? undefined,
        stakingAddress || undefined,
    );

    const handleClose = useCallback(() => {
        setStep('select');
        setSelectedTokenId(null);
        setLockDuration(0n);
        setError(null);
        onClose();
    }, [onClose]);

    const handleProceed = useCallback(async () => {
        if (!selectedTokenId || !pool) return;
        setError(null);

        if (step === 'select') {
            if (!approval.isApproved) {
                setStep('approve');
            } else {
                setStep('confirm');
            }
        } else if (step === 'approve') {
            try {
                await approval.approve();
                setStep('confirm');
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Approval failed');
            }
        } else if (step === 'confirm') {
            try {
                await stakingActions.stake(
                    pool.poolId,
                    selectedTokenId,
                    lockDuration,
                );
                setStep('success');
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Stake failed');
            }
        }
    }, [step, selectedTokenId, pool, approval, stakingActions, lockDuration]);

    if (!isOpen || !pool) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                }}
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.98 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: theme.colors.bg.raised,
                        border: `1px solid ${theme.colors.border.subtle}`,
                        borderRadius: theme.radii.xl,
                        padding: '28px',
                        maxWidth: '520px',
                        width: '100%',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, color: theme.colors.text.primary }}>
                            {step === 'success' ? 'Staked!' : 'Stake NFT'}
                        </h3>
                        <button
                            onClick={handleClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: theme.colors.text.tertiary,
                                cursor: 'pointer',
                                fontSize: '18px',
                                padding: '4px',
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Step indicator */}
                    {step !== 'success' && (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
                            {['select', 'approve', 'confirm'].map((s, i) => (
                                <div
                                    key={s}
                                    style={{
                                        flex: 1,
                                        height: '3px',
                                        borderRadius: '2px',
                                        background: ['select', 'approve', 'confirm'].indexOf(step) >= i
                                            ? theme.colors.brand.orange
                                            : theme.colors.bg.interactive,
                                        transition: `background ${theme.transitions.fast}`,
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Step: Select */}
                    {step === 'select' && (
                        <div>
                            <div style={{ fontSize: '13px', color: theme.colors.text.secondary, marginBottom: '12px' }}>
                                Select an NFT from <CollectionName address={pool.collectionAddress} network={network} /> to stake:
                            </div>

                            {tokensLoading ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: theme.colors.text.tertiary, fontSize: '13px' }}>
                                    Loading your NFTs...
                                </div>
                            ) : !ownedTokens || ownedTokens.length === 0 ? (
                                <div style={{
                                    padding: '30px',
                                    textAlign: 'center',
                                    color: theme.colors.text.tertiary,
                                    fontSize: '13px',
                                    background: theme.colors.bg.overlay,
                                    borderRadius: theme.radii.lg,
                                }}>
                                    You don't own any NFTs from this collection.
                                </div>
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                                    gap: '8px',
                                    marginBottom: '20px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                }}>
                                    {ownedTokens.map((tid) => (
                                        <button
                                            key={tid.toString()}
                                            onClick={() => setSelectedTokenId(tid)}
                                            style={{
                                                padding: '12px 8px',
                                                borderRadius: theme.radii.md,
                                                border: `2px solid ${selectedTokenId === tid ? theme.colors.brand.orange : theme.colors.border.subtle}`,
                                                background: selectedTokenId === tid ? 'rgba(255,107,0,0.08)' : theme.colors.bg.overlay,
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                transition: `all ${theme.transitions.fast}`,
                                            }}
                                        >
                                            <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginBottom: '2px' }}>Token</div>
                                            <div style={{
                                                fontSize: '16px',
                                                fontWeight: 700,
                                                color: selectedTokenId === tid ? theme.colors.brand.orange : theme.colors.text.primary,
                                                fontFamily: theme.fonts.mono,
                                            }}>
                                                #{tid.toString()}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Lock duration */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginBottom: '8px',
                                }}>
                                    Lock Duration (optional bonus)
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {LOCK_PRESETS.map((preset) => (
                                        <button
                                            key={preset.blocks.toString()}
                                            onClick={() => setLockDuration(preset.blocks)}
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: theme.radii.md,
                                                border: `1px solid ${lockDuration === preset.blocks ? theme.colors.brand.orange : theme.colors.border.subtle}`,
                                                background: lockDuration === preset.blocks ? 'rgba(255,107,0,0.08)' : 'transparent',
                                                color: lockDuration === preset.blocks ? theme.colors.brand.orange : theme.colors.text.secondary,
                                                fontSize: '12px',
                                                fontWeight: lockDuration === preset.blocks ? 700 : 500,
                                                cursor: 'pointer',
                                                transition: `all ${theme.transitions.fast}`,
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                                    {LOCK_PRESETS.find(p => p.blocks === lockDuration)?.desc ?? ''}
                                </div>
                            </div>

                            <Button
                                variant="primary"
                                size="md"
                                fullWidth
                                onClick={handleProceed}
                                disabled={selectedTokenId === null}
                            >
                                Continue
                            </Button>
                        </div>
                    )}

                    {/* Step: Approve */}
                    {step === 'approve' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: theme.radii.xl,
                                background: 'rgba(255,107,0,0.1)',
                                border: '1px solid rgba(255,107,0,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '28px',
                                margin: '0 auto 16px',
                            }}>
                                🔐
                            </div>
                            <h4 style={{ fontFamily: theme.fonts.heading, fontSize: '16px', fontWeight: 600, color: theme.colors.text.primary, marginBottom: '8px' }}>
                                Approve Collection
                            </h4>
                            <p style={{ fontSize: '13px', color: theme.colors.text.tertiary, marginBottom: '24px', lineHeight: 1.5 }}>
                                Allow the Staking contract to transfer your NFTs. This is a one-time approval per collection.
                            </p>
                            <Button
                                variant="shine"
                                size="md"
                                fullWidth
                                onClick={handleProceed}
                                loading={approval.isPending}
                            >
                                Approve
                            </Button>
                        </div>
                    )}

                    {/* Step: Confirm */}
                    {step === 'confirm' && (
                        <div>
                            <div style={{
                                background: theme.colors.bg.overlay,
                                borderRadius: theme.radii.lg,
                                padding: '16px',
                                marginBottom: '20px',
                            }}>
                                {[
                                    { label: 'Collection', value: pool.collection },
                                    { label: 'Token ID', value: `#${selectedTokenId?.toString()}` },
                                    { label: 'Lock Duration', value: LOCK_PRESETS.find(p => p.blocks === lockDuration)?.label ?? 'None' },
                                    { label: 'Pool', value: `#${pool.poolId.toString()}` },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                        <span style={{ fontSize: '13px', color: theme.colors.text.tertiary }}>{label}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.text.primary, fontFamily: theme.fonts.mono }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                            <Button
                                variant="primary"
                                size="md"
                                fullWidth
                                onClick={handleProceed}
                                loading={stakingActions.isPending}
                            >
                                Confirm Stake
                            </Button>
                        </div>
                    )}

                    {/* Step: Success */}
                    {step === 'success' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: 'rgba(0,209,140,0.1)',
                                border: '2px solid rgba(0,209,140,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '32px',
                                margin: '0 auto 16px',
                            }}>
                                ✓
                            </div>
                            <h4 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, color: theme.colors.brand.green, marginBottom: '8px' }}>
                                NFT Staked Successfully!
                            </h4>
                            <p style={{ fontSize: '13px', color: theme.colors.text.tertiary, marginBottom: '24px' }}>
                                Your NFT is now earning rewards. Visit the My Stakes tab to track your earnings.
                            </p>
                            <Button variant="secondary" size="md" onClick={handleClose}>
                                Done
                            </Button>
                        </div>
                    )}

                    {/* Error display */}
                    {error && (
                        <div style={{
                            marginTop: '12px',
                            padding: '10px 14px',
                            borderRadius: theme.radii.md,
                            background: 'rgba(255,59,48,0.08)',
                            border: '1px solid rgba(255,59,48,0.2)',
                            fontSize: '12px',
                            color: theme.colors.status.error,
                        }}>
                            {error}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/* ------------------------------------------------------------------ */
/*  UnstakeModal — Unstake confirmation                                */
/* ------------------------------------------------------------------ */

function UnstakeModal({
    pool,
    isOpen,
    onClose,
    network,
    walletAddress,
    currentBlock,
}: {
    readonly pool: StakingPoolItem | null;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly network: ForgeNetwork;
    readonly walletAddress: string;
    readonly currentBlock: bigint | null;
}): JSX.Element | null {
    const [selectedTokenId, setSelectedTokenId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const stakingActions = useStakingActions({ network });

    const { data: userStake } = useQuery({
        queryKey: ['unstakeCheck', network, pool?.poolId.toString(), walletAddress],
        queryFn: async () => {
            const staking = ContractService.getStaking(network);
            const userAddr = await resolveAddress(walletAddress, network);
            const result = await staking.getUserStakeInfo(userAddr, pool!.poolId);
            return result.properties;
        },
        enabled: isOpen && !!pool && !!walletAddress,
    });

    const isLocked = userStake && currentBlock !== null ? currentBlock < userStake.lockEndBlock : false;
    const remaining = userStake && currentBlock ? blocksRemaining(currentBlock, userStake.lockEndBlock) : null;
    const lockTimeStr = estimateTimeRemaining(remaining);

    const handleClose = useCallback(() => {
        setSelectedTokenId('');
        setError(null);
        setSuccess(false);
        onClose();
    }, [onClose]);

    const handleUnstake = useCallback(async () => {
        if (!pool || !selectedTokenId) return;
        setError(null);
        try {
            await stakingActions.unstake(pool.poolId, BigInt(selectedTokenId));
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unstake failed');
        }
    }, [pool, selectedTokenId, stakingActions]);

    if (!isOpen || !pool) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                }}
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.98 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: theme.colors.bg.raised,
                        border: `1px solid ${theme.colors.border.subtle}`,
                        borderRadius: theme.radii.xl,
                        padding: '28px',
                        maxWidth: '460px',
                        width: '100%',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, color: theme.colors.text.primary }}>
                            {success ? 'Unstaked!' : 'Unstake NFT'}
                        </h3>
                        <button onClick={handleClose} style={{ background: 'none', border: 'none', color: theme.colors.text.tertiary, cursor: 'pointer', fontSize: '18px', padding: '4px' }}>
                            ✕
                        </button>
                    </div>

                    {success ? (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: 'rgba(0,209,140,0.1)', border: '2px solid rgba(0,209,140,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '32px', margin: '0 auto 16px',
                            }}>✓</div>
                            <h4 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, color: theme.colors.brand.green, marginBottom: '8px' }}>
                                NFT Unstaked & Rewards Claimed!
                            </h4>
                            <Button variant="secondary" size="md" onClick={handleClose}>Done</Button>
                        </div>
                    ) : (
                        <div>
                            {/* Lock warning */}
                            {isLocked && (
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(255,107,0,0.08)',
                                    border: '1px solid rgba(255,107,0,0.2)',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                }}>
                                    <span style={{ fontSize: '20px' }}>🔒</span>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.brand.orange }}>
                                            Stake is locked
                                        </div>
                                        <div style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>
                                            Locked until block {userStake?.lockEndBlock.toString()} ({lockTimeStr} remaining)
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pending rewards note */}
                            {userStake && userStake.pendingRewards > 0n && (
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(0,209,140,0.06)',
                                    border: '1px solid rgba(0,209,140,0.15)',
                                    marginBottom: '16px',
                                    fontSize: '13px',
                                    color: theme.colors.brand.green,
                                }}>
                                    Unstaking will also claim <strong>{formatTokenAmount(userStake.pendingRewards)} tokens</strong> in pending rewards.
                                </div>
                            )}

                            {/* Token ID input */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginBottom: '6px',
                                }}>
                                    Token ID to Unstake
                                </label>
                                <input
                                    type="text"
                                    value={selectedTokenId}
                                    onChange={(e) => setSelectedTokenId(e.target.value)}
                                    placeholder="Enter token ID"
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: theme.radii.md,
                                        border: `1px solid ${theme.colors.border.subtle}`,
                                        background: theme.colors.bg.overlay,
                                        color: theme.colors.text.primary,
                                        fontFamily: theme.fonts.mono,
                                        fontSize: '14px',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            <Button
                                variant="danger"
                                size="md"
                                fullWidth
                                onClick={handleUnstake}
                                disabled={isLocked || !selectedTokenId || stakingActions.isPending}
                                loading={stakingActions.isPending}
                            >
                                {isLocked ? 'Locked' : 'Confirm Unstake'}
                            </Button>

                            {error && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '10px 14px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(255,59,48,0.08)',
                                    border: '1px solid rgba(255,59,48,0.2)',
                                    fontSize: '12px',
                                    color: theme.colors.status.error,
                                }}>
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/* ------------------------------------------------------------------ */
/*  AdminPanel — Pool creation & configuration forms                   */
/* ------------------------------------------------------------------ */

function AdminPanel({
    network,
    currentBlock,
}: {
    readonly network: ForgeNetwork;
    readonly currentBlock: bigint | null;
}): JSX.Element {
    const stakingActions = useStakingActions({ network });

    // Create Pool form state
    const [cpCollection, setCpCollection] = useState('');
    const [cpRewardToken, setCpRewardToken] = useState('');
    const [cpRewardPerBlock, setCpRewardPerBlock] = useState('');
    const [cpStartBlock, setCpStartBlock] = useState('');
    const [cpEndBlock, setCpEndBlock] = useState('');
    const [cpStatus, setCpStatus] = useState<string | null>(null);

    // Rarity Multiplier form state
    const [rmPoolId, setRmPoolId] = useState('');
    const [rmTier, setRmTier] = useState('');
    const [rmMultiplier, setRmMultiplier] = useState('');
    const [rmStatus, setRmStatus] = useState<string | null>(null);

    // Lock Bonus form state
    const [lbDuration, setLbDuration] = useState('');
    const [lbBonus, setLbBonus] = useState('');
    const [lbStatus, setLbStatus] = useState<string | null>(null);

    const handleCreatePool = useCallback(async () => {
        setCpStatus(null);
        try {
            const startBlock = cpStartBlock ? BigInt(cpStartBlock) : (currentBlock ?? 0n) + 10n;
            const endBlock = cpEndBlock ? BigInt(cpEndBlock) : startBlock + 4320n;
            await stakingActions.createPool(
                cpCollection,
                cpRewardToken,
                BigInt(Math.round(parseFloat(cpRewardPerBlock) * 1e8)),
                startBlock,
                endBlock,
            );
            setCpStatus('Pool created successfully!');
            setCpCollection(''); setCpRewardToken(''); setCpRewardPerBlock(''); setCpStartBlock(''); setCpEndBlock('');
        } catch (e) {
            setCpStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [cpCollection, cpRewardToken, cpRewardPerBlock, cpStartBlock, cpEndBlock, currentBlock, stakingActions]);

    const handleSetRarity = useCallback(async () => {
        setRmStatus(null);
        try {
            await stakingActions.setRarityMultiplier(BigInt(rmPoolId), BigInt(rmTier), BigInt(rmMultiplier));
            setRmStatus('Rarity multiplier set!');
        } catch (e) {
            setRmStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [rmPoolId, rmTier, rmMultiplier, stakingActions]);

    const handleSetLockBonus = useCallback(async () => {
        setLbStatus(null);
        try {
            await stakingActions.setLockBonus(BigInt(lbDuration), BigInt(lbBonus));
            setLbStatus('Lock bonus set!');
        } catch (e) {
            setLbStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [lbDuration, lbBonus, stakingActions]);

    const inputStyle = {
        width: '100%',
        padding: '10px 14px',
        borderRadius: theme.radii.md,
        border: `1px solid ${theme.colors.border.subtle}`,
        background: theme.colors.bg.overlay,
        color: theme.colors.text.primary,
        fontFamily: theme.fonts.mono,
        fontSize: '13px',
        outline: 'none',
        boxSizing: 'border-box' as const,
    };

    const labelStyle = {
        display: 'block' as const,
        fontSize: '11px',
        fontWeight: 600 as const,
        color: theme.colors.text.tertiary,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        marginBottom: '6px',
    };

    const sectionTitleStyle = {
        fontFamily: theme.fonts.heading,
        fontSize: '15px',
        fontWeight: 700 as const,
        color: theme.colors.text.primary,
        marginBottom: '16px',
    };

    function StatusMessage({ status }: { status: string | null }) {
        if (!status) return null;
        const isError = status.startsWith('Error');
        return (
            <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: theme.radii.md,
                background: isError ? 'rgba(255,59,48,0.08)' : 'rgba(0,209,140,0.06)',
                border: `1px solid ${isError ? 'rgba(255,59,48,0.2)' : 'rgba(0,209,140,0.15)'}`,
                fontSize: '12px',
                color: isError ? theme.colors.status.error : theme.colors.brand.green,
            }}>
                {status}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
            {/* Note */}
            <div style={{
                padding: '12px 16px',
                borderRadius: theme.radii.md,
                background: 'rgba(255,107,0,0.06)',
                border: '1px solid rgba(255,107,0,0.15)',
                fontSize: '12px',
                color: theme.colors.text.secondary,
            }}>
                Admin functions require the contract owner wallet. Transactions will revert if the connected wallet is not the owner.
            </div>

            {/* Create Pool */}
            <GlassCard>
                <div style={{ padding: '20px' }}>
                    <h4 style={sectionTitleStyle}>Create Staking Pool</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Collection Address</label>
                            <input style={inputStyle} value={cpCollection} onChange={(e) => setCpCollection(e.target.value)} placeholder="0x..." />
                        </div>
                        <div>
                            <label style={labelStyle}>Reward Token Address</label>
                            <input style={inputStyle} value={cpRewardToken} onChange={(e) => setCpRewardToken(e.target.value)} placeholder="0x..." />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>Reward/Block (tokens)</label>
                                <input style={inputStyle} value={cpRewardPerBlock} onChange={(e) => setCpRewardPerBlock(e.target.value)} placeholder="0.001" />
                            </div>
                            <div>
                                <label style={labelStyle}>Start Block</label>
                                <input style={inputStyle} value={cpStartBlock} onChange={(e) => setCpStartBlock(e.target.value)} placeholder={currentBlock ? String(Number(currentBlock) + 10) : 'auto'} />
                            </div>
                            <div>
                                <label style={labelStyle}>End Block</label>
                                <input style={inputStyle} value={cpEndBlock} onChange={(e) => setCpEndBlock(e.target.value)} placeholder="auto (+4320)" />
                            </div>
                        </div>

                        {/* Duration presets */}
                        <div>
                            <label style={labelStyle}>Duration Presets</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {[
                                    { label: '1 day', blocks: 144 },
                                    { label: '1 week', blocks: 1008 },
                                    { label: '1 month', blocks: 4320 },
                                    { label: '3 months', blocks: 12960 },
                                ].map((preset) => {
                                    const start = cpStartBlock ? Number(cpStartBlock) : (currentBlock ? Number(currentBlock) + 10 : 0);
                                    const isActive = cpEndBlock === String(start + preset.blocks);
                                    return (
                                        <button
                                            key={preset.label}
                                            onClick={() => {
                                                const s = cpStartBlock ? Number(cpStartBlock) : (currentBlock ? Number(currentBlock) + 10 : 10);
                                                if (!cpStartBlock && currentBlock) setCpStartBlock(String(Number(currentBlock) + 10));
                                                setCpEndBlock(String(s + preset.blocks));
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                background: isActive ? 'rgba(255,107,0,0.1)' : theme.colors.bg.overlay,
                                                border: `1px solid ${isActive ? 'rgba(255,107,0,0.3)' : theme.colors.border.subtle}`,
                                                borderRadius: theme.radii.sm,
                                                color: isActive ? theme.colors.brand.orange : theme.colors.text.secondary,
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                fontFamily: theme.fonts.mono,
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Funding calculator */}
                        {(() => {
                            const rpb = parseFloat(cpRewardPerBlock || '0');
                            const startBlock = cpStartBlock ? Number(cpStartBlock) : (currentBlock ? Number(currentBlock) + 10 : 0);
                            const endBlock = cpEndBlock ? Number(cpEndBlock) : startBlock + 4320;
                            const durationBlocks = Math.max(0, endBlock - startBlock);
                            const totalTokens = rpb * durationBlocks;
                            const durationDays = Math.round((durationBlocks * 10) / 60 / 24 * 10) / 10;

                            if (rpb <= 0 || durationBlocks <= 0) return null;

                            return (
                                <div style={{
                                    padding: '14px 16px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(0,209,140,0.04)',
                                    border: '1px solid rgba(0,209,140,0.12)',
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        color: theme.colors.brand.green,
                                        marginBottom: '10px',
                                    }}>
                                        Funding Required
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: theme.colors.text.secondary }}>Duration</span>
                                            <span style={{ color: theme.colors.text.primary, fontFamily: theme.fonts.mono, fontWeight: 600 }}>
                                                {durationBlocks.toLocaleString()} blocks (~{durationDays}d)
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: theme.colors.text.secondary }}>Reward per block</span>
                                            <span style={{ color: theme.colors.text.primary, fontFamily: theme.fonts.mono, fontWeight: 600 }}>
                                                {rpb}
                                            </span>
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            paddingTop: '8px',
                                            borderTop: `1px solid rgba(0,209,140,0.12)`,
                                        }}>
                                            <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>Total tokens needed</span>
                                            <span style={{
                                                color: theme.colors.brand.green,
                                                fontFamily: theme.fonts.mono,
                                                fontWeight: 700,
                                                fontSize: '15px',
                                            }}>
                                                {totalTokens < 1 ? totalTokens.toFixed(8) : totalTokens.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{
                                        marginTop: '10px',
                                        fontSize: '11px',
                                        color: theme.colors.text.tertiary,
                                        lineHeight: 1.5,
                                    }}>
                                        Transfer this amount of the reward token to the StakingRewards contract
                                        (<span style={{ fontFamily: theme.fonts.mono, fontSize: '10px' }}>
                                            {CONTRACT_ADDRESSES[network].staking?.slice(0, 16)}...
                                        </span>) before users stake. If underfunded, claims and unstakes will fail.
                                    </div>
                                </div>
                            );
                        })()}

                        <Button variant="primary" size="md" onClick={handleCreatePool} loading={stakingActions.isPending} disabled={!cpCollection || !cpRewardToken || !cpRewardPerBlock}>
                            Create Pool
                        </Button>
                        <StatusMessage status={cpStatus} />
                    </div>
                </div>
            </GlassCard>

            {/* Set Rarity Multiplier */}
            <GlassCard>
                <div style={{ padding: '20px' }}>
                    <h4 style={sectionTitleStyle}>Set Rarity Multiplier</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={labelStyle}>Pool ID</label>
                            <input style={inputStyle} value={rmPoolId} onChange={(e) => setRmPoolId(e.target.value)} placeholder="0" />
                        </div>
                        <div>
                            <label style={labelStyle}>Rarity Tier</label>
                            <input style={inputStyle} value={rmTier} onChange={(e) => setRmTier(e.target.value)} placeholder="0" />
                        </div>
                        <div>
                            <label style={labelStyle}>Multiplier (BPS)</label>
                            <input style={inputStyle} value={rmMultiplier} onChange={(e) => setRmMultiplier(e.target.value)} placeholder="15000 = 1.5x" />
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleSetRarity} loading={stakingActions.isPending} disabled={!rmPoolId || !rmTier || !rmMultiplier}>
                        Set Multiplier
                    </Button>
                    <StatusMessage status={rmStatus} />
                </div>
            </GlassCard>

            {/* Set Lock Bonus */}
            <GlassCard>
                <div style={{ padding: '20px' }}>
                    <h4 style={sectionTitleStyle}>Set Lock Bonus</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={labelStyle}>Lock Duration (blocks)</label>
                            <input style={inputStyle} value={lbDuration} onChange={(e) => setLbDuration(e.target.value)} placeholder="1008 (~1 week)" />
                        </div>
                        <div>
                            <label style={labelStyle}>Bonus (BPS)</label>
                            <input style={inputStyle} value={lbBonus} onChange={(e) => setLbBonus(e.target.value)} placeholder="2000 = +20%" />
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleSetLockBonus} loading={stakingActions.isPending} disabled={!lbDuration || !lbBonus}>
                        Set Lock Bonus
                    </Button>
                    <StatusMessage status={lbStatus} />
                </div>
            </GlassCard>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  StakingPage — Main export                                          */
/* ------------------------------------------------------------------ */

export function StakingPage(): JSX.Element {
    const { network } = useNetwork();
    const { walletAddress: rawAddr } = useWalletConnect();
    const walletAddress = rawAddr ? (typeof rawAddr === 'string' ? rawAddr : String(rawAddr)) : undefined;
    const { blockNumber: currentBlock } = useBlockNumber({ network });

    // Pool data
    const { items: pools, isLoading: poolsLoading, totalPools, totalRewardsDistributed } = useStakingPools(network);

    // User portfolio (to check which collections user owns NFTs from)
    const portfolio = useUserPortfolio(network, walletAddress);

    // Staking actions for claim
    const stakingActions = useStakingActions({ network });

    // Local state
    const [activeTab, setActiveTab] = useState<StakingTab>('pools');
    const [stakeModal, setStakeModal] = useState<StakeModalState>({ isOpen: false, pool: null });
    const [unstakeModal, setUnstakeModal] = useState<UnstakeModalState>({ isOpen: false, pool: null });

    // Derived data
    const ownedCollections = useMemo(() => {
        const set = new Set<string>();
        for (const h of portfolio.holdings) {
            if (h.count > 0) set.add(h.collectionAddress);
        }
        return set;
    }, [portfolio.holdings]);

    const totalNFTsStaked = useMemo(() => pools.reduce((sum, p) => sum + p.totalStaked, 0), [pools]);
    const activePools = useMemo(() => pools.filter(p => p.active).length, [pools]);

    const TABS = useMemo(() => {
        const tabs: { id: string; label: string; count?: number }[] = [
            { id: 'pools', label: 'Pools', count: pools.length },
            { id: 'my-stakes', label: 'My Stakes' },
        ];
        if (walletAddress) {
            tabs.push({ id: 'admin', label: 'Admin' });
        }
        return tabs;
    }, [pools.length, walletAddress]);

    // Handlers
    const openStakeModal = useCallback((pool: StakingPoolItem) => {
        setStakeModal({ isOpen: true, pool });
    }, []);

    const closeStakeModal = useCallback(() => {
        setStakeModal({ isOpen: false, pool: null });
    }, []);

    const openUnstakeModal = useCallback((pool: StakingPoolItem) => {
        setUnstakeModal({ isOpen: true, pool });
    }, []);

    const closeUnstakeModal = useCallback(() => {
        setUnstakeModal({ isOpen: false, pool: null });
    }, []);

    const handleClaimRewards = useCallback(async (poolId: bigint) => {
        try {
            await stakingActions.claimRewards(poolId);
        } catch {
            // Error handled by useTransaction
        }
    }, [stakingActions]);

    const stakingDeployed = !!CONTRACT_ADDRESSES[network].staking;

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: `${theme.spacing.xxl} ${theme.spacing.lg}`, position: 'relative' }}>
            {/* Background */}
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: -1,
                background: theme.gradients.meshWarm,
                opacity: 0.5,
            }} />

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: ANIM_EASE }}
                style={{ marginBottom: theme.spacing.xl }}
            >
                <h1 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: '40px',
                    fontWeight: 800,
                    color: theme.colors.text.primary,
                    letterSpacing: theme.letterSpacing.tight,
                    lineHeight: 1.1,
                    marginBottom: '8px',
                }}>
                    NFT Staking
                </h1>
                <p style={{
                    fontSize: '15px',
                    color: theme.colors.text.secondary,
                    lineHeight: 1.5,
                }}>
                    Stake your NFTs to earn rewards. Lock for longer to boost your multiplier.
                </p>
            </motion.div>

            {/* Stats Row */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.35, ease: ANIM_EASE }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: theme.spacing.md,
                    marginBottom: theme.spacing.xxl,
                }}
            >
                <StatCard label="Total Pools" value={totalPools} decimals={0} icon="🏊" />
                <StatCard label="Active Pools" value={activePools} decimals={0} icon="🟢" />
                <StatCard label="NFTs Staked" value={totalNFTsStaked} decimals={0} icon="🔒" />
                <StatCard label="Rewards Distributed" value={totalRewardsDistributed} decimals={4} suffix=" tokens" icon="💰" />
            </motion.div>

            {/* Tab Bar */}
            <TabBar
                tabs={TABS}
                activeTab={activeTab}
                onChange={(id) => setActiveTab(id as StakingTab)}
                layoutId="staking-tab"
            />

            {/* Tab Content */}
            <div style={{ marginTop: theme.spacing.lg }}>
                <AnimatePresence mode="wait">
                    {/* Pools Tab */}
                    {activeTab === 'pools' && (
                        <motion.div
                            key="pools"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {!stakingDeployed ? (
                                <EmptyState
                                    icon="⚙️"
                                    title="Staking Not Available"
                                    message="The staking contract is not deployed on this network yet."
                                />
                            ) : poolsLoading ? (
                                <div style={{ padding: '60px 0', textAlign: 'center', color: theme.colors.text.tertiary, fontSize: '14px' }}>
                                    Loading pools...
                                </div>
                            ) : pools.length === 0 ? (
                                <EmptyState
                                    icon="🏊"
                                    title="No Staking Pools"
                                    message="No staking pools have been created yet. Check back soon for rewards opportunities."
                                />
                            ) : (
                                <FlashlightGrid style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                                    gap: theme.spacing.lg,
                                }}>
                                    {pools.map((pool, i) => (
                                        <PoolCard
                                            key={pool.id}
                                            pool={pool}
                                            index={i}
                                            currentBlock={currentBlock}
                                            userOwnsNFTs={ownedCollections.has(pool.collectionAddress)}
                                            onStake={openStakeModal}
                                        />
                                    ))}
                                </FlashlightGrid>
                            )}
                        </motion.div>
                    )}

                    {/* My Stakes Tab */}
                    {activeTab === 'my-stakes' && (
                        <motion.div
                            key="my-stakes"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {!walletAddress ? (
                                <EmptyState
                                    icon="🔗"
                                    title="Connect Your Wallet"
                                    message="Connect your wallet to view your staked NFTs and pending rewards."
                                />
                            ) : !stakingDeployed ? (
                                <EmptyState
                                    icon="⚙️"
                                    title="Staking Not Available"
                                    message="The staking contract is not deployed on this network."
                                />
                            ) : (
                                <UserStakeSummary
                                    pools={pools}
                                    network={network}
                                    walletAddress={walletAddress}
                                    currentBlock={currentBlock}
                                    onClaim={handleClaimRewards}
                                    onUnstake={openUnstakeModal}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* Admin Tab */}
                    {activeTab === 'admin' && (
                        <motion.div
                            key="admin"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <AdminPanel network={network} currentBlock={currentBlock} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Modals */}
            <StakeModal
                pool={stakeModal.pool}
                isOpen={stakeModal.isOpen}
                onClose={closeStakeModal}
                network={network}
                walletAddress={walletAddress ?? ''}
            />
            <UnstakeModal
                pool={unstakeModal.pool}
                isOpen={unstakeModal.isOpen}
                onClose={closeUnstakeModal}
                network={network}
                walletAddress={walletAddress ?? ''}
                currentBlock={currentBlock}
            />
        </div>
    );
}
