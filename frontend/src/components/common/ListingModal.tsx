/**
 * ListingModal — Shared modal for listing an NFT on the marketplace.
 *
 * Handles:
 * 1. Price input (BTC display → sats conversion)
 * 2. Approval check/grant (isApprovedForAll on the collection)
 * 3. Submit listing via useMarketplaceActions.listNFT
 *
 * Used by CollectionPage and NFTDetailPage.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { theme } from '@/styles/theme';
import { Button } from './Button';
import { useApprovalCheck } from '@/hooks/useApprovalCheck';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';
import { useNetwork } from '@/hooks/useNetwork';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ListingModalProps {
    /** Whether the modal is open */
    open: boolean;
    /** Close callback */
    onClose: () => void;
    /** Collection contract address (hex) */
    collectionAddress: string;
    /** Token ID to list */
    tokenId: bigint;
    /** Optional token name for display */
    tokenName?: string;
    /** Called after listing is successfully submitted */
    onSuccess?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SATS_PER_BTC = 100_000_000n;

function btcToSats(btc: string): bigint {
    const parts = btc.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
    return BigInt(whole) * SATS_PER_BTC + BigInt(frac);
}

function satsDisplay(sats: bigint): string {
    return sats.toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ListingModal({
    open,
    onClose,
    collectionAddress,
    tokenId,
    tokenName,
    onSuccess,
}: ListingModalProps): JSX.Element | null {
    const { network } = useNetwork();
    const marketplaceAddress = CONTRACT_ADDRESSES[network].marketplace;

    const [priceInput, setPriceInput] = useState('');
    const [step, setStep] = useState<'price' | 'approval' | 'listing'>('price');
    const [listingError, setListingError] = useState<string | null>(null);

    // Approval check
    const approval = useApprovalCheck(
        collectionAddress,
        tokenId,
        marketplaceAddress || undefined,
    );

    // Marketplace actions
    const marketplace = useMarketplaceActions({
        network,
        onSuccess: () => {
            onSuccess?.();
            handleClose();
        },
    });

    // Reset on open
    useEffect(() => {
        if (open) {
            setPriceInput('');
            setStep('price');
            setListingError(null);
        }
    }, [open]);

    const handleClose = useCallback(() => {
        setPriceInput('');
        setStep('price');
        setListingError(null);
        onClose();
    }, [onClose]);

    const parsedSats = priceInput ? btcToSats(priceInput) : 0n;
    const isValidPrice = parsedSats > 0n;

    // Step 1 → Step 2: check approval
    const handleProceed = useCallback(() => {
        if (!isValidPrice) return;
        if (approval.isApproved) {
            setStep('listing');
        } else {
            setStep('approval');
        }
    }, [isValidPrice, approval.isApproved]);

    // Step 2: approve
    const handleApprove = useCallback(async () => {
        try {
            await approval.approve();
            setStep('listing');
        } catch {
            // Error is in approval.error
        }
    }, [approval]);

    // Step 3: list
    const handleList = useCallback(async () => {
        if (!isValidPrice) return;
        setListingError(null);
        try {
            await marketplace.listNFT(collectionAddress, tokenId, parsedSats);
        } catch (err) {
            setListingError(err instanceof Error ? err.message : String(err));
        }
    }, [collectionAddress, tokenId, parsedSats, isValidPrice, marketplace]);

    if (!open) return null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: theme.zIndex.modal,
                    }}
                >
                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '440px',
                            background: theme.colors.bg.raised,
                            border: `1px solid ${theme.colors.border.default}`,
                            borderRadius: theme.radii.xl,
                            padding: '32px',
                            boxShadow: theme.shadows.xl,
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: theme.fontSize.lg,
                                fontWeight: 700,
                                color: theme.colors.text.primary,
                                margin: 0,
                                letterSpacing: theme.letterSpacing.tight,
                            }}>
                                List for Sale
                            </h3>
                            <button
                                onClick={handleClose}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: theme.colors.text.tertiary,
                                    cursor: 'pointer',
                                    fontSize: '20px',
                                    padding: '4px',
                                    lineHeight: 1,
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Token info */}
                        <div style={{
                            padding: '12px 16px',
                            background: theme.colors.bg.overlay,
                            borderRadius: theme.radii.md,
                            marginBottom: '24px',
                            border: `1px solid ${theme.colors.border.subtle}`,
                        }}>
                            <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>Token</span>
                            <div style={{
                                fontSize: theme.fontSize.base,
                                color: theme.colors.text.primary,
                                fontWeight: 600,
                                marginTop: '4px',
                            }}>
                                {tokenName || `#${tokenId.toString()}`}
                            </div>
                        </div>

                        {/* Step indicators */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                            {(['price', 'approval', 'listing'] as const).map((s, i) => (
                                <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: theme.fontSize.xs,
                                        fontWeight: 700,
                                        background: step === s
                                            ? theme.colors.brand.orange
                                            : i < ['price', 'approval', 'listing'].indexOf(step)
                                                ? theme.colors.brand.green
                                                : theme.colors.bg.interactive,
                                        color: step === s || i < ['price', 'approval', 'listing'].indexOf(step)
                                            ? '#fff'
                                            : theme.colors.text.tertiary,
                                        transition: `background ${theme.transitions.base}`,
                                    }}>
                                        {i < ['price', 'approval', 'listing'].indexOf(step) ? '\u2713' : i + 1}
                                    </div>
                                    <span style={{
                                        fontSize: theme.fontSize.xs,
                                        color: step === s ? theme.colors.text.primary : theme.colors.text.tertiary,
                                        fontWeight: step === s ? 600 : 400,
                                    }}>
                                        {s === 'price' ? 'Set Price' : s === 'approval' ? 'Approve' : 'Confirm'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Step 1: Price input */}
                        {step === 'price' && (
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: theme.fontSize.sm,
                                    color: theme.colors.text.secondary,
                                    marginBottom: '8px',
                                    fontWeight: 500,
                                }}>
                                    Listing Price (BTC)
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.001"
                                        value={priceInput}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (/^\d*\.?\d{0,8}$/.test(v) || v === '') {
                                                setPriceInput(v);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '14px 60px 14px 16px',
                                            background: theme.colors.bg.overlay,
                                            border: `1px solid ${theme.colors.border.default}`,
                                            borderRadius: theme.radii.md,
                                            color: theme.colors.text.primary,
                                            fontSize: theme.fontSize.md,
                                            fontFamily: theme.fonts.mono,
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = theme.colors.brand.orange;
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = theme.colors.border.default;
                                        }}
                                        autoFocus
                                    />
                                    <span style={{
                                        position: 'absolute',
                                        right: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.tertiary,
                                        fontWeight: 600,
                                    }}>
                                        BTC
                                    </span>
                                </div>

                                {isValidPrice && (
                                    <div style={{
                                        marginTop: '8px',
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.secondary,
                                        fontFamily: theme.fonts.mono,
                                    }}>
                                        = {satsDisplay(parsedSats)} sats
                                    </div>
                                )}

                                <Button
                                    fullWidth
                                    disabled={!isValidPrice}
                                    onClick={handleProceed}
                                    style={{ marginTop: '20px' }}
                                >
                                    Continue
                                </Button>
                            </div>
                        )}

                        {/* Step 2: Approval */}
                        {step === 'approval' && (
                            <div>
                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(255, 107, 0, 0.06)',
                                    borderRadius: theme.radii.md,
                                    border: `1px solid ${theme.colors.border.accent}`,
                                    marginBottom: '20px',
                                }}>
                                    <p style={{
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.secondary,
                                        margin: 0,
                                        lineHeight: 1.5,
                                    }}>
                                        To list on FORGE Marketplace, you need to approve
                                        the marketplace contract to transfer NFTs from this collection.
                                        This is a one-time approval per collection.
                                    </p>
                                </div>

                                {approval.error && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        borderRadius: theme.radii.md,
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        marginBottom: '16px',
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.status.error,
                                    }}>
                                        {approval.error}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setStep('price')}
                                        style={{ flex: 1 }}
                                    >
                                        Back
                                    </Button>
                                    <Button
                                        fullWidth
                                        loading={approval.isPending}
                                        onClick={handleApprove}
                                        style={{ flex: 2 }}
                                    >
                                        {approval.isPending ? 'Approving...' : 'Approve Collection'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Confirm listing */}
                        {step === 'listing' && (
                            <div>
                                <div style={{
                                    padding: '16px',
                                    background: theme.colors.bg.overlay,
                                    borderRadius: theme.radii.md,
                                    border: `1px solid ${theme.colors.border.subtle}`,
                                    marginBottom: '20px',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>Price</span>
                                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.primary, fontFamily: theme.fonts.mono, fontWeight: 600 }}>
                                            {priceInput} BTC
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>Sats</span>
                                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                                            {satsDisplay(parsedSats)}
                                        </span>
                                    </div>
                                </div>

                                {(listingError || marketplace.error) && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        borderRadius: theme.radii.md,
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        marginBottom: '16px',
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.status.error,
                                    }}>
                                        {listingError || marketplace.error}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setStep('price')}
                                        style={{ flex: 1 }}
                                    >
                                        Back
                                    </Button>
                                    <Button
                                        fullWidth
                                        loading={marketplace.isPending}
                                        onClick={handleList}
                                        style={{ flex: 2 }}
                                    >
                                        {marketplace.isPending ? 'Listing...' : 'List for Sale'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
