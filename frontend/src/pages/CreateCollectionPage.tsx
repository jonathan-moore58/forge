import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { useDeployCollection } from '@/hooks/useDeployCollection';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CollectionFormData {
    readonly name: string;
    readonly symbol: string;
    readonly supply: string;
    readonly hiddenURI: string;
    readonly mintPrice: string;
    readonly royaltyPercent: string;
    readonly royaltyAddress: string;
    readonly icon: string;
    readonly banner: string;
    readonly description: string;
    readonly website: string;
}

type WizardStep = 1 | 2 | 3;

/* ------------------------------------------------------------------ */
/*  Default Data                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_FORM: CollectionFormData = {
    name: '',
    symbol: '',
    supply: '10000',
    hiddenURI: '',
    mintPrice: '0.001',
    royaltyPercent: '5',
    royaltyAddress: '',
    icon: '',
    banner: '',
    description: '',
    website: '',
};

const STEP_LABELS: readonly string[] = [
    'Collection Info',
    'Pricing & Royalties',
    'Review & Deploy',
];

const STEP_ICONS = [
    /* 1 Info */    <svg key="1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>,
    /* 2 Price */   <svg key="2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>,
    /* 3 Deploy */  <svg key="3" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>,
];

/* ------------------------------------------------------------------ */
/*  Shared Styles                                                      */
/* ------------------------------------------------------------------ */

const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.letterSpacing.wider,
    marginBottom: '6px',
    fontWeight: 600,
};

const baseInputStyle: CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: theme.colors.bg.interactive,
    border: `1px solid ${theme.colors.border.subtle}`,
    borderRadius: theme.radii.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.body,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: `border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast}`,
};

const fieldGroup: CSSProperties = {
    marginBottom: '18px',
};

/* Focus-enhancing wrapper for inputs */
function FocusInput({
    style,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { style?: CSSProperties }) {
    const [focused, setFocused] = useState(false);
    return (
        <input
            {...props}
            onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
            style={{
                ...baseInputStyle,
                ...style,
                borderColor: focused ? `${theme.colors.brand.orange}60` : theme.colors.border.subtle,
                boxShadow: focused ? `0 0 0 3px rgba(255, 107, 0, 0.06)` : 'none',
            }}
        />
    );
}

/* ------------------------------------------------------------------ */
/*  Step Components                                                    */
/* ------------------------------------------------------------------ */

function StepCollectionInfo({
    form,
    onChange,
}: {
    readonly form: CollectionFormData;
    readonly onChange: (patch: Partial<CollectionFormData>) => void;
}): JSX.Element {
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Collection Name *</label>
                    <FocusInput value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. BitPunks" />
                </div>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Symbol *</label>
                    <FocusInput value={form.symbol} onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() })} placeholder="e.g. BPNK" style={{ fontFamily: theme.fonts.mono }} />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Total Supply *</label>
                    <FocusInput type="number" value={form.supply} onChange={(e) => onChange({ supply: e.target.value })} />
                </div>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Base URI (Initial)</label>
                    <FocusInput value={form.hiddenURI} onChange={(e) => onChange({ hiddenURI: e.target.value })} placeholder="ipfs://QmFolderCID/" />
                    <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                        IPFS folder URI with trailing slash. tokenURI(N) = baseURI + N.
                        Use hidden folder CID before reveal, then setBaseURI() to reveal.
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: theme.colors.border.subtle, margin: '20px 0 16px' }} />

            {/* Collection Branding */}
            <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: theme.letterSpacing.wider, fontWeight: 600, marginBottom: '12px' }}>
                Collection Branding
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Icon / Avatar URI</label>
                    <FocusInput value={form.icon} onChange={(e) => onChange({ icon: e.target.value })} placeholder="ipfs://... (square logo)" />
                    <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                        Collection thumbnail. IPFS recommended.
                    </div>
                </div>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Banner URI</label>
                    <FocusInput value={form.banner} onChange={(e) => onChange({ banner: e.target.value })} placeholder="ipfs://... (wide header)" />
                    <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                        Collection page header image.
                    </div>
                </div>
            </div>
            <div style={fieldGroup}>
                <label style={labelStyle}>Description</label>
                <FocusInput value={form.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Brief description of your collection" />
            </div>
            <div style={fieldGroup}>
                <label style={labelStyle}>Website</label>
                <FocusInput value={form.website} onChange={(e) => onChange({ website: e.target.value })} placeholder="https://your-project.com" />
            </div>
        </div>
    );
}

