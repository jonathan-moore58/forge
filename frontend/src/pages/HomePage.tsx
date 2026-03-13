import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/common/Button';
import { useNetwork } from '@/hooks/useNetwork';
import { useMarketStats } from '@/hooks/useMarketplace';
import { useAllCollections, useTotalCollections } from '@/hooks/useRegistry';
// useTotalSupply removed — now using indexer data from useAllCollections
import { useCollectionStats } from '@/hooks/useMarketplace';
import { CollectionImage } from '@/components/common/CollectionImage';
import { LiveTicker, RecentActivitySection } from '@/components/common/ActivityFeed';
import { formatBTC } from '@/utils/format';

/**
 * TrendingRow — a single row in the trending table that fetches its own
 * collection stats. This avoids a waterfall by letting each row load independently.
 */
function TrendingRow({ collection, index }: {
    collection: { id: bigint; collectionAddress: string; creator: string; verified: boolean; name: string | null; baseUri: string | null; icon: string | null; totalSupply: number | null };
    index: number;
}) {
    const { network } = useNetwork();
    const { data: stats } = useCollectionStats(network, collection.collectionAddress);
    const displayName = collection.name || `Collection #${collection.id.toString()}`;

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.04 * index }}
        >
            <Link
                to={`/collection/${collection.collectionAddress}`}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 120px 120px 100px 100px',
                    minWidth: '600px',
                    padding: '16px 20px',
                    background: theme.colors.bg.raised,
                    alignItems: 'center',
                    borderTop: `1px solid ${theme.colors.border.subtle}`,
                    transition: `background ${theme.transitions.fast}`,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.bg.overlay; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.bg.raised; }}
            >
                <span style={{
                    fontSize: '14px',
                    color: theme.colors.text.tertiary,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {index + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: theme.radii.md,
                        overflow: 'hidden',
                        flexShrink: 0,
                    }}>
                        <CollectionImage
                            uri={collection.icon}
                            baseUri={collection.baseUri}
                            index={index}
                            aspectRatio="1"
                            style={{ width: '40px', height: '40px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '15px' }}>
                            {displayName}
                        </span>
                        {collection.verified && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={theme.colors.brand.cyan} style={{ flexShrink: 0 }}>
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                            </svg>
                        )}
                    </div>
                </div>
                <span style={{
                    textAlign: 'right',
                    fontWeight: 500,
                    fontFamily: theme.fonts.mono,
                    fontSize: '13px',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {stats ? formatBTC(stats.floorPrice) : '—'} BTC
                </span>
                <span style={{
                    textAlign: 'right',
                    fontWeight: 500,
                    fontFamily: theme.fonts.mono,
                    fontSize: '13px',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {stats ? formatBTC(stats.volume) : '—'} BTC
                </span>
                <span style={{
                    textAlign: 'right',
                    fontWeight: 600,
                    fontFamily: theme.fonts.mono,
                    fontSize: '13px',
                    fontVariantNumeric: 'tabular-nums',
                    color: theme.colors.text.secondary,
                }}>
                    {stats ? `${stats.salesCount.toString()}` : '—'}
                </span>
                <span style={{
                    textAlign: 'right',
                    color: theme.colors.text.secondary,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '13px',
                }}>
                    {collection.totalSupply != null ? collection.totalSupply.toLocaleString() : '—'}
                </span>
            </Link>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Hero — Rotating Word + Central Orbit Visual                        */
/* ------------------------------------------------------------------ */

const HERO_WORDS = [
    { text: 'Marketplace', color: theme.colors.brand.orange, glow: 'rgba(255, 107, 0, 0.15)' },
    { text: 'Launchpad', color: theme.colors.brand.purple, glow: 'rgba(153, 69, 255, 0.15)' },
    { text: 'Auction House', color: theme.colors.brand.cyan, glow: 'rgba(0, 212, 255, 0.15)' },
    { text: 'Lending Protocol', color: theme.colors.brand.green, glow: 'rgba(20, 241, 149, 0.15)' },
    { text: 'Staking Platform', color: theme.colors.brand.gold, glow: 'rgba(245, 158, 11, 0.15)' },
] as const;


const EASE = [0.22, 1, 0.36, 1] as const;

function HeroSection({ totalVolume, numCollections, totalSales, particlesReady }: {
    totalVolume: number; numCollections: number; totalSales: number; particlesReady: boolean;
}): JSX.Element {
    const [wordIndex, setWordIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % HERO_WORDS.length);
        }, 2800);
        return () => clearInterval(interval);
    }, []);

    const currentWord = HERO_WORDS[wordIndex] ?? HERO_WORDS[0];

    return (
        <section style={{
            position: 'relative',
            overflow: 'hidden',
            minHeight: '600px',
        }}>
            {/* ── Background: Grid perspective ── */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                background: [
                    'radial-gradient(ellipse at 50% 0%, rgba(255, 107, 0, 0.06) 0%, transparent 50%)',
                    'radial-gradient(ellipse at 20% 80%, rgba(153, 69, 255, 0.04) 0%, transparent 50%)',
                    'radial-gradient(ellipse at 80% 80%, rgba(0, 212, 255, 0.03) 0%, transparent 50%)',
                ].join(', '),
            }}>
                {/* Perspective grid lines */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
                    background: `
                        linear-gradient(90deg, rgba(255, 107, 0, 0.03) 1px, transparent 1px),
                        linear-gradient(0deg, rgba(255, 107, 0, 0.03) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 40px',
                    maskImage: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)',
                    transform: 'perspective(500px) rotateX(45deg)',
                    transformOrigin: 'bottom',
                }} />
                {/* Ambient particles */}
                {particlesReady && <Particles
                    id="hero-particles"
                    options={{
                        fullScreen: false,
                        fpsLimit: 60,
                        particles: {
                            number: { value: 50, density: { enable: true } },
                            color: { value: ['#ff6b00', '#ff8c3a', '#9945ff', '#00D4FF'] },
                            opacity: { value: { min: 0.02, max: 0.08 } },
                            size: { value: { min: 1, max: 3 } },
                            move: { enable: true, speed: 0.4, direction: 'top' as const, random: true, outModes: { default: 'out' as const } },
                            links: { enable: false },
                        },
                        detectRetina: true,
                    }}
                    style={{ position: 'absolute', inset: 0 }}
                />}
            </div>

            {/* ── Central FORGE watermark ── */}
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '48%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontFamily: theme.fonts.heading,
                    fontSize: 'clamp(200px, 24vw, 420px)',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    lineHeight: 0.85,
                    whiteSpace: 'nowrap',
                    zIndex: 0,
                    color: 'transparent',
                    WebkitTextStroke: '1px rgba(255, 107, 0, 0.04)',
                }}
            >
                FORGE
            </div>

            {/* ── Main Content — Centered ── */}
            <div style={{
                position: 'relative',
                zIndex: 2,
                maxWidth: '1000px',
                margin: '0 auto',
                padding: '72px 48px 0',
                textAlign: 'center',
            }}>
                {/* Eyebrow */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '28px',
                        padding: '6px 16px',
                        borderRadius: theme.radii.full,
                        background: 'rgba(255, 107, 0, 0.06)',
                        border: '1px solid rgba(255, 107, 0, 0.12)',
                    }}
                >
                    <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: theme.colors.brand.orange,
                        boxShadow: '0 0 10px rgba(255, 107, 0, 0.6)',
                        animation: 'live-pulse 2s ease-in-out infinite',
                    }} />
                    <span style={{
                        fontSize: '11px', fontWeight: 700, fontFamily: theme.fonts.mono,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: theme.colors.brand.orangeLight,
                    }}>
                        Live on Bitcoin L1
                    </span>
                    <span style={{
                        padding: '2px 8px', borderRadius: '4px',
                        background: 'rgba(255, 107, 0, 0.12)',
                        fontSize: '9px', fontWeight: 800, fontFamily: theme.fonts.mono,
                        letterSpacing: '0.08em', color: theme.colors.brand.orange,
                    }}>
                        OPNet
                    </span>
                </motion.div>

                {/* ── Headline with rotating word ── */}
                <div style={{ marginBottom: '12px' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
                        style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: 'clamp(18px, 2.5vw, 24px)',
                            fontWeight: 600,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            color: theme.colors.text.tertiary,
                            marginBottom: '8px',
                        }}
                    >
                        The First Bitcoin NFT
                    </motion.div>
                    <div style={{
                        height: 'clamp(56px, 8vw, 90px)',
                        overflow: 'hidden',
                        position: 'relative',
                    }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={wordIndex}
                                initial={{ y: 50, opacity: 0, filter: 'blur(8px)' }}
                                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                exit={{ y: -50, opacity: 0, filter: 'blur(8px)' }}
                                transition={{ duration: 0.5, ease: EASE }}
                                style={{
                                    fontFamily: theme.fonts.heading,
                                    fontSize: 'clamp(48px, 7vw, 86px)',
                                    fontWeight: 900,
                                    letterSpacing: '-0.04em',
                                    lineHeight: 1,
                                    background: `linear-gradient(135deg, ${currentWord.color} 0%, ${currentWord.color}aa 100%)`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    textShadow: `0 0 60px ${currentWord.glow}`,
                                    position: 'absolute',
                                    width: '100%',
                                }}
                            >
                                {currentWord.text}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* Description */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
                    style={{
                        fontSize: '17px',
                        lineHeight: 1.7,
                        color: theme.colors.text.secondary,
                        maxWidth: '520px',
                        margin: '16px auto 0',
                    }}
                >
                    Mint, trade, auction, lend, and stake NFTs — all on{' '}
                    <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>Bitcoin L1</span>.
                    No bridges. No wrapping. Pure on-chain.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '14px',
                        marginTop: '32px',
                    }}
                >
                    <Link to="/launchpad">
                        <Button size="lg" style={{
                            padding: '14px 36px', fontSize: '14px', fontWeight: 700,
                            boxShadow: '0 0 32px rgba(255, 107, 0, 0.25), 0 4px 20px rgba(0, 0, 0, 0.4)',
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Explore
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </span>
                        </Button>
                    </Link>
                    <Link to="/create">
                        <Button variant="secondary" size="lg" style={{
                            padding: '14px 36px', fontSize: '14px', fontWeight: 600,
                        }}>
                            Launch Collection
                        </Button>
                    </Link>
                </motion.div>

                {/* ── Live Activity Ticker ── */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.65, ease: EASE }}
                    style={{ marginTop: '28px', display: 'flex', justifyContent: 'center' }}
                >
                    <LiveTicker />
                </motion.div>

                {/* ── Product Showcase Bento Grid ── */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
                    style={{
                        marginTop: '32px',
                        maxWidth: '900px',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                    }}
                >
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '10px',
                    }}>
                        {[
                            { icon: '💎', label: 'Marketplace', desc: 'Trade NFTs peer-to-peer', color: theme.colors.brand.orange, link: '/marketplace' },
                            { icon: '⚡', label: 'Auctions', desc: 'English & Dutch auctions', color: theme.colors.brand.cyan, link: '/auction' },
                            { icon: '🚀', label: 'Launchpad', desc: 'Mint new collections', color: theme.colors.brand.purple, link: '/launchpad' },
                            { icon: '🔒', label: 'Lending', desc: 'Borrow against NFTs', color: theme.colors.brand.green, link: '/lending' },
                            { icon: '🏆', label: 'Staking', desc: 'Earn yield on holdings', color: theme.colors.brand.gold, link: '/staking' },
                            { icon: '🔥', label: 'Factory', desc: 'Deploy in minutes', color: theme.colors.brand.orangeLight, link: '/create' },
                        ].map((item, i) => (
                            <Link key={item.label} to={item.link} style={{ textDecoration: 'none' }}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.8 + i * 0.08, ease: EASE }}
                                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                                    style={{
                                        padding: '18px 20px',
                                        borderRadius: '14px',
                                        background: 'rgba(18, 18, 26, 0.8)',
                                        backdropFilter: 'blur(20px)',
                                        border: `1px solid ${theme.colors.border.subtle}`,
                                        borderLeft: `3px solid ${item.color}40`,
                                        cursor: 'pointer',
                                        transition: `border-color 200ms ease, box-shadow 200ms ease`,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '14px',
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = `${item.color}30`;
                                        (e.currentTarget as HTMLElement).style.borderLeftColor = item.color;
                                        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${item.color}10`;
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = theme.colors.border.subtle;
                                        (e.currentTarget as HTMLElement).style.borderLeftColor = `${item.color}40`;
                                        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                                    }}
                                >
                                    {/* Corner glow */}
                                    <div style={{
                                        position: 'absolute', top: '-20px', right: '-20px',
                                        width: '80px', height: '80px', borderRadius: '50%',
                                        background: `radial-gradient(circle, ${item.color}10 0%, transparent 70%)`,
                                        pointerEvents: 'none',
                                    }} />
                                    {/* Icon */}
                                    <div style={{
                                        width: '40px', height: '40px',
                                        borderRadius: '10px',
                                        background: `${item.color}10`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '20px', flexShrink: 0,
                                    }}>{item.icon}</div>
                                    {/* Text */}
                                    <div>
                                        <div style={{
                                            fontSize: '14px', fontWeight: 700, color: theme.colors.text.primary,
                                            fontFamily: theme.fonts.heading, letterSpacing: '-0.02em',
                                            marginBottom: '2px',
                                        }}>{item.label}</div>
                                        <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, lineHeight: 1.4 }}>{item.desc}</div>
                                    </div>
                                </motion.div>
                            </Link>
                        ))}
                    </div>

                    {/* Live stats strip below the grid */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.4 }}
                        style={{
                            marginTop: '16px',
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '32px',
                            padding: '14px 0',
                        }}
                    >
                        {[
                            { label: 'Volume', value: `${totalVolume.toFixed(1)} BTC`, color: theme.colors.brand.orange },
                            { label: 'Collections', value: numCollections.toString(), color: theme.colors.brand.purple },
                            { label: 'Sales', value: totalSales.toString(), color: theme.colors.brand.cyan },
                        ].map((stat) => (
                            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '5px', height: '5px', borderRadius: '50%',
                                    background: stat.color,
                                    boxShadow: `0 0 8px ${stat.color}60`,
                                }} />
                                <span style={{
                                    fontSize: '11px', fontFamily: theme.fonts.mono, fontWeight: 600,
                                    color: theme.colors.text.tertiary, textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}>{stat.label}</span>
                                <span style={{
                                    fontSize: '13px', fontFamily: theme.fonts.mono, fontWeight: 800,
                                    color: theme.colors.text.primary,
                                }}>{stat.value}</span>
                            </div>
                        ))}
                    </motion.div>
                </motion.div>
            </div>

            {/* ── Scrolling Marquee Strip ── */}
            <div style={{
                borderTop: `1px solid ${theme.colors.border.subtle}`,
                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                padding: '14px 0',
                overflow: 'hidden',
                position: 'relative',
                zIndex: 4,
                marginTop: 'auto',
            }}>
                <motion.div
                    animate={{ x: ['0%', '-50%'] }}
                    transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
                    style={{
                        display: 'flex', gap: '48px', whiteSpace: 'nowrap', width: 'max-content',
                    }}
                >
                    {[...Array(2)].map((_, setIdx) => (
                        <div key={setIdx} style={{ display: 'flex', gap: '48px', alignItems: 'center' }}>
                            {['LAUNCHPAD', 'MARKETPLACE', 'AUCTIONS', 'STAKING', 'LENDING', 'ON-CHAIN', 'BITCOIN L1', 'NON-CUSTODIAL'].map((text, i) => (
                                <span key={`${setIdx}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span style={{
                                        fontSize: '13px', fontWeight: 600, fontFamily: theme.fonts.mono,
                                        letterSpacing: '0.1em',
                                        color: i % 3 === 0 ? theme.colors.brand.orange : theme.colors.text.tertiary,
                                    }}>
                                        {text}
                                    </span>
                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: theme.colors.border.strong }} />
                                </span>
                            ))}
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Keyframes */}
            <style>{`
                @keyframes live-pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.85); }
                }
            `}</style>
        </section>
    );
}

/* ------------------------------------------------------------------ */
/*  Fallback sparkline data (used before indexer provides history)     */
/* ------------------------------------------------------------------ */

/** Varied sparkline shapes — shown before indexer provides real history */
const SPARKLINE_VOLUME = [2, 5, 3, 8, 6, 12, 9, 14, 11, 18, 15, 22];
const SPARKLINE_SALES = [1, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 14];
const SPARKLINE_COLLECTIONS = [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8];
const SPARKLINE_FEES = [0.5, 1, 0.8, 2, 1.5, 3, 2.2, 4, 3, 5, 4.5, 6];

/* ------------------------------------------------------------------ */
/*  HomePage                                                           */
/* ------------------------------------------------------------------ */

export function HomePage(): JSX.Element {
    const [particlesReady, setParticlesReady] = useState(false);
    const { network } = useNetwork();

    // Real data hooks
    const { data: marketStats } = useMarketStats(network);
    const { data: totalCollections } = useTotalCollections(network);
    const { data: allCollections } = useAllCollections(network);

    // Top 5 collections for trending table (sorted by ID for now — will sort by volume with indexer)
    const trendingCollections = useMemo(() => {
        if (!allCollections) return [];
        return allCollections.slice(0, 5);
    }, [allCollections]);

    useEffect(() => {
        initParticlesEngine(async (engine) => {
            await loadSlim(engine);
        }).then(() => setParticlesReady(true));
    }, []);

    // Derive stats from real data (fallback to 0)
    const totalVolume = marketStats ? Number(marketStats.totalVolume) / 1e8 : 0;
    const totalSales = marketStats ? Number(marketStats.totalSales) : 0;
    const numCollections = totalCollections ? Number(totalCollections) : 0;

    return (
        <div>
            {/* ═══ Hero Section — Centered Dramatic Layout ═══ */}
            <HeroSection
                totalVolume={totalVolume}
                numCollections={numCollections}
                totalSales={totalSales}
                particlesReady={particlesReady}
            />

            {/* ═══ Stats Bar ═══ */}
            <section style={{
                maxWidth: '1440px',
                margin: '0 auto',
                padding: '32px 24px 64px',
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                }}>
                    <StatCard label="Total Volume" value={totalVolume} decimals={1} suffix="BTC" sparklineData={SPARKLINE_VOLUME} />
                    <StatCard label="Total Sales" value={totalSales} decimals={0} sparklineData={SPARKLINE_SALES} />
                    <StatCard label="Collections" value={numCollections} decimals={0} sparklineData={SPARKLINE_COLLECTIONS} />
                    <StatCard label="Total Fees" value={marketStats ? Number(marketStats.totalFees) / 1e8 : 0} decimals={4} suffix="BTC" sparklineData={SPARKLINE_FEES} />
                </div>
            </section>

            {/* ═══ Trending Collections ═══ */}
            <section style={{
                maxWidth: '1440px',
                margin: '0 auto',
                padding: '0 24px 80px',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                }}>
                    <h2 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: theme.fontSize['2xl'],
                        fontWeight: 700,
                        letterSpacing: theme.letterSpacing.tight,
                    }}>
                        Trending Collections
                    </h2>
                    <Link to="/marketplace" style={{
                        fontSize: '14px',
                        color: theme.colors.brand.orange,
                        fontWeight: 500,
                        transition: `opacity ${theme.transitions.fast}`,
                    }}>
                        View All →
                    </Link>
                </div>

                <div style={{
                    borderRadius: theme.radii.lg,
                    overflowX: 'auto',
                    border: `1px solid ${theme.colors.border.subtle}`,
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 120px 120px 100px 100px',
                        minWidth: '600px',
                        padding: '12px 20px',
                        background: theme.colors.bg.overlay,
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.colors.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: theme.letterSpacing.wider,
                    }}>
                        <span>#</span>
                        <span>Collection</span>
                        <span style={{ textAlign: 'right' }}>Floor</span>
                        <span style={{ textAlign: 'right' }}>Volume</span>
                        <span style={{ textAlign: 'right' }}>Sales</span>
                        <span style={{ textAlign: 'right' }}>Supply</span>
                    </div>

                    {/* Rows */}
                    {trendingCollections.length > 0 ? (
                        trendingCollections.map((collection, i) => (
                            <TrendingRow
                                key={collection.id.toString()}
                                collection={collection}
                                index={i}
                            />
                        ))
                    ) : (
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: theme.colors.text.tertiary,
                            fontSize: theme.fontSize.sm,
                        }}>
                            {allCollections === undefined ? 'Loading collections...' : 'No collections yet. Be the first to launch!'}
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Recent Activity ═══ */}
            <RecentActivitySection />

            {/* ═══ Upcoming Drops ═══ */}
            <section style={{
                maxWidth: '1440px',
                margin: '0 auto',
                padding: '0 24px 100px',
            }}>
                <h2 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: theme.fontSize['2xl'],
                    fontWeight: 700,
                    letterSpacing: theme.letterSpacing.tight,
                    marginBottom: '32px',
                }}>
                    Upcoming Drops
                </h2>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px',
                }}>
                    {/*
                     * TODO: Replace with real upcoming drops from factory.
                     * Will iterate collections with future phase start blocks.
                     * For now, show a CTA to launch.
                     */}
                    <GlassCard hover glow="orange">
                        <div style={{
                            height: '200px',
                            background: `linear-gradient(135deg, ${theme.colors.brand.orange}18 0%, ${theme.colors.bg.overlay} 100%)`,
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <div style={{
                                position: 'absolute',
                                top: '20%',
                                left: '30%',
                                width: '200px',
                                height: '200px',
                                borderRadius: '50%',
                                background: `radial-gradient(circle, ${theme.colors.brand.orange}15 0%, transparent 70%)`,
                                filter: 'blur(40px)',
                            }} />
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.orange} strokeWidth="1.5" style={{ position: 'relative', zIndex: 1, opacity: 0.6 }}>
                                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: '12px',
                            }}>
                                <div>
                                    <h3 style={{
                                        fontFamily: theme.fonts.heading,
                                        fontSize: theme.fontSize.lg,
                                        fontWeight: 600,
                                        letterSpacing: theme.letterSpacing.snug,
                                    }}>Launch Your Collection</h3>
                                    <p style={{
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.tertiary,
                                        marginTop: '4px',
                                    }}>
                                        Deploy your NFT collection on Bitcoin
                                    </p>
                                </div>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingTop: '12px',
                                borderTop: `1px solid ${theme.colors.border.subtle}`,
                            }}>
                                <div>
                                    <div style={{
                                        fontSize: '10px',
                                        color: theme.colors.text.tertiary,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        fontWeight: 500,
                                    }}>
                                        Create in minutes
                                    </div>
                                </div>
                                <Link to="/create">
                                    <Button size="sm" variant="primary">
                                        Get Started
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </section>
        </div>
    );
}
