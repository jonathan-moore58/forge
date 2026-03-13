/**
 * CreateAuctionModal — Modal for creating English or Dutch auctions.
 *
 * Flow:
 * 1. Select auction type (English / Dutch)
 * 2. Set prices + duration
 * 3. Approve AuctionHouse contract (if not already)
 * 4. Submit auction creation TX
 *
 * Used by NFTDetailPage and AuctionPage.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { theme } from '@/styles/theme';
import { Button } from './Button';
import { useApprovalCheck } from '@/hooks/useApprovalCheck';
import { useAuctionActions } from '@/hooks/useAuctionActions';
import { useNetwork } from '@/hooks/useNetwork';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CreateAuctionModalProps {
    /** Whether the modal is open */
    open: boolean;
    /** Close callback */
    onClose: () => void;
    /** Collection contract address (hex) */
    collectionAddress: string;
    /** Token ID to auction */
    tokenId: bigint;
    /** Optional token name for display */
    tokenName?: string;
    /** Called after auction is successfully created */
    onSuccess?: () => void;
}

type AuctionType = 'english' | 'dutch';
type ModalStep = 'type' | 'params' | 'approval' | 'confirm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SATS_PER_BTC = 100_000_000n;

function btcToSats(btc: string): bigint {
    if (!btc || btc === '.' || btc === '0.') return 0n;
    const parts = btc.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
    return BigInt(whole) * SATS_PER_BTC + BigInt(frac);
}

function formatSats(sats: bigint): string {
    return sats.toLocaleString();
}

/** Validate BTC input — only digits and one decimal point, up to 8 decimals */
function isValidBtcInput(v: string): boolean {
    return /^\d*\.?\d{0,8}$/.test(v) || v === '';
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function EnglishIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 18L8 10L12 14L16 6L20 12" stroke={theme.colors.brand.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="12" r="2" fill={theme.colors.brand.orange} />
        </svg>
    );
}

function DutchIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 6L8 10L12 8L16 14L20 18" stroke={theme.colors.brand.purple} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="18" r="2" fill={theme.colors.brand.purple} />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CreateAuctionModal({
    open,
    onClose,
    collectionAddress,
    tokenId,
    tokenName,
    onSuccess,
}: CreateAuctionModalProps): JSX.Element | null {
    const { network } = useNetwork();
    const auctionHouseAddress = CONTRACT_ADDRESSES[network].auctionHouse;

    const [auctionType, setAuctionType] = useState<AuctionType>('english');
    const [step, setStep] = useState<ModalStep>('type');
    const [createError, setCreateError] = useState<string | null>(null);

    // English params
    const [startPrice, setStartPrice] = useState('');
    const [reservePrice, setReservePrice] = useState('');

    // Dutch params
    const [dutchStartPrice, setDutchStartPrice] = useState('');
    const [dutchEndPrice, setDutchEndPrice] = useState('');

    // Shared
    const [durationBlocks, setDurationBlocks] = useState('144'); // ~1 day default

    // Approval check
    const approval = useApprovalCheck(
        collectionAddress,
        tokenId,
        auctionHouseAddress || undefined,
    );

    // Auction actions
    const auction = useAuctionActions({
        network,
        onSuccess: () => {
            onSuccess?.();
            handleClose();
        },
    });

    // Reset on open
    useEffect(() => {
        if (open) {
            setAuctionType('english');
            setStep('type');
            setCreateError(null);
            setStartPrice('');
            setReservePrice('');
            setDutchStartPrice('');
            setDutchEndPrice('');
            setDurationBlocks('144');
        }
    }, [open]);

    const handleClose = useCallback(() => {
        setStep('type');
        setCreateError(null);
        onClose();
    }, [onClose]);

    // Computed values
    const startPriceSats = auctionType === 'english' ? btcToSats(startPrice) : btcToSats(dutchStartPrice);
    const secondPriceSats = auctionType === 'english' ? btcToSats(reservePrice) : btcToSats(dutchEndPrice);
    const durationBigint = BigInt(durationBlocks || '0');
    const durationHours = Math.round((Number(durationBlocks || 0) * 10) / 60);

    const isParamsValid = (() => {
        if (startPriceSats <= 0n) return false;
        if (durationBigint <= 0n) return false;

        if (auctionType === 'english') {
            // Reserve can be 0 (no reserve)
            return true;
        } else {
            // Dutch: end price must be < start price and > 0
            return secondPriceSats > 0n && secondPriceSats < startPriceSats;
        }
    })();

    // Step transitions
    const handleParamsProceed = useCallback(() => {
        if (!isParamsValid) return;
        if (approval.isApproved) {
            setStep('confirm');
        } else {
            setStep('approval');
        }
    }, [isParamsValid, approval.isApproved]);

    const handleApprove = useCallback(async () => {
        try {
            await approval.approve();
            setStep('confirm');
        } catch {
            // Error is in approval.error
        }
    }, [approval]);

    const handleCreate = useCallback(async () => {
        setCreateError(null);
        try {
            if (auctionType === 'english') {
                await auction.createEnglishAuction(
                    collectionAddress,
                    tokenId,
                    startPriceSats,
                    secondPriceSats,
                    durationBigint,
                );
            } else {
                await auction.createDutchAuction(
                    collectionAddress,
                    tokenId,
                    startPriceSats,
                    secondPriceSats,
                    durationBigint,
                );
            }
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : String(err));
        }
    }, [auctionType, collectionAddress, tokenId, startPriceSats, secondPriceSats, durationBigint, auction]);

    if (!open) return null;

    const STEPS: ModalStep[] = ['type', 'params', 'approval', 'confirm'];
    const stepLabels = { type: 'Type', params: 'Details', approval: 'Approve', confirm: 'Create' };
    const accentColor = auctionType === 'english' ? theme.colors.brand.orange : theme.colors.brand.purple;

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
                        zIndex: 9990,
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: '480px',
                            background: theme.colors.bg.raised,
                            border: `1px solid ${theme.colors.border.default}`,
                            borderRadius: theme.radii.xl,
                            padding: '32px',
                            boxShadow: theme.shadows.xl,
                            maxHeight: '90vh',
                            overflowY: 'auto',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: theme.fontSize.lg,
                                fontWeight: 700,
                                color: theme.colors.text.primary,
                                margin: 0,
                                letterSpacing: theme.letterSpacing.tight,
                            }}>
                                Create Auction
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
                            marginBottom: '20px',
                            border: `1px solid ${theme.colors.border.subtle}`,
                        }}>
                            <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>NFT</span>
                            <div style={{
                                fontSize: theme.fontSize.base,
                                color: theme.colors.text.primary,
                                fontWeight: 600,
                                marginTop: '4px',
                            }}>
                                {tokenName || `Token #${tokenId.toString()}`}
                            </div>
                        </div>

                        {/* Step indicators */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
                            {STEPS.map((s, i) => {
                                const currentIdx = STEPS.indexOf(step);
                                const isActive = s === step;
                                const isDone = i < currentIdx;
                                return (
                                    <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                        <div style={{
                                            width: '26px',
                                            height: '26px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            background: isActive ? accentColor : isDone ? theme.colors.brand.green : theme.colors.bg.interactive,
                                            color: isActive || isDone ? '#fff' : theme.colors.text.tertiary,
                                            transition: 'background 0.2s',
                                        }}>
                                            {isDone ? '\u2713' : i + 1}
                                        </div>
                                        <span style={{
                                            fontSize: '11px',
                                            color: isActive ? theme.colors.text.primary : theme.colors.text.tertiary,
                                            fontWeight: isActive ? 600 : 400,
                                        }}>
                                            {stepLabels[s]}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Step 1: Choose auction type */}
                        {step === 'type' && (
                            <div>
                                <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, marginBottom: '16px', marginTop: 0 }}>
                                    Choose how you want to auction your NFT:
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* English */}
                                    <button
                                        onClick={() => setAuctionType('english')}
                                        style={{
                                            padding: '20px',
                                            background: auctionType === 'english' ? 'rgba(255, 107, 0, 0.06)' : theme.colors.bg.overlay,
                                            border: `1px solid ${auctionType === 'english' ? 'rgba(255, 107, 0, 0.3)' : theme.colors.border.subtle}`,
                                            borderRadius: theme.radii.md,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            color: theme.colors.text.primary,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <EnglishIcon />
                                            <span style={{ fontWeight: 700, fontSize: theme.fontSize.base }}>English Auction</span>
                                            {auctionType === 'english' && (
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    padding: '2px 8px',
                                                    borderRadius: theme.radii.full,
                                                    background: theme.colors.brand.orange,
                                                    color: '#fff',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                }}>SELECTED</span>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, lineHeight: 1.5 }}>
                                            Bidders compete by placing increasing bids. Highest bid wins when the timer ends.
                                            Anti-snipe protection extends the auction if a bid is placed near the end.
                                        </p>
                                    </button>

                                    {/* Dutch */}
                                    <button
                                        onClick={() => setAuctionType('dutch')}
                                        style={{
                                            padding: '20px',
                                            background: auctionType === 'dutch' ? 'rgba(153, 69, 255, 0.06)' : theme.colors.bg.overlay,
                                            border: `1px solid ${auctionType === 'dutch' ? 'rgba(153, 69, 255, 0.3)' : theme.colors.border.subtle}`,
                                            borderRadius: theme.radii.md,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            color: theme.colors.text.primary,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <DutchIcon />
                                            <span style={{ fontWeight: 700, fontSize: theme.fontSize.base }}>Dutch Auction</span>
                                            {auctionType === 'dutch' && (
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    padding: '2px 8px',
                                                    borderRadius: theme.radii.full,
                                                    background: theme.colors.brand.purple,
                                                    color: '#fff',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                }}>SELECTED</span>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, lineHeight: 1.5 }}>
                                            Price starts high and drops over time. First buyer to accept the current price wins instantly.
                                        </p>
                                    </button>
                                </div>

                                <Button
                                    fullWidth
                                    onClick={() => setStep('params')}
                                    style={{ marginTop: '20px' }}
                                >
                                    Continue
                                </Button>
                            </div>
                        )}

                        {/* Step 2: Set parameters */}
                        {step === 'params' && (
                            <div>
                                {auctionType === 'english' ? (
                                    <>
                                        {/* Starting Price */}
                                        <label style={labelStyle}>Starting Price (BTC)</label>
                                        <p style={hintStyle}>The minimum first bid amount.</p>
                                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.001"
                                                value={startPrice}
                                                onChange={(e) => isValidBtcInput(e.target.value) && setStartPrice(e.target.value)}
                                                style={inputStyle}
                                                autoFocus
                                            />
                                            <span style={suffixStyle}>BTC</span>
                                        </div>
                                        {startPrice && btcToSats(startPrice) > 0n && (
                                            <div style={satsHintStyle}>= {formatSats(btcToSats(startPrice))} sats</div>
                                        )}

                                        {/* Reserve Price */}
                                        <label style={labelStyle}>Reserve Price (BTC)</label>
                                        <p style={hintStyle}>Minimum price to sell. Set to 0 for no reserve.</p>
                                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.005"
                                                value={reservePrice}
                                                onChange={(e) => isValidBtcInput(e.target.value) && setReservePrice(e.target.value)}
                                                style={inputStyle}
                                            />
                                            <span style={suffixStyle}>BTC</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Dutch Start Price */}
                                        <label style={labelStyle}>Start Price (BTC)</label>
                                        <p style={hintStyle}>The highest price — auction starts here.</p>
                                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.01"
                                                value={dutchStartPrice}
                                                onChange={(e) => isValidBtcInput(e.target.value) && setDutchStartPrice(e.target.value)}
                                                style={inputStyle}
                                                autoFocus
                                            />
                                            <span style={suffixStyle}>BTC</span>
                                        </div>
                                        {dutchStartPrice && btcToSats(dutchStartPrice) > 0n && (
                                            <div style={satsHintStyle}>= {formatSats(btcToSats(dutchStartPrice))} sats</div>
                                        )}

                                        {/* Dutch End Price */}
                                        <label style={labelStyle}>Floor Price (BTC)</label>
                                        <p style={hintStyle}>The lowest price — auction won&#39;t go below this.</p>
                                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.001"
                                                value={dutchEndPrice}
                                                onChange={(e) => isValidBtcInput(e.target.value) && setDutchEndPrice(e.target.value)}
                                                style={inputStyle}
                                            />
                                            <span style={suffixStyle}>BTC</span>
                                        </div>
                                    </>
                                )}

                                {/* Duration */}
                                <label style={labelStyle}>Duration (blocks)</label>
                                <p style={hintStyle}>
                                    1 block &#8776; 10 minutes. Default 144 blocks &#8776; 1 day.
                                </p>
                                <div style={{ position: 'relative', marginBottom: '8px' }}>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        placeholder="144"
                                        value={durationBlocks}
                                        onChange={(e) => setDurationBlocks(e.target.value.replace(/\D/g, ''))}
                                        style={inputStyle}
                                    />
                                    <span style={suffixStyle}>blocks</span>
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: theme.colors.text.tertiary,
                                    marginBottom: '20px',
                                    fontFamily: theme.fonts.mono,
                                }}>
                                    &#8776; {durationHours < 1 ? `${Number(durationBlocks || 0) * 10}m` : durationHours < 24 ? `${durationHours}h` : `${Math.round(durationHours / 24)}d`}
                                </div>

                                {/* Quick duration presets */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                                    {[
                                        { label: '6h', blocks: '36' },
                                        { label: '1d', blocks: '144' },
                                        { label: '3d', blocks: '432' },
                                        { label: '7d', blocks: '1008' },
                                    ].map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setDurationBlocks(preset.blocks)}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                background: durationBlocks === preset.blocks ? `${accentColor}15` : theme.colors.bg.overlay,
                                                border: `1px solid ${durationBlocks === preset.blocks ? `${accentColor}40` : theme.colors.border.subtle}`,
                                                borderRadius: theme.radii.sm,
                                                color: durationBlocks === preset.blocks ? accentColor : theme.colors.text.secondary,
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                fontFamily: theme.fonts.mono,
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button variant="ghost" onClick={() => setStep('type')} style={{ flex: 1 }}>
                                        Back
                                    </Button>
                                    <Button
                                        fullWidth
                                        disabled={!isParamsValid}
                                        onClick={handleParamsProceed}
                                        style={{ flex: 2 }}
                                    >
                                        Continue
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Approval */}
                        {step === 'approval' && (
                            <div>
                                <div style={{
                                    padding: '16px',
                                    background: `${accentColor}08`,
                                    borderRadius: theme.radii.md,
                                    border: `1px solid ${accentColor}25`,
                                    marginBottom: '20px',
                                }}>
                                    <p style={{
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.text.secondary,
                                        margin: 0,
                                        lineHeight: 1.5,
                                    }}>
                                        To create an auction, you need to approve the AuctionHouse contract
                                        to transfer NFTs from this collection. This is a one-time approval per collection.
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
                                    <Button variant="ghost" onClick={() => setStep('params')} style={{ flex: 1 }}>
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

                        {/* Step 4: Confirm & Create */}
                        {step === 'confirm' && (
                            <div>
                                {/* Summary */}
                                <div style={{
                                    padding: '16px',
                                    background: theme.colors.bg.overlay,
                                    borderRadius: theme.radii.md,
                                    border: `1px solid ${theme.colors.border.subtle}`,
                                    marginBottom: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                }}>
                                    <div style={summaryRowStyle}>
                                        <span style={summaryLabelStyle}>Type</span>
                                        <span style={{
                                            ...summaryValueStyle,
                                            color: accentColor,
                                            fontWeight: 700,
                                        }}>
                                            {auctionType === 'english' ? 'English (Ascending Bids)' : 'Dutch (Descending Price)'}
                                        </span>
                                    </div>

                                    {auctionType === 'english' ? (
                                        <>
                                            <div style={summaryRowStyle}>
                                                <span style={summaryLabelStyle}>Starting Price</span>
                                                <span style={summaryValueStyle}>{startPrice} BTC</span>
                                            </div>
                                            <div style={summaryRowStyle}>
                                                <span style={summaryLabelStyle}>Reserve Price</span>
                                                <span style={summaryValueStyle}>
                                                    {reservePrice && btcToSats(reservePrice) > 0n ? `${reservePrice} BTC` : 'No reserve'}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={summaryRowStyle}>
                                                <span style={summaryLabelStyle}>Start Price</span>
                                                <span style={summaryValueStyle}>{dutchStartPrice} BTC</span>
                                            </div>
                                            <div style={summaryRowStyle}>
                                                <span style={summaryLabelStyle}>Floor Price</span>
                                                <span style={summaryValueStyle}>{dutchEndPrice} BTC</span>
                                            </div>
                                        </>
                                    )}

                                    <div style={summaryRowStyle}>
                                        <span style={summaryLabelStyle}>Duration</span>
                                        <span style={summaryValueStyle}>
                                            {Number(durationBlocks).toLocaleString()} blocks
                                            ({durationHours < 24 ? `~${durationHours}h` : `~${Math.round(durationHours / 24)}d`})
                                        </span>
                                    </div>
                                </div>

                                {/* Info about fees */}
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'rgba(255, 107, 0, 0.04)',
                                    borderRadius: theme.radii.md,
                                    border: '1px solid rgba(255, 107, 0, 0.12)',
                                    marginBottom: '20px',
                                    fontSize: '12px',
                                    color: theme.colors.text.secondary,
                                    lineHeight: 1.5,
                                }}>
                                    A 2% platform fee is charged on the final sale price. Royalties are enforced if set by the collection creator.
                                </div>

                                {(createError || auction.error) && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        borderRadius: theme.radii.md,
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        marginBottom: '16px',
                                        fontSize: theme.fontSize.sm,
                                        color: theme.colors.status.error,
                                    }}>
                                        {createError || auction.error}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button variant="ghost" onClick={() => setStep('params')} style={{ flex: 1 }}>
                                        Back
                                    </Button>
                                    <Button
                                        fullWidth
                                        loading={auction.isPending}
                                        onClick={handleCreate}
                                        style={{ flex: 2 }}
                                    >
                                        {auction.isPending ? 'Creating...' : 'Create Auction'}
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

/* ------------------------------------------------------------------ */
/*  Shared Styles                                                      */
/* ------------------------------------------------------------------ */

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: '4px',
    fontWeight: 500,
};

const hintStyle: React.CSSProperties = {
    fontSize: '12px',
    color: theme.colors.text.tertiary,
    margin: '0 0 8px 0',
    lineHeight: 1.4,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 60px 12px 16px',
    background: theme.colors.bg.overlay,
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.radii.md,
    color: theme.colors.text.primary,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fonts.mono,
    outline: 'none',
    boxSizing: 'border-box',
};

const suffixStyle: React.CSSProperties = {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.tertiary,
    fontWeight: 600,
};

const satsHintStyle: React.CSSProperties = {
    marginTop: '-12px',
    marginBottom: '16px',
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.mono,
};

const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const summaryLabelStyle: React.CSSProperties = {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.secondary,
};

const summaryValueStyle: React.CSSProperties = {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.mono,
    fontWeight: 600,
};
