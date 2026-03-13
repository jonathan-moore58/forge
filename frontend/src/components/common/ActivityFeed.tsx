import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/styles/theme';
import { truncateAddress } from '@/utils/format';
import { IndexerAPI, type IndexerActivity } from '@/services/IndexerAPI';
import type { ActivityType } from '@/types';

interface ActivityEntry {
    id: string;
    type: ActivityType;
    user: string;
    item: string;
    collection: string;
    price: string;
    blocksAgo: number;
}

const ACTIVITY_COLORS: Record<string, string> = {
    sale: theme.colors.brand.green,
    listing: theme.colors.brand.orange,
    list: theme.colors.brand.orange,
    offer: theme.colors.brand.purple,
    mint: theme.colors.brand.gold,
    transfer: theme.colors.text.secondary,
    bid: theme.colors.brand.cyan,
    auction_settled: theme.colors.brand.green,
    offer_accepted: theme.colors.brand.green,
    cancel_listing: theme.colors.status.error,
};

const ACTIVITY_VERBS: Record<string, string> = {
    sale: 'bought',
    listing: 'listed',
    list: 'listed',
    offer: 'offered on',
    mint: 'minted',
    transfer: 'transferred',
    bid: 'bid on',
    auction_settled: 'won',
    offer_accepted: 'accepted offer on',
    cancel_listing: 'delisted',
};

/** Convert IndexerActivity to display format */
function toActivityEntry(a: IndexerActivity, currentBlock: number): ActivityEntry {
    const type: ActivityType = (a.event_type === 'list' ? 'listing' : a.event_type) as ActivityType;
    return {
        id: `${a.tx_hash ?? 'unknown'}-${a.id ?? 0}`,
        type: type in ACTIVITY_COLORS ? type : 'transfer',
        user: a.from_address || a.to_address || '???',
        item: `#${a.token_id ?? 0}`,
        collection: truncateAddress(a.collection_address, 8, 4),
        price: a.price ? (Number(a.price) / 1e8).toFixed(4) : '0',
        blocksAgo: Math.max(0, currentBlock - (a.block_number ?? 0)),
    };
}