function StepPricingRoyalties({
    form,
    onChange,
}: {
    readonly form: CollectionFormData;
    readonly onChange: (patch: Partial<CollectionFormData>) => void;
}): JSX.Element {
    return (
        <div>
            <div style={fieldGroup}>
                <label style={labelStyle}>Mint Price (BTC) *</label>
                <FocusInput
                    type="number"
                    step={0.001}
                    min={0}
                    value={form.mintPrice}
                    onChange={(e) => onChange({ mintPrice: e.target.value })}
                    style={{ fontFamily: theme.fonts.mono }}
                />
                <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                    {form.mintPrice && parseFloat(form.mintPrice) > 0
                        ? `= ${Math.round(parseFloat(form.mintPrice) * 1e8).toLocaleString()} sats`
                        : 'Set to 0 for free mint'}
                </div>
            </div>

            <div style={{
                height: '1px',
                background: theme.colors.border.subtle,
                margin: '24px 0',
            }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Royalty %</label>
                    <FocusInput
                        type="number"
                        min={0}
                        max={15}
                        step={0.5}
                        value={form.royaltyPercent}
                        onChange={(e) => onChange({ royaltyPercent: e.target.value })}
                    />
                    <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, marginTop: '4px' }}>
                        Max 15%. Charged on secondary sales.
                    </div>
                </div>
                <div style={fieldGroup}>
                    <label style={labelStyle}>Royalty Address</label>
                    <FocusInput
                        value={form.royaltyAddress}
                        onChange={(e) => onChange({ royaltyAddress: e.target.value })}
                        placeholder="Leave blank to use your wallet"
                        style={{ fontFamily: theme.fonts.mono, fontSize: '13px' }}
                    />
                </div>
            </div>
        </div>
    );
}

