import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { bech32m } from 'bech32';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { TabBar } from '@/components/common/TabBar';
import { FlashlightGrid } from '@/components/common/FlashlightGrid';
import { ListingModal } from '@/components/common/ListingModal';
import { NFTImage } from '@/components/common/NFTImage';
import { CollectionImage } from '@/components/common/CollectionImage';
import { useNetwork } from '@/hooks/useNetwork';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';
import { useCollectionActions } from '@/hooks/useCollectionActions';
import { IndexerAPI, type IndexerListing, type IndexerActivity, type IndexerOffer } from '@/services/IndexerAPI';
import { useCollectionStats } from '@/hooks/useMarketplace';
import { useTotalSupply } from '@/hooks/useCollectionData';
import { truncateAddress } from '@/utils/format';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CollectionNFT {
    readonly tokenId: number;
    readonly name: string;
    readonly owner: string;
    readonly listing: IndexerListing | null;
}

type TabId = 'items' | 'activity' | 'offers';

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_BANNER_GRADIENT = `linear-gradient(135deg, rgba(255,107,0,0.15) 0%, rgba(153,69,255,0.1) 50%, rgba(0,212,255,0.08) 100%)`;

/* ------------------------------------------------------------------ */
/*  Collection NFT Card (with trading actions)                         */
/* ------------------------------------------------------------------ */

function CollectionNFTCard({
    nft,
    index,
    isOwner,
    collectionAddress,
    isRegistered,
    baseUri,
    onListClick,
    onBuyClick,
    onCancelClick,
    buyPending,
    cancelPending,
}: {
    readonly nft: CollectionNFT;
    readonly index: number;
    readonly isOwner: boolean;
    readonly collectionAddress: string;
    readonly isRegistered: boolean;
    readonly baseUri: string;
    readonly onListClick: (tokenId: number) => void;
    readonly onBuyClick: (listing: IndexerListing) => void;
    readonly onCancelClick: (listingId: number) => void;
    readonly buyPending: boolean;
    readonly cancelPending: boolean;
}): JSX.Element {
    const [isHovered, setIsHovered] = useState(false);
    const isListed = nft.listing !== null;
    const priceDisplay = isListed ? (Number(nft.listing!.price) / 1e8) : null;

    // Determine action label and handler
    let actionLabel: string;
    let actionBg: string;
    let actionHandler: (() => void) | null = null;

    if (isOwner && isListed) {
        actionLabel = cancelPending ? 'Cancelling...' : 'Cancel Listing';
        actionBg = 'rgba(239, 68, 68, 0.8)';
        actionHandler = () => onCancelClick(nft.listing!.listing_id);
    } else if (isOwner && !isListed && isRegistered) {
        actionLabel = 'List for Sale';
        actionBg = theme.colors.brand.orange;
        actionHandler = () => onListClick(nft.tokenId);
    } else if (isOwner && !isListed && !isRegistered) {
        actionLabel = 'Not Tradeable';
        actionBg = theme.colors.bg.interactive;
        actionHandler = null;
    } else if (!isOwner && isListed) {
        actionLabel = buyPending ? 'Buying...' : 'Buy Now';
        actionBg = theme.colors.brand.orange;
        actionHandler = () => onBuyClick(nft.listing!);
    } else {
        actionLabel = 'View Details';
        actionBg = theme.colors.bg.interactive;
        actionHandler = null; // Link handles navigation
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.025, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
            <Link to={`/nft/${collectionAddress}/${nft.tokenId}`} style={{ textDecoration: 'none' }}>
                <div
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    style={{
                        background: theme.colors.bg.card,
                        border: `1px solid ${isHovered ? theme.colors.border.accent : isOwner ? 'rgba(255, 107, 0, 0.15)' : theme.colors.border.subtle}`,
                        borderRadius: theme.radii.lg,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: isHovered ? '0 8px 32px rgba(255,107,0,0.08)' : 'none',
                        transition: `all ${theme.transitions.fast}`,
                        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
                    }}
                >
                    {/* Image — 1:1 */}
                    <div style={{ position: 'relative', overflow: 'hidden' }}>
                    <NFTImage
                        baseUri={baseUri}
                        tokenId={nft.tokenId}
                        index={index}
                    />

                        {/* Owner badge */}
                        {isOwner && (
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                padding: '2px 7px',
                                borderRadius: theme.radii.full,
                                background: 'rgba(255, 107, 0, 0.15)',
                                border: '1px solid rgba(255, 107, 0, 0.3)',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: theme.colors.brand.orange,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                backdropFilter: 'blur(8px)',
                                zIndex: 3,
                            }}>
                                Owned
                            </div>
                        )}

                        {/* Listed badge */}
                        {isListed && (
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                padding: '2px 7px',
                                borderRadius: theme.radii.full,
                                background: 'rgba(20, 241, 149, 0.12)',
                                border: '1px solid rgba(20, 241, 149, 0.25)',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: theme.colors.brand.green,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                backdropFilter: 'blur(8px)',
                                zIndex: 3,
                            }}>
                                Listed
                            </div>
                        )}

                        {/* Quick-action overlay */}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                padding: '10px 12px',
                                background: 'linear-gradient(to top, rgba(10,10,15,0.95) 60%, transparent)',
                                display: 'flex',
                                justifyContent: 'center',
                                zIndex: 4,
                                transform: isHovered ? 'translateY(0)' : 'translateY(100%)',
                                transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                            onClick={actionHandler ? (e) => { e.preventDefault(); e.stopPropagation(); actionHandler!(); } : undefined}
                        >
                            <span style={{
                                padding: '6px 20px',
                                borderRadius: theme.radii.sm,
                                background: actionBg,
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                            }}>
                                {actionLabel}
                            </span>
                        </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '12px 14px' }}>
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: '13px',
                            fontWeight: 600,
                            marginBottom: '8px',
                            color: theme.colors.text.primary,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {nft.name}
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            paddingTop: '8px',
                            borderTop: `1px solid ${theme.colors.border.subtle}`,
                        }}>
                            <div>
                                <div style={{
                                    fontSize: '10px',
                                    color: theme.colors.text.tertiary,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginBottom: '2px',
                                    fontWeight: 500,
                                }}>
                                    {isListed ? 'Price' : 'Owner'}
                                </div>
                                <div style={{
                                    fontFamily: theme.fonts.mono,
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    fontVariantNumeric: 'tabular-nums',
                                    color: theme.colors.text.primary,
                                }}>
                                    {isListed
                                        ? `${priceDisplay! < 0.001 ? priceDisplay!.toFixed(8) : priceDisplay!.toFixed(4)} BTC`
                                        : `${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}`}
                                </div>
                            </div>
                            {isOwner && isListed && (
                                <div style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: theme.colors.brand.green,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}>
                                    Your Listing
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Edit Branding Modal                                                */
/* ------------------------------------------------------------------ */

function EditBrandingModal({
    open,
    onClose,
    currentIcon,
    currentBanner,
    currentDescription,
    currentWebsite,
    onSave,
    saving,
}: {
    readonly open: boolean;
    readonly onClose: () => void;
    readonly currentIcon: string;
    readonly currentBanner: string;
    readonly currentDescription: string;
    readonly currentWebsite: string;
    readonly onSave: (icon: string, banner: string, description: string, website: string) => void;
    readonly saving: boolean;
}): JSX.Element | null {
    const [icon, setIcon] = useState(currentIcon);
    const [banner, setBanner] = useState(currentBanner);
    const [description, setDescription] = useState(currentDescription);
    const [website, setWebsite] = useState(currentWebsite);

    if (!open) return null;

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 14px',
        background: theme.colors.bg.interactive,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radii.md,
        color: theme.colors.text.primary,
        fontSize: '13px',
        fontFamily: theme.fonts.mono,
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '12px',
        fontWeight: 600,
        color: theme.colors.text.secondary,
        marginBottom: '6px',
        display: 'block',
        letterSpacing: theme.letterSpacing.wider,
        textTransform: 'uppercase',
    };

    const canSave = icon.trim() && banner.trim() && description.trim() && website.trim();

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: theme.colors.bg.card,
                    border: `1px solid ${theme.colors.border.subtle}`,
                    borderRadius: theme.radii.xl,
                    padding: '28px',
                    width: '480px',
                    maxWidth: '95vw',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
                }}
            >
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: theme.fontSize.xl,
                        fontWeight: 700,
                        marginBottom: '4px',
                    }}>
                        Edit Collection Branding
                    </h3>
                    <p style={{
                        fontSize: '13px',
                        color: theme.colors.text.tertiary,
                        margin: 0,
                    }}>
                        Update your collection&apos;s icon, banner, description, and website on-chain.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>Icon URI</label>
                        <input
                            style={inputStyle}
                            value={icon}
                            onChange={(e) => setIcon(e.target.value)}
                            placeholder="ipfs://QmXyz... or https://..."
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Banner URI</label>
                        <input
                            style={inputStyle}
                            value={banner}
                            onChange={(e) => setBanner(e.target.value)}
                            placeholder="ipfs://QmXyz... or https://..."
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Description</label>
                        <textarea
                            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="A short description of your collection"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Website</label>
                        <input
                            style={inputStyle}
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://mycollection.com"
                        />
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: theme.spacing.sm,
                    marginTop: '24px',
                }}>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onSave(icon.trim(), banner.trim(), description.trim(), website.trim())}
                        disabled={!canSave || saving}
                    >
                        {saving ? 'Saving...' : 'Save On-Chain'}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Set Base URI Modal                                                 */