export function ActivityFeed({
    items,
    maxItems = 10,
    compact = false,
}: {
    items: ActivityEntry[];
    maxItems?: number;
    compact?: boolean;
}): JSX.Element {
    const visibleItems = items.slice(0, maxItems);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '1px' : '4px' }}>
            <AnimatePresence initial={false}>
                {visibleItems.map((item, index) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -16, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                        exit={{ opacity: 0, x: 16, height: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.05 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: compact ? '10px 14px' : '12px 18px',
                            borderRadius: compact ? '0' : theme.radii.md,
                            background: compact ? 'transparent' : theme.colors.bg.card,
                            borderBottom: compact ? `1px solid ${theme.colors.border.subtle}` : undefined,
                            border: compact ? undefined : `1px solid ${theme.colors.border.subtle}`,
                            fontSize: compact ? '13px' : '14px',
                            transition: `background ${theme.transitions.fast}`,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: ACTIVITY_COLORS[item.type] ?? theme.colors.text.secondary,
                                flexShrink: 0,
                                boxShadow: `0 0 6px ${ACTIVITY_COLORS[item.type] ?? theme.colors.text.secondary}40`,
                            }} />
                            <span style={{ color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono, fontSize: '12px' }}>
                                {truncateAddress(item.user)}
                            </span>
                            <span style={{ color: ACTIVITY_COLORS[item.type] ?? theme.colors.text.secondary, fontWeight: 500 }}>
                                {ACTIVITY_VERBS[item.type] ?? item.type}
                            </span>
                            <span style={{
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: theme.colors.text.primary,
                            }}>
                                {item.item}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                            <span style={{
                                fontWeight: 600,
                                fontFamily: theme.fonts.mono,
                                fontSize: '13px',
                                fontVariantNumeric: 'tabular-nums',
                                color: theme.colors.text.primary,
                            }}>
                                {item.price} BTC
                            </span>
                            <span style={{
                                fontSize: '11px',
                                color: theme.colors.text.tertiary,
                                whiteSpace: 'nowrap',
                            }}>
                                {item.blocksAgo}b ago
                            </span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/** Live scrolling ticker — fetches real activity from indexer with mock fallback */
export function LiveTicker(): JSX.Element {
    const { data: activityData } = useQuery({
        queryKey: ['global-activity-ticker'],
        queryFn: async () => {
            const res = await IndexerAPI.activity({ limit: 10 });
            return res.data;
        },
        staleTime: 15_000,
        refetchInterval: 20_000, // Poll every 20s
    });

    const { data: healthData } = useQuery({
        queryKey: ['indexer-health-ticker'],
        queryFn: async () => {
            const res = await IndexerAPI.health();
            return res.data;
        },
        staleTime: 30_000,
    });

    const currentBlock = healthData?.lastBlock ?? 0;

    // Convert real data or use mock fallback
    const items: ActivityEntry[] = (activityData && activityData.length > 0)
        ? activityData.map((a) => toActivityEntry(a, currentBlock))
        : [
            { id: '1', type: 'sale', user: 'bc1p...x7f', item: '#42', collection: 'FORGE', price: '0.12', blocksAgo: 1 },
            { id: '2', type: 'listing', user: 'bc1p...q3k', item: '#7', collection: 'Sentinels', price: '0.08', blocksAgo: 3 },
            { id: '3', type: 'mint', user: 'bc1p...m9a', item: '#99', collection: 'TMOTO', price: '0.005', blocksAgo: 5 },
        ];

    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (items.length === 0) return;
        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % items.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [items.length]);

    const item = items[current];
    if (!item) return <div />;

    return (
        <div style={{
            padding: '8px 20px',
            borderRadius: theme.radii.full,
            background: 'rgba(255, 107, 0, 0.03)',
            border: '1px solid rgba(255, 107, 0, 0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            boxShadow: '0 0 20px rgba(255, 107, 0, 0.03)',
        }}>
            {/* Pulsing live dot */}
            <div style={{ position: 'relative', width: '8px', height: '8px' }}>
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: theme.colors.brand.green,
                }} />
                <div style={{
                    position: 'absolute',
                    inset: '-3px',
                    borderRadius: '50%',
                    background: theme.colors.brand.green,
                    animation: 'live-pulse 2s ease-in-out infinite',
                    opacity: 0.4,
                }} />
            </div>
            <AnimatePresence mode="wait">
                <motion.span
                    key={current}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    style={{ color: theme.colors.text.secondary }}
                >
                    <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.text.tertiary }}>
                        {truncateAddress(item.user)}
                    </span>{' '}
                    <span style={{ color: ACTIVITY_COLORS[item.type] ?? theme.colors.text.secondary, fontWeight: 500 }}>
                        {ACTIVITY_VERBS[item.type] ?? item.type}
                    </span>{' '}
                    <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>{item.item}</span>{' '}
                    for{' '}
                    <span style={{
                        color: theme.colors.text.primary,
                        fontWeight: 600,
                        fontFamily: theme.fonts.mono,
                        fontVariantNumeric: 'tabular-nums',
                    }}>{item.price} BTC</span>{' '}
                    <span style={{ color: theme.colors.text.tertiary, fontSize: '12px' }}>{item.blocksAgo} blocks ago</span>
                </motion.span>
            </AnimatePresence>
        </div>
    );
}

/** Standalone activity section for HomePage — fetches its own data */
export function RecentActivitySection(): JSX.Element {
    const { data: activityData } = useQuery({
        queryKey: ['global-activity-recent'],
        queryFn: async () => {
            const res = await IndexerAPI.activity({ limit: 15 });
            return res.data;
        },
        staleTime: 15_000,
        refetchInterval: 30_000,
    });

    const { data: healthData } = useQuery({
        queryKey: ['indexer-health-recent'],
        queryFn: async () => {
            const res = await IndexerAPI.health();
            return res.data;
        },
        staleTime: 30_000,
    });

    const currentBlock = healthData?.lastBlock ?? 0;

    const items: ActivityEntry[] = (activityData && activityData.length > 0)
        ? activityData.map((a) => toActivityEntry(a, currentBlock))
        : [];

    if (items.length === 0) return <div />;

    return (
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
                    Recent Activity
                </h2>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: theme.colors.text.tertiary,
                }}>
                    <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: theme.colors.brand.green,
                        animation: 'live-pulse 2s ease-in-out infinite',
                    }} />
                    Live
                </div>
            </div>
            <ActivityFeed items={items} maxItems={10} />
        </section>
    );
}
