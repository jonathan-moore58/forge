import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { TabBar } from '@/components/common/TabBar';
import { ListingModal } from '@/components/common/ListingModal';
import { CreateAuctionModal } from '@/components/common/CreateAuctionModal';
import { useNetwork } from '@/hooks/useNetwork';
import { useTokenMetadata, useOwnerOf, useCollectionMetadata } from '@/hooks/useCollectionData';
import { useListingForNFT, useListing } from '@/hooks/useMarketplace';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';
import { useBlockNumber } from '@/hooks/useBlockNumber';
import { IndexerAPI, type IndexerActivity, type IndexerOffer } from '@/services/IndexerAPI';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PricePoint {
    readonly block: number;
    readonly price: number;
}

type DetailTab = 'traits' | 'history' | 'offers';

/* ------------------------------------------------------------------ */
/*  Empty defaults (real data comes from hooks)                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Rarity helpers                                                     */
/* ------------------------------------------------------------------ */

function getRarityConfig(percentile: number) {
    if (percentile <= 1) return { tier: 'Legendary', color: '#ffaa00', bg: 'linear-gradient(135deg, rgba(255,170,0,0.15), rgba(255,85,0,0.15))', border: 'rgba(255,170,0,0.3)' };
    if (percentile <= 5) return { tier: 'Epic', color: '#aa66ff', bg: 'rgba(153,69,255,0.12)', border: 'rgba(153,69,255,0.25)' };
    if (percentile <= 15) return { tier: 'Rare', color: '#4499ff', bg: 'rgba(0,136,255,0.12)', border: 'rgba(0,136,255,0.25)' };
    return { tier: 'Common', color: theme.colors.text.secondary, bg: 'rgba(255,255,255,0.04)', border: theme.colors.border.subtle };
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function RarityBadge({ rank, total }: { readonly rank: number; readonly total: number }): JSX.Element {
    const pct = (rank / total) * 100;
    const config = getRarityConfig(pct);

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: theme.radii.full,
            background: config.bg,
            border: `1px solid ${config.border}`,
            backdropFilter: 'blur(8px)',
        }}>
            <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: config.color,
                fontFamily: theme.fonts.mono,
            }}>
                #{rank}
            </span>
            <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: config.color,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
            }}>
                {config.tier}
            </span>
        </div>
    );
}

function PriceHistoryChart({ data }: { readonly data: readonly PricePoint[] }): JSX.Element {
    if (data.length === 0) return <div />;

    const maxPrice = Math.max(...data.map((d) => d.price));
    const minPrice = Math.min(...data.map((d) => d.price));
    const priceRange = maxPrice - minPrice || 1;
    const blockMin = data[0]?.block ?? 0;
    const blockMax = data[data.length - 1]?.block ?? 1;
    const blockRange = blockMax - blockMin || 1;

    const points = data.map((d) => {
        const x = ((d.block - blockMin) / blockRange) * 100;
        const y = 100 - ((d.price - minPrice) / priceRange) * 80 - 10;
        return `${x},${y}`;
    }).join(' ');

    const areaPoints = `0,100 ${points} 100,100`;

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: theme.spacing.md,
            }}>
                <span style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: theme.colors.text.secondary,
                    textTransform: 'uppercase',
                    letterSpacing: theme.letterSpacing.wider,
                }}>
                    Price History
                </span>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <span style={{
                        fontSize: '12px',
                        color: theme.colors.brand.green,
                        fontWeight: 600,
                        fontFamily: theme.fonts.mono,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        +{(((maxPrice - minPrice) / minPrice) * 100).toFixed(0)}%
                    </span>
                    <span style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>all-time</span>
                </div>
            </div>
            <div style={{
                background: theme.colors.bg.raised,
                borderRadius: theme.radii.md,
                padding: '16px',
                border: `1px solid ${theme.colors.border.subtle}`,
            }}>
                <svg viewBox="0 0 100 100" style={{
                    width: '100%',
                    height: '160px',
                    overflow: 'visible',
                }}>
                    <defs>
                        <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.colors.brand.orange} stopOpacity={0.15} />
                            <stop offset="100%" stopColor={theme.colors.brand.orange} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[20, 40, 60, 80].map(y => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y}
                            stroke={theme.colors.border.subtle} strokeWidth="0.3" strokeDasharray="2 2" />
                    ))}
                    <polygon points={areaPoints} fill="url(#priceArea)" />
                    <polyline
                        points={points}
                        fill="none"
                        stroke={theme.colors.brand.orange}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {data.map((d, i) => {
                        const x = ((d.block - blockMin) / blockRange) * 100;
                        const y = 100 - ((d.price - minPrice) / priceRange) * 80 - 10;
                        return (
                            <g key={`${d.block}-${i}`}>
                                <circle cx={x} cy={y} r="3" fill={theme.colors.bg.base} stroke={theme.colors.brand.orange} strokeWidth="1.5" />
                                {i === data.length - 1 && (
                                    <circle cx={x} cy={y} r="5" fill="none" stroke={theme.colors.brand.orange} strokeWidth="0.5" opacity="0.5" />
                                )}
                            </g>
                        );
                    })}
                </svg>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: theme.colors.text.tertiary,
                    fontFamily: theme.fonts.mono,
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: '8px',
                }}>
                    <span>Block {blockMin.toLocaleString()}</span>
                    <span>Block {blockMax.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}

