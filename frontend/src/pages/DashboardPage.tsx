import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { StatCard } from '@/components/common/StatCard';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useNetwork } from '@/hooks/useNetwork';
import { useMarketStats } from '@/hooks/useMarketplace';
import { useTotalCollections } from '@/hooks/useRegistry';
import { useUserPortfolio } from '@/hooks/useUserPortfolio';
import { useUserOffers } from '@/hooks/useUserOffers';
import { useCollectionRegistry } from '@/hooks/useForgeData';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PortfolioDataPoint {
    readonly date: string;
    readonly value: number;
}

interface HoldingItem {
    readonly collection: string;
    readonly collectionSlug: string;
    readonly count: number;
    readonly avgCost: number;
    readonly floorPrice: number;
    readonly totalValue: number;
    readonly pnl: number;
    readonly pnlPercent: number;
}

interface BestOffer {
    readonly nftName: string;
    readonly collection: string;
    readonly offer: number;
    readonly floor: number;
    readonly aboveFloor: number;
    readonly from: string;
    readonly expiry: string;
}

interface SweepCollection {
    readonly name: string;
    readonly slug: string;
    readonly floor: number;
    readonly listed: number;
    readonly volume24h: number;
}

interface BulkItem {
    readonly id: string;
    readonly name: string;
    readonly collection: string;
    readonly price: number;
    readonly isListed: boolean;
    readonly selected: boolean;
}

type DashTab = 'overview' | 'sweep' | 'bulk';
type TimeRange = '1W' | '1M' | '3M' | 'ALL';

/* ------------------------------------------------------------------ */
/*  Chart Data — empty until indexer is available                       */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

interface TooltipPayloadEntry {
    readonly value: number;
    readonly dataKey: string;
}

