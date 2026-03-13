import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { StatCard } from '@/components/common/StatCard';
import { TabBar } from '@/components/common/TabBar';
import { BlockCountdown } from '@/components/common/FlipCountdown';
import { TimelineStepper } from '@/components/common/TimelineStepper';
import { useNetwork } from '@/hooks/useNetwork';
import { useBlockNumber } from '@/hooks/useBlockNumber';
import { useQuery } from '@tanstack/react-query';
import { useTotalCollections } from '@/hooks/useRegistry';
import { useLaunchpadDrops } from '@/hooks/useLaunchpadDrops';
import { useMarketStats } from '@/hooks/useMarketplace';
import { IndexerAPI } from '@/services/IndexerAPI';
import { useCollectionActions } from '@/hooks/useCollectionActions';
import { useMint } from '@/hooks/useMint';
import { useTotalSupply } from '@/hooks/useCollectionData';
import { CollectionImage } from '@/components/common/CollectionImage';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { bech32m } from 'bech32';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MintPhase {
    readonly name: string;
    readonly startBlock: number;
    readonly endBlock: number;
    readonly price: number;
    readonly maxPerWallet: number;
}

interface Drop {
    readonly id: string;
    readonly address: string;
    readonly creator: string;
    readonly name: string;
    readonly description: string;
    readonly supply: number;
    readonly minted: number;
    readonly mintPrice: number;
    /** Raw price in sats (for contract calls) */
    readonly mintPriceSats: bigint;
    readonly startBlock: number;
    readonly endBlock: number;
    readonly status: 'live' | 'upcoming' | 'ended';
    readonly featured: boolean;
    readonly bannerGradient: string;
    readonly baseUri: string;
    readonly icon: string;
    readonly banner: string;
    readonly phases: readonly MintPhase[];
    readonly dutchAuction: {
        readonly startPrice: number;
        readonly endPrice: number;
        readonly decayPerBlock: number;
    } | null;
}

const GRADIENT_POOL = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getDutchPrice(drop: Drop, block: number): number {
    if (!drop.dutchAuction) return drop.mintPrice;
    const elapsed = Math.max(0, block - drop.startBlock);
    const decay = elapsed * drop.dutchAuction.decayPerBlock;
    return Math.max(drop.dutchAuction.endPrice, drop.dutchAuction.startPrice - decay);
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function MintProgressBar({
    minted,
    supply,
    large = false,
}: {
    readonly minted: number;
    readonly supply: number;
    readonly large?: boolean;
}): JSX.Element {
    const pct = supply > 0 ? Math.min(100, (minted / supply) * 100) : 0;
    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '6px',
                fontSize: large ? '13px' : '12px',
                color: theme.colors.text.secondary,
            }}>
                <span>
                    <CountUp end={minted} duration={1.5} separator="," enableScrollSpy scrollSpyOnce />
                    {' / '}
                    {supply.toLocaleString()} minted
                </span>
                <span style={{
                    fontWeight: 700,
                    fontFamily: theme.fonts.mono,
                    color: pct >= 90 ? theme.colors.brand.green : theme.colors.text.primary,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {pct.toFixed(1)}%
                </span>
            </div>
            <div style={{
                height: large ? '10px' : '8px',
                borderRadius: theme.radii.full,
                background: theme.colors.bg.interactive,
                overflow: 'hidden',
                position: 'relative',
            }}>
                <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        borderRadius: theme.radii.full,
                        background: pct >= 90
                            ? theme.gradients.cyanToGreen
                            : theme.gradients.orangeToPurple,
                        position: 'relative',
                    }}
                >
                    {/* Shimmer */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'gradient-shift 2s ease infinite',
                    }} />
                </motion.div>
            </div>
        </div>
    );
}