function MakeOfferModal({
    isOpen,
    onClose,
    nftName,
    nftCollectionName,
    nftListedPrice,
    onSubmitOffer,
}: {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly nftName?: string;
    readonly nftCollectionName?: string;
    readonly nftListedPrice?: number;
    readonly onSubmitOffer?: (priceBTC: number, expiryBlocks: number) => void;
}): JSX.Element | null {
    const [offerPrice, setOfferPrice] = useState('');
    const [expiryBlocks, setExpiryBlocks] = useState('144');

    if (!isOpen) return null;

    const offerNum = parseFloat(offerPrice) || 0;
    const royaltyFee = offerNum * 0.05;
    const platformFee = offerNum * 0.01;
    const total = offerNum + platformFee;

    const inputStyle = {
        width: '100%',
        padding: '12px 14px',
        background: theme.colors.bg.overlay,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radii.md,
        color: theme.colors.text.primary,
        fontFamily: theme.fonts.mono,
        fontSize: '16px',
        outline: 'none',
        boxSizing: 'border-box' as const,
        transition: `border-color ${theme.transitions.fast}`,
    };

    const labelStyle = {
        display: 'block' as const,
        fontSize: '11px',
        color: theme.colors.text.tertiary,
        marginBottom: '6px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        fontWeight: 600,
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: theme.zIndex.modal,
                backdropFilter: 'blur(12px)',
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '440px',
                    background: theme.colors.bg.raised,
                    borderRadius: theme.radii.xl,
                    border: `1px solid ${theme.colors.border.default}`,
                    padding: theme.spacing.xl,
                    boxShadow: theme.shadows.elevated,
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: theme.spacing.lg,
                }}>
                    <h3 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: '20px',
                        fontWeight: 700,
                    }}>
                        Make an Offer
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: theme.colors.text.tertiary,
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '4px',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* NFT preview */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: theme.colors.bg.overlay,
                    borderRadius: theme.radii.md,
                    marginBottom: theme.spacing.lg,
                }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: theme.radii.sm,
                        background: theme.gradients.orangeToCyan,
                        flexShrink: 0,
                    }} />
                    <div>
                        <div style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>
                            {nftCollectionName ?? 'Collection'}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>
                            {nftName ?? 'NFT'}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: theme.colors.text.tertiary }}>Listed</div>
                        <div style={{ fontFamily: theme.fonts.mono, fontWeight: 600, fontSize: '14px' }}>
                            {nftListedPrice ?? 0} BTC
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: theme.spacing.md }}>
                    <label style={labelStyle}>Offer Price (BTC)</label>
                    <input
                        type="number"
                        value={offerPrice}
                        onChange={(e) => setOfferPrice(e.target.value)}
                        placeholder="0.00"
                        step={0.01}
                        style={inputStyle}
                    />
                </div>

                <div style={{ marginBottom: theme.spacing.lg }}>
                    <label style={labelStyle}>Expiry</label>
                    <select
                        value={expiryBlocks}
                        onChange={(e) => setExpiryBlocks(e.target.value)}
                        style={{ ...inputStyle, fontFamily: theme.fonts.body, fontSize: '14px', cursor: 'pointer' }}
                    >
                        <option value="48">48 blocks (~8 hours)</option>
                        <option value="144">144 blocks (~1 day)</option>
                        <option value="288">288 blocks (~2 days)</option>
                        <option value="1008">1,008 blocks (~1 week)</option>
                    </select>
                </div>

                {/* Fee breakdown */}
                {offerNum > 0 && (
                    <div style={{
                        padding: '12px 14px',
                        background: theme.colors.bg.overlay,
                        borderRadius: theme.radii.md,
                        marginBottom: theme.spacing.lg,
                        fontSize: '13px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: theme.colors.text.tertiary }}>Offer amount</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                                {offerNum.toFixed(4)} BTC
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: theme.colors.text.tertiary }}>Royalty (5%)</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums', color: theme.colors.text.secondary }}>
                                {royaltyFee.toFixed(4)} BTC
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: theme.colors.text.tertiary }}>Platform fee (1%)</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums', color: theme.colors.text.secondary }}>
                                {platformFee.toFixed(4)} BTC
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            borderTop: `1px solid ${theme.colors.border.subtle}`,
                            fontWeight: 600,
                        }}>
                            <span>You pay</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                                {total.toFixed(4)} BTC
                            </span>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <Button variant="ghost" fullWidth onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        fullWidth
                        disabled={!offerPrice || parseFloat(offerPrice) <= 0}
                        onClick={() => {
                            if (onSubmitOffer && offerPrice) {
                                onSubmitOffer(parseFloat(offerPrice), parseInt(expiryBlocks));
                            }
                        }}
                    >
                        Submit Offer
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function NFTDetailPage(): JSX.Element {
    const { collection, tokenId } = useParams<{ collection: string; tokenId: string }>();
    const { network } = useNetwork();
    const tid = tokenId ? BigInt(tokenId) : undefined;

    /* ---- Real data hooks ---- */
    const { data: tokenMeta } = useTokenMetadata(network, collection, tid);
    const { data: ownerAddr } = useOwnerOf(network, collection, tid);
    const { data: collectionMeta } = useCollectionMetadata(network, collection);
    const { data: activeListingId } = useListingForNFT(network, collection, tid);
    const { data: activeListing } = useListing(network, activeListingId);
    const { blockNumber } = useBlockNumber({ network });
    const marketActions = useMarketplaceActions({ network });
    const { address: walletAddr } = useWalletConnect();

    /* ---- Owner detection ---- */
    const isOwner = !!(walletAddr && ownerAddr && String(walletAddr).toLowerCase() === String(ownerAddr).toLowerCase());
    // Verify the listing is active AND belongs to this specific token
    const isListed = !!activeListing && activeListing.status === 0n && activeListing.tokenId === tid;

    /* ---- Sale history from indexer ---- */
    const { data: saleHistory } = useQuery({
        queryKey: ['nftSaleHistory', network, collection, tokenId],
        queryFn: async () => {
            if (!collection) return [];
            const res = await IndexerAPI.activity({
                collection,
                type: 'sale',
                limit: 20,
            });
            // Filter to just this token
            return res.data.filter((a) => a.token_id === Number(tokenId));
        },
        enabled: !!collection && !!tokenId,
        staleTime: 30_000,
    });
    const sales: IndexerActivity[] = saleHistory ?? [];

    /* ---- Offers from indexer ---- */
    const { data: offersData } = useQuery({
        queryKey: ['nftOffers', network, collection, tokenId],
        queryFn: async () => {
            if (!collection || tokenId === undefined) return [];
            const res = await IndexerAPI.offers({
                collection,
                tokenId: Number(tokenId),
                status: 0, // Active offers only
            });
            return res.data;
        },
        enabled: !!collection && tokenId !== undefined,
        staleTime: 15_000,
    });
    const offers: IndexerOffer[] = offersData ?? [];

    /* ---- Price history for chart ---- */
    const priceHistory: PricePoint[] = useMemo(() =>
        sales.map((s) => ({
            block: s.block_number,
            price: s.price ? Number(s.price) / 1e8 : 0,
        })).reverse(), // Oldest first for chart
    [sales]);

    /* ---- Top offer ---- */
    const topOffer = useMemo(() => {
        if (offers.length === 0) return null;
        return offers.reduce((best, o) =>
            BigInt(o.price) > BigInt(best.price) ? o : best,
        );
    }, [offers]);

    /* ---- Modals ---- */
    const [showListingModal, setShowListingModal] = useState(false);
    const [showAuctionModal, setShowAuctionModal] = useState(false);

    /* ---- Computed NFT data — no mock fallbacks ---- */
    const lastSalePrice = sales.length > 0 && sales[0]?.price
        ? Number(sales[0].price) / 1e8
        : 0;
    const nft = {
        tokenId: tid !== undefined ? Number(tid) : 0,
        name: (tokenMeta?.name && tokenMeta.name !== 'Unrevealed')
            ? tokenMeta.name
            : (collectionMeta?.name ? `${collectionMeta.name} #${tokenId ?? '?'}` : `#${tokenId ?? '?'}`),
        collection: collectionMeta?.name ?? (collection ? `${collection.slice(0, 8)}...` : 'Unknown'),
        collectionSlug: collection ?? '',
        description: tokenMeta?.description ?? '',
        owner: ownerAddr ?? '—',
        price: activeListing ? Number(activeListing.price) / 1e8 : 0,
        lastSale: lastSalePrice,
        rarity: 0,
        rarityTotal: 0,
        mintBlock: 0,
    };
    const nftListingPrice = activeListing?.price;

    const [activeTab, setActiveTab] = useState<DetailTab>('traits');
    const [showOfferModal, setShowOfferModal] = useState(false);

    const rarityPct = (nft.rarity / nft.rarityTotal) * 100;
    const rarityConfig = getRarityConfig(rarityPct);
    // Price change computed for future use
    void ((nft.price - nft.lastSale) / nft.lastSale);

    const TABS = [
        { id: 'traits', label: 'Traits' },
        { id: 'history', label: 'Sale History', count: sales.length || undefined },
        { id: 'offers', label: 'Offers', count: offers.length || undefined },
    ];

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Breadcrumb */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: theme.spacing.lg,
                    fontSize: '13px',
                }}
            >
                <Link to="/marketplace" style={{ color: theme.colors.text.tertiary, textDecoration: 'none' }}>
                    Marketplace
                </Link>
                <span style={{ color: theme.colors.text.tertiary }}>/</span>
                <Link
                    to={`/collection/${collection ?? nft.collectionSlug}`}
                    style={{ color: theme.colors.brand.orange, textDecoration: 'none', fontWeight: 500 }}
                >
                    {nft.collection}
                </Link>
                <span style={{ color: theme.colors.text.tertiary }}>/</span>
                <span style={{ color: theme.colors.text.primary, fontFamily: theme.fonts.mono }}>
                    #{tokenId ?? nft.tokenId}
                </span>
            </motion.div>

            {/* Main Layout */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: theme.spacing.xxl,
            }}>
                {/* Left: Image + Chart */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div style={{
                        background: theme.colors.bg.card,
                        border: `1px solid ${theme.colors.border.subtle}`,
                        borderRadius: theme.radii.xl,
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            aspectRatio: '1',
                            background: `linear-gradient(135deg, rgba(255,107,0,0.12) 0%, rgba(153,69,255,0.08) 50%, rgba(0,212,255,0.06) 100%)`,
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                        }}>
                            {/* Rarity overlay */}
                            <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 2 }}>
                                <RarityBadge rank={nft.rarity} total={nft.rarityTotal} />
                            </div>
                            {/* NFT Image */}
                            {tokenMeta?.image ? (
                                <img
                                    src={tokenMeta.image}
                                    alt={nft.name}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        position: 'absolute',
                                        inset: 0,
                                    }}
                                />
                            ) : (
                                <div style={{
                                    fontFamily: theme.fonts.heading,
                                    fontSize: '80px',
                                    fontWeight: 700,
                                    opacity: 0.06,
                                    color: theme.colors.text.primary,
                                }}>
                                    #{nft.tokenId}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Price History */}
                    <div style={{ marginTop: theme.spacing.lg }}>
                        <PriceHistoryChart data={priceHistory} />
                    </div>
                </motion.div>

                {/* Right: Details */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Title & Collection */}
                    <div style={{ marginBottom: theme.spacing.lg }}>
                        <Link
                            to={`/collection/${collection ?? nft.collectionSlug}`}
                            style={{
                                fontSize: '14px',
                                color: theme.colors.brand.orange,
                                fontWeight: 500,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            {nft.collection}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={theme.colors.brand.cyan}>
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                            </svg>
                        </Link>
                        <h1 style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: theme.fontSize['3xl'],
                            fontWeight: 700,
                            letterSpacing: theme.letterSpacing.tight,
                            marginTop: '4px',
                            marginBottom: '12px',
                        }}>
                            {nft.name}
                        </h1>
                        <p style={{
                            fontSize: '15px',
                            color: theme.colors.text.secondary,
                            lineHeight: 1.6,
                            marginBottom: theme.spacing.md,
                        }}>
                            {nft.description}
                        </p>
                        <div style={{
                            display: 'flex',
                            gap: theme.spacing.xl,
                            fontSize: '13px',
                        }}>
                            <div>
                                <span style={{ color: theme.colors.text.tertiary }}>Owner </span>
                                <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.brand.cyan }}>
                                    {typeof nft.owner === 'string' ? nft.owner : '—'}
                                </span>
                            </div>
                            <div>
                                <span style={{ color: theme.colors.text.tertiary }}>Minted </span>
                                <span style={{ fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
                                    Block {nft.mintBlock.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Price + Actions */}
                    <div style={{
                        padding: theme.spacing.lg,
                        background: theme.colors.bg.card,
                        border: `1px solid ${isOwner ? 'rgba(255,107,0,0.2)' : 'rgba(255,107,0,0.15)'}`,
                        borderRadius: theme.radii.xl,
                        marginBottom: theme.spacing.lg,
                        boxShadow: '0 0 24px rgba(255,107,0,0.06)',
                    }}>
                        {/* Owner badge */}
                        {isOwner && (
                            <div style={{
                                padding: '6px 12px',
                                background: 'rgba(255, 107, 0, 0.08)',
                                borderRadius: theme.radii.sm,
                                marginBottom: theme.spacing.md,
                                fontSize: '12px',
                                fontWeight: 600,
                                color: theme.colors.brand.orange,
                                textAlign: 'center',
                            }}>
                                You own this NFT
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: theme.spacing.md,
                        }}>
                            <div>
                                <div style={{
                                    fontSize: '11px',
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: theme.letterSpacing.wider,
                                    marginBottom: '4px',
                                    fontWeight: 600,
                                }}>
                                    {isListed ? 'Listed Price' : 'Current Price'}
                                </div>
                                <div style={{
                                    fontFamily: theme.fonts.heading,
                                    fontSize: '32px',
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {nft.price > 0 ? nft.price : '--'} <span style={{ fontSize: '16px', color: theme.colors.text.secondary }}>BTC</span>
                                </div>
                            </div>
                            {nft.lastSale > 0 && (
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: theme.colors.text.tertiary,
                                        marginBottom: '4px',
                                        fontWeight: 500,
                                    }}>
                                        Last Sale
                                    </div>
                                    <div style={{
                                        fontFamily: theme.fonts.mono,
                                        fontSize: '16px',
                                        fontWeight: 500,
                                        color: theme.colors.text.secondary,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {nft.lastSale} BTC
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions: Owner vs Buyer */}
                        {isOwner ? (
                            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                                {isListed ? (
                                    <>
                                        <Button
                                            variant="danger"
                                            size="lg"
                                            fullWidth
                                            loading={marketActions.isPending}
                                            onClick={async () => {
                                                if (activeListingId !== undefined) {
                                                    try {
                                                        await marketActions.cancelListing(activeListingId);
                                                    } catch (err) {
                                                        console.error('Cancel failed:', err);
                                                    }
                                                }
                                            }}
                                        >
                                            Cancel Listing
                                        </Button>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                                        <Button
                                            size="lg"
                                            fullWidth
                                            onClick={() => setShowListingModal(true)}
                                        >
                                            List for Sale
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="lg"
                                            fullWidth
                                            onClick={() => setShowAuctionModal(true)}
                                        >
                                            Create Auction
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : isListed ? (
                            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                                <Button
                                    size="lg"
                                    fullWidth
                                    disabled={marketActions.isPending || !nftListingPrice}
                                    onClick={async () => {
                                        if (activeListingId !== undefined && nftListingPrice) {
                                            try {
                                                await marketActions.buyNFT(activeListingId, nftListingPrice);
                                            } catch (err) {
                                                console.error('Buy failed:', err);
                                            }
                                        }
                                    }}
                                >
                                    {marketActions.isPending ? 'Processing...' : `Buy Now — ${nft.price} BTC`}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="lg"
                                    fullWidth
                                    onClick={() => setShowOfferModal(true)}
                                >
                                    Make Offer
                                </Button>
                            </div>
                        ) : (
                            <div style={{
                                padding: '12px',
                                textAlign: 'center',
                                color: theme.colors.text.tertiary,
                                fontSize: '14px',
                                fontWeight: 500,
                            }}>
                                Not listed for sale
                            </div>
                        )}

                        {/* Transaction error display */}
                        {marketActions.error && (
                            <div style={{
                                marginTop: theme.spacing.sm,
                                padding: '10px 14px',
                                background: 'rgba(255,60,60,0.08)',
                                border: `1px solid rgba(255,60,60,0.2)`,
                                borderRadius: theme.radii.md,
                                fontSize: '13px',
                                color: '#ff6b6b',
                                lineHeight: 1.5,
                            }}>
                                {marketActions.error}
                            </div>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: theme.spacing.sm,
                        marginBottom: theme.spacing.lg,
                    }}>
                        {[
                            { label: 'Rarity', value: nft.rarity > 0 ? `#${nft.rarity}` : '—', color: rarityConfig.color },
                            { label: 'Top Offer', value: topOffer ? `${(Number(topOffer.price) / 1e8).toFixed(4)}` : '—', color: topOffer ? theme.colors.brand.green : theme.colors.text.primary },
                            { label: 'Total Sales', value: String(sales.length), color: theme.colors.text.primary },
                        ].map((stat) => (
                            <div key={stat.label} style={{
                                padding: '14px 16px',
                                background: theme.colors.bg.card,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                borderRadius: theme.radii.lg,
                            }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginBottom: '4px',
                                    fontWeight: 600,
                                }}>
                                    {stat.label}
                                </div>
                                <div style={{
                                    fontFamily: theme.fonts.mono,
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: stat.color,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {stat.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ marginBottom: theme.spacing.lg }}>
                        <TabBar
                            tabs={TABS}
                            activeTab={activeTab}
                            onChange={(id) => setActiveTab(id as DetailTab)}
                            layoutId="nft-detail-tab"
                        />
                    </div>

                    {/* Tab Content */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'traits' && (
                            <motion.div
                                key="traits"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                style={{ textAlign: 'center', padding: theme.spacing.xl }}
                            >
                                <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>{'\uD83C\uDFA8'}</div>
                                <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500 }}>
                                    No trait data available
                                </div>
                                <div style={{ color: theme.colors.text.tertiary, fontSize: '13px', marginTop: '4px' }}>
                                    Trait metadata will be indexed from on-chain storage.
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'history' && (
                            <motion.div
                                key="history"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <GlassCard style={{ overflow: 'hidden' }}>
                                    {sales.length > 0 ? (
                                        <div>
                                            {/* Header */}
                                            <div style={{
                                                display: 'flex',
                                                padding: '10px 16px',
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                color: theme.colors.text.tertiary,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                            }}>
                                                <span style={{ flex: 1 }}>Event</span>
                                                <span style={{ width: '100px', textAlign: 'right' }}>Price</span>
                                                <span style={{ width: '110px', textAlign: 'right' }}>From</span>
                                                <span style={{ width: '110px', textAlign: 'right' }}>To</span>
                                                <span style={{ width: '90px', textAlign: 'right' }}>Block</span>
                                            </div>
                                            {/* Rows */}
                                            {sales.map((sale, i) => (
                                                <motion.div
                                                    key={sale.id}
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
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: theme.radii.full,
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            color: theme.colors.brand.orange,
                                                            background: 'rgba(255, 107, 0, 0.08)',
                                                            textTransform: 'capitalize',
                                                        }}>
                                                            Sale
                                                        </span>
                                                    </div>
                                                    <span style={{
                                                        width: '100px',
                                                        textAlign: 'right',
                                                        fontFamily: theme.fonts.mono,
                                                        fontWeight: 600,
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                        {sale.price ? `${(Number(sale.price) / 1e8).toFixed(4)}` : '—'}
                                                    </span>
                                                    <span style={{
                                                        width: '110px',
                                                        textAlign: 'right',
                                                        fontFamily: theme.fonts.mono,
                                                        fontSize: '11px',
                                                        color: theme.colors.text.secondary,
                                                    }}>
                                                        {sale.from_address ? `${sale.from_address.slice(0, 6)}...${sale.from_address.slice(-4)}` : '—'}
                                                    </span>
                                                    <span style={{
                                                        width: '110px',
                                                        textAlign: 'right',
                                                        fontFamily: theme.fonts.mono,
                                                        fontSize: '11px',
                                                        color: theme.colors.text.secondary,
                                                    }}>
                                                        {sale.to_address ? `${sale.to_address.slice(0, 6)}...${sale.to_address.slice(-4)}` : '—'}
                                                    </span>
                                                    <span style={{
                                                        width: '90px',
                                                        textAlign: 'right',
                                                        color: theme.colors.text.tertiary,
                                                        fontSize: '12px',
                                                        fontFamily: theme.fonts.mono,
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                        {sale.block_number.toLocaleString()}
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
                                            <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>{'📊'}</div>
                                            <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500 }}>
                                                No sale history yet
                                            </div>
                                            <div style={{ color: theme.colors.text.tertiary, fontSize: '13px', marginTop: '4px' }}>
                                                Sales will appear here once this NFT is traded on the marketplace.
                                            </div>
                                        </div>
                                    )}
                                </GlassCard>
                            </motion.div>
                        )}

                        {activeTab === 'offers' && (
                            <motion.div
                                key="offers"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <GlassCard style={{ overflow: 'hidden' }}>
                                    {offers.length > 0 ? (
                                        <div>
                                            {/* Header */}
                                            <div style={{
                                                display: 'flex',
                                                padding: '10px 16px',
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                color: theme.colors.text.tertiary,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                            }}>
                                                <span style={{ flex: 1 }}>From</span>
                                                <span style={{ width: '120px', textAlign: 'right' }}>Amount</span>
                                                <span style={{ width: '100px', textAlign: 'right' }}>Expiry</span>
                                                {isOwner && <span style={{ width: '100px' }} />}
                                            </div>
                                            {/* Offer rows — sorted by price descending */}
                                            {[...offers]
                                                .sort((a, b) => Number(BigInt(b.price) - BigInt(a.price)))
                                                .map((offer, i) => {
                                                    const isBest = topOffer && offer.offer_id === topOffer.offer_id;
                                                    return (
                                                        <motion.div
                                                            key={offer.offer_id}
                                                            initial={{ opacity: 0, x: -8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.04 }}
                                                            style={{
                                                                display: 'flex',
                                                                padding: '14px 16px',
                                                                fontSize: '13px',
                                                                alignItems: 'center',
                                                                borderTop: i > 0 ? `1px solid ${theme.colors.border.subtle}` : undefined,
                                                                background: isBest
                                                                    ? 'rgba(255, 107, 0, 0.04)'
                                                                    : i % 2 === 0
                                                                    ? 'transparent'
                                                                    : 'rgba(255,255,255,0.01)',
                                                            }}
                                                        >
                                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{
                                                                    fontFamily: theme.fonts.mono,
                                                                    fontSize: '12px',
                                                                    color: theme.colors.text.secondary,
                                                                }}>
                                                                    {offer.offerer.slice(0, 8)}...{offer.offerer.slice(-4)}
                                                                </span>
                                                                {isBest && (
                                                                    <span style={{
                                                                        padding: '2px 6px',
                                                                        borderRadius: theme.radii.full,
                                                                        fontSize: '9px',
                                                                        fontWeight: 700,
                                                                        color: theme.colors.brand.orange,
                                                                        background: 'rgba(255, 107, 0, 0.12)',
                                                                        textTransform: 'uppercase',
                                                                    }}>
                                                                        Best
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span style={{
                                                                width: '120px',
                                                                textAlign: 'right',
                                                                fontFamily: theme.fonts.mono,
                                                                fontWeight: 600,
                                                                fontVariantNumeric: 'tabular-nums',
                                                                color: isBest ? theme.colors.brand.orange : theme.colors.text.primary,
                                                            }}>
                                                                {(Number(offer.price) / 1e8).toFixed(4)} BTC
                                                            </span>
                                                            <span style={{
                                                                width: '100px',
                                                                textAlign: 'right',
                                                                fontFamily: theme.fonts.mono,
                                                                fontSize: '12px',
                                                                color: theme.colors.text.tertiary,
                                                                fontVariantNumeric: 'tabular-nums',
                                                            }}>
                                                                Blk {offer.expiry_block.toLocaleString()}
                                                            </span>
                                                            {isOwner && (
                                                                <div style={{ width: '100px', display: 'flex', justifyContent: 'flex-end' }}>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={async () => {
                                                                            try {
                                                                                await marketActions.acceptOffer(BigInt(offer.offer_id), BigInt(offer.token_id));
                                                                            } catch (err) {
                                                                                console.error('Accept offer failed:', err);
                                                                            }
                                                                        }}
                                                                    >
                                                                        Accept
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    );
                                                })}
                                        </div>
                                    ) : (
                                        <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
                                            <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>{'💎'}</div>
                                            <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500 }}>
                                                No offers yet
                                            </div>
                                            <div style={{ color: theme.colors.text.tertiary, fontSize: '13px', marginTop: '4px' }}>
                                                Be the first to make an offer on this NFT.
                                            </div>
                                        </div>
                                    )}
                                </GlassCard>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* Offer Modal */}
            <AnimatePresence>
                {showOfferModal && (
                    <MakeOfferModal
                        isOpen={showOfferModal}
                        onClose={() => setShowOfferModal(false)}
                        nftName={nft.name}
                        nftCollectionName={nft.collection}
                        nftListedPrice={nft.price}
                        onSubmitOffer={async (priceBTC, expiryBlocks) => {
                            if (!collection || tid === undefined) return;
                            try {
                                const priceSats = BigInt(Math.round(priceBTC * 1e8));
                                const currentBlock = blockNumber ?? 0n;
                                const expiry = currentBlock + BigInt(expiryBlocks);
                                await marketActions.makeOffer(
                                    collection,
                                    tid,
                                    priceSats,
                                    expiry,
                                );
                                setShowOfferModal(false);
                            } catch (err) {
                                console.error('Offer failed:', err);
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Listing Modal (owner only) */}
            {collection && tid !== undefined && (
                <ListingModal
                    open={showListingModal}
                    onClose={() => setShowListingModal(false)}
                    collectionAddress={collection}
                    tokenId={tid}
                    tokenName={nft.name}
                />
            )}

            {/* Auction Modal (owner only) */}
            {collection && tid !== undefined && (
                <CreateAuctionModal
                    open={showAuctionModal}
                    onClose={() => setShowAuctionModal(false)}
                    collectionAddress={collection}
                    tokenId={tid}
                    tokenName={nft.name}
                />
            )}
        </div>
    );
}