function StepReview({ form }: { readonly form: CollectionFormData }): JSX.Element {
    const sectionStyle: CSSProperties = {
        padding: '16px',
        background: theme.colors.bg.overlay,
        borderRadius: theme.radii.lg,
        border: `1px solid ${theme.colors.border.subtle}`,
        marginBottom: '12px',
    };

    const sectionTitle: CSSProperties = {
        fontFamily: theme.fonts.heading,
        fontWeight: 700,
        fontSize: '13px',
        marginBottom: '12px',
        color: theme.colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: theme.letterSpacing.wider,
    };

    const row: CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '7px 0',
        fontSize: '13px',
    };

    return (
        <div>
            {/* Collection Info */}
            <div style={sectionStyle}>
                <h4 style={sectionTitle}>Collection Info</h4>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Name</span>
                    <span style={{ fontWeight: 600 }}>{form.name || '--'}</span>
                </div>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Symbol</span>
                    <span style={{ fontWeight: 600, fontFamily: theme.fonts.mono }}>{form.symbol || '--'}</span>
                </div>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Supply</span>
                    <span style={{ fontWeight: 600, fontFamily: theme.fonts.mono }}>{Number(form.supply).toLocaleString()}</span>
                </div>
                {form.hiddenURI && (
                    <div style={row}>
                        <span style={{ color: theme.colors.text.tertiary }}>Base URI</span>
                        <span style={{
                            fontFamily: theme.fonts.mono,
                            fontSize: '12px',
                            maxWidth: '280px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {form.hiddenURI}
                        </span>
                    </div>
                )}
            </div>

            {/* Branding */}
            {(form.icon || form.banner || form.description || form.website) && (
                <div style={sectionStyle}>
                    <h4 style={sectionTitle}>Branding</h4>
                    {form.icon && (
                        <div style={row}>
                            <span style={{ color: theme.colors.text.tertiary }}>Icon</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {form.icon}
                            </span>
                        </div>
                    )}
                    {form.banner && (
                        <div style={row}>
                            <span style={{ color: theme.colors.text.tertiary }}>Banner</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {form.banner}
                            </span>
                        </div>
                    )}
                    {form.description && (
                        <div style={row}>
                            <span style={{ color: theme.colors.text.tertiary }}>Description</span>
                            <span style={{ fontSize: '12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {form.description}
                            </span>
                        </div>
                    )}
                    {form.website && (
                        <div style={row}>
                            <span style={{ color: theme.colors.text.tertiary }}>Website</span>
                            <span style={{ fontFamily: theme.fonts.mono, fontSize: '12px' }}>
                                {form.website}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Pricing & Royalties */}
            <div style={sectionStyle}>
                <h4 style={sectionTitle}>Pricing & Royalties</h4>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Mint Price</span>
                    <span style={{ fontWeight: 600, fontFamily: theme.fonts.mono }}>
                        {form.mintPrice} BTC
                    </span>
                </div>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Royalty</span>
                    <span style={{ fontWeight: 600 }}>{form.royaltyPercent}%</span>
                </div>
                <div style={row}>
                    <span style={{ color: theme.colors.text.tertiary }}>Royalty Address</span>
                    <span style={{
                        fontFamily: theme.fonts.mono,
                        fontSize: '12px',
                        maxWidth: '280px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {form.royaltyAddress || 'Your wallet'}
                    </span>
                </div>
            </div>

            {/* Gas Estimate */}
            <div style={{
                padding: '16px 20px',
                borderRadius: theme.radii.lg,
                background: 'rgba(255, 107, 0, 0.04)',
                border: `1px solid rgba(255, 107, 0, 0.12)`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div>
                    <div style={{
                        fontSize: '10px',
                        color: theme.colors.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: theme.letterSpacing.wider,
                        marginBottom: '4px',
                        fontWeight: 600,
                    }}>
                        Estimated Cost
                    </div>
                    <div style={{
                        fontFamily: theme.fonts.mono,
                        fontSize: '20px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        ~0.002 BTC
                    </div>
                </div>
                <div style={{
                    padding: '6px 12px',
                    borderRadius: theme.radii.full,
                    background: theme.colors.bg.interactive,
                    fontSize: '12px',
                    color: theme.colors.text.tertiary,
                    fontFamily: theme.fonts.mono,
                }}>
                    2-3 transactions
                </div>
            </div>

            {/* Info note */}
            <div style={{
                marginTop: '12px',
                padding: '12px 16px',
                borderRadius: theme.radii.md,
                background: 'rgba(59, 130, 246, 0.04)',
                border: '1px solid rgba(59, 130, 246, 0.1)',
                fontSize: '12px',
                color: theme.colors.text.secondary,
                lineHeight: 1.6,
            }}>
                Deployment requires <strong>2-3 wallet confirmations</strong>. TX1 deploys the contract.
                TX2 initializes everything (name, symbol, supply, price, royalties).
                TX3 sets branding (icon, banner, etc.) — only if you filled in branding fields above.
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Step Indicator (Vertical)                                          */
/* ------------------------------------------------------------------ */

function StepIndicator({
    currentStep,
}: {
    readonly currentStep: WizardStep;
}): JSX.Element {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {STEP_LABELS.map((label, i) => {
                const stepNum = (i + 1) as WizardStep;
                const isCompleted = stepNum < currentStep;
                const isCurrent = stepNum === currentStep;
                const isLast = i === STEP_LABELS.length - 1;

                return (
                    <div key={label}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 14px',
                            borderRadius: theme.radii.md,
                            background: isCurrent ? 'rgba(255, 107, 0, 0.04)' : 'transparent',
                            border: isCurrent ? `1px solid rgba(255, 107, 0, 0.1)` : '1px solid transparent',
                            transition: `all ${theme.transitions.fast}`,
                        }}>
                            <div style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                flexShrink: 0,
                                background: isCompleted
                                    ? 'rgba(20, 241, 149, 0.12)'
                                    : isCurrent
                                        ? theme.colors.brand.orange
                                        : theme.colors.bg.interactive,
                                color: isCompleted
                                    ? theme.colors.brand.green
                                    : isCurrent
                                        ? '#fff'
                                        : theme.colors.text.tertiary,
                                border: isCurrent
                                    ? 'none'
                                    : isCompleted
                                        ? `1px solid rgba(20, 241, 149, 0.2)`
                                        : `1px solid ${theme.colors.border.subtle}`,
                                boxShadow: isCurrent
                                    ? `0 0 12px rgba(255, 107, 0, 0.3)`
                                    : 'none',
                            }}>
                                {isCompleted ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : isCurrent ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {STEP_ICONS[i]}
                                    </span>
                                ) : (
                                    stepNum
                                )}
                            </div>
                            <div>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: isCurrent ? 600 : 400,
                                    color: isCurrent
                                        ? theme.colors.text.primary
                                        : isCompleted
                                            ? theme.colors.text.secondary
                                            : theme.colors.text.tertiary,
                                }}>
                                    {label}
                                </div>
                            </div>
                        </div>
                        {/* Connecting line */}
                        {!isLast && (
                            <div style={{
                                width: '2px',
                                height: '8px',
                                marginLeft: '24px',
                                background: isCompleted ? 'rgba(20, 241, 149, 0.2)' : theme.colors.border.subtle,
                                transition: `background ${theme.transitions.base}`,
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Deploy Overlay                                                     */
/* ------------------------------------------------------------------ */

interface DeployOverlayProps {
    readonly status: import('@/hooks/useDeployCollection').DeployStatus;
    readonly contractAddress: string | null;
    readonly error: string | null;
    readonly hasBranding: boolean;
    readonly onClose: () => void;
    readonly onRetry: () => void;
    readonly onViewCollection: () => void;
}

const ALL_DEPLOY_STAGES = [
    { key: 'deploying', label: 'Deploying contract — confirm in wallet...' },
    { key: 'waiting', label: 'Waiting for deploy TX to be mined...' },
    { key: 'initializing', label: 'Initializing collection — confirm in wallet...' },
    { key: 'verifying', label: 'Verifying initialization on-chain...' },
    { key: 'branding', label: 'Setting branding — confirm in wallet...' },
    { key: 'confirmed', label: 'Collection deployed!' },
] as const;

function DeployOverlay({ status, contractAddress, error, hasBranding, onClose, onRetry, onViewCollection }: DeployOverlayProps) {
    // Filter stages: skip optional TXs that user didn't fill
    const stages = useMemo(
        () => ALL_DEPLOY_STAGES.filter((s) => {
            if (s.key === 'branding' && !hasBranding) return false;
            return true;
        }),
        [hasBranding],
    );
    const currentStage = stages.findIndex((s) => s.key === status);
    const isComplete = status === 'confirmed';
    const isError = status === 'error';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(5, 5, 8, 0.9)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: theme.zIndex.modal,
            }}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                style={{
                    width: '440px',
                    padding: '40px',
                    background: theme.colors.bg.raised,
                    borderRadius: theme.radii.xl,
                    border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.2)' : isComplete ? 'rgba(20, 241, 149, 0.2)' : theme.colors.border.subtle}`,
                    textAlign: 'center',
                }}
            >
                {/* Header icon */}
                <div style={{ marginBottom: '24px' }}>
                    {isComplete ? (
                        <svg width="56" height="56" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="24" fill="none" stroke={theme.colors.brand.green} strokeWidth="3" />
                            <path d="M18 28l7 7L38 21" fill="none" stroke={theme.colors.brand.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : isError ? (
                        <svg width="56" height="56" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="24" fill="none" stroke={theme.colors.status.error} strokeWidth="3" />
                            <path d="M20 20l16 16M36 20l-16 16" fill="none" stroke={theme.colors.status.error} strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'spin 2s linear infinite' }}>
                            <circle cx="28" cy="28" r="24" fill="none" stroke={theme.colors.bg.interactive} strokeWidth="3" />
                            <path d="M28 4a24 24 0 0 1 24 24" fill="none" stroke={theme.colors.brand.orange} strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    )}
                </div>

                <h3 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: '20px',
                    fontWeight: 700,
                    marginBottom: '8px',
                }}>
                    {isComplete ? 'Collection Deployed!' : isError ? 'Deployment Failed' : status === 'waiting' ? 'Waiting for Confirmation...' : status === 'initializing' ? 'Initializing...' : status === 'verifying' ? 'Verifying...' : status === 'branding' ? 'Setting Branding...' : 'Deploying Collection'}
                </h3>
                <p style={{
                    fontSize: '13px',
                    color: theme.colors.text.tertiary,
                    marginBottom: '24px',
                }}>
                    {isComplete
                        ? 'Your collection is live! It will appear on the launchpad shortly.'
                        : isError
                            ? 'Something went wrong during deployment.'
                            : status === 'waiting'
                                ? 'Deploy TX broadcast. Waiting for it to be mined on-chain...'
                                : status === 'initializing'
                                    ? 'Confirm the initialize transaction in your wallet.'
                                    : status === 'verifying'
                                        ? 'Checking that initialization succeeded on-chain...'
                                        : status === 'branding'
                                            ? 'Confirm the branding transaction in your wallet.'
                                            : 'Confirm the deployment transaction in your wallet.'}
                </p>

                {/* Stage progress */}
                {!isError && (
                    <div style={{ textAlign: 'left' }}>
                        {stages.map((s, i) => (
                            <motion.div
                                key={s.key}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: i <= currentStage ? 1 : 0.3, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '6px 0',
                                    fontSize: '13px',
                                    color: i < currentStage
                                        ? theme.colors.brand.green
                                        : i === currentStage
                                            ? theme.colors.text.primary
                                            : theme.colors.text.tertiary,
                                }}
                            >
                                {i < currentStage ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.green} strokeWidth="2.5">
                                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : i === currentStage && !isComplete ? (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16">
                                            <circle cx="8" cy="8" r="6" fill="none" stroke={theme.colors.bg.interactive} strokeWidth="2" />
                                            <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={theme.colors.brand.orange} strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </motion.div>
                                ) : i === currentStage && isComplete ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.green} strokeWidth="2.5">
                                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : (
                                    <div style={{
                                        width: '14px',
                                        height: '14px',
                                        borderRadius: '50%',
                                        border: `1px solid ${theme.colors.border.subtle}`,
                                    }} />
                                )}
                                {s.label}
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Error details */}
                {isError && error && (
                    <div style={{
                        textAlign: 'left',
                        padding: '12px 16px',
                        borderRadius: theme.radii.md,
                        background: 'rgba(239, 68, 68, 0.06)',
                        border: '1px solid rgba(239, 68, 68, 0.12)',
                        fontSize: '12px',
                        color: theme.colors.status.error,
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                        maxHeight: '120px',
                        overflow: 'auto',
                    }}>
                        {error}
                    </div>
                )}

                {/* Contract address on success */}
                {isComplete && contractAddress && (
                    <div style={{
                        marginTop: '8px',
                        padding: '10px 14px',
                        borderRadius: theme.radii.md,
                        background: 'rgba(20, 241, 149, 0.04)',
                        border: '1px solid rgba(20, 241, 149, 0.1)',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: theme.colors.text.secondary,
                        wordBreak: 'break-all',
                        textAlign: 'left',
                    }}>
                        <span style={{ fontSize: '10px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Contract Address
                        </span>
                        <br />
                        {contractAddress}
                    </div>
                )}

                {/* Progress bar */}
                {!isError && !isComplete && (
                    <div style={{
                        marginTop: '20px',
                        height: '4px',
                        borderRadius: '2px',
                        background: theme.colors.bg.interactive,
                        overflow: 'hidden',
                    }}>
                        <motion.div
                            animate={{ width: `${((currentStage + 1) / stages.length) * 100}%` }}
                            transition={{ duration: 0.5 }}
                            style={{
                                height: '100%',
                                background: theme.gradients.orangeToPurple,
                                borderRadius: '2px',
                            }}
                        />
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    {isError && (
                        <>
                            <Button variant="ghost" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button onClick={onRetry}>
                                Try Again
                            </Button>
                        </>
                    )}
                    {isComplete && (
                        <>
                            <Button variant="ghost" onClick={onClose}>
                                Close
                            </Button>
                            <Button onClick={onViewCollection}>
                                View Collection
                            </Button>
                        </>
                    )}
                </div>

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </motion.div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function validateStep(step: WizardStep, form: CollectionFormData): readonly string[] {
    const errors: string[] = [];
    switch (step) {
        case 1:
            if (!form.name.trim()) errors.push('Collection name is required');
            if (!form.symbol.trim()) errors.push('Symbol is required');
            if (!form.supply || parseInt(form.supply, 10) <= 0) errors.push('Supply must be greater than 0');
            break;
        case 2:
            if (!form.mintPrice || parseFloat(form.mintPrice) < 0) {
                errors.push('Mint price cannot be negative');
            }
            if (parseFloat(form.royaltyPercent) > 15) errors.push('Royalty cannot exceed 15%');
            if (parseFloat(form.royaltyPercent) < 0) errors.push('Royalty cannot be negative');
            break;
        case 3:
            break;
    }
    return errors;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export function CreateCollectionPage(): JSX.Element {
    const navigate = useNavigate();
    const { address: walletAddr } = useWalletConnect();
    const [step, setStep] = useState<WizardStep>(1);
    const [form, setForm] = useState<CollectionFormData>(DEFAULT_FORM);
    const [errors, setErrors] = useState<readonly string[]>([]);
    const [deploying, setDeploying] = useState(false);
    const {
        deploy,
        status: deployStatus,
        contractAddress: deployedAddress,
        error: deployError,
        reset: resetDeploy,
    } = useDeployCollection();

    const hasBranding = !!(form.icon || form.banner || form.description || form.website);

    const updateForm = useCallback((patch: Partial<CollectionFormData>) => {
        setForm((prev) => ({ ...prev, ...patch }));
        setErrors([]);
    }, []);

    const goNext = useCallback(() => {
        const stepErrors = validateStep(step, form);
        if (stepErrors.length > 0) {
            setErrors(stepErrors);
            return;
        }
        setErrors([]);
        if (step < 3) {
            setStep((step + 1) as WizardStep);
        }
    }, [step, form]);

    const goBack = useCallback(() => {
        if (step > 1) {
            setStep((step - 1) as WizardStep);
            setErrors([]);
        }
    }, [step]);

    const handleDeploy = useCallback(async () => {
        // Validate all steps before deploying
        const allErrors = [
            ...validateStep(1, form),
            ...validateStep(2, form),
        ];
        if (allErrors.length > 0) {
            setErrors(allErrors);
            return;
        }
        setDeploying(true);
        try {
            const mintPriceSats = BigInt(Math.round(parseFloat(form.mintPrice || '0') * 1e8));
            const royaltyBps = BigInt(Math.round(parseFloat(form.royaltyPercent || '0') * 100));

            await deploy({
                name: form.name.trim(),
                symbol: form.symbol.trim().toUpperCase(),
                supply: parseInt(form.supply, 10),
                mintPrice: mintPriceSats,
                hiddenURI: form.hiddenURI || '',
                royaltyBps,
                royaltyRecipient: form.royaltyAddress || (walletAddr ? String(walletAddr) : ''),
                icon: form.icon.trim(),
                banner: form.banner.trim(),
                description: form.description.trim(),
                website: form.website.trim(),
            });
        } catch {
            // Error is captured in the hook state
        }
    }, [form, deploy, walletAddr]);

    return (
        <div style={{
            maxWidth: '960px',
            margin: '0 auto',
            padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
        }}>
            {/* Gradient mesh background */}
            <div style={{
                position: 'fixed',
                inset: 0,
                background: theme.gradients.meshCool,
                pointerEvents: 'none',
                zIndex: -1,
            }} />

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginBottom: theme.spacing.xl }}
            >
                <h1 style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: '36px',
                    fontWeight: 700,
                    letterSpacing: theme.letterSpacing.tight,
                    marginBottom: '6px',
                }}>
                    Create Collection
                </h1>
                <p style={{ fontSize: '15px', color: theme.colors.text.secondary }}>
                    Launch your NFT collection on Bitcoin in 3 steps.
                </p>
            </motion.div>

            {/* Progress bar */}
            <div style={{
                height: '3px',
                background: theme.colors.bg.interactive,
                borderRadius: '2px',
                overflow: 'hidden',
                marginBottom: theme.spacing.xl,
            }}>
                <motion.div
                    animate={{ width: `${(step / 3) * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        height: '100%',
                        background: theme.gradients.orangeToPurple,
                        borderRadius: '2px',
                    }}
                />
            </div>

            {/* Two-column layout: sidebar + content */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                gap: theme.spacing.xl,
                alignItems: 'start',
            }}>
                {/* Left: Step indicator */}
                <div style={{ position: 'sticky', top: '100px' }}>
                    <StepIndicator currentStep={step} />
                </div>

                {/* Right: Step content */}
                <GlassCard style={{ padding: '28px 32px' }}>
                    {/* Step header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '24px',
                    }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: theme.radii.md,
                            background: 'rgba(255, 107, 0, 0.08)',
                            border: `1px solid rgba(255, 107, 0, 0.15)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme.colors.brand.orange,
                        }}>
                            {STEP_ICONS[step - 1]}
                        </div>
                        <div>
                            <div style={{ fontSize: '11px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: theme.letterSpacing.wider, fontWeight: 500 }}>
                                Step {step} of 3
                            </div>
                            <h2 style={{
                                fontFamily: theme.fonts.heading,
                                fontSize: '20px',
                                fontWeight: 700,
                            }}>
                                {STEP_LABELS[step - 1]}
                            </h2>
                        </div>
                    </div>

                    {/* Step content with slide animation */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {step === 1 && <StepCollectionInfo form={form} onChange={updateForm} />}
                            {step === 2 && <StepPricingRoyalties form={form} onChange={updateForm} />}
                            {step === 3 && <StepReview form={form} />}
                        </motion.div>
                    </AnimatePresence>

                    {/* Errors */}
                    <AnimatePresence>
                        {errors.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    marginTop: '16px',
                                    padding: '12px 16px',
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    border: '1px solid rgba(239, 68, 68, 0.12)',
                                }}
                            >
                                {errors.map((err) => (
                                    <div key={err} style={{
                                        fontSize: '13px',
                                        color: theme.colors.status.error,
                                        marginBottom: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}>
                                        <span style={{ fontSize: '10px' }}>{'\u2717'}</span>
                                        {err}
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Navigation */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '24px',
                        paddingTop: '20px',
                        borderTop: `1px solid ${theme.colors.border.subtle}`,
                    }}>
                        <Button variant="ghost" onClick={goBack} disabled={step === 1}>
                            Back
                        </Button>
                        {step < 3 ? (
                            <Button onClick={goNext}>
                                Continue
                            </Button>
                        ) : (
                            <Button variant="shine" onClick={handleDeploy}>
                                Deploy Collection
                            </Button>
                        )}
                    </div>
                </GlassCard>
            </div>

            {/* Deploy overlay */}
            <AnimatePresence>
                {deploying && (
                    <DeployOverlay
                        status={deployStatus}
                        contractAddress={deployedAddress}
                        error={deployError}
                        hasBranding={hasBranding}
                        onClose={() => { setDeploying(false); resetDeploy(); }}
                        onRetry={handleDeploy}
                        onViewCollection={() => {
                            setDeploying(false);
                            resetDeploy();
                            if (deployedAddress) navigate(`/collection/${deployedAddress}`);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