interface CustomTooltipProps {
    readonly active?: boolean;
    readonly payload?: readonly TooltipPayloadEntry[];
    readonly label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps): JSX.Element | null {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0];
    if (!entry) return null;

    return (
        <div style={{
            padding: '10px 14px',
            background: theme.colors.bg.raised,
            border: `1px solid ${theme.colors.border.subtle}`,
            borderRadius: theme.radii.md,
            boxShadow: theme.shadows.md,
            fontSize: '12px',
        }}>
            <div style={{ color: theme.colors.text.tertiary, marginBottom: '2px' }}>{label}</div>
            <div style={{
                fontFamily: theme.fonts.mono,
                fontWeight: 700,
                color: theme.colors.brand.orange,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {entry.value.toFixed(2)} BTC
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Segmented Control (iOS-style tab pills)                            */
/* ------------------------------------------------------------------ */

function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    layoutId,
}: {
    options: { id: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    layoutId: string;
}) {
    return (
        <div style={{
            display: 'inline-flex',
            padding: '3px',
            background: theme.colors.bg.interactive,
            borderRadius: theme.radii.md,
            border: `1px solid ${theme.colors.border.subtle}`,
        }}>
            {options.map((opt) => {
                const isActive = opt.id === value;
                return (
                    <button
                        key={opt.id}
                        onClick={() => onChange(opt.id)}
                        style={{
                            position: 'relative',
                            padding: '8px 20px',
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? theme.colors.text.primary : theme.colors.text.tertiary,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            zIndex: 1,
                            transition: `color ${theme.transitions.fast}`,
                            borderRadius: theme.radii.sm,
                        }}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: theme.colors.bg.overlay,
                                    borderRadius: theme.radii.sm,
                                    border: `1px solid ${theme.colors.border.default}`,
                                    boxShadow: theme.shadows.sm,
                                    zIndex: -1,
                                }}
                            />
                        )}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/* Time range pill selector */
function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
    const ranges: TimeRange[] = ['1W', '1M', '3M', 'ALL'];
    return (
        <div style={{ display: 'flex', gap: '4px' }}>
            {ranges.map((r) => (
                <button
                    key={r}
                    onClick={() => onChange(r)}
                    style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: value === r ? 600 : 400,
                        color: value === r ? theme.colors.text.primary : theme.colors.text.tertiary,
                        background: value === r ? theme.colors.bg.interactive : 'transparent',
                        border: `1px solid ${value === r ? theme.colors.border.default : 'transparent'}`,
                        borderRadius: theme.radii.sm,
                        cursor: 'pointer',
                        transition: `all ${theme.transitions.fast}`,
                    }}
                >
                    {r}
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

const DASH_TABS = [
    { id: 'overview' as DashTab, label: 'Overview' },
    { id: 'sweep' as DashTab, label: 'Sweep Floor' },
    { id: 'bulk' as DashTab, label: 'Bulk List / Delist' },
];

export function DashboardPage(): JSX.Element {
    const [activeTab, setActiveTab] = useState<DashTab>('overview');
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [sweepCount, setSweepCount] = useState<Record<string, number>>({});
    const [bulkItems, setBulkItems] = useState<readonly BulkItem[]>([]);

    /* ── Real blockchain hooks ── */
    const { network } = useNetwork();
    const { walletAddress: rawAddr } = useWalletConnect();
    const walletAddress = rawAddr ? (typeof rawAddr === 'string' ? rawAddr : String(rawAddr)) : undefined;
    const { data: marketStats } = useMarketStats(network);
    const { data: totalCollections } = useTotalCollections(network);

    // User on-chain data
    const portfolio = useUserPortfolio(network, walletAddress);
    const userOffers = useUserOffers(network, walletAddress);
    const { items: registryCollections } = useCollectionRegistry(network);

    // Marketplace-level stats
    const mktTotalListings = marketStats ? Number(marketStats.totalListings) : undefined;
    const mktTotalVolume = marketStats ? Number(marketStats.totalVolume) / 1e8 : undefined;
    const mktTotalSales = marketStats ? Number(marketStats.totalSales) : undefined;
    const registeredCollections = totalCollections !== undefined ? Number(totalCollections) : undefined;

    // Convert portfolio to HoldingItem shape
    const holdings: HoldingItem[] = useMemo(() => {
        return portfolio.holdings.map((h) => ({
            collection: `${h.collectionAddress.slice(0, 6)}...${h.collectionAddress.slice(-4)}`,
            collectionSlug: h.collectionAddress,
            count: h.count,
            avgCost: 0, // Requires tx history indexer
            floorPrice: Number(h.floorPrice) / 1e8,
            totalValue: Number(h.totalValue) / 1e8,
            pnl: 0, // Requires tx history indexer
            pnlPercent: 0,
        }));
    }, [portfolio.holdings]);

    // Convert received offers to BestOffer shape (above-floor offers)
    const bestOffers: BestOffer[] = useMemo(() => {
        return userOffers.received.map((o) => {
            const offerBtc = Number(o.price) / 1e8;
            return {
                nftName: `#${o.tokenId.toString()}`,
                collection: `${String(o.collection).slice(0, 6)}...${String(o.collection).slice(-4)}`,
                offer: offerBtc,
                floor: 0,
                aboveFloor: 0,
                from: `${String(o.offerer).slice(0, 6)}...${String(o.offerer).slice(-4)}`,
                expiry: `${Number(o.expiryBlock)} blk`,
            };
        });
    }, [userOffers.received]);

    // Convert registry collections to SweepCollection shape
    const sweepCollections: SweepCollection[] = useMemo(() => {
        return registryCollections.map((col) => ({
            name: `${col.collectionAddress.slice(0, 6)}...${col.collectionAddress.slice(-4)}`,
            slug: col.collectionAddress,
            floor: 0, // Floor from marketplace stats (loaded separately)
            listed: 0,
            volume24h: 0,
        }));
    }, [registryCollections]);

    const totalPnl = 0; // P&L requires historical data (indexer)
    const totalPortfolio = Number(portfolio.totalValueSats) / 1e8;

    // Chart data requires a historical indexer — show empty until available
    const chartData: readonly PortfolioDataPoint[] = useMemo(
        () => totalPortfolio > 0 ? [{ date: 'Now', value: totalPortfolio }] : [],
        [totalPortfolio],
    );

    const chartChange = useMemo(() => {
        if (chartData.length < 2) return 0;
        const first = chartData[0]?.value ?? 0;
        const last = chartData[chartData.length - 1]?.value ?? 0;
        return first > 0 ? ((last - first) / first) * 100 : 0;
    }, [chartData]);

    const toggleBulkItem = (id: string) => {
        setBulkItems((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, selected: !item.selected } : item,
            ),
        );
    };

    const selectedBulkItems = bulkItems.filter((i) => i.selected);

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Background */}
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
                <h1 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: '40px',
                    fontWeight: 700,
                    letterSpacing: theme.letterSpacing.tight,
                    marginBottom: '6px',
                }}>
                    Dashboard
                </h1>
                <p style={{ fontSize: '15px', color: theme.colors.text.secondary }}>
                    Track your portfolio, manage listings, and find opportunities.
                    {registeredCollections !== undefined && (
                        <span style={{ marginLeft: '8px', color: theme.colors.text.tertiary }}>
                            {registeredCollections} collection{registeredCollections !== 1 ? 's' : ''} registered
                            {mktTotalVolume !== undefined ? ` · ${mktTotalVolume.toFixed(2)} BTC total volume` : ''}
                        </span>
                    )}
                </p>
            </motion.div>

            {/* Top Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: theme.spacing.md,
                marginBottom: theme.spacing.xxl,
            }}>
                {/* Portfolio value */}
                <div style={{
                    padding: '24px',
                    background: theme.colors.bg.card,
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${theme.colors.border.subtle}`,
                    borderRadius: theme.radii.lg,
                    boxShadow: theme.shadows.glow.orange,
                }}>
                    <div style={{
                        fontSize: '10px',
                        color: theme.colors.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: theme.letterSpacing.wider,
                        marginBottom: '8px',
                        fontWeight: 600,
                    }}>
                        Portfolio Value
                    </div>
                    <div style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: '32px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '6px',
                    }}>
                        <CountUp end={totalPortfolio} decimals={2} duration={1.8} enableScrollSpy scrollSpyOnce />
                        <span style={{ fontSize: '14px', color: theme.colors.text.secondary, fontWeight: 500 }}>BTC</span>
                    </div>
                </div>

                <StatCard
                    label="Total P&L"
                    value={totalPnl}
                    decimals={2}
                    prefix={totalPnl >= 0 ? '+' : ''}
                    suffix="BTC"
                    change={totalPortfolio - totalPnl !== 0 ? (totalPnl / (totalPortfolio - totalPnl)) * 100 : 0}
                />
                <StatCard label="NFTs Held" value={portfolio.holdings.reduce((acc, h) => acc + h.count, 0)} decimals={0} />
                <StatCard label="Active Listings" value={mktTotalListings ?? 0} decimals={0} />
                <StatCard label="Total Sales" value={mktTotalSales ?? 0} decimals={0} />
            </div>

            {/* Portfolio Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                style={{ marginBottom: theme.spacing.xxl }}
            >
                <GlassCard style={{ padding: '24px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                    }}>
                        <div>
                            <div style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: '16px',
                                fontWeight: 700,
                                marginBottom: '4px',
                            }}>
                                Portfolio Value Over Time
                            </div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: chartChange >= 0 ? theme.colors.brand.green : theme.colors.status.error,
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {chartChange >= 0 ? '+' : ''}{chartChange.toFixed(1)}% this period
                            </div>
                        </div>
                        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                    </div>
                    <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[...chartData]}>
                                <defs>
                                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={theme.colors.brand.orange} stopOpacity={0.2} />
                                        <stop offset="100%" stopColor={theme.colors.brand.orange} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: theme.colors.text.tertiary, fontSize: 11 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: theme.colors.text.tertiary, fontSize: 11 }}
                                    domain={['auto', 'auto']}
                                    tickFormatter={(v: number) => `${v.toFixed(1)}`}
                                    width={40}
                                />
                                <Tooltip content={<ChartTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={theme.colors.brand.orange}
                                    strokeWidth={2}
                                    fill="url(#portfolioGrad)"
                                    animationDuration={800}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Tabs — Segmented Control */}
            <div style={{ marginBottom: theme.spacing.xl }}>
                <SegmentedControl
                    options={DASH_TABS}
                    value={activeTab}
                    onChange={setActiveTab}
                    layoutId="dash-segment"
                />
            </div>

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    {/* Holdings P&L Table */}
                    <div style={{ marginBottom: theme.spacing.xxl }}>
                        <h3 style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '18px',
                            fontWeight: 700,
                            marginBottom: theme.spacing.md,
                        }}>
                            Holdings P&L
                        </h3>

                        <div style={{
                            background: theme.colors.bg.card,
                            borderRadius: theme.radii.lg,
                            border: `1px solid ${theme.colors.border.subtle}`,
                            overflowX: 'auto',
                        }}>
                            {/* Header */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 60px 80px 80px 80px 80px 80px', minWidth: '600px',
                                padding: '10px 16px',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                            }}>
                                <span>Collection</span>
                                <span style={{ textAlign: 'right' }}>Held</span>
                                <span style={{ textAlign: 'right' }}>Avg Cost</span>
                                <span style={{ textAlign: 'right' }}>Floor</span>
                                <span style={{ textAlign: 'right' }}>Value</span>
                                <span style={{ textAlign: 'right' }}>P&L</span>
                                <span style={{ textAlign: 'right' }}>%</span>
                            </div>

                            {holdings.map((h, i) => (
                                <motion.div
                                    key={h.collection}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Link to={`/collection/${h.collectionSlug}`} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 60px 80px 80px 80px 80px 80px', minWidth: '600px',
                                        padding: '14px 16px',
                                        fontSize: '13px',
                                        alignItems: 'center',
                                        borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                        textDecoration: 'none',
                                        color: 'inherit',
                                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                        transition: `background ${theme.transitions.fast}`,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: theme.radii.sm,
                                                background: theme.gradients.orangeToPurple,
                                                opacity: 0.7,
                                                flexShrink: 0,
                                            }} />
                                            <span style={{ fontWeight: 600 }}>{h.collection}</span>
                                        </div>
                                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{h.count}</span>
                                        <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                            {h.avgCost}
                                        </span>
                                        <span style={{ textAlign: 'right', fontFamily: theme.fonts.mono, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                            {h.floorPrice}
                                        </span>
                                        <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {h.totalValue.toFixed(2)}
                                        </span>
                                        <span style={{
                                            textAlign: 'right',
                                            fontWeight: 700,
                                            fontFamily: theme.fonts.mono,
                                            fontVariantNumeric: 'tabular-nums',
                                            color: h.pnl >= 0 ? theme.colors.brand.green : theme.colors.status.error,
                                            padding: '2px 6px',
                                            borderRadius: theme.radii.xs,
                                            background: h.pnl >= 0 ? 'rgba(20, 241, 149, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                                        }}>
                                            {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}
                                        </span>
                                        <span style={{
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            fontVariantNumeric: 'tabular-nums',
                                            color: h.pnlPercent >= 0 ? theme.colors.brand.green : theme.colors.status.error,
                                        }}>
                                            {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(1)}%
                                        </span>
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Best Offers */}
                    <div>
                        <h3 style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '18px',
                            fontWeight: 700,
                            marginBottom: theme.spacing.md,
                        }}>
                            Best Offers Received
                        </h3>

                        <div style={{
                            background: theme.colors.bg.card,
                            borderRadius: theme.radii.lg,
                            border: `1px solid ${theme.colors.border.subtle}`,
                            overflowX: 'auto',
                        }}>
                            {/* Header */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 80px 80px 80px 80px 140px', minWidth: '560px',
                                padding: '10px 16px',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                            }}>
                                <span>NFT</span>
                                <span style={{ textAlign: 'right' }}>Offer</span>
                                <span style={{ textAlign: 'right' }}>Floor</span>
                                <span style={{ textAlign: 'right' }}>vs Floor</span>
                                <span style={{ textAlign: 'right' }}>Expiry</span>
                                <span />
                            </div>

                            {bestOffers.map((offer, i) => (
                                <motion.div
                                    key={`${offer.nftName}-${i}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 80px 80px 80px 80px 140px', minWidth: '560px',
                                        padding: '14px 16px',
                                        fontSize: '13px',
                                        alignItems: 'center',
                                        borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{offer.nftName}</div>
                                        <div style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>{offer.collection}</div>
                                    </div>
                                    <span style={{
                                        fontWeight: 700,
                                        textAlign: 'right',
                                        fontFamily: theme.fonts.mono,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {offer.offer}
                                    </span>
                                    <span style={{ textAlign: 'right', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                        {offer.floor}
                                    </span>
                                    <span style={{
                                        textAlign: 'right',
                                        fontWeight: 700,
                                        fontSize: '12px',
                                        color: theme.colors.brand.green,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        +{offer.aboveFloor.toFixed(1)}%
                                    </span>
                                    <span style={{ textAlign: 'right', color: theme.colors.text.tertiary, fontSize: '12px', fontFamily: theme.fonts.mono }}>
                                        {offer.expiry}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', opacity: 0.5, cursor: 'not-allowed' }}>
                                        <Button size="sm" disabled>Accept</Button>
                                        <Button size="sm" variant="ghost" disabled>Reject</Button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Tab: Sweep Floor */}
            {activeTab === 'sweep' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <p style={{ fontSize: '14px', color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                        Select a collection and the number of floor items to sweep.
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: theme.spacing.md,
                    }}>
                        {sweepCollections.map((col, i) => {
                            const count = sweepCount[col.slug] ?? 0;
                            const total = count * col.floor;

                            return (
                                <motion.div
                                    key={col.slug}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06 }}
                                >
                                    <GlassCard hover style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                            <div>
                                                <h4 style={{ fontFamily: theme.fonts.heading, fontSize: '16px', fontWeight: 700 }}>
                                                    {col.name}
                                                </h4>
                                                <div style={{ fontSize: '12px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                                                    {col.listed} listed | {col.volume24h} BTC 24h vol
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '10px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: theme.letterSpacing.wider }}>Floor</div>
                                                <div style={{ fontFamily: theme.fonts.mono, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{col.floor} BTC</div>
                                            </div>
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            marginBottom: count > 0 ? '16px' : 0,
                                        }}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSweepCount((prev) => ({ ...prev, [col.slug]: Math.max(0, (prev[col.slug] ?? 0) - 1) }))}
                                                disabled={count <= 0}
                                            >
                                                -
                                            </Button>
                                            <div style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                fontFamily: theme.fonts.mono,
                                                fontSize: '20px',
                                                fontWeight: 700,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {count}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSweepCount((prev) => ({ ...prev, [col.slug]: Math.min(col.listed, (prev[col.slug] ?? 0) + 1) }))}
                                            >
                                                +
                                            </Button>
                                        </div>

                                        {count > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    paddingTop: '12px',
                                                    borderTop: `1px solid ${theme.colors.border.subtle}`,
                                                }}
                                            >
                                                <span style={{ fontSize: '13px', color: theme.colors.text.secondary }}>
                                                    Total: <span style={{
                                                        fontWeight: 700,
                                                        fontFamily: theme.fonts.mono,
                                                        color: theme.colors.text.primary,
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                        {total.toFixed(4)} BTC
                                                    </span>
                                                </span>
                                                <Button size="sm" disabled>Sweep {count}</Button>
                                            </motion.div>
                                        )}
                                    </GlassCard>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* Tab: Bulk List / Delist */}
            {activeTab === 'bulk' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: theme.spacing.lg,
                        padding: '14px 20px',
                        background: theme.colors.bg.card,
                        borderRadius: theme.radii.lg,
                        border: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <div style={{
                            fontSize: '14px',
                            color: theme.colors.text.secondary,
                        }}>
                            <span style={{ fontWeight: 700, color: theme.colors.text.primary }}>
                                {selectedBulkItems.length}
                            </span> selected
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled
                            >
                                Bulk List ({selectedBulkItems.filter((i) => !i.isListed).length})
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                disabled
                            >
                                Bulk Delist ({selectedBulkItems.filter((i) => i.isListed).length})
                            </Button>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: theme.spacing.md,
                    }}>
                        {bulkItems.map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.02 }}
                                onClick={() => toggleBulkItem(item.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div style={{
                                    background: theme.colors.bg.card,
                                    border: item.selected
                                        ? `2px solid ${theme.colors.brand.orange}`
                                        : `1px solid ${theme.colors.border.subtle}`,
                                    borderRadius: theme.radii.lg,
                                    overflow: 'hidden',
                                    boxShadow: item.selected ? theme.shadows.glow.orange : 'none',
                                    transition: `border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast}`,
                                }}>
                                    <div style={{
                                        height: '140px',
                                        background: `linear-gradient(${135 + i * 10}deg, rgba(255,107,0,0.06) 0%, ${theme.colors.bg.overlay} 100%)`,
                                        position: 'relative',
                                    }}>
                                        {item.isListed && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '6px',
                                                left: '6px',
                                                padding: '3px 8px',
                                                borderRadius: theme.radii.full,
                                                background: 'rgba(20, 241, 149, 0.12)',
                                                border: '1px solid rgba(20, 241, 149, 0.25)',
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                color: theme.colors.brand.green,
                                                textTransform: 'uppercase',
                                            }}>
                                                Listed
                                            </div>
                                        )}
                                        {item.selected && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '6px',
                                                right: '6px',
                                                width: '22px',
                                                height: '22px',
                                                borderRadius: '50%',
                                                background: theme.colors.brand.orange,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: '#fff',
                                            }}>
                                                {'\u2713'}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '10px 14px' }}>
                                        <div style={{ fontFamily: theme.fonts.heading, fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                            {item.name}
                                        </div>
                                        <div style={{ fontSize: '12px', fontFamily: theme.fonts.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {item.price} BTC
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
