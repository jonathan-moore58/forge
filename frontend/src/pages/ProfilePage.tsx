import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/styles/theme';
import { Button } from '@/components/common/Button';
import { TabBar } from '@/components/common/TabBar';
import { FlashlightGrid } from '@/components/common/FlashlightGrid';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useNetwork } from '@/hooks/useNetwork';
import { useMarketStats } from '@/hooks/useMarketplace';
import { useUserPortfolio } from '@/hooks/useUserPortfolio';
import { useUserListings } from '@/hooks/useUserListings';
import { useUserOffers } from '@/hooks/useUserOffers';
import { IndexerAPI, type IndexerActivity } from '@/services/IndexerAPI';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OwnedNFT {
    readonly tokenId: number;
    readonly name: string;
    readonly collection: string;
    readonly collectionSlug: string;
    readonly floorPrice: number;
    readonly lastSale: number;
    readonly rarity: number;
    readonly isListed: boolean;
    readonly listPrice: number | null;
}

interface OfferSent {
    readonly id: string;
    readonly nftName: string;
    readonly collection: string;
    readonly amount: number;
    readonly status: 'pending' | 'accepted' | 'expired';
    readonly blocksAgo: number;
}

interface OfferReceived {
    readonly id: string;
    readonly nftName: string;
    readonly from: string;
    readonly amount: number;
    readonly expiryBlocks: number;
    readonly maxBlocks: number;
}

type ProfileTab = 'owned' | 'listed' | 'offers-sent' | 'offers-received' | 'activity' | 'royalties';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRarityColor(rank: number): string {
    if (rank <= 100) return '#ffaa00';
    if (rank <= 500) return '#aa66ff';
    if (rank <= 1500) return '#4499ff';
    return theme.colors.text.tertiary;
}