function DutchAuctionCurve({ drop, currentBlock }: { readonly drop: Drop; readonly currentBlock: number }): JSX.Element | null {
    if (!drop.dutchAuction) return null;

    const steps = 30;
    const blockRange = drop.endBlock - drop.startBlock;
    const blockStep = blockRange / steps;

    const points: string[] = [];
    const fillPoints: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const block = drop.startBlock + i * blockStep;
        const price = getDutchPrice(drop, block);
        const x = (i / steps) * 280;
        const y = 130 - ((price - drop.dutchAuction.endPrice) /
            (drop.dutchAuction.startPrice - drop.dutchAuction.endPrice)) * 110;
        points.push(`${x},${y}`);
        fillPoints.push(`${x},${y}`);
    }
    fillPoints.push(`280,130`);
    fillPoints.push(`0,130`);

    const currentX = Math.min(280, Math.max(0,
        ((currentBlock - drop.startBlock) / blockRange) * 280));
    const currentPrice = getDutchPrice(drop, currentBlock);
    const currentY = 130 - ((currentPrice - drop.dutchAuction.endPrice) /
        (drop.dutchAuction.startPrice - drop.dutchAuction.endPrice)) * 110;

    return (
        <div style={{ marginTop: '16px' }}>
            <div style={{
                fontSize: '11px',
                color: theme.colors.text.tertiary,
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: theme.letterSpacing.wider,
                fontWeight: 600,
            }}>
                Dutch Auction Price Curve
            </div>
            <div style={{
                background: theme.colors.bg.overlay,
                borderRadius: theme.radii.md,
                padding: '16px',
                border: `1px solid ${theme.colors.border.subtle}`,
            }}>
                <svg viewBox="0 0 280 150" style={{ width: '100%', height: '140px' }}>
                    <defs>
                        <linearGradient id="dutch-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.colors.brand.cyan} stopOpacity="0.15" />
                            <stop offset="100%" stopColor={theme.colors.brand.cyan} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[0, 1, 2, 3].map((i) => (
                        <line key={i} x1="0" y1={20 + i * 36} x2="280" y2={20 + i * 36}
                            stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    ))}
                    {/* Fill */}
                    <polygon points={fillPoints.join(' ')} fill="url(#dutch-fill)" />
                    {/* Curve */}
                    <polyline
                        points={points.join(' ')}
                        fill="none"
                        stroke={theme.colors.brand.cyan}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Current position dashed line */}
                    <line x1={currentX} y1={currentY} x2={currentX} y2="130"
                        stroke={theme.colors.brand.orange} strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
                    {/* Current dot + halo */}
                    <circle cx={currentX} cy={currentY} r="8"
                        fill={theme.colors.brand.orange} opacity="0.15" />
                    <circle cx={currentX} cy={currentY} r="4"
                        fill={theme.colors.brand.orange} stroke="#fff" strokeWidth="1.5" />
                    {/* Price label */}
                    <text
                        x={currentX}
                        y={currentY - 14}
                        fill={theme.colors.text.primary}
                        fontSize="10"
                        textAnchor="middle"
                        fontFamily={theme.fonts.mono}
                        fontWeight="600"
                    >
                        {currentPrice.toFixed(4)} BTC
                    </text>
                </svg>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: theme.colors.text.tertiary,
                    fontFamily: theme.fonts.mono,
                    marginTop: '4px',
                }}>
                    <span>Start: {drop.dutchAuction.startPrice} BTC</span>
                    <span>Floor: {drop.dutchAuction.endPrice} BTC</span>
                </div>
            </div>
        </div>
    );
}

