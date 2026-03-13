import { useState, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { theme } from '@/styles/theme';
import { Button } from '@/components/common/Button';
import { StatCard } from '@/components/common/StatCard';
import { TabBar } from '@/components/common/TabBar';
import { BlockCountdown } from '@/components/common/FlipCountdown';
import { NFTImage } from '@/components/common/NFTImage';
import { useNetwork } from '@/hooks/useNetwork';
import { useBlockNumber } from '@/hooks/useBlockNumber';
import { useAuctionStats, useAllAuctions } from '@/hooks/useAuctions';
import { useAuctionActions } from '@/hooks/useAuctionActions';
import { IndexerAPI } from '@/services/IndexerAPI';
import { ANTI_SNIPE_BLOCKS } from '@/config/constants';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AuctionType = 'english' | 'dutch';

interface BidEntry {
    readonly bidder: string;
    readonly amount: number;
    readonly block: number;
    readonly isAntiSnipe: boolean;
}

interface Auction {
    readonly id: string;
    readonly name: string;
    readonly collection: string;
    readonly collectionSlug: string;
    readonly tokenId: number;
    readonly type: AuctionType;
    readonly startBlock: number;
    readonly endBlock: number;
    readonly startPrice: number;
    readonly currentBid: number;
    readonly reservePrice: number;
    readonly reserveMet: boolean;
    readonly bidCount: number;
    readonly bids: readonly BidEntry[];
    readonly seller: string;
    readonly sellerFull: string;
    readonly antiSnipeBlocks: number;
    readonly antiSnipeExtension: number;
    readonly wasExtended: boolean;
    readonly dutchStartPrice: number | null;
    readonly dutchEndPrice: number | null;
    readonly dutchDecayPerBlock: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortenAddr(addr: string): string {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

/**
 * Hook to fetch collection info from the indexer for an auction card.
 * Returns name, icon, base_uri. Cached 5 minutes.
 */
function useAuctionCollectionInfo(collectionAddress: string | undefined) {
    return useQuery({
        queryKey: ['auction-collection-info', collectionAddress],
        queryFn: async () => {
            const res = await IndexerAPI.collection(collectionAddress!);
            return res.data;
        },
        enabled: !!collectionAddress,
        staleTime: 5 * 60_000,
    });
}

function getDutchPrice(auction: Auction, block: number): number {
    if (auction.dutchStartPrice === null || auction.dutchEndPrice === null || auction.dutchDecayPerBlock === null) return 0;
    const elapsed = Math.max(0, block - auction.startBlock);
    const decay = elapsed * auction.dutchDecayPerBlock;
    return Math.max(auction.dutchEndPrice, auction.dutchStartPrice - decay);
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function BidHistory({ bids }: { readonly bids: readonly BidEntry[] }): JSX.Element {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {bids.map((bid, i) => (
                <motion.div
                    key={`${bid.bidder}-${bid.block}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 100px 30px',
                        padding: '10px 14px',
                        background: i % 2 === 0 ? theme.colors.bg.raised : 'transparent',
                        fontSize: '13px',
                        alignItems: 'center',
                    }}
                >
                    <span style={{
                        fontFamily: theme.fonts.mono, fontSize: '12px',
                        color: i === 0 ? theme.colors.brand.green : theme.colors.text.secondary,
                        fontWeight: i === 0 ? 600 : 400, display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        {bid.bidder}
                        {i === 0 && (
                            <span style={{
                                padding: '1px 6px', borderRadius: theme.radii.sm,
                                background: 'rgba(20,241,149,0.1)', fontSize: '9px',
                                color: theme.colors.brand.green, fontWeight: 700,
                            }}>WINNING</span>
                        )}
                    </span>
                    <span style={{
                        fontFamily: theme.fonts.mono, fontWeight: 600, textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: i === 0 ? theme.colors.text.primary : theme.colors.text.secondary,
                    }}>
                        {bid.amount} BTC
                    </span>
                    <span style={{
                        textAlign: 'right', fontFamily: theme.fonts.mono, fontSize: '11px',
                        color: theme.colors.text.tertiary, fontVariantNumeric: 'tabular-nums',
                    }}>
                        Blk {bid.block.toLocaleString()}
                    </span>
                    <span style={{
                        textAlign: 'center', fontSize: '10px',
                        color: bid.isAntiSnipe ? theme.colors.brand.gold : 'transparent', fontWeight: 700,
                    }}>
                        {bid.isAntiSnipe ? 'AS' : ''}
                    </span>
                </motion.div>
            ))}
        </div>
    );
}

function DutchAuctionCard({ auction, index, currentBlock, onBuy }: { readonly auction: Auction; readonly index: number; readonly currentBlock: number; readonly onBuy?: (auctionId: bigint, price: bigint) => Promise<unknown> }): JSX.Element {
    const currentPrice = getDutchPrice(auction, currentBlock);
    const remaining = Math.max(0, auction.endBlock - currentBlock);
    const progress = Math.min(100, ((currentBlock - auction.startBlock) / (auction.endBlock - auction.startBlock)) * 100);
    const [buyError, setBuyError] = useState<string | null>(null);
    const [isBuying, setIsBuying] = useState(false);
    const { data: collectionInfo } = useAuctionCollectionInfo(auction.collectionSlug);
    const collectionName = collectionInfo?.name || shortenAddr(auction.collectionSlug);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
            <div style={{
                background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.subtle}`,
                borderRadius: theme.radii.xl, overflow: 'hidden',
            }}>
                {/* NFT Image */}
                <div style={{ position: 'relative' }}>
                    <NFTImage
                        baseUri={collectionInfo?.base_uri ?? ''}
                        tokenId={auction.tokenId}
                        index={index}
                        aspectRatio="16/9"
                        style={{ borderRadius: 0 }}
                    />
                    <div style={{
                        position: 'absolute', top: '10px', right: '10px', padding: '4px 10px',
                        borderRadius: theme.radii.full, background: 'rgba(153,69,255,0.15)',
                        border: '1px solid rgba(153,69,255,0.3)', fontSize: '10px', fontWeight: 700,
                        color: theme.colors.brand.purple, letterSpacing: '0.04em',
                        backdropFilter: 'blur(8px)',
                    }}>DUTCH</div>
                </div>

                <div style={{ padding: '20px' }}>
                    <Link to={`/collection/${auction.collectionSlug}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontSize: '12px', color: theme.colors.brand.purple, fontWeight: 500, cursor: 'pointer' }}>
                            {collectionName}
                        </div>
                    </Link>
                    <Link to={`/nft/${auction.collectionSlug}/${auction.tokenId}`} style={{ textDecoration: 'none' }}>
                        <h3 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, marginTop: '4px', marginBottom: theme.spacing.md, color: theme.colors.text.primary, cursor: 'pointer' }}>
                            {collectionName} #{auction.tokenId}
                        </h3>
                    </Link>

                    <div style={{
                        padding: '14px', background: theme.colors.bg.overlay, borderRadius: theme.radii.md,
                        border: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                                Start: {auction.dutchStartPrice?.toFixed(4)} BTC
                            </span>
                            <span style={{ fontSize: '11px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                                Floor: {auction.dutchEndPrice?.toFixed(4)} BTC
                            </span>
                        </div>
                        <div style={{
                            fontFamily: theme.fonts.heading, fontSize: '24px', fontWeight: 700,
                            color: theme.colors.brand.purple, textAlign: 'center', marginBottom: '10px',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {currentPrice.toFixed(4)} BTC
                        </div>
                        <div style={{ height: '4px', background: theme.colors.bg.interactive, borderRadius: '2px', overflow: 'hidden' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8 }}
                                style={{ height: '100%', background: `linear-gradient(90deg, ${theme.colors.brand.purple}, ${theme.colors.brand.cyan})`, borderRadius: '2px' }}
                            />
                        </div>
                    </div>

                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: theme.spacing.md, paddingTop: theme.spacing.md,
                        borderTop: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <BlockCountdown blocksRemaining={remaining} />
                        <Button
                            size="md"
                            loading={isBuying}
                            disabled={isBuying}
                            onClick={async () => {
                                setBuyError(null);
                                setIsBuying(true);
                                try {
                                    await onBuy?.(BigInt(auction.id), BigInt(Math.round(currentPrice * 1e8)));
                                } catch (err) {
                                    console.error('[FORGE][dutch-buy] Error:', err);
                                    setBuyError(err instanceof Error ? err.message : String(err));
                                } finally {
                                    setIsBuying(false);
                                }
                            }}
                        >
                            Buy at {currentPrice.toFixed(4)}
                        </Button>
                    </div>
                    {buyError && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px 12px',
                            borderRadius: theme.radii.sm,
                            background: 'rgba(255,59,48,0.06)',
                            border: '1px solid rgba(255,59,48,0.15)',
                            fontSize: '12px',
                            color: theme.colors.status.error,
                        }}>
                            {buyError}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function EnglishAuctionCard({ auction, index, currentBlock, onBid }: { readonly auction: Auction; readonly index: number; readonly currentBlock: number; readonly onBid?: (auctionId: bigint, amount: bigint) => Promise<unknown> }): JSX.Element {
    const [bidAmount, setBidAmount] = useState('');
    const [bidError, setBidError] = useState<string | null>(null);
    const [isBidding, setIsBidding] = useState(false);
    const remaining = Math.max(0, auction.endBlock - currentBlock);
    const isNearEnd = remaining <= auction.antiSnipeBlocks && remaining > 0;
    // Contract rule: first bid must be >= startPrice; subsequent bids >= highestBid * 1.05
    const minBid = auction.currentBid > 0
        ? auction.currentBid * 1.05
        : Math.max(auction.startPrice, 0.0001);
    const { data: collectionInfo } = useAuctionCollectionInfo(auction.collectionSlug);
    const collectionName = collectionInfo?.name || shortenAddr(auction.collectionSlug);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
            <div style={{
                background: theme.colors.bg.card,
                border: `1px solid ${isNearEnd ? 'rgba(255,107,0,0.2)' : theme.colors.border.subtle}`,
                borderRadius: theme.radii.xl, overflow: 'hidden',
                boxShadow: isNearEnd ? '0 0 24px rgba(255,107,0,0.06)' : 'none',
            }}>
                {/* NFT Image */}
                <div style={{ position: 'relative' }}>
                    <NFTImage
                        baseUri={collectionInfo?.base_uri ?? ''}
                        tokenId={auction.tokenId}
                        index={index}
                        aspectRatio="16/9"
                        style={{ borderRadius: 0 }}
                    />
                    {auction.wasExtended && (
                        <motion.div
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                position: 'absolute', top: '10px', left: '10px', padding: '4px 10px',
                                borderRadius: theme.radii.full, background: 'rgba(245,158,11,0.15)',
                                border: '1px solid rgba(245,158,11,0.3)', fontSize: '10px', fontWeight: 700,
                                color: theme.colors.brand.gold, letterSpacing: '0.04em',
                                backdropFilter: 'blur(8px)',
                            }}
                        >ANTI-SNIPE EXTENDED</motion.div>
                    )}
                    <div style={{
                        position: 'absolute', top: '10px', right: '10px', padding: '4px 10px',
                        borderRadius: theme.radii.full,
                        background: auction.reserveMet ? 'rgba(20,241,149,0.15)' : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${auction.reserveMet ? 'rgba(20,241,149,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
                        color: auction.reserveMet ? theme.colors.brand.green : theme.colors.status.error,
                        backdropFilter: 'blur(8px)',
                    }}>
                        {auction.reserveMet ? 'RESERVE MET' : 'RESERVE NOT MET'}
                    </div>
                </div>

                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <Link to={`/collection/${auction.collectionSlug}`} style={{ textDecoration: 'none' }}>
                                <div style={{ fontSize: '12px', color: theme.colors.brand.orange, fontWeight: 500, cursor: 'pointer' }}>
                                    {collectionName}
                                </div>
                            </Link>
                            <Link to={`/nft/${auction.collectionSlug}/${auction.tokenId}`} style={{ textDecoration: 'none' }}>
                                <h3 style={{ fontFamily: theme.fonts.heading, fontSize: '18px', fontWeight: 700, marginTop: '4px', color: theme.colors.text.primary, cursor: 'pointer' }}>
                                    {collectionName} #{auction.tokenId}
                                </h3>
                            </Link>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '12px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                            {auction.bidCount} bids
                        </div>
                    </div>

                    <div style={{
                        marginTop: theme.spacing.md, padding: '14px', background: theme.colors.bg.overlay,
                        borderRadius: theme.radii.md, border: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                            <div>
                                <div style={{ fontSize: '10px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: theme.letterSpacing.wider, fontWeight: 600 }}>
                                    {auction.currentBid > 0 ? 'Current Bid' : 'Starting Price'}
                                </div>
                                <div style={{ fontFamily: theme.fonts.heading, fontSize: '24px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {auction.currentBid > 0 ? auction.currentBid.toFixed(4) : auction.startPrice.toFixed(4)} <span style={{ fontSize: '12px', color: theme.colors.text.secondary }}>BTC</span>
                                </div>
                            </div>
                            <BlockCountdown blocksRemaining={remaining} />
                        </div>
                    </div>

                    {remaining > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
                            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                                <input
                                    type="number" placeholder={`Min: ${minBid.toFixed(4)} BTC`} value={bidAmount}
                                    onChange={(e) => { setBidAmount(e.target.value); setBidError(null); }} step={0.0001}
                                    style={{
                                        flex: 1, padding: '10px 14px', background: theme.colors.bg.base,
                                        border: `1px solid ${bidError ? 'rgba(255,59,48,0.4)' : theme.colors.border.subtle}`, borderRadius: theme.radii.md,
                                        color: theme.colors.text.primary, fontFamily: theme.fonts.mono, fontSize: '14px',
                                        outline: 'none', fontVariantNumeric: 'tabular-nums',
                                    }}
                                />
                                <Button
                                    disabled={!bidAmount || parseFloat(bidAmount) < minBid || isBidding}
                                    loading={isBidding}
                                    onClick={async () => {
                                        setBidError(null);
                                        setIsBidding(true);
                                        try {
                                            const auctionId = BigInt(auction.id);
                                            const amountSats = BigInt(Math.round(parseFloat(bidAmount) * 1e8));
                                            await onBid?.(auctionId, amountSats);
                                            setBidAmount('');
                                        } catch (err) {
                                            console.error('[FORGE][bid] Error:', err);
                                            setBidError(err instanceof Error ? err.message : String(err));
                                        } finally {
                                            setIsBidding(false);
                                        }
                                    }}
                                >
                                    Place Bid
                                </Button>
                            </div>
                            {bidError && (
                                <div style={{
                                    padding: '8px 12px',
                                    borderRadius: theme.radii.sm,
                                    background: 'rgba(255,59,48,0.06)',
                                    border: '1px solid rgba(255,59,48,0.15)',
                                    fontSize: '12px',
                                    color: theme.colors.status.error,
                                }}>
                                    {bidError}
                                </div>
                            )}
                        </div>
                    )}

                    {isNearEnd && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            style={{
                                marginTop: theme.spacing.sm, padding: '10px 12px',
                                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                                borderRadius: theme.radii.sm, fontSize: '12px', color: theme.colors.brand.gold,
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}
                        >
                            <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ fontSize: '14px' }}>⚠</motion.span>
                            Bids placed now extend the auction by {auction.antiSnipeExtension} blocks
                        </motion.div>
                    )}

                    {auction.bids.length > 0 && (
                        <div style={{ marginTop: theme.spacing.md }}>
                            <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: theme.letterSpacing.wider, marginBottom: '8px', fontWeight: 600 }}>
                                Recent Bids
                            </div>
                            <div style={{ background: theme.colors.bg.card, borderRadius: theme.radii.md, border: `1px solid ${theme.colors.border.subtle}`, overflow: 'hidden' }}>
                                <BidHistory bids={auction.bids.slice(0, 3)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function AuctionPage(): JSX.Element {
    const { network } = useNetwork();
    const navigate = useNavigate();
    const { address: walletAddr } = useWalletConnect();
    const { data: auctionStats } = useAuctionStats(network);
    const { data: realAuctions } = useAllAuctions(network);
    const { blockNumber: currentBlock } = useBlockNumber({ network });

    // F-H2: Wire auction action buttons
    const auctionActions = useAuctionActions({ network });

    const [activeTab, setActiveTab] = useState('english');

    // Use real block number when available, fallback to 0 (loading)
    const simulatedBlock = currentBlock ? Number(currentBlock) : 0;

    // Fetch bids for each active auction in parallel
    const bidQueries = useQueries({
        queries: (realAuctions ?? []).map((a) => ({
            queryKey: ['auction-bids', a.id.toString()],
            queryFn: async () => {
                const res = await IndexerAPI.auctionBids(Number(a.id), { limit: 10 });
                return { auctionId: a.id.toString(), bids: res.data };
            },
            staleTime: 30_000,
            enabled: Number(a.bidCount) > 0,
        })),
    });

    // Build a map of auctionId → BidEntry[] from resolved queries
    const bidsMap = useMemo(() => {
        const map = new Map<string, BidEntry[]>();
        for (const q of bidQueries) {
            if (q.data) {
                map.set(
                    q.data.auctionId,
                    q.data.bids.map((b) => ({
                        bidder: `${b.bidder.slice(0, 8)}...${b.bidder.slice(-4)}`,
                        amount: Number(BigInt(b.amount)) / 1e8,
                        block: b.block_number,
                        isAntiSnipe: false, // Would need original vs extended endBlock to determine
                    })),
                );
            }
        }
        return map;
    }, [bidQueries]);

    // Map real auctions to the page's Auction shape, or empty array
    const auctionList: Auction[] = (realAuctions ?? []).map((a) => {
        const startPrice = Number(a.startPrice) / 1e8;
        const endPrice = Number(a.endPrice) / 1e8;
        const totalBlocks = Math.max(1, Number(a.endBlock) - Number(a.startBlock));
        const isDutch = a.auctionType === 1n;

        return {
            id: a.id.toString(),
            name: `Auction #${a.id.toString()}`,
            collection: `${String(a.collection).slice(0, 6)}...${String(a.collection).slice(-4)}`,
            collectionSlug: String(a.collection),
            tokenId: Number(a.tokenId),
            type: isDutch ? 'dutch' as const : 'english' as const,
            startBlock: Number(a.startBlock),
            endBlock: Number(a.endBlock),
            startPrice,
            currentBid: Number(a.highestBid) / 1e8,
            reservePrice: Number(a.reservePrice) / 1e8,
            reserveMet: a.highestBid >= a.reservePrice,
            bidCount: Number(a.bidCount),
            bids: bidsMap.get(a.id.toString()) ?? [],
            seller: a.seller ? `${a.seller.slice(0, 8)}...${a.seller.slice(-4)}` : '',
            sellerFull: a.seller ? String(a.seller) : '',
            antiSnipeBlocks: ANTI_SNIPE_BLOCKS,
            antiSnipeExtension: ANTI_SNIPE_BLOCKS,
            wasExtended: false, // TODO: track in indexer when anti-snipe extends an auction
            dutchStartPrice: isDutch ? startPrice : null,
            dutchEndPrice: isDutch ? endPrice : null,
            dutchDecayPerBlock: isDutch ? (startPrice - endPrice) / totalBlocks : null,
        };
    });

    const englishAuctions = auctionList.filter((a) => a.type === 'english');
    const dutchAuctions = auctionList.filter((a) => a.type === 'dutch');

    const TABS = [
        { id: 'english', label: 'English Auctions', count: englishAuctions.length },
        { id: 'dutch', label: 'Dutch Auctions', count: dutchAuctions.length },
    ];

    return (
        <div style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ marginBottom: theme.spacing.xl }}
            >
                <h1 style={{
                    fontFamily: theme.fonts.heading, fontSize: theme.fontSize['4xl'],
                    fontWeight: 700, letterSpacing: theme.letterSpacing.tighter, marginBottom: theme.spacing.xs,
                }}>Live Auctions</h1>
                <p style={{ fontSize: theme.fontSize.md, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
                    Bid on exclusive NFTs. Anti-snipe protection ensures fair endings.
                </p>
            </motion.div>

            {/* Create Auction CTA */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.35 }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    background: 'linear-gradient(135deg, rgba(255,107,0,0.06) 0%, rgba(153,69,255,0.06) 100%)',
                    border: `1px solid rgba(255, 107, 0, 0.15)`,
                    borderRadius: theme.radii.lg,
                    marginBottom: theme.spacing.xl,
                    gap: theme.spacing.md,
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <div style={{ fontWeight: 600, fontSize: theme.fontSize.base, color: theme.colors.text.primary, marginBottom: '4px' }}>
                        Want to auction your NFT?
                    </div>
                    <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>
                        Go to any NFT you own and click &quot;Create Auction&quot; to start an English or Dutch auction.
                    </div>
                </div>
                <Button
                    size="md"
                    onClick={() => {
                        if (walletAddr) {
                            navigate('/profile');
                        } else {
                            // If not connected, go to profile which will show connect prompt
                            navigate('/profile');
                        }
                    }}
                >
                    {walletAddr ? 'View My NFTs' : 'Connect Wallet'}
                </Button>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.35 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: theme.spacing.md, marginBottom: theme.spacing.xxl }}
            >
                <StatCard label="Current Block" value={simulatedBlock} decimals={0} icon="⛓" />
                <StatCard label="Total Auctions" value={auctionStats ? Number(auctionStats.totalAuctions) : 0} decimals={0} />
                <StatCard label="Total Settled" value={auctionStats ? Number(auctionStats.totalSettled) : 0} decimals={0} />
                <StatCard label="Total Volume" value={auctionStats ? Number(auctionStats.totalVolume) / 1e8 : 0} decimals={2} suffix="BTC" />
            </motion.div>

            <div style={{ marginBottom: theme.spacing.xl }}>
                <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} layoutId="auction-tab" />
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'english' && (
                    <motion.div key="english" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {englishAuctions.length === 0 ? (
                            <div style={{
                                padding: '64px 24px',
                                textAlign: 'center',
                                background: theme.colors.bg.card,
                                backdropFilter: 'blur(16px)',
                                border: `1px solid ${theme.colors.border.subtle}`,
                                borderRadius: theme.radii.lg,
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#9201;</div>
                                <p style={{ color: theme.colors.text.secondary, margin: 0, fontSize: theme.fontSize.base }}>
                                    No English auctions live right now.
                                </p>
                                <p style={{ color: theme.colors.text.tertiary, margin: '8px 0 0', fontSize: theme.fontSize.sm }}>
                                    Own an NFT? Go to its detail page and click &quot;Create Auction&quot; to start one.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(400px, 100%), 1fr))', gap: theme.spacing.lg }}>
                                {englishAuctions.map((auction, i) => (
                                    <EnglishAuctionCard key={auction.id} auction={auction} index={i} currentBlock={simulatedBlock} onBid={auctionActions.placeBid} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
                {activeTab === 'dutch' && (
                    <motion.div key="dutch" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {dutchAuctions.length === 0 ? (
                            <div style={{
                                padding: '64px 24px',
                                textAlign: 'center',
                                background: theme.colors.bg.card,
                                backdropFilter: 'blur(16px)',
                                border: `1px solid ${theme.colors.border.subtle}`,
                                borderRadius: theme.radii.lg,
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#128202;</div>
                                <p style={{ color: theme.colors.text.secondary, margin: 0, fontSize: theme.fontSize.base }}>
                                    No Dutch auctions live right now.
                                </p>
                                <p style={{ color: theme.colors.text.tertiary, margin: '8px 0 0', fontSize: theme.fontSize.sm }}>
                                    Dutch auctions start at a high price and decrease over time. Create one from any NFT you own.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(400px, 100%), 1fr))', gap: theme.spacing.lg }}>
                                {dutchAuctions.map((auction, i) => (
                                    <DutchAuctionCard key={auction.id} auction={auction} index={i} currentBlock={simulatedBlock} onBuy={auctionActions.buyDutchAuction} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