/* ------------------------------------------------------------------ */

function SetBaseURIModal({
    open,
    onClose,
    currentBaseUri,
    onSave,
    saving,
}: {
    readonly open: boolean;
    readonly onClose: () => void;
    readonly currentBaseUri: string;
    readonly onSave: (baseUri: string) => void;
    readonly saving: boolean;
}): JSX.Element | null {
    const [baseUri, setBaseUri] = useState(currentBaseUri);

    if (!open) return null;

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 14px',
        background: theme.colors.bg.interactive,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: theme.radii.md,
        color: theme.colors.text.primary,
        fontSize: '13px',
        fontFamily: theme.fonts.mono,
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '12px',
        fontWeight: 600,
        color: theme.colors.text.secondary,
        marginBottom: '6px',
        display: 'block',
        letterSpacing: theme.letterSpacing.wider,
        textTransform: 'uppercase',
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: theme.colors.bg.card,
                    border: `1px solid ${theme.colors.border.subtle}`,
                    borderRadius: theme.radii.xl,
                    padding: '28px',
                    width: '480px',
                    maxWidth: '95vw',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
                }}
            >
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: theme.fontSize.xl,
                        fontWeight: 700,
                        marginBottom: '4px',
                    }}>
                        Set Base URI
                    </h3>
                    <p style={{
                        fontSize: '13px',
                        color: theme.colors.text.tertiary,
                        margin: 0,
                        lineHeight: 1.5,
                    }}>
                        Set the base URI for token metadata. Each token&apos;s metadata will be fetched
                        from <code style={{ color: theme.colors.brand.orange, fontSize: '12px' }}>baseURI + tokenId + &quot;.json&quot;</code>.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>Base URI</label>
                        <input
                            style={inputStyle}
                            value={baseUri}
                            onChange={(e) => setBaseUri(e.target.value)}
                            placeholder="ipfs://QmXyz.../ or https://api.example.com/metadata/"
                        />
                        <p style={{
                            fontSize: '11px',
                            color: theme.colors.text.tertiary,
                            margin: '6px 0 0',
                            lineHeight: 1.4,
                        }}>
                            Must end with &quot;/&quot; so token URIs resolve correctly.
                            Example: <code style={{ fontSize: '11px' }}>ipfs://QmXyz.../</code>
                        </p>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: theme.spacing.sm,
                    marginTop: '24px',
                }}>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onSave(baseUri.trim())}
                        disabled={!baseUri.trim() || saving}
                    >
                        {saving ? 'Saving...' : 'Set On-Chain'}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function CollectionPage(): JSX.Element {
    const { address } = useParams<{ address: string }>();
    const { network } = useNetwork();
    const { walletAddress: rawWalletAddress, address: walletAddrObj } = useWalletConnect();
    const walletAddress = rawWalletAddress ? (typeof rawWalletAddress === 'string' ? rawWalletAddress : String(rawWalletAddress)).toLowerCase() : '';

    /* ---- Indexer data ---- */
    const { data: indexerCollection, isLoading } = useQuery({
        queryKey: ['collection', 'indexer', address],
        queryFn: () => IndexerAPI.collection(address!),
        enabled: !!address,
        staleTime: 15_000,
    });

    const { data: indexerTokens } = useQuery({
        queryKey: ['collection', 'tokens', address],
        queryFn: () => IndexerAPI.collectionTokens(address!, { limit: 200 }),
        enabled: !!address,
        staleTime: 15_000,
    });

    const { data: indexerListings, refetch: refetchListings } = useQuery({
        queryKey: ['collection', 'listings', address],
        queryFn: async () => {
            const res = await IndexerAPI.listings({ collection: address!, status: 0 });
            return res.data;
        },
        enabled: !!address,
        staleTime: 15_000,
    });

    const { data: collStats } = useCollectionStats(network, address);

    // Check if collection is registered on marketplace
    const { data: regStatus } = useQuery({
        queryKey: ['collection', 'regStatus', address],
        queryFn: async () => {
            const res = await IndexerAPI.registrationStatus(address!);
            return res.data;
        },
        enabled: !!address,
        staleTime: 15_000,
    });
    const isMarketplaceRegistered = regStatus?.registered ?? false;

    /* ---- Activity feed (real data from indexer, mock fallback) ---- */
    const { data: activityData } = useQuery({
        queryKey: ['collection', 'activity', address],
        queryFn: async () => {
            const res = await IndexerAPI.activity({ collection: address!, limit: 30 });
            return res.data;
        },
        enabled: !!address,
        staleTime: 15_000,
        refetchInterval: 30_000, // Poll every 30s for live updates
    });
    const activities: IndexerActivity[] = activityData ?? [];

    /* ---- Offers for this collection ---- */
    const { data: offersData } = useQuery({
        queryKey: ['collection', 'offers', address],
        queryFn: async () => {
            const res = await IndexerAPI.offers({ collection: address!, status: 0 });
            return res.data;
        },
        enabled: !!address,
        staleTime: 15_000,
    });
    const collectionOffers: IndexerOffer[] = offersData ?? [];

    /* ---- Marketplace actions ---- */
    const marketplace = useMarketplaceActions({
        network,
        onSuccess: () => { refetchListings(); },
    });

    /* ---- Collection owner actions ---- */
    const queryClient = useQueryClient();
    const collectionActions = useCollectionActions({
        collectionAddress: address ?? '',
        network,
        onSuccess: () => {
            // Invalidate collection data so the page refreshes with new metadata
            queryClient.invalidateQueries({ queryKey: ['collection', 'indexer', address] });
        },
    });

    /* ---- Listing modal state ---- */
    const [listingModalOpen, setListingModalOpen] = useState(false);
    const [listingTokenId, setListingTokenId] = useState<bigint>(0n);
    const [listingTokenName, setListingTokenName] = useState('');

    /* ---- Edit branding modal state ---- */
    const [brandingModalOpen, setBrandingModalOpen] = useState(false);

    /* ---- Set base URI modal state ---- */
    const [baseUriModalOpen, setBaseUriModalOpen] = useState(false);

    /* ---- On-chain totalSupply for real-time mint count ---- */
    const { data: onChainSupply } = useTotalSupply(network, address);

    /* ---- Computed values ---- */
    const col = indexerCollection?.data ?? null;
    const cName = col?.name ?? (isLoading ? 'Loading...' : 'Unknown Collection');
    // Prefer on-chain totalSupply (real-time) over indexer (delayed)
    const cSupply = onChainSupply !== undefined ? Number(onChainSupply) : (col?.total_supply ?? 0);
    const cMaxSupply = col?.max_supply ?? 0;
    const cFloorPrice = collStats ? Number(collStats.floorPrice) / 1e8 : 0;
    const cTotalVolume = collStats ? Number(collStats.volume) / 1e8 : 0;
    const cSalesCount = collStats ? Number(collStats.salesCount) : 0;
    const cRoyalty = col?.royalty_bps ? col.royalty_bps / 100 : 0;
    const cVerified = col?.verified === 1;
    const cBaseUri = col?.base_uri ?? '';
    const cIcon = col?.icon ?? '';
    const cBanner = col?.banner ?? '';
    const cDescription = col?.description ?? '';
    const cWebsite = col?.website ?? '';
    // Multi-strategy owner check — wallet may return hex or bech32m, DB stores bech32m
    const isCreator = useMemo(() => {
        if (!col?.creator) return false;
        const creatorLower = col.creator.toLowerCase();

        // Strategy 1: Direct string comparison (walletAddress is the string the wallet gives us)
        if (walletAddress && walletAddress === creatorLower) return true;

        // Strategy 2: Hex comparison (wallet Address object hex vs bech32m-decoded creator)
        if (walletAddrObj) {
            const walletHex = String(walletAddrObj).replace(/^0x/i, '').toLowerCase();
            let creatorHex = '';
            try {
                const decoded = bech32m.decode(col.creator, col.creator.length);
                const rawBytes = bech32m.fromWords(decoded.words.slice(1));
                creatorHex = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch {
                creatorHex = creatorLower;
            }
            if (walletHex === creatorHex) return true;
            // Suffix match — wallet is 32-byte (64 hex), creator might be 21-byte (42 hex)
            if (walletHex.length === 64 && creatorHex.length === 42 && walletHex.endsWith(creatorHex)) return true;
            if (creatorHex.length === 64 && walletHex.length === 42 && creatorHex.endsWith(walletHex)) return true;
        }

        return false;
    }, [col?.creator, walletAddress, walletAddrObj]);
    const salePhase = col?.sale_phase ?? 0;
    const phaseLabel = salePhase === 2 ? 'Public' : salePhase === 1 ? 'Whitelist' : salePhase === 3 ? 'Ended' : 'Inactive';

    const [activeTab, setActiveTab] = useState<TabId>('items');
    const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'token-id'>('token-id');
    const [itemsFilter, setItemsFilter] = useState<'all' | 'listed'>('listed');

    // Build listing map: tokenId → IndexerListing
    const listingMap = useMemo(() => {
        const map = new Map<number, IndexerListing>();
        for (const l of (indexerListings ?? [])) {
            map.set(l.token_id, l);
        }
        return map;
    }, [indexerListings]);

    // Map tokens with listing data
    const tokens = indexerTokens?.data ?? [];
    const nfts = useMemo((): readonly CollectionNFT[] => {
        return tokens.map((t) => ({
            tokenId: t.token_id,
            name: `${col?.symbol ?? 'NFT'} #${t.token_id}`,
            owner: t.owner,
            listing: listingMap.get(t.token_id) ?? null,
        }));
    }, [tokens, col?.symbol, listingMap]);

    // Count listed
    const listedCount = useMemo(() => nfts.filter(n => n.listing !== null).length, [nfts]);

    // Filter by items filter (listed only vs all items)
    const filteredNFTs = useMemo(() => {
        if (itemsFilter === 'listed') {
            return nfts.filter(n => n.listing !== null);
        }
        return [...nfts];
    }, [nfts, itemsFilter]);

    // Sort
    const sortedNFTs = useMemo(() => {
        const arr = [...filteredNFTs];
        switch (sortBy) {
            case 'price-asc':
                arr.sort((a, b) => {
                    const ap = a.listing ? Number(a.listing.price) : Infinity;
                    const bp = b.listing ? Number(b.listing.price) : Infinity;
                    return ap - bp;
                });
                break;
            case 'price-desc':
                arr.sort((a, b) => {
                    const ap = a.listing ? Number(a.listing.price) : -1;
                    const bp = b.listing ? Number(b.listing.price) : -1;
                    return bp - ap;
                });
                break;
            case 'token-id':
                arr.sort((a, b) => a.tokenId - b.tokenId);
                break;
        }
        return arr;
    }, [filteredNFTs, sortBy]);

    /* ---- Action handlers ---- */
    const handleListClick = useCallback((tokenId: number) => {
        const nft = nfts.find(n => n.tokenId === tokenId);
        setListingTokenId(BigInt(tokenId));
        setListingTokenName(nft?.name ?? `#${tokenId}`);
        setListingModalOpen(true);
    }, [nfts]);

    const handleBuyClick = useCallback(async (listing: IndexerListing) => {
        await marketplace.buyNFT(BigInt(listing.listing_id), BigInt(listing.price));
    }, [marketplace]);

    const handleCancelClick = useCallback(async (listingId: number) => {
        await marketplace.cancelListing(BigInt(listingId));
    }, [marketplace]);

    // Count how many NFTs the connected wallet owns in this collection
    const ownedCount = useMemo(
        () => nfts.filter(n => n.owner.toLowerCase() === walletAddress).length,
        [nfts, walletAddress],
    );

    const TABS = [
        { id: 'items', label: 'Items', count: cSupply || undefined },
        { id: 'activity', label: 'Activity', count: activities.length || undefined },
        { id: 'offers', label: 'Offers', count: collectionOffers.length || undefined },
    ];

    return (
        <div>
            {/* Banner + Avatar wrapper */}
            <div style={{ position: 'relative' }}>
                {/* Banner — blurred collection image background */}
                <div style={{
                    height: '320px',
                    background: DEFAULT_BANNER_GRADIENT,
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Collection banner → icon → token #1 as blurred banner background */}
                    {(cBanner || cIcon || cBaseUri) && (
                        <CollectionImage
                            uri={cBanner || cIcon}
                            baseUri={cBaseUri}
                            index={0}
                            aspectRatio="auto"
                            style={{
                                width: '100%',
                                height: '100%',
                                position: 'absolute',
                                inset: 0,
                                objectFit: 'cover',
                            }}
                        />
                    )}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to bottom, transparent 60%, rgba(10,10,15,0.7) 100%)',
                        zIndex: 1,
                    }} />
                </div>
                {/* Collection avatar — icon → token #1 (outside overflow:hidden) */}
                <div style={{
                    position: 'absolute',
                    bottom: '-40px',
                    left: '48px',
                    width: '96px',
                    height: '96px',
                    borderRadius: theme.radii.xl,
                    border: `4px solid ${theme.colors.bg.base}`,
                    overflow: 'hidden',
                    boxShadow: theme.shadows.lg,
                    zIndex: 2,
                }}>
                    <CollectionImage
                        uri={cIcon}
                        baseUri={cBaseUri}
                        index={0}
                        aspectRatio="1"
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            </div>

            <div style={{
                maxWidth: '1440px',
                margin: '0 auto',
                padding: `60px ${theme.spacing.lg} ${theme.spacing.xxl}`,
            }}>
                {/* Collection Info */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginBottom: theme.spacing.xxl }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                                <h1 style={{
                                    fontFamily: theme.fonts.heading,
                                    fontSize: theme.fontSize['3xl'],
                                    fontWeight: 700,
                                    letterSpacing: theme.letterSpacing.tight,
                                }}>
                                    {cName}
                                </h1>
                                {cVerified && (
                                    <span style={{
                                        padding: '3px 10px',
                                        borderRadius: theme.radii.full,
                                        background: 'rgba(20,241,149,0.1)',
                                        border: '1px solid rgba(20,241,149,0.2)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: theme.colors.brand.green,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill={theme.colors.brand.green}>
                                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                        </svg>
                                        Verified
                                    </span>
                                )}
                                <span style={{
                                    padding: '3px 10px',
                                    borderRadius: theme.radii.full,
                                    background: salePhase === 2 ? 'rgba(20,241,149,0.1)' : salePhase === 3 ? 'rgba(255,107,0,0.1)' : 'rgba(255,255,255,0.06)',
                                    border: `1px solid ${salePhase === 2 ? 'rgba(20,241,149,0.2)' : salePhase === 3 ? 'rgba(255,107,0,0.2)' : theme.colors.border.subtle}`,
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: salePhase === 2 ? theme.colors.brand.green : salePhase === 3 ? theme.colors.brand.orange : theme.colors.text.tertiary,
                                }}>
                                    {phaseLabel}
                                </span>
                            </div>
                            <div style={{
                                display: 'flex',
                                gap: theme.spacing.md,
                                alignItems: 'center',
                                marginBottom: theme.spacing.md,
                            }}>
                                <span style={{
                                    fontSize: '13px',
                                    color: theme.colors.text.tertiary,
                                    fontFamily: theme.fonts.mono,
                                }}>
                                    {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : '--'}
                                </span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                            {isCreator && (
                                <>
                                    <Button variant="secondary" size="sm" onClick={() => setBrandingModalOpen(true)}>
                                        Edit Branding
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => setBaseUriModalOpen(true)}>
                                        {cBaseUri ? 'Update Base URI' : 'Set Base URI'}
                                    </Button>
                                </>
                            )}
                            <Button variant="secondary" size="sm">Share</Button>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Row */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.35 }}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: theme.spacing.md,
                        marginBottom: theme.spacing.xxl,
                    }}
                >
                    {([
                        { label: 'Floor Price', value: cFloorPrice, suffix: 'BTC', decimals: cFloorPrice < 0.01 ? 4 : 2 },
                        { label: 'Total Volume', value: cTotalVolume, suffix: 'BTC', decimals: cTotalVolume < 1 ? 4 : 1 },
                        { label: 'Listed', value: listedCount, suffix: undefined, decimals: 0 },
                        { label: 'Sales', value: cSalesCount, suffix: undefined, decimals: 0 },
                        { label: 'Supply', value: cSupply, suffix: cMaxSupply ? ` / ${cMaxSupply.toLocaleString()}` : undefined, decimals: 0 },
                        { label: 'Royalty', value: cRoyalty, suffix: '%', decimals: 0 },
                    ] as { label: string; value: number; suffix?: string; decimals: number }[]).map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.05 }}
                            style={{
                                padding: '16px 20px',
                                background: theme.colors.bg.card,
                                border: `1px solid ${theme.colors.border.subtle}`,
                                borderRadius: theme.radii.lg,
                            }}
                        >
                            <div style={{
                                fontSize: theme.fontSize.xs,
                                fontWeight: 500,
                                color: theme.colors.text.tertiary,
                                textTransform: 'uppercase',
                                letterSpacing: theme.letterSpacing.wider,
                                marginBottom: '6px',
                            }}>
                                {stat.label}
                            </div>
                            <div style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: theme.fontSize.xl,
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '4px',
                            }}>
                                <CountUp
                                    end={stat.value}
                                    decimals={stat.decimals}
                                    duration={1.5}
                                    separator=","
                                    enableScrollSpy
                                    scrollSpyOnce
                                />
                                {stat.suffix && (
                                    <span style={{
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.secondary,
                                        fontWeight: 500,
                                    }}>
                                        {stat.suffix}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Sales Price Chart ── */}
                {(() => {
                    // Build price points from sale activity
                    const saleActivities = activities.filter((a) => a.event_type === 'sale' && a.price);
                    const pricePoints = saleActivities
                        .map((a) => ({ block: a.block_number, price: Number(a.price!) / 1e8 }))
                        .sort((a, b) => a.block - b.block);

                    if (pricePoints.length < 2) return null;

                    const maxP = Math.max(...pricePoints.map((d) => d.price));
                    const minP = Math.min(...pricePoints.map((d) => d.price));
                    const range = maxP - minP || 1;
                    const blockMin = pricePoints[0]!.block;
                    const blockMax = pricePoints[pricePoints.length - 1]!.block;
                    const blockRange = blockMax - blockMin || 1;
                    const pctChange = ((pricePoints[pricePoints.length - 1]!.price - pricePoints[0]!.price) / pricePoints[0]!.price) * 100;
                    const isUp = pctChange >= 0;

                    const points = pricePoints.map((d) => {
                        const x = ((d.block - blockMin) / blockRange) * 100;
                        const y = 100 - ((d.price - minP) / range) * 80 - 10;
                        return `${x},${y}`;
                    }).join(' ');

                    return (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            style={{ marginBottom: theme.spacing.xl }}
                        >
                            <GlassCard style={{ padding: '20px 24px' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '16px',
                                }}>
                                    <span style={{
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: theme.colors.text.secondary,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                    }}>
                                        Price History
                                    </span>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}>
                                        <span style={{
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            fontFamily: theme.fonts.mono,
                                            color: isUp ? theme.colors.brand.green : theme.colors.status.error,
                                        }}>
                                            {isUp ? '+' : ''}{pctChange.toFixed(1)}%
                                        </span>
                                        <span style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>
                                            {pricePoints.length} sales
                                        </span>
                                    </div>
                                </div>
                                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '140px', overflow: 'visible' }}>
                                    <defs>
                                        <linearGradient id="collPriceArea" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={isUp ? theme.colors.brand.green : theme.colors.status.error} stopOpacity={0.15} />
                                            <stop offset="100%" stopColor={isUp ? theme.colors.brand.green : theme.colors.status.error} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    {[20, 40, 60, 80].map((y) => (
                                        <line key={y} x1="0" y1={y} x2="100" y2={y}
                                            stroke={theme.colors.border.subtle} strokeWidth="0.3" strokeDasharray="2 2" />
                                    ))}
                                    <polygon points={`0,100 ${points} 100,100`} fill="url(#collPriceArea)" />
                                    <polyline
                                        points={points}
                                        fill="none"
                                        stroke={isUp ? theme.colors.brand.green : theme.colors.status.error}
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {pricePoints.map((d, i) => {
                                        const x = ((d.block - blockMin) / blockRange) * 100;
                                        const y = 100 - ((d.price - minP) / range) * 80 - 10;
                                        return (
                                            <circle key={i} cx={x} cy={y} r="2.5"
                                                fill={theme.colors.bg.base}
                                                stroke={isUp ? theme.colors.brand.green : theme.colors.status.error}
                                                strokeWidth="1.5" />
                                        );
                                    })}
                                </svg>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '10px',
                                    color: theme.colors.text.tertiary,
                                    fontFamily: theme.fonts.mono,
                                    marginTop: '8px',
                                }}>
                                    <span>Block {blockMin.toLocaleString()}</span>
                                    <span>Floor: {minP.toFixed(4)} BTC</span>
                                    <span>Block {blockMax.toLocaleString()}</span>
                                </div>
                            </GlassCard>
                        </motion.div>
                    );
                })()}

                {/* Registration status banners */}
                {!isMarketplaceRegistered && isCreator && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.3 }}
                        style={{
                            padding: '16px 20px',
                            background: 'rgba(255, 107, 0, 0.08)',
                            border: `1px solid rgba(255, 107, 0, 0.25)`,
                            borderRadius: theme.radii.lg,
                            marginBottom: theme.spacing.lg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: theme.radii.md,
                                background: 'rgba(255, 107, 0, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                            }}>
                                {'\u{1F4E2}'}
                            </div>
                            <div>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: theme.colors.brand.orange,
                                    marginBottom: '2px',
                                }}>
                                    Register for Marketplace Trading
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: theme.colors.text.secondary,
                                    lineHeight: 1.5,
                                }}>
                                    Your collection is not yet registered on the marketplace. Register it so NFT holders can list, buy, and sell.
                                </div>
                            </div>
                        </div>
                        <Link
                            to="/register"
                            style={{
                                padding: '8px 18px',
                                borderRadius: theme.radii.sm,
                                background: theme.colors.brand.orange,
                                border: 'none',
                                color: '#fff',
                                fontSize: '13px',
                                fontWeight: 600,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Register Now
                        </Link>
                    </motion.div>
                )}

                {!isMarketplaceRegistered && !isCreator && walletAddress && ownedCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.3 }}
                        style={{
                            padding: '14px 20px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: `1px solid ${theme.colors.border.subtle}`,
                            borderRadius: theme.radii.lg,
                            marginBottom: theme.spacing.lg,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}
                    >
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: theme.radii.md,
                            background: theme.colors.bg.overlay,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                        }}>
                            {'\u{1F512}'}
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: theme.colors.text.secondary,
                            lineHeight: 1.5,
                        }}>
                            This collection is not yet registered for marketplace trading. The collection creator must register it before NFTs can be listed for sale.
                        </div>
                    </motion.div>
                )}

                {/* Owner listing banner — shows when connected wallet owns NFTs here */}
                {walletAddress && ownedCount > 0 && isMarketplaceRegistered && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        style={{
                            padding: '14px 20px',
                            background: 'rgba(255, 107, 0, 0.06)',
                            border: `1px solid rgba(255, 107, 0, 0.15)`,
                            borderRadius: theme.radii.lg,
                            marginBottom: theme.spacing.lg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: theme.radii.md,
                                background: 'rgba(255, 107, 0, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                            }}>
                                {'💰'}
                            </div>
                            <div>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: theme.colors.text.primary,
                                    marginBottom: '2px',
                                }}>
                                    You own {ownedCount} NFT{ownedCount > 1 ? 's' : ''} in this collection
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: theme.colors.text.secondary,
                                }}>
                                    Hover any of your NFTs below and click &quot;List for Sale&quot; to sell on the marketplace.
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { setItemsFilter('all'); setSortBy('token-id'); }}
                            style={{
                                padding: '6px 14px',
                                borderRadius: theme.radii.sm,
                                background: theme.colors.brand.orange,
                                border: 'none',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            View My NFTs
                        </button>
                    </motion.div>
                )}

                {/* Tabs */}
                <div style={{ marginBottom: theme.spacing.lg }}>
                    <TabBar
                        tabs={TABS}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as TabId)}
                        layoutId="collection-tab"
                    />
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    {activeTab === 'items' && (
                        <motion.div
                            key="items"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {(
                                <div>
                                    {/* Filter bar: Listed / All Items toggle + sort */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: theme.spacing.md,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                                            {/* All Items / Listed toggle */}
                                            <div style={{
                                                display: 'flex',
                                                background: theme.colors.bg.raised,
                                                borderRadius: theme.radii.md,
                                                border: `1px solid ${theme.colors.border.subtle}`,
                                                overflow: 'hidden',
                                            }}>
                                                {(['all', 'listed'] as const).map((filter) => (
                                                    <button
                                                        key={filter}
                                                        onClick={() => setItemsFilter(filter)}
                                                        style={{
                                                            padding: '6px 14px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            fontFamily: theme.fonts.body,
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            transition: `all ${theme.transitions.fast}`,
                                                            background: itemsFilter === filter
                                                                ? 'rgba(255, 107, 0, 0.15)'
                                                                : 'transparent',
                                                            color: itemsFilter === filter
                                                                ? theme.colors.brand.orange
                                                                : theme.colors.text.tertiary,
                                                            borderRight: filter === 'all'
                                                                ? `1px solid ${theme.colors.border.subtle}`
                                                                : 'none',
                                                        }}
                                                    >
                                                        {filter === 'listed' ? `Listed (${listedCount})` : `All Items (${nfts.length})`}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Count label */}
                                            <span style={{ fontSize: '13px', color: theme.colors.text.secondary }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    color: theme.colors.text.primary,
                                                    fontFamily: theme.fonts.mono,
                                                }}>
                                                    {sortedNFTs.length}
                                                </span>{' '}
                                                {itemsFilter === 'listed' ? 'listed' : 'items'}
                                            </span>
                                        </div>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                            style={{
                                                padding: '8px 12px',
                                                background: theme.colors.bg.raised,
                                                border: `1px solid ${theme.colors.border.subtle}`,
                                                borderRadius: theme.radii.sm,
                                                color: theme.colors.text.primary,
                                                fontSize: '12px',
                                                fontFamily: theme.fonts.body,
                                                outline: 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <option value="token-id">Token ID</option>
                                            <option value="price-asc">Price: Low to High</option>
                                            <option value="price-desc">Price: High to Low</option>
                                        </select>
                                    </div>

                                    {sortedNFTs.length > 0 ? (
                                        <FlashlightGrid style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                            gap: theme.spacing.md,
                                        }}>
                                            {sortedNFTs.map((nft, i) => (
                                                <CollectionNFTCard
                                                    key={nft.tokenId}
                                                    nft={nft}
                                                    index={i}
                                                    isOwner={nft.owner.toLowerCase() === walletAddress}
                                                    collectionAddress={address!}
                                                    isRegistered={isMarketplaceRegistered}
                                                    baseUri={cBaseUri}
                                                    onListClick={handleListClick}
                                                    onBuyClick={handleBuyClick}
                                                    onCancelClick={handleCancelClick}
                                                    buyPending={marketplace.isPending}
                                                    cancelPending={marketplace.isPending}
                                                />
                                            ))}
                                        </FlashlightGrid>
                                    ) : (
                                        <div style={{
                                            textAlign: 'center',
                                            padding: theme.spacing.xxxl,
                                        }}>
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
                                                {itemsFilter === 'listed' ? '\uD83D\uDCB0' : '\uD83D\uDDBC'}
                                            </div>
                                            <div style={{
                                                fontFamily: theme.fonts.heading,
                                                fontSize: theme.fontSize.lg,
                                                fontWeight: 600,
                                                marginBottom: '8px',
                                                color: theme.colors.text.primary,
                                            }}>
                                                {itemsFilter === 'listed' ? 'No NFTs listed for sale' : 'No items to display'}
                                            </div>
                                            <div style={{
                                                fontSize: theme.fontSize.base,
                                                color: theme.colors.text.tertiary,
                                                marginBottom: itemsFilter === 'listed' ? '16px' : '0',
                                            }}>
                                                {itemsFilter === 'listed'
                                                    ? 'Owners can list their NFTs from this collection for sale.'
                                                    : 'Items will appear once the collection is minted and indexed.'}
                                            </div>
                                            {itemsFilter === 'listed' && nfts.length > 0 && (
                                                <button
                                                    onClick={() => setItemsFilter('all')}
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
                                                    View All Items
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'activity' && (
                        <motion.div
                            key="activity"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activities.length > 0 ? (
                                <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '100px 1fr 1fr 120px 100px',
                                        padding: '12px 20px',
                                        background: theme.colors.bg.overlay,
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: theme.colors.text.tertiary,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                    }}>
                                        <span>Event</span>
                                        <span>From</span>
                                        <span>To</span>
                                        <span style={{ textAlign: 'right' }}>Price</span>
                                        <span style={{ textAlign: 'right' }}>Token</span>
                                    </div>
                                    {activities.map((a, i) => {
                                        const eventColors: Record<string, string> = {
                                            sale: theme.colors.brand.green,
                                            list: theme.colors.brand.orange,
                                            offer: theme.colors.brand.purple,
                                            mint: theme.colors.brand.gold,
                                            transfer: theme.colors.text.secondary,
                                            bid: theme.colors.brand.cyan,
                                            auction_settled: theme.colors.brand.green,
                                            offer_accepted: theme.colors.brand.green,
                                            cancel_listing: theme.colors.status.error,
                                        };
                                        const color = eventColors[a.event_type] ?? theme.colors.text.secondary;
                                        const price = a.price ? (Number(a.price) / 1e8).toFixed(4) : '--';
                                        return (
                                            <div key={a.id ?? i} style={{
                                                display: 'grid',
                                                gridTemplateColumns: '100px 1fr 1fr 120px 100px',
                                                padding: '14px 20px',
                                                borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                                fontSize: '13px',
                                                transition: `background ${theme.transitions.fast}`,
                                            }}>
                                                <span style={{
                                                    color,
                                                    fontWeight: 600,
                                                    textTransform: 'capitalize',
                                                    fontSize: '12px',
                                                }}>
                                                    {a.event_type.replace('_', ' ')}
                                                </span>
                                                <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.text.tertiary }}>
                                                    {a.from_address ? truncateAddress(a.from_address) : '--'}
                                                </span>
                                                <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.text.tertiary }}>
                                                    {a.to_address ? truncateAddress(a.to_address) : '--'}
                                                </span>
                                                <span style={{
                                                    textAlign: 'right',
                                                    fontFamily: theme.fonts.mono,
                                                    fontWeight: 500,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {price !== '--' ? `${price} BTC` : '--'}
                                                </span>
                                                <span style={{
                                                    textAlign: 'right',
                                                    fontFamily: theme.fonts.mono,
                                                    color: theme.colors.brand.orange,
                                                    fontSize: '12px',
                                                }}>
                                                    #{a.token_id}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </GlassCard>
                            ) : (
                                <GlassCard style={{ overflow: 'hidden', padding: theme.spacing.xl, textAlign: 'center' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>{'⚡'}</div>
                                    <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500 }}>
                                        No activity yet
                                    </div>
                                    <div style={{ color: theme.colors.text.tertiary, fontSize: '13px', marginTop: '4px' }}>
                                        Activity will appear once trades are executed on-chain.
                                    </div>
                                </GlassCard>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'offers' && (
                        <motion.div
                            key="offers"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {collectionOffers.length > 0 ? (
                                <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 120px 120px 100px',
                                        padding: '12px 20px',
                                        background: theme.colors.bg.overlay,
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: theme.colors.text.tertiary,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                    }}>
                                        <span>Offerer</span>
                                        <span style={{ textAlign: 'right' }}>Price</span>
                                        <span style={{ textAlign: 'right' }}>Expiry</span>
                                        <span style={{ textAlign: 'right' }}>Token</span>
                                    </div>
                                    {collectionOffers.map((o, i) => (
                                        <div key={o.offer_id ?? i} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 120px 120px 100px',
                                            padding: '14px 20px',
                                            borderBottom: `1px solid ${theme.colors.border.subtle}`,
                                            fontSize: '13px',
                                        }}>
                                            <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', color: theme.colors.brand.purple }}>
                                                {truncateAddress(o.offerer)}
                                            </span>
                                            <span style={{
                                                textAlign: 'right',
                                                fontFamily: theme.fonts.mono,
                                                fontWeight: 600,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                {(Number(o.price) / 1e8).toFixed(4)} BTC
                                            </span>
                                            <span style={{
                                                textAlign: 'right',
                                                fontFamily: theme.fonts.mono,
                                                fontSize: '12px',
                                                color: theme.colors.text.tertiary,
                                            }}>
                                                Block {o.expiry_block.toLocaleString()}
                                            </span>
                                            <span style={{
                                                textAlign: 'right',
                                                fontFamily: theme.fonts.mono,
                                                color: theme.colors.brand.orange,
                                                fontSize: '12px',
                                            }}>
                                                #{o.token_id}
                                            </span>
                                        </div>
                                    ))}
                                </GlassCard>
                            ) : (
                                <GlassCard style={{ overflow: 'hidden', padding: theme.spacing.xl, textAlign: 'center' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>{'💎'}</div>
                                    <div style={{ color: theme.colors.text.secondary, fontSize: '14px', fontWeight: 500 }}>
                                        No offers yet
                                    </div>
                                    <div style={{ color: theme.colors.text.tertiary, fontSize: '13px', marginTop: '4px' }}>
                                        Collection offers will appear once the marketplace is active.
                                    </div>
                                </GlassCard>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Listing Modal */}
            <ListingModal
                open={listingModalOpen}
                onClose={() => setListingModalOpen(false)}
                collectionAddress={address!}
                tokenId={listingTokenId}
                tokenName={listingTokenName}
                onSuccess={() => refetchListings()}
            />

            {/* Edit Branding Modal (creator only) */}
            <EditBrandingModal
                open={brandingModalOpen}
                onClose={() => setBrandingModalOpen(false)}
                currentIcon={cIcon}
                currentBanner={cBanner}
                currentDescription={cDescription}
                currentWebsite={cWebsite}
                saving={collectionActions.isPending}
                onSave={async (icon, banner, description, website) => {
                    await collectionActions.changeMetadata(icon, banner, description, website);
                    setBrandingModalOpen(false);
                    // Force-enrich so backend picks up the new branding immediately
                    if (address) {
                        try { await IndexerAPI.enrichCollection(address, col?.creator); } catch { /* non-critical */ }
                        queryClient.invalidateQueries({ queryKey: ['collection', 'indexer', address] });
                    }
                }}
            />

            {/* Set Base URI Modal (creator only) */}
            <SetBaseURIModal
                open={baseUriModalOpen}
                onClose={() => setBaseUriModalOpen(false)}
                currentBaseUri={cBaseUri}
                saving={collectionActions.isPending}
                onSave={async (baseUri) => {
                    await collectionActions.setBaseUri(baseUri);
                    setBaseUriModalOpen(false);
                    // Force-enrich so backend picks up the new base URI via tokenURI(1) immediately
                    if (address) {
                        try { await IndexerAPI.enrichCollection(address, col?.creator); } catch { /* non-critical */ }
                        queryClient.invalidateQueries({ queryKey: ['collection', 'indexer', address] });
                        queryClient.invalidateQueries({ queryKey: ['collection', 'tokens', address] });
                    }
                }}
            />
        </div>
    );
}
