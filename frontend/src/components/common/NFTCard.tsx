import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';
import { formatBTC } from '@/utils/format';

interface NFTCardProps {
    collectionAddress: string;
    tokenId: bigint;
    name: string;
    collectionName: string;
    imageUrl: string;
    price: bigint;
    lastSalePrice: bigint;
    rarityRank: number;
    totalSupply: number;
    listed: boolean;
    verified?: boolean;
}

/* Rarity tier config */
function getRarityTier(rank: number, total: number) {
    const pct = rank / total;
    if (pct <= 0.01) return { label: 'Legendary', bg: 'linear-gradient(135deg, rgba(255,170,0,0.15), rgba(255,85,0,0.15))', color: '#ffaa00', border: 'rgba(255,170,0,0.3)' };
    if (pct <= 0.05) return { label: 'Epic', bg: 'rgba(153,69,255,0.12)', color: '#aa66ff', border: 'rgba(153,69,255,0.25)' };
    if (pct <= 0.15) return { label: 'Rare', bg: 'rgba(0,136,255,0.12)', color: '#4499ff', border: 'rgba(0,136,255,0.25)' };
    return { label: 'Common', bg: 'rgba(255,255,255,0.04)', color: theme.colors.text.secondary, border: theme.colors.border.subtle };
}

export function NFTCard({
    collectionAddress,
    tokenId,
    name,
    collectionName,
    imageUrl,
    price,
    lastSalePrice,
    rarityRank,
    totalSupply,
    listed,
    verified = false,
}: NFTCardProps): JSX.Element {
    const cardRef = useRef<HTMLDivElement>(null);
    const [tilt, setTilt] = useState({ x: 0, y: 0 });
    const [glare, setGlare] = useState({ x: 50, y: 50 });
    const [isHovered, setIsHovered] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    function handleMouseMove(e: React.MouseEvent): void {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setTilt({ x: (y - 0.5) * -8, y: (x - 0.5) * 8 });
        setGlare({ x: x * 100, y: y * 100 });
    }

    function handleMouseLeave(): void {
        setTilt({ x: 0, y: 0 });
        setIsHovered(false);
    }

    const btcPrice = Number(listed ? price : lastSalePrice) / 1e8;
    const rarity = rarityRank > 0 ? getRarityTier(rarityRank, totalSupply) : null;

    return (
        <Link to={`/nft/${collectionAddress}/${tokenId}`} style={{ textDecoration: 'none' }}>
            <motion.div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={handleMouseLeave}
                animate={{ rotateX: tilt.x, rotateY: tilt.y }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                    background: theme.colors.bg.card,
                    border: `1px solid ${isHovered ? theme.colors.border.accent : theme.colors.border.subtle}`,
                    borderRadius: theme.radii.lg,
                    overflow: 'hidden',
                    perspective: '1000px',
                    transformStyle: 'preserve-3d',
                    cursor: 'pointer',
                    boxShadow: isHovered ? '0 8px 32px rgba(255, 107, 0, 0.1), 0 0 0 1px rgba(255, 107, 0, 0.06)' : 'none',
                    transition: `border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast}`,
                }}
            >
                {/* Image container — 1:1 aspect ratio */}
                <div style={{
                    position: 'relative',
                    aspectRatio: '1',
                    background: theme.colors.bg.overlay,
                    overflow: 'hidden',
                }}>
                    {imageUrl ? (
                        <>
                            {/* Blur placeholder */}
                            {!imageLoaded && (
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: `linear-gradient(135deg, ${theme.colors.bg.overlay}, ${theme.colors.bg.interactive})`,
                                }} className="skeleton" />
                            )}
                            <img
                                src={imageUrl}
                                alt={name}
                                onLoad={() => setImageLoaded(true)}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    opacity: imageLoaded ? 1 : 0,
                                    transition: 'opacity 0.4s ease, transform 0.4s ease',
                                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                                }}
                            />
                        </>
                    ) : (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `linear-gradient(135deg, ${theme.colors.bg.overlay} 0%, ${theme.colors.bg.interactive} 100%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <span style={{
                                fontFamily: theme.fonts.mono,
                                fontSize: theme.fontSize.xl,
                                fontWeight: 700,
                                color: theme.colors.text.tertiary,
                                opacity: 0.5,
                            }}>
                                #{tokenId.toString()}
                            </span>
                        </div>
                    )}

                    {/* Holographic glare */}
                    {isHovered && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
                            pointerEvents: 'none',
                            zIndex: 2,
                        }} />
                    )}

                    {/* Rarity badge */}
                    {rarity && (
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            padding: '3px 8px',
                            borderRadius: theme.radii.full,
                            background: rarity.bg,
                            border: `1px solid ${rarity.border}`,
                            fontSize: '10px',
                            fontWeight: 700,
                            color: rarity.color,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            backdropFilter: 'blur(8px)',
                            zIndex: 3,
                        }}>
                            #{rarityRank}
                        </div>
                    )}

                    {/* Listed badge */}
                    {listed && (
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            padding: '3px 8px',
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

                    {/* Quick-buy overlay — slides up on hover */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: isHovered ? 0 : '100%' }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: '12px 14px',
                            background: 'linear-gradient(to top, rgba(10, 10, 15, 0.95) 60%, transparent)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            zIndex: 4,
                        }}
                    >
                        <span style={{
                            fontFamily: theme.fonts.mono,
                            fontSize: '13px',
                            fontWeight: 600,
                            color: theme.colors.text.primary,
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {btcPrice < 0.001 ? btcPrice.toFixed(8) : btcPrice.toFixed(4)} BTC
                        </span>
                        <span style={{
                            padding: '5px 14px',
                            borderRadius: theme.radii.sm,
                            background: theme.colors.brand.orange,
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                        }}>
                            {listed ? 'Buy Now' : 'Make Offer'}
                        </span>
                    </motion.div>
                </div>

                {/* Info section */}
                <div style={{ padding: '14px 16px' }}>
                    <div style={{
                        fontSize: theme.fontSize.xs,
                        color: theme.colors.text.tertiary,
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        {collectionName}
                        {verified && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={theme.colors.brand.cyan}>
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                            </svg>
                        )}
                    </div>
                    <div style={{
                        fontFamily: theme.fonts.heading,
                        fontSize: '15px',
                        fontWeight: 600,
                        letterSpacing: theme.letterSpacing.snug,
                        marginBottom: '12px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: theme.colors.text.primary,
                    }}>
                        {name}
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        paddingTop: '10px',
                        borderTop: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <div>
                            <div style={{
                                fontSize: '10px',
                                color: theme.colors.text.tertiary,
                                marginBottom: '2px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                fontWeight: 500,
                            }}>
                                {listed ? 'Price' : 'Last Sale'}
                            </div>
                            <div style={{
                                fontFamily: theme.fonts.mono,
                                fontWeight: 600,
                                fontSize: '14px',
                                fontVariantNumeric: 'tabular-nums',
                                color: theme.colors.text.primary,
                            }}>
                                {formatBTC(listed ? price : lastSalePrice)} BTC
                            </div>
                        </div>
                        {rarity && (
                            <div style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: rarity.color,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}>
                                {rarity.label}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}