const OFFER_STATUS_STYLES: Record<OfferSent['status'], { color: string; bg: string }> = {
    pending: { color: theme.colors.brand.gold, bg: 'rgba(245, 158, 11, 0.08)' },
    accepted: { color: theme.colors.brand.green, bg: 'rgba(20, 241, 149, 0.08)' },
    expired: { color: theme.colors.text.tertiary, bg: 'rgba(255, 255, 255, 0.03)' },
};

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function NFTGridCard({ nft, index }: { readonly nft: OwnedNFT; readonly index: number }): JSX.Element {
    const [hovered, setHovered] = useState(false);
    const rarityColor = getRarityColor(nft.rarity);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.02 }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
        >
            <Link to={`/nft/${nft.collectionSlug}/${nft.tokenId}`} style={{ textDecoration: 'none' }}>
                <div style={{
                    background: theme.colors.bg.card,
                    border: `1px solid ${hovered ? theme.colors.border.accent : theme.colors.border.subtle}`,
                    borderRadius: theme.radii.lg,
                    overflow: 'hidden',
                    transition: `border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast}`,
                    boxShadow: hovered ? '0 8px 24px rgba(255, 107, 0, 0.08)' : 'none',
                }}>
                    {/* Image placeholder — 1:1 */}
                    <div style={{
                        aspectRatio: '1',
                        background: `linear-gradient(${120 + index * 12}deg,
                            rgba(${(index * 37) % 200 + 55}, ${(index * 71) % 150}, ${(index * 53) % 200}, 0.12) 0%,
                            ${theme.colors.bg.overlay} 100%)`,
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* Listed badge */}
                        {nft.isListed && (
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                padding: '3px 8px',
                                borderRadius: theme.radii.full,
                                background: 'rgba(20, 241, 149, 0.12)',
                                border: '1px solid rgba(20, 241, 149, 0.25)',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.brand.green,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                backdropFilter: 'blur(8px)',
                            }}>
                                Listed
                            </div>
                        )}
                        {/* Rarity badge */}
                        <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            padding: '3px 7px',
                            borderRadius: theme.radii.full,
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: rarityColor,
                        }}>
                            #{nft.rarity}
                        </div>

                        {/* Hover overlay */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: hovered ? 0 : '100%' }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                padding: '10px 12px',
                                background: 'linear-gradient(to top, rgba(10,10,15,0.95) 60%, transparent)',
                                display: 'flex',
                                justifyContent: 'center',
                            }}
                        >
                            <span style={{
                                padding: '5px 14px',
                                borderRadius: theme.radii.sm,
                                background: theme.colors.brand.orange,
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 700,
                            }}>
                                View NFT
                            </span>
                        </motion.div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '12px 14px' }}>
                        <div style={{
                            fontSize: '10px',
                            color: theme.colors.brand.orange,
                            fontWeight: 500,
                            marginBottom: '2px',
                        }}>
                            {nft.collection}
                        </div>
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '13px',
                            fontWeight: 600,
                            color: theme.colors.text.primary,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginBottom: '10px',
                        }}>
                            {nft.name}
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            borderTop: `1px solid ${theme.colors.border.subtle}`,
                            fontSize: '12px',
                        }}>
                            <div>
                                <div style={{ color: theme.colors.text.tertiary, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>
                                    {nft.isListed ? 'List Price' : 'Floor'}
                                </div>
                                <div style={{ fontFamily: theme.fonts.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {(nft.listPrice ?? nft.floorPrice).toFixed(4)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: theme.colors.text.tertiary, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>Last</div>
                                <div style={{ fontFamily: theme.fonts.mono, color: theme.colors.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
                                    {nft.lastSale}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

/* Offer expiry progress bar */
function ExpiryBar({ remaining, max }: { remaining: number; max: number }) {
    const pct = Math.max(0, Math.min(100, (remaining / max) * 100));
    const isUrgent = pct < 20;
    return (
        <div style={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            background: theme.colors.bg.interactive,
            overflow: 'hidden',
        }}>
            <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: '2px',
                background: isUrgent ? theme.colors.status.error : theme.colors.brand.green,
                transition: 'width 0.3s ease',
            }} />
        </div>
    );
}

/* Table header row */
function TableHeader({ columns }: { columns: { label: string; align?: 'left' | 'right' | 'center'; width?: string }[] }) {
    return (
        <div style={{
            display: 'flex',
            padding: '10px 16px',
            fontSize: '10px',
            fontWeight: 600,
            color: theme.colors.text.tertiary,
            textTransform: 'uppercase',
            letterSpacing: theme.letterSpacing.wider,
            borderBottom: `1px solid ${theme.colors.border.subtle}`,
        }}>
            {columns.map((col, i) => (
                <span key={i} style={{
                    flex: col.width ? undefined : 1,
                    width: col.width,
                    textAlign: col.align ?? 'left',
                    flexShrink: col.width ? 0 : undefined,
                }}>
                    {col.label}
                </span>
            ))}
        </div>
    );
}

/* Empty state */
function EmptyTabState({ icon, message }: { icon: string; message: string }) {
    return (
        <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: theme.colors.text.tertiary,
        }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3 }}>{icon}</div>
            <div style={{ fontSize: '14px' }}>{message}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function ProfilePage(): JSX.Element {
    const [activeTab, setActiveTab] = useState<ProfileTab>('owned');

    /* ── Real blockchain hooks ── */
    const { network } = useNetwork();
    const { address: rawWalletAddr } = useWalletConnect();
    const walletAddress = rawWalletAddr ? String(rawWalletAddr) : undefined;
    const { data: marketStats } = useMarketStats(network);

    const displayAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : 'Not connected';

    // TODO: Creator collection count — would need to filter registry by creator address

    // Global marketplace volume (shown in profile context)
    const mktTotalVolume = marketStats ? Number(marketStats.totalVolume) / 1e8 : undefined;
    void mktTotalVolume;

    // ── User data from on-chain hooks ──
    const portfolio = useUserPortfolio(network, walletAddress);
    const userListings = useUserListings(network, walletAddress);
    const userOffers = useUserOffers(network, walletAddress);

    // ── Activity history from indexer ──
    const { data: activityData } = useQuery({
        queryKey: ['userActivity', network, walletAddress],
        queryFn: async () => {
            if (!walletAddress) return [];
            const res = await IndexerAPI.activity({ address: walletAddress, limit: 50 });
            return res.data;
        },
        enabled: !!walletAddress,
        staleTime: 30_000,
    });
    const activities: IndexerActivity[] = activityData ?? [];

    // ── Royalties earned from activity (RoyaltyPaid events where to_address === wallet) ──
    const { data: royaltyData } = useQuery({
        queryKey: ['userRoyalties', network, walletAddress],
        queryFn: async () => {
            if (!walletAddress) return [];
            const res = await IndexerAPI.activity({ address: walletAddress, type: 'royalty_paid', limit: 100 });
            return res.data;
        },
        enabled: !!walletAddress,
        staleTime: 60_000,
    });
    const royalties: IndexerActivity[] = royaltyData ?? [];
    const totalRoyaltiesSats = useMemo(() =>
        royalties.reduce((sum, r) => sum + (r.price ? BigInt(r.price) : 0n), 0n),
    [royalties]);

    // Convert portfolio holdings to OwnedNFT shape
    const ownedNFTs: OwnedNFT[] = useMemo(() => {
        return portfolio.holdings.flatMap((h) =>
            h.tokenIds.map((tid) => ({
                tokenId: Number(tid),
                name: `#${tid.toString()}`,
                collection: `${h.collectionAddress.slice(0, 6)}...${h.collectionAddress.slice(-4)}`,
                collectionSlug: h.collectionAddress,
                floorPrice: Number(h.floorPrice) / 1e8,
                lastSale: 0,
                rarity: 0,
                isListed: false, // Determined by cross-referencing listings
                listPrice: null,
            })),
        );
    }, [portfolio.holdings]);

    // Determine which owned NFTs are listed
    const listedSet = useMemo(() => {
        const s = new Set<string>();
        for (const l of userListings.listings) {
            s.add(`${String(l.collection)}:${l.tokenId.toString()}`);
        }
        return s;
    }, [userListings.listings]);

    const ownedWithListingStatus: OwnedNFT[] = useMemo(() => {
        return ownedNFTs.map((nft) => {
            const key = `${nft.collectionSlug}:${BigInt(nft.tokenId).toString()}`;
            const isListed = listedSet.has(key);
            return { ...nft, isListed, listPrice: isListed ? nft.floorPrice : null };
        });
    }, [ownedNFTs, listedSet]);

    const listedNFTs = ownedWithListingStatus.filter((n) => n.isListed);

    // Convert offers to page shapes
    const offersSent: OfferSent[] = useMemo(() => {
        return userOffers.sent.map((o) => ({
            id: `os-${o.id.toString()}`,
            nftName: `#${o.tokenId.toString()}`,
            collection: `${String(o.collection).slice(0, 6)}...${String(o.collection).slice(-4)}`,
            amount: Number(o.price) / 1e8,
            status: o.status === 0n ? 'pending' as const : o.status === 1n ? 'accepted' as const : 'expired' as const,
            blocksAgo: 0,
        }));
    }, [userOffers.sent]);

    const offersReceived: OfferReceived[] = useMemo(() => {
        return userOffers.received.map((o) => ({
            id: `or-${o.id.toString()}`,
            nftName: `#${o.tokenId.toString()}`,
            from: `${String(o.offerer).slice(0, 6)}...${String(o.offerer).slice(-4)}`,
            amount: Number(o.price) / 1e8,
            expiryBlocks: Number(o.expiryBlock),
            maxBlocks: 144,
        }));
    }, [userOffers.received]);

    const portfolioValue = Number(portfolio.totalValueSats) / 1e8;
    const pnl = 0; // P&L requires historical data (indexer)

    const TABS = useMemo(() => [
        { id: 'owned', label: 'Owned', count: ownedWithListingStatus.length },
        { id: 'listed', label: 'Listed', count: listedNFTs.length },
        { id: 'offers-sent', label: 'Offers Sent', count: offersSent.length },
        { id: 'offers-received', label: 'Offers Received', count: offersReceived.length },
        { id: 'activity', label: 'Activity', count: activities.length || undefined },
        { id: 'royalties', label: 'Royalties', count: royalties.length || undefined },
    ], [ownedWithListingStatus.length, listedNFTs.length, offersSent.length, offersReceived.length, activities.length, royalties.length]);

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Background mesh */}
            <div style={{
                position: 'fixed',
                inset: 0,
                background: theme.gradients.meshCool,
                pointerEvents: 'none',
                zIndex: -1,
            }} />

            {/* Profile Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    display: 'flex',
                    gap: '20px',
                    alignItems: 'center',
                    marginBottom: theme.spacing.xxl,
                }}
            >
                {/* Gradient ring avatar */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    padding: '3px',
                    background: theme.gradients.orangeToCyan,
                    flexShrink: 0,
                }}>
                    <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        background: theme.colors.bg.raised,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: theme.fonts.heading,
                        fontSize: '28px',
                        fontWeight: 700,
                        color: theme.colors.text.tertiary,
                    }}>
                        {'\uD83D\uDD25'}
                    </div>
                </div>
                <div>
                    <h1 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: '32px',
                        fontWeight: 700,
                        letterSpacing: theme.letterSpacing.tight,
                        marginBottom: '4px',
                    }}>
                        My Portfolio
                        {mktTotalVolume !== undefined && (
                            <span style={{
                                fontSize: '13px',
                                fontWeight: 500,
                                color: theme.colors.text.tertiary,
                                marginLeft: '12px',
                            }}>
                                {mktTotalVolume.toFixed(2)} BTC marketplace volume
                            </span>
                        )}
                    </h1>
                    <div style={{
                        fontFamily: theme.fonts.mono,
                        fontSize: '14px',
                        color: theme.colors.text.tertiary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        {displayAddress}
                        <button style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: theme.colors.text.tertiary,
                            padding: '2px',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Portfolio Stats */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr',
                    gap: theme.spacing.md,
                    marginBottom: theme.spacing.xxl,
                }}
            >
                {/* Portfolio value — featured */}
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
                        <CountUp end={portfolioValue} decimals={2} duration={1.8} enableScrollSpy scrollSpyOnce />
                        <span style={{ fontSize: '14px', color: theme.colors.text.secondary, fontWeight: 500 }}>BTC</span>
                    </div>
                </div>

                {/* Other stats */}
                {[
                    { label: 'Total Spent', value: 0, suffix: 'BTC' },
                    { label: 'Total Earned', value: 0, suffix: 'BTC' },
                    { label: 'Unrealized P&L', value: pnl, suffix: 'BTC', positive: pnl >= 0 },
                    { label: 'NFTs Owned', value: portfolio.nftsOwned, decimals: 0 },
                    { label: 'Pending Offers', value: offersSent.filter(o => o.status === 'pending').length, decimals: 0 },
                ].map((stat) => (
                    <div key={stat.label} style={{
                        padding: '20px',
                        background: theme.colors.bg.card,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${theme.colors.border.subtle}`,
                        borderRadius: theme.radii.lg,
                    }}>
                        <div style={{
                            fontSize: '10px',
                            color: theme.colors.text.tertiary,
                            textTransform: 'uppercase',
                            letterSpacing: theme.letterSpacing.wider,
                            marginBottom: '8px',
                            fontWeight: 500,
                        }}>
                            {stat.label}
                        </div>
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '22px',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: stat.positive !== undefined
                                ? (stat.positive ? theme.colors.brand.green : theme.colors.status.error)
                                : theme.colors.text.primary,
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '4px',
                        }}>
                            {stat.positive !== undefined && (stat.positive ? '+' : '')}
                            <CountUp end={stat.value} decimals={stat.decimals ?? 2} duration={1.5} enableScrollSpy scrollSpyOnce />
                            {stat.suffix && (
                                <span style={{ fontSize: '12px', color: theme.colors.text.secondary, fontWeight: 500 }}>
                                    {stat.suffix}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </motion.div>

            {/* Tabs */}
            <TabBar
                tabs={TABS}
                activeTab={activeTab}
                onChange={(id) => setActiveTab(id as ProfileTab)}
                layoutId="profile-tab"
            />

            <div style={{ marginTop: theme.spacing.lg }}>
                <AnimatePresence mode="wait">
                    {/* Owned */}
                    {activeTab === 'owned' && (
                        <motion.div key="owned" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <FlashlightGrid>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: theme.spacing.md,
                                }}>
                                    {ownedWithListingStatus.map((nft, i) => (
                                        <NFTGridCard key={`${nft.collectionSlug}-${nft.tokenId}`} nft={nft} index={i} />
                                    ))}
                                </div>
                            </FlashlightGrid>
                        </motion.div>
                    )}

                    {/* Listed */}
                    {activeTab === 'listed' && (
                        <motion.div key="listed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            {listedNFTs.length > 0 ? (
                                <FlashlightGrid>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                        gap: theme.spacing.md,
                                    }}>
                                        {listedNFTs.map((nft, i) => (
                                            <NFTGridCard key={`${nft.collectionSlug}-${nft.tokenId}`} nft={nft} index={i} />
                                        ))}
                                    </div>
                                </FlashlightGrid>
                            ) : (
                                <EmptyTabState icon={'\uD83C\uDFAA'} message="No items listed for sale." />
                            )}
                        </motion.div>
                    )}

                    {/* Offers Sent */}
                    {activeTab === 'offers-sent' && (
                        <motion.div key="offers-sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <div style={{
                                background: theme.colors.bg.card,
                                borderRadius: theme.radii.lg,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                overflow: 'hidden',
                            }}>
                                <TableHeader columns={[
                                    { label: 'NFT' },
                                    { label: 'Amount', width: '100px', align: 'right' },
                                    { label: 'Status', width: '90px', align: 'center' },
                                    { label: 'Time', width: '80px', align: 'right' },
                                    { label: '', width: '80px' },
                                ]} />
                                {offersSent.map((offer, i) => {
                                    const st = OFFER_STATUS_STYLES[offer.status];
                                    return (
                                        <motion.div
                                            key={offer.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            style={{
                                                display: 'flex',
                                                padding: '14px 16px',
                                                fontSize: '13px',
                                                alignItems: 'center',
                                                borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{offer.nftName}</div>
                                                <div style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>{offer.collection}</div>
                                            </div>
                                            <span style={{ width: '100px', textAlign: 'right', fontFamily: theme.fonts.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                {offer.amount} BTC
                                            </span>
                                            <div style={{ width: '90px', display: 'flex', justifyContent: 'center' }}>
                                                <span style={{
                                                    padding: '3px 10px',
                                                    borderRadius: theme.radii.full,
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: st.color,
                                                    background: st.bg,
                                                    textTransform: 'capitalize',
                                                }}>
                                                    {offer.status}
                                                </span>
                                            </div>
                                            <span style={{ width: '80px', textAlign: 'right', color: theme.colors.text.tertiary, fontSize: '12px', fontFamily: theme.fonts.mono }}>
                                                {offer.blocksAgo} blks
                                            </span>
                                            <div style={{ width: '80px', display: 'flex', justifyContent: 'flex-end' }}>
                                                {offer.status === 'pending' && <Button size="sm" variant="danger">Cancel</Button>}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Offers Received */}
                    {activeTab === 'offers-received' && (
                        <motion.div key="offers-received" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <div style={{
                                background: theme.colors.bg.card,
                                borderRadius: theme.radii.lg,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                overflow: 'hidden',
                            }}>
                                <TableHeader columns={[
                                    { label: 'NFT' },
                                    { label: 'From', width: '100px', align: 'right' },
                                    { label: 'Amount', width: '90px', align: 'right' },
                                    { label: 'Expiry', width: '100px', align: 'right' },
                                    { label: '', width: '140px' },
                                ]} />
                                {offersReceived.map((offer, i) => (
                                    <motion.div
                                        key={offer.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.04 }}
                                        style={{
                                            display: 'flex',
                                            padding: '14px 16px',
                                            fontSize: '13px',
                                            alignItems: 'center',
                                            borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                        }}
                                    >
                                        <div style={{ flex: 1, fontWeight: 600 }}>{offer.nftName}</div>
                                        <span style={{ width: '100px', textAlign: 'right', fontFamily: theme.fonts.mono, fontSize: '11px', color: theme.colors.text.secondary }}>
                                            {offer.from}
                                        </span>
                                        <span style={{ width: '90px', textAlign: 'right', fontFamily: theme.fonts.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {offer.amount} BTC
                                        </span>
                                        <div style={{ width: '100px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                            <span style={{ fontSize: '11px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                                                {offer.expiryBlocks} blks
                                            </span>
                                            <ExpiryBar remaining={offer.expiryBlocks} max={offer.maxBlocks} />
                                        </div>
                                        <div style={{ width: '140px', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            <Button size="sm">Accept</Button>
                                            <Button size="sm" variant="ghost">Reject</Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Activity */}
                    {activeTab === 'activity' && (
                        <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <div style={{
                                background: theme.colors.bg.card,
                                borderRadius: theme.radii.lg,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                overflow: 'hidden',
                            }}>
                                <TableHeader columns={[
                                    { label: 'Type', width: '100px' },
                                    { label: 'NFT' },
                                    { label: 'Price', width: '100px', align: 'right' },
                                    { label: 'Counterparty', width: '120px', align: 'right' },
                                    { label: 'Block', width: '90px', align: 'right' },
                                ]} />
                                {activities.length > 0 ? activities.map((evt, i) => {
                                    const isIncoming = evt.to_address?.toLowerCase() === walletAddress?.toLowerCase();
                                    const counterparty = isIncoming ? evt.from_address : evt.to_address;
                                    const shortAddr = counterparty
                                        ? `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`
                                        : '—';
                                    const typeColors: Record<string, string> = {
                                        mint: theme.colors.brand.green,
                                        sale: theme.colors.brand.orange,
                                        list: theme.colors.brand.cyan,
                                        cancel: theme.colors.text.tertiary,
                                        transfer: theme.colors.brand.purple,
                                        offer: theme.colors.brand.gold,
                                        royalty_paid: '#22c55e',
                                    };
                                    const typeColor = typeColors[evt.event_type] ?? theme.colors.text.secondary;
                                    return (
                                        <motion.div
                                            key={evt.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            style={{
                                                display: 'flex',
                                                padding: '14px 16px',
                                                fontSize: '13px',
                                                alignItems: 'center',
                                                borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                            }}
                                        >
                                            <div style={{ width: '100px', flexShrink: 0 }}>
                                                <span style={{
                                                    padding: '3px 8px',
                                                    borderRadius: theme.radii.full,
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: typeColor,
                                                    background: `${typeColor}14`,
                                                    textTransform: 'capitalize',
                                                }}>
                                                    {evt.event_type.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Link
                                                    to={`/nft/${evt.collection_address}/${evt.token_id}`}
                                                    style={{ textDecoration: 'none', color: theme.colors.text.primary, fontWeight: 600 }}
                                                >
                                                    #{evt.token_id}
                                                </Link>
                                                <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                                                    {evt.collection_address.slice(0, 8)}...
                                                </div>
                                            </div>
                                            <span style={{
                                                width: '100px',
                                                textAlign: 'right',
                                                fontFamily: theme.fonts.mono,
                                                fontWeight: 600,
                                                fontVariantNumeric: 'tabular-nums',
                                                color: evt.price ? theme.colors.text.primary : theme.colors.text.tertiary,
                                            }}>
                                                {evt.price ? `${(Number(evt.price) / 1e8).toFixed(4)}` : '—'}
                                            </span>
                                            <span style={{
                                                width: '120px',
                                                textAlign: 'right',
                                                fontFamily: theme.fonts.mono,
                                                fontSize: '11px',
                                                color: theme.colors.text.secondary,
                                            }}>
                                                {shortAddr}
                                            </span>
                                            <span style={{
                                                width: '90px',
                                                textAlign: 'right',
                                                color: theme.colors.text.tertiary,
                                                fontSize: '12px',
                                                fontFamily: theme.fonts.mono,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {evt.block_number.toLocaleString()}
                                            </span>
                                        </motion.div>
                                    );
                                }) : (
                                    <EmptyTabState icon={'📋'} message="No activity yet. Mint, list, or trade NFTs to see your history." />
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Royalties */}
                    {activeTab === 'royalties' && (
                        <motion.div key="royalties" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            {/* Royalty summary */}
                            <div style={{
                                padding: theme.spacing.lg,
                                background: theme.colors.bg.card,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                borderRadius: theme.radii.lg,
                                marginBottom: theme.spacing.lg,
                            }}>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr 1fr',
                                    gap: theme.spacing.md,
                                }}>
                                    <div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: theme.colors.text.tertiary,
                                            textTransform: 'uppercase',
                                            letterSpacing: theme.letterSpacing.wider,
                                            marginBottom: '6px',
                                            fontWeight: 600,
                                        }}>
                                            Total Earned
                                        </div>
                                        <div style={{
                                            fontFamily: theme.fonts.heading,
                                            fontSize: '24px',
                                            fontWeight: 700,
                                            color: theme.colors.brand.green,
                                        }}>
                                            {(Number(totalRoyaltiesSats) / 1e8).toFixed(4)} <span style={{ fontSize: '13px', color: theme.colors.text.secondary }}>BTC</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: theme.colors.text.tertiary,
                                            textTransform: 'uppercase',
                                            letterSpacing: theme.letterSpacing.wider,
                                            marginBottom: '6px',
                                            fontWeight: 600,
                                        }}>
                                            Payments
                                        </div>
                                        <div style={{
                                            fontFamily: theme.fonts.heading,
                                            fontSize: '24px',
                                            fontWeight: 700,
                                        }}>
                                            {royalties.length}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: theme.colors.text.tertiary,
                                            textTransform: 'uppercase',
                                            letterSpacing: theme.letterSpacing.wider,
                                            marginBottom: '6px',
                                            fontWeight: 600,
                                        }}>
                                            Enforcement
                                        </div>
                                        <div style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: theme.colors.brand.green,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                            </svg>
                                            On-chain
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Royalty payment history */}
                            <div style={{
                                background: theme.colors.bg.card,
                                borderRadius: theme.radii.lg,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                overflow: 'hidden',
                            }}>
                                <TableHeader columns={[
                                    { label: 'Collection' },
                                    { label: 'Token', width: '80px' },
                                    { label: 'Amount', width: '110px', align: 'right' },
                                    { label: 'Block', width: '90px', align: 'right' },
                                ]} />
                                {royalties.length > 0 ? royalties.map((r, i) => (
                                    <motion.div
                                        key={r.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        style={{
                                            display: 'flex',
                                            padding: '14px 16px',
                                            fontSize: '13px',
                                            alignItems: 'center',
                                            borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <Link
                                                to={`/collection/${r.collection_address}`}
                                                style={{ textDecoration: 'none', color: theme.colors.brand.orange, fontWeight: 500, fontSize: '12px' }}
                                            >
                                                {r.collection_address.slice(0, 10)}...{r.collection_address.slice(-4)}
                                            </Link>
                                        </div>
                                        <span style={{ width: '80px', fontFamily: theme.fonts.mono, fontWeight: 600 }}>
                                            #{r.token_id}
                                        </span>
                                        <span style={{
                                            width: '110px',
                                            textAlign: 'right',
                                            fontFamily: theme.fonts.mono,
                                            fontWeight: 600,
                                            color: theme.colors.brand.green,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            +{r.price ? (Number(r.price) / 1e8).toFixed(4) : '0'} BTC
                                        </span>
                                        <span style={{
                                            width: '90px',
                                            textAlign: 'right',
                                            color: theme.colors.text.tertiary,
                                            fontSize: '12px',
                                            fontFamily: theme.fonts.mono,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {r.block_number.toLocaleString()}
                                        </span>
                                    </motion.div>
                                )) : (
                                    <div style={{
                                        padding: '40px 16px',
                                        textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.3 }}>{'💎'}</div>
                                        <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                                            No royalty payments yet
                                        </div>
                                        <div style={{ color: theme.colors.text.tertiary, fontSize: '13px' }}>
                                            Royalties are enforced on-chain for every NFT sale. Payments will appear here as they occur.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