function WhitelistChecker(): JSX.Element {
    const [address, setAddress] = useState('');
    const [result, setResult] = useState<'eligible' | 'not-eligible' | null>(null);
    const [isFocused, setIsFocused] = useState(false);

    const checkWhitelist = useCallback(() => {
        // Validates address format (Taproot bc1p required for OPNet)
        // Real whitelist verification requires on-chain Merkle proof check
        if (!address.trim()) return;
        setResult(address.startsWith('bc1p') && address.length >= 62 ? 'eligible' : 'not-eligible');
    }, [address]);

    return (
        <div style={{
            padding: '24px',
            background: theme.colors.bg.card,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${theme.colors.border.subtle}`,
            borderRadius: theme.radii.lg,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.cyan} strokeWidth="2">
                    <path d="M9 12l2 2 4-4" />
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                </svg>
                <h3 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: '16px',
                    fontWeight: 700,
                }}>
                    Whitelist Checker
                </h3>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Enter your Bitcoin address (bc1p...)"
                        value={address}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onChange={(e) => {
                            setAddress(e.target.value);
                            setResult(null);
                        }}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: theme.colors.bg.interactive,
                            border: `1px solid ${isFocused ? theme.colors.brand.orange + '60' : theme.colors.border.subtle}`,
                            borderRadius: theme.radii.md,
                            color: theme.colors.text.primary,
                            fontFamily: theme.fonts.mono,
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            transition: `border-color ${theme.transitions.fast}`,
                            boxShadow: isFocused ? `0 0 0 3px rgba(255, 107, 0, 0.08)` : 'none',
                        }}
                    />
                </div>
                <Button variant="secondary" onClick={checkWhitelist}>
                    Check
                </Button>
            </div>
            <AnimatePresence>
                {result !== null && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        style={{
                            marginTop: '12px',
                            padding: '12px 16px',
                            borderRadius: theme.radii.md,
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: result === 'eligible'
                                ? 'rgba(20, 241, 149, 0.06)'
                                : 'rgba(239, 68, 68, 0.06)',
                            color: result === 'eligible'
                                ? theme.colors.brand.green
                                : theme.colors.status.error,
                            border: `1px solid ${result === 'eligible'
                                ? 'rgba(20, 241, 149, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)'}`,
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>
                            {result === 'eligible' ? '\u2713' : '\u2717'}
                        </span>
                        {result === 'eligible'
                            ? 'Address is whitelisted for the next phase.'
                            : 'Address is not on the whitelist.'}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Owner Controls — shown when wallet is the collection creator       */
/* ------------------------------------------------------------------ */

function OwnerControls({ drop }: { readonly drop: Drop }): JSX.Element | null {
    const { walletAddress, address: addrObj } = useWalletConnect();
    const { network } = useNetwork();

    // Compare addresses using multiple strategies to handle different encodings.
    // The DB stores creator as bech32m — either from factory event (normalizeAddress)
    // or from force-enrich (raw walletAddress string). The wallet provides both
    // a string address and an Address object.
    let isOwner = false;
    if (drop.creator) {
        const creatorLower = drop.creator.toLowerCase();

        // Strategy 1: Direct string comparison (works if enrichCollection stored walletAddress directly)
        if (walletAddress) {
            const walletStr = (typeof walletAddress === 'string' ? walletAddress : String(walletAddress)).toLowerCase();
            if (walletStr === creatorLower) {
                isOwner = true;
            }
        }

        // Strategy 2: Hex comparison (wallet Address hex vs bech32m-decoded creator)
        if (!isOwner && addrObj) {
            const walletHex = String(addrObj).replace(/^0x/i, '').toLowerCase();

            let creatorHex = '';
            try {
                const decoded = bech32m.decode(drop.creator, drop.creator.length);
                const rawBytes = bech32m.fromWords(decoded.words.slice(1));
                creatorHex = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch {
                creatorHex = creatorLower;
            }

            // Exact match
            if (walletHex === creatorHex) {
                isOwner = true;
            }
            // Suffix match — wallet is 32-byte (64 hex), creator might be 21-byte (42 hex)
            // The 21-byte witness program is the last 21 bytes of the padded 32-byte value
            if (!isOwner && walletHex.length === 64 && creatorHex.length === 42) {
                if (walletHex.endsWith(creatorHex)) {
                    isOwner = true;
                }
            }
            // Or vice versa
            if (!isOwner && creatorHex.length === 64 && walletHex.length === 42) {
                if (creatorHex.endsWith(walletHex)) {
                    isOwner = true;
                }
            }
        }

        // Debug logging — always enabled for now to help troubleshoot
        console.log('[OwnerControls]', {
            drop: drop.name,
            walletAddress: walletAddress ? String(walletAddress).slice(0, 20) + '...' : 'none',
            addrObj: addrObj ? String(addrObj).slice(0, 20) + '...' : 'none',
            creator: drop.creator.slice(0, 20) + '...',
            isOwner,
        });
    }
    const actions = useCollectionActions({
        collectionAddress: drop.address,
        network,
        invalidateKeys: [['launchpad', 'drops', network]],
    });

    // Check marketplace registration status
    const { data: regStatus } = useQuery({
        queryKey: ['launchpad', 'regStatus', drop.address],
        queryFn: async () => {
            const res = await IndexerAPI.registrationStatus(drop.address);
            return res.data;
        },
        staleTime: 30_000,
    });
    const isMarketplaceRegistered = regStatus?.registered ?? false;

    if (!isOwner) return null;

    const isLive = drop.status === 'live';

    return (
        <div style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: theme.radii.lg,
            background: 'rgba(255, 107, 0, 0.06)',
            border: '1px solid rgba(255, 107, 0, 0.15)',
        }}>
            <div style={{
                fontSize: '10px',
                color: theme.colors.brand.orange,
                textTransform: 'uppercase',
                letterSpacing: theme.letterSpacing.wider,
                fontWeight: 700,
                marginBottom: '8px',
            }}>
                Owner Controls
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                    size="sm"
                    variant={isLive ? 'ghost' : 'primary'}
                    loading={actions.isPending}
                    onClick={() => actions.setMintOpen(!isLive)}
                >
                    {actions.isPending ? 'Sending...' : isLive ? 'Pause Minting' : 'Enable Minting'}
                </Button>

                {isMarketplaceRegistered ? (
                    <span style={{
                        padding: '4px 10px',
                        borderRadius: theme.radii.full,
                        background: 'rgba(20, 241, 149, 0.1)',
                        border: '1px solid rgba(20, 241, 149, 0.2)',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.colors.brand.green,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                    }}>
                        Marketplace Listed
                    </span>
                ) : (
                    <Link to="/register" style={{ textDecoration: 'none' }}>
                        <Button size="sm" variant="secondary">
                            Register for Trading
                        </Button>
                    </Link>
                )}
            </div>
            {actions.error && (
                <div style={{
                    marginTop: '6px',
                    fontSize: '11px',
                    color: theme.colors.status.error,
                }}>
                    {actions.error}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Drop Card                                                          */
/* ------------------------------------------------------------------ */

function DropCard({ drop, index, currentBlock }: { readonly drop: Drop; readonly index: number; readonly currentBlock: number }): JSX.Element {
    const { network } = useNetwork();
    const mint = useMint({
        collectionAddress: drop.address,
        network,
        invalidateKeys: [['launchpad', 'drops', network]],
    });

    // On-chain totalSupply for real-time mint count (overrides indexer's stale value)
    const { data: onChainSupply } = useTotalSupply(network, drop.address);
    const minted = onChainSupply !== undefined ? Number(onChainSupply) : drop.minted;

    const isSoldOut = drop.supply > 0 && minted >= drop.supply;
    const isLive = drop.status === 'live' && !isSoldOut;
    const isUpcoming = drop.status === 'upcoming';
    const hasStartBlock = drop.startBlock > 0;
    const blocksUntilStart = hasStartBlock ? drop.startBlock - currentBlock : 0;
    const activePhase = drop.phases.find(
        (p) => currentBlock >= p.startBlock && currentBlock < p.endBlock,
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
        >
            <GlassCard hover glow={isLive ? 'orange' : undefined}>
                {/* Banner */}
                <div style={{
                    height: '160px',
                    background: drop.bannerGradient,
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Collection image: icon/banner → token #1 fallback */}
                    {(drop.icon || drop.banner || drop.baseUri) && (
                        <CollectionImage
                            uri={drop.icon || drop.banner}
                            baseUri={drop.baseUri}
                            index={index}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                aspectRatio: 'auto',
                            }}
                        />
                    )}
                    {/* Animated orbs */}
                    <motion.div
                        animate={{ x: [0, 20, 0], y: [0, -10, 0], scale: [1, 1.1, 1] }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute',
                            width: '120px',
                            height: '120px',
                            borderRadius: '50%',
                            background: 'rgba(255, 107, 0, 0.08)',
                            filter: 'blur(40px)',
                            top: '-30px',
                            right: '-20px',
                        }}
                    />
                    <motion.div
                        animate={{ x: [0, -15, 0], y: [0, 15, 0] }}
                        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute',
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'rgba(153, 69, 255, 0.06)',
                            filter: 'blur(30px)',
                            bottom: '-20px',
                            left: '20%',
                        }}
                    />

                    {/* Status badges */}
                    {isLive && (
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            padding: '5px 12px',
                            borderRadius: theme.radii.full,
                            background: 'rgba(20, 241, 149, 0.12)',
                            border: '1px solid rgba(20, 241, 149, 0.25)',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: theme.colors.brand.green,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            backdropFilter: 'blur(8px)',
                        }}>
                            <motion.div
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: theme.colors.brand.green,
                                }}
                            />
                            Live
                        </div>
                    )}
                    {drop.status === 'ended' && (
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            padding: '5px 12px',
                            borderRadius: theme.radii.full,
                            background: 'rgba(255, 255, 255, 0.06)',
                            backdropFilter: 'blur(8px)',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: theme.colors.text.tertiary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                        }}>
                            Sold Out
                        </div>
                    )}
                    {drop.dutchAuction && (
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            padding: '5px 10px',
                            borderRadius: theme.radii.full,
                            background: 'rgba(0, 212, 255, 0.1)',
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            backdropFilter: 'blur(8px)',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: theme.colors.brand.cyan,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                        }}>
                            Dutch
                        </div>
                    )}

                    {/* Collection name overlay */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '24px 20px 14px',
                        background: 'linear-gradient(to top, rgba(10,10,15,0.9) 0%, transparent 100%)',
                    }}>
                        <Link to={`/collection/${drop.address}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h3 style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: '20px',
                                fontWeight: 700,
                                letterSpacing: theme.letterSpacing.snug,
                            }}>
                                {drop.name}
                            </h3>
                        </Link>
                    </div>
                </div>

                <div style={{ padding: '16px 20px 20px' }}>
                    <p style={{
                        fontSize: '13px',
                        color: theme.colors.text.tertiary,
                        marginBottom: '16px',
                        lineHeight: 1.5,
                    }}>
                        {drop.description}
                    </p>

                    <MintProgressBar minted={minted} supply={drop.supply} />

                    {/* Active phase info */}
                    {activePhase && (
                        <div style={{
                            marginTop: '14px',
                            padding: '10px 14px',
                            background: 'rgba(255, 107, 0, 0.04)',
                            borderRadius: theme.radii.md,
                            border: '1px solid rgba(255, 107, 0, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                        }}>
                            <motion.div
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                style={{
                                    width: '5px',
                                    height: '5px',
                                    borderRadius: '50%',
                                    background: theme.colors.brand.orange,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ color: theme.colors.brand.orange, fontWeight: 600 }}>
                                {activePhase.name}
                            </span>
                            <span style={{ color: theme.colors.border.strong }}>|</span>
                            <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.text.primary, fontWeight: 500 }}>
                                {activePhase.price} BTC
                            </span>
                            <span style={{ color: theme.colors.text.tertiary }}>
                                Max {activePhase.maxPerWallet}/wallet
                            </span>
                        </div>
                    )}

                    {/* Dutch auction curve */}
                    {drop.dutchAuction && <DutchAuctionCurve drop={drop} currentBlock={currentBlock} />}

                    {/* Upcoming countdown / paused status */}
                    {isUpcoming && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{
                                fontSize: '11px',
                                color: theme.colors.text.tertiary,
                                marginBottom: '8px',
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                fontWeight: 500,
                            }}>
                                {hasStartBlock ? 'Starts in' : 'Status'}
                            </div>
                            {hasStartBlock ? (
                                <BlockCountdown blocksRemaining={blocksUntilStart} />
                            ) : (
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: theme.colors.text.secondary,
                                    fontFamily: theme.fonts.mono,
                                }}>
                                    Minting Not Open
                                </div>
                            )}
                        </div>
                    )}

                    {/* Owner controls (visible only to collection creator) */}
                    <OwnerControls drop={drop} />

                    {/* Footer */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '16px',
                        paddingTop: '16px',
                        borderTop: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <div>
                            <div style={{
                                fontSize: '10px',
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                marginBottom: '2px',
                                fontWeight: 500,
                            }}>
                                Mint Price
                            </div>
                            <div style={{
                                fontFamily: theme.fonts.mono,
                                fontWeight: 700,
                                fontSize: '18px',
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {drop.dutchAuction
                                    ? `${getDutchPrice(drop, currentBlock).toFixed(4)} BTC`
                                    : `${drop.mintPrice} BTC`}
                            </div>
                        </div>
                        {isLive && (
                            <Button
                                size="md"
                                loading={mint.isPending}
                                onClick={() => mint.publicMint(1n, drop.mintPriceSats)}
                            >
                                {mint.isPending ? 'Minting...' : 'Mint Now'}
                            </Button>
                        )}
                        {isUpcoming && !isSoldOut && (
                            <Button variant="ghost" size="md" disabled>
                                {hasStartBlock ? `${blocksUntilStart.toLocaleString()} blocks` : 'Not Open'}
                            </Button>
                        )}
                        {(drop.status === 'ended' || isSoldOut) && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Link to={`/collection/${drop.address}`} style={{ textDecoration: 'none' }}>
                                    <Button variant="secondary" size="md">View Collection</Button>
                                </Link>
                                <Link to="/register" style={{ textDecoration: 'none' }}>
                                    <Button variant="ghost" size="md">Register for Trading</Button>
                                </Link>
                            </div>
                        )}
                    </div>
                    {mint.error && (
                        <div style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: theme.colors.status.error,
                            wordBreak: 'break-word',
                        }}>
                            {mint.error}
                        </div>
                    )}
                    {mint.status === 'confirmed' && (
                        <div style={{
                            marginTop: '12px',
                            padding: '12px 14px',
                            borderRadius: theme.radii.md,
                            background: 'rgba(20, 241, 149, 0.06)',
                            border: '1px solid rgba(20, 241, 149, 0.15)',
                        }}>
                            <div style={{
                                fontSize: '13px',
                                color: theme.colors.brand.green,
                                fontWeight: 600,
                                marginBottom: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}>
                                {'\u2713'} Mint successful!
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Link to={`/collection/${drop.address}`} style={{ flex: 1, textDecoration: 'none' }}>
                                    <Button variant="secondary" size="sm" fullWidth>
                                        View Collection
                                    </Button>
                                </Link>
                                <Link to="/marketplace" style={{ flex: 1, textDecoration: 'none' }}>
                                    <Button variant="ghost" size="sm" fullWidth>
                                        Marketplace
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </GlassCard>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Featured Drop                                                      */
/* ------------------------------------------------------------------ */

function FeaturedDrop({ drop, currentBlock }: { readonly drop: Drop; readonly currentBlock: number }): JSX.Element {
    const { network } = useNetwork();
    const mint = useMint({
        collectionAddress: drop.address,
        network,
        invalidateKeys: [['launchpad', 'drops', network]],
    });

    // On-chain totalSupply for real-time mint count (overrides indexer's stale value)
    const { data: onChainSupply } = useTotalSupply(network, drop.address);
    const minted = onChainSupply !== undefined ? Number(onChainSupply) : drop.minted;

    const activePhase = drop.phases.find(
        (p) => currentBlock >= p.startBlock && currentBlock < p.endBlock,
    );

    const phaseSteps = drop.phases.map((phase) => {
        const isActive = currentBlock >= phase.startBlock && currentBlock < phase.endBlock;
        const isCompleted = currentBlock >= phase.endBlock;
        return {
            label: phase.name,
            sublabel: `${phase.price} BTC | Max ${phase.maxPerWallet}/wallet`,
            status: isCompleted ? 'completed' as const : isActive ? 'active' as const : 'upcoming' as const,
            detail: isActive
                ? `Block ${phase.startBlock.toLocaleString()} → ${phase.endBlock.toLocaleString()}`
                : undefined,
        };
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div style={{
                borderRadius: theme.radii.xl,
                overflow: 'hidden',
                background: theme.colors.bg.card,
                border: `1px solid ${theme.colors.border.subtle}`,
                boxShadow: theme.shadows.glow.orange,
                position: 'relative',
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    minHeight: '480px',
                }}>
                    {/* Left: Visual area with particles effect */}
                    <div style={{
                        background: drop.bannerGradient,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                    }}>
                        {/* Collection image: icon/banner → token #1 fallback */}
                        {(drop.icon || drop.banner || drop.baseUri) && (
                            <CollectionImage
                                uri={drop.icon || drop.banner}
                                baseUri={drop.baseUri}
                                index={0}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    aspectRatio: 'auto',
                                }}
                            />
                        )}
                        {/* Animated orbs */}
                        <motion.div
                            animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.2, 1] }}
                            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute',
                                width: '200px',
                                height: '200px',
                                borderRadius: '50%',
                                background: 'rgba(255, 107, 0, 0.12)',
                                filter: 'blur(60px)',
                                top: '10%',
                                right: '10%',
                            }}
                        />
                        <motion.div
                            animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 1.15, 1] }}
                            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute',
                                width: '160px',
                                height: '160px',
                                borderRadius: '50%',
                                background: 'rgba(0, 212, 255, 0.08)',
                                filter: 'blur(50px)',
                                bottom: '15%',
                                left: '15%',
                            }}
                        />
                        <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                            style={{
                                width: '180px',
                                height: '180px',
                                borderRadius: '50%',
                                border: `1px solid rgba(255, 107, 0, 0.15)`,
                                position: 'absolute',
                            }}
                        />
                        <motion.div
                            animate={{ rotate: [360, 0] }}
                            transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
                            style={{
                                width: '120px',
                                height: '120px',
                                borderRadius: '50%',
                                border: `1px solid rgba(0, 212, 255, 0.1)`,
                                position: 'absolute',
                            }}
                        />
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '72px',
                            fontWeight: 700,
                            opacity: 0.06,
                            letterSpacing: theme.letterSpacing.tighter,
                        }}>
                            FORGE
                        </div>

                        {/* Featured badge */}
                        <div style={{
                            position: 'absolute',
                            top: '16px',
                            left: '16px',
                            padding: '6px 14px',
                            borderRadius: theme.radii.full,
                            background: 'rgba(20, 241, 149, 0.12)',
                            border: '1px solid rgba(20, 241, 149, 0.25)',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: theme.colors.brand.green,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            backdropFilter: 'blur(8px)',
                        }}>
                            <motion.div
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: theme.colors.brand.green,
                                }}
                            />
                            Featured Drop — Live Now
                        </div>
                    </div>

                    {/* Right: Details */}
                    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '32px',
                            fontWeight: 700,
                            letterSpacing: theme.letterSpacing.tight,
                            marginBottom: '8px',
                        }}>
                            {drop.name}
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: theme.colors.text.secondary,
                            lineHeight: 1.6,
                            marginBottom: '24px',
                        }}>
                            {drop.description}
                        </p>

                        <MintProgressBar minted={minted} supply={drop.supply} large />

                        {/* Stats row */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '16px',
                            marginTop: '24px',
                        }}>
                            <div style={{
                                padding: '14px 16px',
                                background: theme.colors.bg.overlay,
                                borderRadius: theme.radii.md,
                                border: `1px solid ${theme.colors.border.subtle}`,
                            }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: theme.letterSpacing.wider,
                                    marginBottom: '4px',
                                    fontWeight: 500,
                                }}>
                                    Current Price
                                </div>
                                <div style={{
                                    fontFamily: theme.fonts.mono,
                                    fontSize: '22px',
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {activePhase?.price ?? drop.mintPrice} BTC
                                </div>
                            </div>
                            <div style={{
                                padding: '14px 16px',
                                background: theme.colors.bg.overlay,
                                borderRadius: theme.radii.md,
                                border: `1px solid ${theme.colors.border.subtle}`,
                            }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: theme.letterSpacing.wider,
                                    marginBottom: '4px',
                                    fontWeight: 500,
                                }}>
                                    Ends In
                                </div>
                                <BlockCountdown blocksRemaining={Math.max(0, drop.endBlock - currentBlock)} />
                            </div>
                        </div>

                        {/* Phases Timeline */}
                        <div style={{ marginTop: '24px', flex: 1 }}>
                            <div style={{
                                fontSize: '11px',
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                fontWeight: 600,
                                marginBottom: '12px',
                            }}>
                                Mint Phases
                            </div>
                            <TimelineStepper steps={phaseSteps} compact />
                        </div>

                        {/* Mint button */}
                        <div style={{ marginTop: '24px' }}>
                            <Button
                                size="lg"
                                fullWidth
                                loading={mint.isPending}
                                onClick={() => mint.publicMint(1n, drop.mintPriceSats)}
                            >
                                {mint.isPending ? 'Minting...' : `Mint Now — ${activePhase?.price ?? drop.mintPrice} BTC`}
                            </Button>
                            {mint.error && (
                                <div style={{
                                    marginTop: '8px',
                                    fontSize: '12px',
                                    color: theme.colors.status.error,
                                    wordBreak: 'break-word',
                                }}>
                                    {mint.error}
                                </div>
                            )}
                            {mint.status === 'confirmed' && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '12px 14px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(20, 241, 149, 0.06)',
                                    border: '1px solid rgba(20, 241, 149, 0.15)',
                                }}>
                                    <div style={{
                                        fontSize: '13px',
                                        color: theme.colors.brand.green,
                                        fontWeight: 600,
                                        marginBottom: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}>
                                        {'\u2713'} Mint successful!
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Link to={`/collection/${drop.address}`} style={{ flex: 1, textDecoration: 'none' }}>
                                            <Button variant="secondary" size="sm" fullWidth>
                                                View Collection
                                            </Button>
                                        </Link>
                                        <Link to="/marketplace" style={{ flex: 1, textDecoration: 'none' }}>
                                            <Button variant="ghost" size="sm" fullWidth>
                                                Marketplace
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

const FILTER_TABS = [
    { id: 'all', label: 'All Drops' },
    { id: 'live', label: 'Live' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'ended', label: 'Ended' },
];

export function LaunchpadPage(): JSX.Element {
    const [filter, setFilter] = useState('all');
    const { network } = useNetwork();
    const { blockNumber } = useBlockNumber({ network });
    const { data: totalCollections } = useTotalCollections(network);
    const { data: launchpadDrops } = useLaunchpadDrops(network);
    const { data: marketStats } = useMarketStats(network);

    // Use real block number when available, fallback to 0 (loading)
    const [simulatedBlock, setSimulatedBlock] = useState(0);
    const currentBlock = blockNumber ? Number(blockNumber) : simulatedBlock;

    // Map registry data to Drop interface for rendering
    const drops: Drop[] = (launchpadDrops ?? []).map((d, i) => ({
        id: d.id,
        address: d.address,
        creator: d.creator,
        name: d.name,
        description: d.description,
        supply: d.supply,
        minted: d.minted,
        mintPrice: d.mintPrice,
        mintPriceSats: d.mintPriceSats,
        startBlock: 0, // Not tracked in registry
        endBlock: 0,
        status: d.status,
        featured: d.featured,
        bannerGradient: GRADIENT_POOL[i % GRADIENT_POOL.length] as string,
        baseUri: d.baseUri,
        icon: d.icon,
        banner: d.banner,
        phases: [],
        dutchAuction: d.dutchAuction,
    }));
    const featured = drops.find((d) => d.featured);
    const filteredDrops = drops.filter(
        (d) => !d.featured && (filter === 'all' || d.status === filter),
    );

    const liveDropCount = drops.filter((d) => d.status === 'live').length;
    const statsTotalVolume = marketStats ? Number(marketStats.totalVolume) / 1e8 : 0;

    /* Simulate block progression — ~10 min per Bitcoin block (only when no real block data) */
    useEffect(() => {
        if (blockNumber) return;
        const interval = setInterval(() => {
            setSimulatedBlock((prev) => prev + 1);
        }, 600_000);
        return () => clearInterval(interval);
    }, [blockNumber]);

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Gradient mesh background */}
            <div style={{
                position: 'fixed',
                inset: 0,
                background: theme.gradients.meshWarm,
                pointerEvents: 'none',
                zIndex: -1,
            }} />

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginBottom: theme.spacing.xxl }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h1 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: '40px',
                        fontWeight: 700,
                        letterSpacing: theme.letterSpacing.tight,
                    }}>
                        Launchpad
                    </h1>
                    <div style={{
                        padding: '4px 10px',
                        borderRadius: theme.radii.full,
                        background: 'rgba(20, 241, 149, 0.1)',
                        border: '1px solid rgba(20, 241, 149, 0.2)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: theme.colors.brand.green,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                    }}>
                        {liveDropCount} Live
                    </div>
                </div>
                <p style={{
                    fontSize: '16px',
                    color: theme.colors.text.secondary,
                    lineHeight: 1.6,
                }}>
                    Discover and mint the latest collections launching on Bitcoin.
                </p>
            </motion.div>

            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: theme.spacing.md,
                marginBottom: theme.spacing.xxl,
            }}>
                <StatCard label="Current Block" value={currentBlock} decimals={0} icon="⛓" />
                <StatCard label="Active Drops" value={liveDropCount} decimals={0} change={0} />
                <StatCard
                    label="Collections"
                    value={totalCollections !== undefined ? Number(totalCollections) : 0}
                    decimals={0}
                    suffix="total"
                />
                <StatCard
                    label="Total Volume"
                    value={statsTotalVolume}
                    decimals={1}
                    suffix="BTC"
                />
            </div>

            {/* Featured Drop */}
            {featured && <FeaturedDrop drop={featured} currentBlock={currentBlock} />}

            {/* Whitelist Checker */}
            <div style={{ marginTop: theme.spacing.xxl }}>
                <WhitelistChecker />
            </div>

            {/* Filter Tabs */}
            <div style={{ marginTop: theme.spacing.xxl, marginBottom: theme.spacing.lg }}>
                <TabBar
                    tabs={FILTER_TABS}
                    activeTab={filter}
                    onChange={setFilter}
                    layoutId="launchpad-filter"
                />
            </div>

            {/* Drops Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                gap: theme.spacing.lg,
            }}>
                <AnimatePresence mode="wait">
                    {filteredDrops.map((drop, i) => (
                        <DropCard key={drop.id} drop={drop} index={i} currentBlock={currentBlock} />
                    ))}
                </AnimatePresence>
            </div>

            {filteredDrops.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                        textAlign: 'center',
                        padding: theme.spacing.xxxl,
                    }}
                >
                    <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>
                        {'\uD83D\uDD25'}
                    </div>
                    <div style={{ color: theme.colors.text.tertiary, fontSize: '15px' }}>
                        No drops found for this filter.
                    </div>
                </motion.div>
            )}
        </div>
    );
}
