import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/styles/theme';
import { StatCard } from '@/components/common/StatCard';
import { FlashlightGrid } from '@/components/common/FlashlightGrid';
import { Skeleton } from '@/components/common/Skeleton';
import { useNetwork } from '@/hooks/useNetwork';
import { mapCollection, type CollectionItem } from '@/hooks/useRegistry';
import { CollectionImage } from '@/components/common/CollectionImage';
import { IndexerAPI, type CollectionStats } from '@/services/IndexerAPI';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortKey = 'volume' | 'floor' | 'listed' | 'recent';

interface CollectionWithStats extends CollectionItem {
    stats: CollectionStats | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function satsToBtc(sats: string | null | undefined): number {
    if (!sats) return 0;
    return Number(sats) / 1e8;
}

function formatBtc(sats: string | null | undefined): string {
    const btc = satsToBtc(sats);
    if (btc === 0) return '--';
    if (btc < 0.001) return btc.toFixed(8);
    if (btc < 1) return btc.toFixed(4);
    return btc.toFixed(2);
}

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Collection Card                                                    */
/* ------------------------------------------------------------------ */

function CollectionCard({
    collection,
    index,
}: {
    readonly collection: CollectionWithStats;
    readonly index: number;
}): JSX.Element {
    const [isHovered, setIsHovered] = useState(false);
    const stats = collection.stats;
    const displayName = collection.name || shortAddr(collection.collectionAddress);

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
            <Link to={`/collection/${collection.collectionAddress}`} style={{ textDecoration: 'none' }}>
                <div
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    style={{
                        background: theme.colors.bg.card,
                        border: `1px solid ${isHovered ? theme.colors.border.accent : theme.colors.border.subtle}`,
                        borderRadius: theme.radii.lg,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: isHovered
                            ? '0 8px 32px rgba(255,107,0,0.08), 0 0 0 1px rgba(255,107,0,0.05)'
                            : theme.shadows.sm,
                        transition: `border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.base}, transform ${theme.transitions.fast}`,
                        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                    }}
                >
                    {/* Banner — collection icon/banner → fallback to token #1 */}
                    <div style={{
                        height: '120px',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        <CollectionImage
                            uri={collection.icon || collection.banner}
                            baseUri={collection.baseUri}
                            index={index}
                            aspectRatio="auto"
                            style={{ width: '100%', height: '100%' }}
                        />

                        {/* Verified badge */}
                        {collection.verified && (
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                padding: '3px 8px',
                                borderRadius: theme.radii.full,
                                background: 'rgba(0, 212, 255, 0.15)',
                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: theme.colors.brand.cyan,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                backdropFilter: 'blur(8px)',
                            }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill={theme.colors.brand.cyan}>
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                </svg>
                                Verified
                            </div>
                        )}
                    </div>

                    {/* Info section */}
                    <div style={{ padding: '16px' }}>
                        {/* Name + symbol */}
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '15px',
                            fontWeight: 600,
                            letterSpacing: theme.letterSpacing.snug,
                            color: theme.colors.text.primary,
                            marginBottom: '4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {displayName}
                        </div>
                        {collection.symbol && (
                            <div style={{
                                fontSize: theme.fontSize.xs,
                                color: theme.colors.text.tertiary,
                                marginBottom: '12px',
                                fontFamily: theme.fonts.mono,
                            }}>
                                {collection.symbol}
                            </div>
                        )}
                        {!collection.symbol && <div style={{ marginBottom: '12px' }} />}

                        {/* Stats grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '8px',
                            paddingTop: '12px',
                            borderTop: `1px solid ${theme.colors.border.subtle}`,
                        }}>
                            <StatCell label="Floor" value={formatBtc(stats?.floor_price)} suffix={stats?.floor_price ? ' BTC' : ''} />
                            <StatCell label="Volume" value={formatBtc(stats?.total_volume)} suffix={stats?.total_volume ? ' BTC' : ''} />
                            <StatCell label="Listed" value={stats?.listed_count?.toString() ?? '0'} />
                            <StatCell label="Supply" value={collection.totalSupply?.toString() ?? '--'} />
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

function StatCell({ label, value, suffix = '' }: { label: string; value: string; suffix?: string }): JSX.Element {
    return (
        <div>
            <div style={{
                fontSize: '10px',
                color: theme.colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 500,
                marginBottom: '2px',
            }}>
                {label}
            </div>
            <div style={{
                fontFamily: theme.fonts.mono,
                fontSize: '13px',
                fontWeight: 600,
                color: theme.colors.text.primary,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {value}{suffix}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Skeleton Card                                                      */
/* ------------------------------------------------------------------ */

function CollectionCardSkeleton({ index }: { index: number }): JSX.Element {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.05 }}
            style={{
                background: theme.colors.bg.card,
                border: `1px solid ${theme.colors.border.subtle}`,
                borderRadius: theme.radii.lg,
                overflow: 'hidden',
            }}
        >
            <Skeleton style={{ height: '100px', borderRadius: 0 }} />
            <div style={{ padding: '16px' }}>
                <Skeleton style={{ height: '18px', width: '70%', marginBottom: '4px' }} />
                <Skeleton style={{ height: '14px', width: '30%', marginBottom: '12px' }} />
                <div style={{ borderTop: `1px solid ${theme.colors.border.subtle}`, paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Skeleton style={{ height: '30px' }} />
                    <Skeleton style={{ height: '30px' }} />
                    <Skeleton style={{ height: '30px' }} />
                    <Skeleton style={{ height: '30px' }} />
                </div>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function MarketplacePage(): JSX.Element {
    const { network } = useNetwork();

    // Only fetch collections that are registered on the marketplace (stock exchange model)
    const { data: collections, isLoading: collectionsLoading } = useQuery({
        queryKey: ['marketplace', network, 'registeredCollections'],
        queryFn: async () => {
            const res = await IndexerAPI.collections({ marketplace_registered: 1 });
            return res.data.map(mapCollection);
        },
        staleTime: 30_000,
    });

    // Fetch global stats
    const { data: globalStats } = useQuery({
        queryKey: ['marketplace', network, 'globalStats'],
        queryFn: async () => {
            const res = await IndexerAPI.globalStats();
            return res.data;
        },
        staleTime: 30_000,
    });

    // Fetch stats for each collection
    const { data: collectionStatsMap } = useQuery({
        queryKey: ['marketplace', network, 'allCollectionStats', collections?.map(c => c.collectionAddress).join(',')],
        queryFn: async () => {
            const map: Record<string, CollectionStats> = {};
            const addresses = (collections ?? []).map(c => c.collectionAddress);
            const results = await Promise.allSettled(
                addresses.map(async (addr) => {
                    const res = await IndexerAPI.collectionStats(addr);
                    return { addr, stats: res.data };
                }),
            );
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    map[result.value.addr] = result.value.stats;
                }
            }
            return map;
        },
        enabled: !!collections && collections.length > 0,
        staleTime: 30_000,
    });

    const [sortBy, setSortBy] = useState<SortKey>('volume');
    const [searchQuery, setSearchQuery] = useState('');

    // Merge collections with their stats.
    // Only marketplace-registered collections are fetched (via marketplace_registered=1 filter).
    // Registration is the gate — like a stock exchange listing.
    const collectionsWithStats: CollectionWithStats[] = useMemo(() => {
        return (collections ?? []).map((c) => ({
            ...c,
            stats: collectionStatsMap?.[c.collectionAddress] ?? null,
        }));
    }, [collections, collectionStatsMap]);

    const filteredAndSorted = useMemo(() => {
        let result = [...collectionsWithStats];

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((c) =>
                (c.name?.toLowerCase().includes(q)) ||
                (c.symbol?.toLowerCase().includes(q)) ||
                c.collectionAddress.toLowerCase().includes(q),
            );
        }

        // Sort — collections with activity rank higher
        switch (sortBy) {
            case 'volume':
                result.sort((a, b) => satsToBtc(b.stats?.total_volume) - satsToBtc(a.stats?.total_volume));
                break;
            case 'floor':
                result.sort((a, b) => {
                    const af = satsToBtc(a.stats?.floor_price);
                    const bf = satsToBtc(b.stats?.floor_price);
                    if (af === 0 && bf === 0) return 0;
                    if (af === 0) return 1;
                    if (bf === 0) return -1;
                    return af - bf;
                });
                break;
            case 'listed':
                result.sort((a, b) => (b.stats?.listed_count ?? 0) - (a.stats?.listed_count ?? 0));
                break;
            case 'recent':
                result.sort((a, b) => Number(b.registeredAt - a.registeredAt));
                break;
        }

        return result;
    }, [collectionsWithStats, sortBy, searchQuery]);

    // Compute aggregated stats
    const totalVolume = globalStats ? Number(globalStats.totalVolume) / 1e8 : 0;
    const totalSales = globalStats?.totalSales ?? 0;
    const activeListings = globalStats?.activeListings ?? 0;
    const totalCollections = collectionsWithStats.length;

    const SORT_OPTIONS: readonly { readonly key: SortKey; readonly label: string }[] = [
        { key: 'volume', label: 'Volume' },
        { key: 'floor', label: 'Floor Price' },
        { key: 'listed', label: 'Most Listed' },
        { key: 'recent', label: 'Recently Added' },
    ];

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ marginBottom: theme.spacing.xl }}
            >
                <h1 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: theme.fontSize['4xl'],
                    fontWeight: 700,
                    letterSpacing: theme.letterSpacing.tighter,
                    marginBottom: theme.spacing.xs,
                }}>
                    Marketplace
                </h1>
                <p style={{
                    fontSize: theme.fontSize.md,
                    color: theme.colors.text.secondary,
                }}>
                    Secondary trading for Bitcoin NFTs. Only creator-registered collections are listed.
                </p>
            </motion.div>

            {/* Stats Row */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.35 }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: theme.spacing.md,
                    marginBottom: theme.spacing.xxl,
                }}
            >
                <StatCard label="Total Volume" value={totalVolume} decimals={totalVolume < 1 ? 4 : 2} suffix=" BTC" sparklineData={[0, 0, 0, 0, 0, totalVolume]} />
                <StatCard label="Total Sales" value={totalSales} decimals={0} sparklineData={[0, 0, 0, 0, 0, totalSales]} />
                <StatCard label="Active Listings" value={activeListings} decimals={0} sparklineData={[0, 0, 0, 0, 0, activeListings]} />
                <StatCard label="Collections" value={totalCollections} decimals={0} sparklineData={[0, 0, 0, 0, 0, totalCollections]} />
            </motion.div>

            {/* Search + Sort Bar */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: theme.spacing.md,
                    marginBottom: theme.spacing.lg,
                }}
            >
                {/* Search */}
                <div style={{
                    position: 'relative',
                    flex: 1,
                    maxWidth: '400px',
                }}>
                    <svg
                        width="16" height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={theme.colors.text.tertiary}
                        strokeWidth="2"
                        strokeLinecap="round"
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search collections..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            background: theme.colors.bg.raised,
                            border: `1px solid ${theme.colors.border.subtle}`,
                            borderRadius: theme.radii.md,
                            color: theme.colors.text.primary,
                            fontFamily: theme.fonts.body,
                            fontSize: '13px',
                            outline: 'none',
                            transition: `border-color ${theme.transitions.fast}`,
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Sort + Register link */}
                <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortKey)}
                        style={{
                            padding: '8px 12px',
                            background: theme.colors.bg.raised,
                            border: `1px solid ${theme.colors.border.subtle}`,
                            borderRadius: theme.radii.sm,
                            color: theme.colors.text.primary,
                            fontFamily: theme.fonts.body,
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        {SORT_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                                {opt.label}
                            </option>
                        ))}
                    </select>

                    <Link
                        to="/register"
                        style={{
                            padding: '8px 16px',
                            borderRadius: theme.radii.sm,
                            background: 'rgba(255, 107, 0, 0.08)',
                            border: `1px solid ${theme.colors.border.accent}`,
                            color: theme.colors.brand.orange,
                            fontSize: '13px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            transition: `background ${theme.transitions.fast}`,
                        }}
                    >
                        + Register Collection
                    </Link>
                </div>
            </motion.div>

            {/* Collection Grid */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${sortBy}-${searchQuery}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {collectionsLoading ? (
                        <FlashlightGrid style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: theme.spacing.md,
                        }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <CollectionCardSkeleton key={i} index={i} />
                            ))}
                        </FlashlightGrid>
                    ) : filteredAndSorted.length > 0 ? (
                        <FlashlightGrid style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: theme.spacing.md,
                        }}>
                            {filteredAndSorted.map((col, i) => (
                                <CollectionCard key={col.collectionAddress} collection={col} index={i} />
                            ))}
                        </FlashlightGrid>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ textAlign: 'center', padding: theme.spacing.xxxl }}
                        >
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: theme.radii.xl,
                                background: theme.colors.bg.overlay,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px',
                                fontSize: '28px',
                            }}>
                                {searchQuery ? '\u{1F50D}' : '\u{1F3A8}'}
                            </div>
                            <div style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: theme.fontSize.lg,
                                fontWeight: 600,
                                marginBottom: '8px',
                                color: theme.colors.text.primary,
                            }}>
                                {searchQuery ? 'No collections found' : 'No registered collections yet'}
                            </div>
                            <div style={{
                                fontSize: theme.fontSize.base,
                                color: theme.colors.text.tertiary,
                                marginBottom: '8px',
                                maxWidth: '480px',
                                margin: '0 auto 20px',
                                lineHeight: 1.6,
                            }}>
                                {searchQuery
                                    ? 'Try a different search term.'
                                    : 'Collections appear here after a creator registers them for trading. Creators: deploy your collection on the launchpad, then register it for the marketplace.'}
                            </div>
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        padding: '8px 20px',
                                        borderRadius: theme.radii.md,
                                        background: theme.colors.bg.interactive,
                                        border: `1px solid ${theme.colors.border.default}`,
                                        color: theme.colors.text.primary,
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Clear search
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <Link
                                        to="/register"
                                        style={{
                                            display: 'inline-block',
                                            padding: '10px 24px',
                                            borderRadius: theme.radii.md,
                                            background: theme.colors.brand.orange,
                                            color: '#fff',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                        }}
                                    >
                                        Register a Collection
                                    </Link>
                                    <Link
                                        to="/launchpad"
                                        style={{
                                            display: 'inline-block',
                                            padding: '10px 24px',
                                            borderRadius: theme.radii.md,
                                            background: theme.colors.bg.interactive,
                                            border: `1px solid ${theme.colors.border.default}`,
                                            color: theme.colors.text.primary,
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            textDecoration: 'none',
                                        }}
                                    >
                                        Browse Launchpad
                                    </Link>
                                </div>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
