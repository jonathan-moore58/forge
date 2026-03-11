import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useNetwork } from '@/hooks/useNetwork';
import { useLendingActions } from '@/hooks/useLendingActions';
import {
    useLendingStats,
    usePendingLoans,
    useMyBorrowedLoans,
    useMyFundedLoans,
    type LoanItem,
} from '@/hooks/useLending';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { StatCard } from '@/components/common/StatCard';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LendingTab = 'borrow' | 'lend';

interface BorrowFormState {
    collection: string;
    tokenId: string;
    paymentToken: string;
    loanAmount: string;
    interestBps: number;
    durationKey: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Duration presets: label -> block count (Bitcoin ~10 min/block) */
const DURATION_OPTIONS: readonly { readonly value: string; readonly label: string; readonly blocks: number }[] = [
    { value: '1d', label: '1 Day', blocks: 144 },
    { value: '1w', label: '1 Week', blocks: 1_008 },
    { value: '1m', label: '1 Month', blocks: 4_320 },
    { value: '3m', label: '3 Months', blocks: 12_960 },
];

const PAYMENT_TOKENS = ['MOTO', 'PILL'] as const;

const STATUS_LABELS: Record<number, string> = {
    0: 'pending',
    1: 'active',
    2: 'repaid',
    3: 'defaulted',
    4: 'cancelled',
};

const ANIM_EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortenAddr(addr: string): string {
    if (addr.length < 14) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function bpsToPercent(bps: number): string {
    return (bps / 100).toFixed(2);
}

function formatAmount(sats: string): string {
    try {
        return Number(sats).toLocaleString();
    } catch {
        return sats;
    }
}

function durationBlocksToLabel(blocks: number): string {
    const match = DURATION_OPTIONS.find((o) => o.blocks === blocks);
    if (match) return match.label;
    if (blocks < 144) return `${blocks} blocks`;
    const days = Math.round(blocks / 144);
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}m`;
}

function getStatusLabel(status: number): string {
    return STATUS_LABELS[status] ?? 'unknown';
}

/* ------------------------------------------------------------------ */
/*  Shared inline styles (using theme tokens)                          */
/* ------------------------------------------------------------------ */

const cardStyle: React.CSSProperties = {
    background: theme.colors.bg.card,
    backdropFilter: 'blur(16px)',
    border: `1px solid ${theme.colors.border.subtle}`,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    boxShadow: theme.shadows.card,
};

const buttonStyle: React.CSSProperties = {
    background: theme.colors.brand.orange,
    color: theme.colors.text.primary,
    borderRadius: theme.radii.md,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    padding: '12px 24px',
    fontSize: theme.fontSize.base,
    fontFamily: theme.fonts.body,
    transition: `opacity ${theme.transitions.base}`,
};

const buttonDangerStyle: React.CSSProperties = {
    background: theme.colors.status.error,
    color: theme.colors.text.primary,
    borderRadius: theme.radii.md,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    padding: '10px 20px',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fonts.body,
    transition: `opacity ${theme.transitions.base}`,
};

const buttonDisabledStyle: React.CSSProperties = {
    background: theme.colors.bg.interactive,
    color: theme.colors.text.tertiary,
    borderRadius: theme.radii.md,
    border: 'none',
    cursor: 'not-allowed',
    fontWeight: 600,
    padding: '10px 20px',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fonts.body,
};

const inputStyle: React.CSSProperties = {
    background: theme.colors.bg.overlay,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.radii.md,
    padding: '12px 16px',
    width: '100%',
    fontSize: theme.fontSize.base,
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: theme.fonts.body,
    transition: `border-color ${theme.transitions.base}`,
};

const selectStyle: React.CSSProperties = {
    background: theme.colors.bg.overlay,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.radii.md,
    padding: '12px 16px',
    width: '100%',
    fontSize: theme.fontSize.base,
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
    fontFamily: theme.fonts.body,
    appearance: 'none' as const,
    transition: `border-color ${theme.transitions.base}`,
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: '6px',
    fontWeight: 500,
    fontFamily: theme.fonts.body,
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: theme.fontSize.xl,
    fontWeight: 700,
    color: theme.colors.text.primary,
    margin: '0 0 20px 0',
    letterSpacing: theme.letterSpacing.snug,
    fontFamily: theme.fonts.heading,
};

/* ------------------------------------------------------------------ */
/*  Hero Visual — Animated NFT Lending Concept                         */
/* ------------------------------------------------------------------ */

function LendingHeroVisual(): JSX.Element {
    return (
        <div style={{ position: 'relative', height: '100%', minHeight: '420px', perspective: '1000px' }}>
            {/* Decorative rings */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '300px', height: '300px', borderRadius: '50%',
                border: '1px solid rgba(255, 107, 0, 0.06)',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '200px', height: '200px', borderRadius: '50%',
                border: '1px solid rgba(0, 212, 255, 0.04)',
                pointerEvents: 'none',
            }} />

            {/* NFT Card — the collateral */}
            <motion.div
                initial={{ opacity: 0, y: 50, rotateY: 15 }}
                animate={{ opacity: 1, y: 0, rotateY: -4 }}
                transition={{ duration: 0.9, delay: 0.3, ease: ANIM_EASE }}
                style={{
                    position: 'absolute', top: '5%', left: '10%',
                    width: '200px',
                    borderRadius: '16px',
                    background: `linear-gradient(145deg, ${theme.colors.bg.raised} 0%, ${theme.colors.bg.overlay} 100%)`,
                    border: `1px solid ${theme.colors.border.default}`,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 107, 0, 0.06)',
                    overflow: 'hidden',
                    zIndex: 3,
                    animation: 'lending-float-1 7s ease-in-out infinite',
                }}
            >
                {/* NFT Image area */}
                <div style={{
                    height: '140px',
                    background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.18) 0%, rgba(153, 69, 255, 0.12) 50%, rgba(0, 212, 255, 0.08) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                }}>
                    {/* NFT shape */}
                    <div style={{
                        width: '52px', height: '52px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, #ff6b00 0%, #ff8c3a 100%)',
                        transform: 'rotate(45deg)',
                        boxShadow: '0 8px 24px rgba(255, 107, 0, 0.35)',
                    }} />
                    {/* Lock overlay */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.2, duration: 0.5, ease: ANIM_EASE }}
                        style={{
                            position: 'absolute', bottom: '8px', right: '8px',
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(8px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid rgba(255, 107, 0, 0.3)',
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.orange} strokeWidth="2.5" strokeLinecap="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </motion.div>
                </div>
                {/* NFT Info */}
                <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '10px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Collateral</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: theme.colors.text.primary, marginTop: '2px', fontFamily: theme.fonts.heading }}>Genesis #0042</div>
                    <div style={{ fontSize: '11px', color: theme.colors.text.secondary, marginTop: '4px', fontFamily: theme.fonts.mono }}>Locked in contract</div>
                </div>
            </motion.div>

            {/* Token flow card — what borrower receives */}
            <motion.div
                initial={{ opacity: 0, x: 40, rotateY: -10 }}
                animate={{ opacity: 1, x: 0, rotateY: 3 }}
                transition={{ duration: 0.9, delay: 0.6, ease: ANIM_EASE }}
                style={{
                    position: 'absolute', top: '25%', right: '5%',
                    width: '180px',
                    borderRadius: '16px',
                    background: `linear-gradient(145deg, ${theme.colors.bg.raised} 0%, rgba(20, 241, 149, 0.03) 100%)`,
                    border: `1px solid rgba(20, 241, 149, 0.12)`,
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), 0 0 30px rgba(20, 241, 149, 0.04)',
                    padding: '16px',
                    zIndex: 2,
                    animation: 'lending-float-2 8s ease-in-out infinite',
                }}
            >
                <div style={{ fontSize: '10px', color: theme.colors.brand.green, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '10px' }}>Tokens Received</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #14f195 0%, #0cb77a 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 800, color: '#0A0A0F',
                    }}>M</div>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.text.primary, fontFamily: theme.fonts.heading }}>50,000</div>
                        <div style={{ fontSize: '10px', color: theme.colors.text.tertiary }}>MOTO tokens</div>
                    </div>
                </div>
                {/* Progress bar showing loan health */}
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: theme.colors.text.tertiary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <span>Loan Health</span>
                        <span style={{ color: theme.colors.brand.green }}>Active</span>
                    </div>
                    <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '72%' }}
                            transition={{ delay: 1.5, duration: 1, ease: ANIM_EASE }}
                            style={{ height: '100%', borderRadius: '2px', background: `linear-gradient(90deg, ${theme.colors.brand.green}, ${theme.colors.brand.cyan})` }}
                        />
                    </div>
                </div>
            </motion.div>

            {/* Interest card — floating small card */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.9, ease: ANIM_EASE }}
                style={{
                    position: 'absolute', bottom: '8%', left: '25%',
                    borderRadius: '12px',
                    background: theme.colors.bg.raised,
                    border: `1px solid ${theme.colors.border.default}`,
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
                    padding: '12px 18px',
                    zIndex: 4,
                    animation: 'lending-float-3 6s ease-in-out infinite',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '24px', height: '24px', borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px',
                    }}>
                        %
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.colors.brand.gold, fontFamily: theme.fonts.heading }}>10% APR</div>
                        <div style={{ fontSize: '9px', color: theme.colors.text.tertiary }}>Interest Rate</div>
                    </div>
                </div>
            </motion.div>

            {/* Animated connection line — from NFT to Tokens */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                <motion.path
                    d="M 180 160 C 240 160, 260 200, 300 200"
                    fill="none"
                    stroke="url(#lendingGrad)"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.5 }}
                    transition={{ delay: 1, duration: 1.2, ease: ANIM_EASE }}
                />
                <defs>
                    <linearGradient id="lendingGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={theme.colors.brand.orange} />
                        <stop offset="100%" stopColor={theme.colors.brand.green} />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function LoanCard({
    loan,
    actionLabel,
    onAction,
    showBorrower,
    disabled,
}: {
    readonly loan: LoanItem;
    readonly actionLabel: string;
    readonly onAction: (loan: LoanItem) => void;
    readonly showBorrower?: boolean;
    readonly disabled?: boolean;
}): JSX.Element {
    const [hovered, setHovered] = useState(false);
    const statusLabel = getStatusLabel(loan.status);

    const statusColor =
        statusLabel === 'pending' ? theme.colors.status.warning
        : statusLabel === 'active' ? theme.colors.status.success
        : theme.colors.status.error;

    const statusBg =
        statusLabel === 'pending' ? 'rgba(245, 158, 11, 0.1)'
        : statusLabel === 'active' ? 'rgba(20, 241, 149, 0.1)'
        : 'rgba(239, 68, 68, 0.1)';

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
                ...cardStyle,
                transition: `border-color ${theme.transitions.base}, box-shadow ${theme.transitions.base}`,
                borderColor: hovered ? theme.colors.border.accent : theme.colors.border.subtle,
                boxShadow: hovered ? theme.shadows.cardHover : theme.shadows.card,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                <div>
                    <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, marginBottom: '4px' }}>Collection</div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.primary, fontWeight: 600, fontFamily: theme.fonts.mono }}>
                        {shortenAddr(loan.collection)}
                    </div>
                </div>
                <div style={{
                    padding: '4px 10px',
                    borderRadius: theme.radii.sm,
                    fontSize: theme.fontSize.xs,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: theme.letterSpacing.wider,
                    background: statusBg,
                    color: statusColor,
                }}>
                    {statusLabel}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: theme.spacing.md }}>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Token ID</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.text.primary, fontWeight: 600 }}>#{loan.tokenId}</div>
                </div>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Amount</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.brand.orange, fontWeight: 600 }}>
                        {formatAmount(loan.amount)} <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.secondary }}>sats</span>
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Interest</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.text.primary, fontWeight: 600 }}>
                        {bpsToPercent(loan.interestBps)}%
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Duration</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.text.primary, fontWeight: 600 }}>
                        {durationBlocksToLabel(loan.durationBlocks)}
                    </div>
                </div>
            </div>

            {showBorrower && (
                <div style={{ marginBottom: theme.spacing.md }}>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Borrower</div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.secondary, fontFamily: theme.fonts.mono }}>
                        {shortenAddr(loan.borrower)}
                    </div>
                </div>
            )}

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${theme.colors.border.subtle}`,
                paddingTop: theme.spacing.md,
            }}>
                <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono }}>
                    {shortenAddr(loan.paymentToken)}
                </span>
                <button
                    style={disabled ? buttonDisabledStyle : actionLabel === 'Claim Default' ? buttonDangerStyle : buttonStyle}
                    onClick={() => !disabled && onAction(loan)}
                    disabled={disabled}
                >
                    {actionLabel}
                </button>
            </div>
        </motion.div>
    );
}

function HowItWorksStep({
    step,
    title,
    description,
    icon,
}: {
    readonly step: number;
    readonly title: string;
    readonly description: string;
    readonly icon: string;
}): JSX.Element {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: step * 0.1 }}
        >
            <GlassCard style={{
                padding: '28px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
                height: '100%',
            }}>
                <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'rgba(255, 107, 0, 0.08)',
                    border: `1px solid rgba(255, 107, 0, 0.15)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                }}>
                    {icon}
                </div>
                <div style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: theme.colors.brand.orange,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: theme.fonts.mono,
                }}>
                    Step {step}
                </div>
                <h3 style={{
                    fontSize: theme.fontSize.md,
                    fontWeight: 700,
                    color: theme.colors.text.primary,
                    margin: 0,
                    fontFamily: theme.fonts.heading,
                }}>
                    {title}
                </h3>
                <p style={{
                    fontSize: theme.fontSize.sm,
                    color: theme.colors.text.secondary,
                    margin: 0,
                    lineHeight: '1.6',
                    fontFamily: theme.fonts.body,
                }}>
                    {description}
                </p>
            </GlassCard>
        </motion.div>
    );
}

function EmptyState({ message }: { readonly message: string }): JSX.Element {
    return (
        <GlassCard style={{ textAlign: 'center', padding: '56px 32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>📭</div>
            <p style={{ color: theme.colors.text.tertiary, margin: 0, fontSize: theme.fontSize.base, fontFamily: theme.fonts.body }}>{message}</p>
        </GlassCard>
    );
}

function LoadingState(): JSX.Element {
    return (
        <GlassCard style={{ textAlign: 'center', padding: '56px 32px' }}>
            <div style={{
                width: '24px',
                height: '24px',
                border: `2px solid ${theme.colors.border.default}`,
                borderTopColor: theme.colors.brand.orange,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
            }} />
            <p style={{ color: theme.colors.text.tertiary, margin: 0, fontSize: theme.fontSize.base, fontFamily: theme.fonts.body }}>Loading...</p>
        </GlassCard>
    );
}

function ErrorState({ message }: { readonly message: string }): JSX.Element {
    return (
        <GlassCard style={{ textAlign: 'center', padding: '56px 32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>⚠️</div>
            <p style={{ color: theme.colors.status.error, margin: 0, fontSize: theme.fontSize.base, fontFamily: theme.fonts.body }}>{message}</p>
        </GlassCard>
    );
}

function ConnectWalletBanner(): JSX.Element {
    return (
        <GlassCard glow="orange" style={{ textAlign: 'center', padding: '56px 32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔗</div>
            <p style={{ color: theme.colors.text.secondary, margin: 0, fontSize: theme.fontSize.md, fontFamily: theme.fonts.body, fontWeight: 500 }}>
                Connect your wallet to create loan requests and manage your loans.
            </p>
        </GlassCard>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function LendingPage(): JSX.Element {
    /* ----- Shared hooks ----- */
    const { network } = useNetwork();
    const { address: rawAddr } = useWalletConnect();
    const walletAddr = rawAddr ? String(rawAddr) : undefined;
    const lendingActions = useLendingActions({ network });

    /* ----- Data queries ----- */
    const statsQuery = useLendingStats(network);
    const pendingLoansQuery = usePendingLoans(network);
    const myBorrowedQuery = useMyBorrowedLoans(network, walletAddr);
    const myFundedQuery = useMyFundedLoans(network, walletAddr);

    /* ----- Local state ----- */
    const [activeTab, setActiveTab] = useState<LendingTab>('borrow');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const [form, setForm] = useState<BorrowFormState>({
        collection: '',
        tokenId: '',
        paymentToken: 'MOTO',
        loanAmount: '',
        interestBps: 1000,
        durationKey: '1w',
    });

    /* ----- Stats ----- */
    const stats = useMemo(() => {
        if (!statsQuery.data) {
            return { totalLoans: 0, activeLoans: 0, totalVolume: 0, totalRepaid: 0 };
        }
        const d = statsQuery.data;
        return {
            totalLoans: d.totalCreated,
            activeLoans: d.totalActive,
            totalVolume: Number(d.totalVolume),
            totalRepaid: d.totalRepaid,
        };
    }, [statsQuery.data]);

    /* ----- Determine if a funded loan is expired (can be claimed) ----- */
    const isLoanExpired = (_loan: LoanItem): boolean => {
        return true;
    };

    /* ----- Form handlers ----- */
    function updateField<K extends keyof BorrowFormState>(key: K, value: BorrowFormState[K]): void {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleCreateLoan(): Promise<void> {
        if (!walletAddr) return;
        if (!form.collection || !form.tokenId || !form.loanAmount) return;

        const durationOpt = DURATION_OPTIONS.find((o) => o.value === form.durationKey);
        if (!durationOpt) return;

        setActionLoading('create');
        try {
            await lendingActions.createLoanRequest(
                form.collection,
                BigInt(form.tokenId),
                form.paymentToken,
                BigInt(form.loanAmount),
                BigInt(form.interestBps),
                BigInt(durationOpt.blocks),
            );
            setForm({
                collection: '',
                tokenId: '',
                paymentToken: 'MOTO',
                loanAmount: '',
                interestBps: 1000,
                durationKey: '1w',
            });
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }

    async function handleRepayLoan(loan: LoanItem): Promise<void> {
        setActionLoading(`repay-${loan.id}`);
        try {
            await lendingActions.repayLoan(BigInt(loan.id));
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }

    async function handleCancelLoan(loan: LoanItem): Promise<void> {
        setActionLoading(`cancel-${loan.id}`);
        try {
            await lendingActions.cancelLoanRequest(BigInt(loan.id));
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }

    async function handleFundLoan(loan: LoanItem): Promise<void> {
        setActionLoading(`fund-${loan.id}`);
        try {
            await lendingActions.fundLoan(BigInt(loan.id));
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }

    async function handleClaimDefault(loan: LoanItem): Promise<void> {
        setActionLoading(`claim-${loan.id}`);
        try {
            await lendingActions.claimDefaultedLoan(BigInt(loan.id));
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }

    /* ----- Split my borrowed loans into active vs pending ----- */
    const myPendingBorrowed = useMemo(() => {
        if (!walletAddr || !pendingLoansQuery.data) return [];
        return pendingLoansQuery.data.filter((l) => l.borrower === walletAddr);
    }, [pendingLoansQuery.data, walletAddr]);

    const myActiveBorrowed = myBorrowedQuery.data ?? [];
    const myFundedLoans = myFundedQuery.data ?? [];
    const pendingLoans = pendingLoansQuery.data ?? [];

    /* ----- Render ----- */
    return (
        <div style={{
            minHeight: '100vh',
            background: theme.colors.bg.base,
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.body,
        }}>
            {/* Keyframes */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes lending-float-1 { 0%, 100% { transform: translateY(0) rotateY(-4deg); } 50% { transform: translateY(-12px) rotateY(-2deg); } }
                @keyframes lending-float-2 { 0%, 100% { transform: translateY(0) rotateY(3deg); } 50% { transform: translateY(-10px) rotateY(5deg); } }
                @keyframes lending-float-3 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
                @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }
            `}</style>

            {/* ======== HERO SECTION ======== */}
            <section style={{
                position: 'relative',
                overflow: 'hidden',
                minHeight: '520px',
            }}>
                {/* Background glow blobs */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
                    <div style={{
                        position: 'absolute', top: '10%', left: '5%', width: '500px', height: '500px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255, 107, 0, 0.07) 0%, transparent 70%)',
                        filter: 'blur(80px)',
                    }} />
                    <div style={{
                        position: 'absolute', bottom: '10%', right: '10%', width: '400px', height: '400px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(20, 241, 149, 0.05) 0%, transparent 70%)',
                        filter: 'blur(80px)',
                    }} />
                    <div style={{
                        position: 'absolute', top: '40%', left: '50%', width: '300px', height: '300px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(153, 69, 255, 0.04) 0%, transparent 70%)',
                        filter: 'blur(60px)',
                    }} />
                </div>

                {/* Hero content — split layout */}
                <div style={{
                    position: 'relative',
                    zIndex: 2,
                    maxWidth: '1320px',
                    margin: '0 auto',
                    padding: '72px 48px 56px',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
                    gap: '48px',
                    alignItems: 'center',
                }}>
                    {/* Left: Typography */}
                    <div>
                        {/* Eyebrow */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, ease: ANIM_EASE }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '10px',
                                marginBottom: '24px',
                            }}
                        >
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: theme.colors.brand.green,
                                boxShadow: '0 0 10px rgba(20, 241, 149, 0.6)',
                                position: 'relative',
                            }}>
                                <span style={{
                                    position: 'absolute', inset: '-4px',
                                    borderRadius: '50%',
                                    border: '1px solid rgba(20, 241, 149, 0.3)',
                                    animation: 'pulse-ring 2s ease-out infinite',
                                }} />
                            </span>
                            <span style={{
                                fontSize: '11px', fontWeight: 700, fontFamily: theme.fonts.mono,
                                letterSpacing: '0.12em', textTransform: 'uppercase',
                                color: theme.colors.brand.green,
                            }}>
                                First on Bitcoin L1
                            </span>
                            <span style={{
                                padding: '2px 8px', borderRadius: '4px',
                                background: 'rgba(20, 241, 149, 0.08)',
                                border: '1px solid rgba(20, 241, 149, 0.15)',
                                fontSize: '10px', fontWeight: 700, fontFamily: theme.fonts.mono,
                                letterSpacing: '0.08em', color: theme.colors.brand.green,
                            }}>
                                NEW
                            </span>
                        </motion.div>

                        {/* Headline — stacked words */}
                        <div style={{
                            fontFamily: theme.fonts.heading,
                            fontSize: 'clamp(42px, 5.5vw, 72px)',
                            fontWeight: 800,
                            lineHeight: 0.95,
                            letterSpacing: '-0.05em',
                        }}>
                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.1, ease: ANIM_EASE }}
                                style={{ color: theme.colors.text.primary }}
                            >
                                Unlock.
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.2, ease: ANIM_EASE }}
                                style={{ color: theme.colors.text.primary }}
                            >
                                Liquidity.
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.3, ease: ANIM_EASE }}
                            >
                                <span style={{
                                    background: `linear-gradient(135deg, ${theme.colors.brand.orange} 0%, ${theme.colors.brand.gold} 50%, ${theme.colors.brand.orange} 100%)`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    position: 'relative',
                                    display: 'inline-block',
                                }}>
                                    Instantly.
                                    <motion.div
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{ duration: 0.8, delay: 0.9, ease: ANIM_EASE }}
                                        style={{
                                            position: 'absolute', bottom: '2px', left: 0, right: '10%',
                                            height: '4px', borderRadius: '2px',
                                            background: 'linear-gradient(90deg, #ff6b00, #f59e0b, transparent)',
                                            transformOrigin: 'left',
                                        }}
                                    />
                                </span>
                            </motion.div>
                        </div>

                        {/* Description */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.5, ease: ANIM_EASE }}
                            style={{
                                marginTop: '28px',
                                fontSize: '17px',
                                lineHeight: 1.7,
                                color: theme.colors.text.secondary,
                                maxWidth: '460px',
                            }}
                        >
                            Collateralize your NFTs to borrow{' '}
                            <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>OP20 tokens</span> instantly.
                            Earn yield as a lender. All on{' '}
                            <span style={{ color: theme.colors.brand.orange, fontWeight: 600 }}>Bitcoin L1</span>.
                        </motion.p>

                        {/* CTAs */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.65, ease: ANIM_EASE }}
                            style={{ display: 'flex', gap: '14px', marginTop: '36px' }}
                        >
                            <button
                                onClick={() => setActiveTab('borrow')}
                                style={{
                                    ...buttonStyle,
                                    padding: '14px 32px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    boxShadow: '0 0 24px rgba(255, 107, 0, 0.25), 0 4px 20px rgba(0, 0, 0, 0.4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                            >
                                Start Borrowing
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setActiveTab('lend')}
                                style={{
                                    padding: '14px 32px',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    border: `1px solid ${theme.colors.border.strong}`,
                                    borderRadius: theme.radii.md,
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    color: theme.colors.text.primary,
                                    cursor: 'pointer',
                                    fontFamily: theme.fonts.body,
                                    transition: `all ${theme.transitions.base}`,
                                }}
                            >
                                Earn as Lender
                            </button>
                        </motion.div>

                        {/* Mini stats */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.9 }}
                            style={{
                                display: 'flex', gap: '36px', marginTop: '48px',
                                paddingTop: '24px',
                                borderTop: `1px solid ${theme.colors.border.subtle}`,
                            }}
                        >
                            {[
                                { value: String(stats.totalLoans), label: 'Total Loans' },
                                { value: String(stats.activeLoans), label: 'Active' },
                                { value: String(stats.totalRepaid), label: 'Repaid' },
                            ].map((s) => (
                                <div key={s.label}>
                                    <div style={{
                                        fontFamily: theme.fonts.mono, fontSize: '22px', fontWeight: 700,
                                        color: theme.colors.text.primary, letterSpacing: '-0.03em',
                                    }}>
                                        {s.value}
                                    </div>
                                    <div style={{
                                        fontSize: '11px', color: theme.colors.text.tertiary,
                                        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginTop: '2px',
                                    }}>
                                        {s.label}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>

                    {/* Right: Animated visual */}
                    <LendingHeroVisual />
                </div>
            </section>

            {/* ======== Stats Bar ======== */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto 56px',
                    padding: '0 48px',
                }}
            >
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: theme.spacing.lg,
                }}>
                    <StatCard label="Total Loans" value={stats.totalLoans} decimals={0} icon="📋" />
                    <StatCard label="Active Loans" value={stats.activeLoans} decimals={0} icon="🔥" />
                    <StatCard label="Total Volume" value={stats.totalVolume} decimals={0} suffix="sats" icon="📊" />
                    <StatCard label="Repaid" value={stats.totalRepaid} decimals={0} icon="✅" />
                </div>
            </motion.section>

            {/* ======== Tab Switcher ======== */}
            <motion.section
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: '0 48px',
                }}
            >
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    marginBottom: theme.spacing.xl,
                    background: theme.colors.bg.raised,
                    borderRadius: theme.radii.md,
                    padding: '4px',
                    width: 'fit-content',
                }}>
                    {(['borrow', 'lend'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '10px 36px',
                                borderRadius: theme.radii.md,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: theme.fontSize.base,
                                fontWeight: 600,
                                transition: `all ${theme.transitions.base}`,
                                background: activeTab === tab ? theme.colors.brand.orange : 'transparent',
                                color: activeTab === tab ? theme.colors.text.primary : theme.colors.text.secondary,
                                fontFamily: theme.fonts.body,
                            }}
                        >
                            {tab === 'borrow' ? 'Borrow' : 'Lend'}
                        </button>
                    ))}
                </div>

                {/* ======== Borrow Tab ======== */}
                {activeTab === 'borrow' && (
                    <div>
                        {/* -- Create Loan Request Form -- */}
                        {!walletAddr ? (
                            <div style={{ marginBottom: theme.spacing.xxl }}>
                                <ConnectWalletBanner />
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <GlassCard glow="orange" style={{ maxWidth: '640px', marginBottom: theme.spacing.xxl, padding: '32px' }}>
                                    <h2 style={sectionTitleStyle}>Create Loan Request</h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {/* Collection Address */}
                                        <div>
                                            <label style={labelStyle}>Collection Address</label>
                                            <input
                                                type="text"
                                                placeholder="bc1p..."
                                                value={form.collection}
                                                onChange={(e) => updateField('collection', e.target.value)}
                                                style={inputStyle}
                                            />
                                        </div>

                                        {/* Token ID + Payment Token — side by side */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={labelStyle}>Token ID</label>
                                                <input
                                                    type="number"
                                                    placeholder="0"
                                                    min={0}
                                                    value={form.tokenId}
                                                    onChange={(e) => updateField('tokenId', e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Payment Token</label>
                                                <div style={{ position: 'relative' }}>
                                                    <select
                                                        value={form.paymentToken}
                                                        onChange={(e) => updateField('paymentToken', e.target.value)}
                                                        style={selectStyle}
                                                    >
                                                        {PAYMENT_TOKENS.map((token) => (
                                                            <option key={token} value={token}>{token}</option>
                                                        ))}
                                                    </select>
                                                    <div style={{
                                                        position: 'absolute', right: '16px', top: '50%',
                                                        transform: 'translateY(-50%)', pointerEvents: 'none',
                                                        color: theme.colors.text.tertiary, fontSize: '10px',
                                                    }}>&#9660;</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Loan Amount + Duration — side by side */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={labelStyle}>Loan Amount (sats)</label>
                                                <input
                                                    type="number"
                                                    placeholder="100000"
                                                    min={0}
                                                    value={form.loanAmount}
                                                    onChange={(e) => updateField('loanAmount', e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Duration</label>
                                                <div style={{ position: 'relative' }}>
                                                    <select
                                                        value={form.durationKey}
                                                        onChange={(e) => updateField('durationKey', e.target.value)}
                                                        style={selectStyle}
                                                    >
                                                        {DURATION_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>
                                                                {opt.label} ({opt.blocks.toLocaleString()} blocks)
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div style={{
                                                        position: 'absolute', right: '16px', top: '50%',
                                                        transform: 'translateY(-50%)', pointerEvents: 'none',
                                                        color: theme.colors.text.tertiary, fontSize: '10px',
                                                    }}>&#9660;</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Interest Rate Slider */}
                                        <div>
                                            <label style={labelStyle}>
                                                Interest Rate:{' '}
                                                <span style={{ color: theme.colors.brand.orange, fontWeight: 700 }}>
                                                    {bpsToPercent(form.interestBps)}%
                                                </span>
                                                <span style={{ color: theme.colors.text.tertiary, fontWeight: 400, marginLeft: '8px' }}>
                                                    ({form.interestBps} bps)
                                                </span>
                                            </label>
                                            <input
                                                type="range"
                                                min={100}
                                                max={5000}
                                                step={50}
                                                value={form.interestBps}
                                                onChange={(e) => updateField('interestBps', Number(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    height: '6px',
                                                    borderRadius: '3px',
                                                    outline: 'none',
                                                    cursor: 'pointer',
                                                    accentColor: theme.colors.brand.orange,
                                                }}
                                            />
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: theme.fontSize.xs,
                                                color: theme.colors.text.tertiary,
                                                marginTop: '4px',
                                            }}>
                                                <span>1%</span>
                                                <span>50%</span>
                                            </div>
                                        </div>

                                        {/* Submit Button */}
                                        <button
                                            onClick={handleCreateLoan}
                                            disabled={actionLoading === 'create' || !form.collection || !form.tokenId || !form.loanAmount}
                                            style={{
                                                ...(actionLoading === 'create' || !form.collection || !form.tokenId || !form.loanAmount
                                                    ? buttonDisabledStyle
                                                    : buttonStyle),
                                                width: '100%',
                                                padding: '14px 24px',
                                                fontSize: theme.fontSize.md,
                                                marginTop: '4px',
                                            }}
                                        >
                                            {actionLoading === 'create' ? 'Creating...' : 'Create Loan Request'}
                                        </button>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        )}

                        {/* -- My Pending Loan Requests (cancellable) -- */}
                        {walletAddr && myPendingBorrowed.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                style={{ marginBottom: theme.spacing.xxl }}
                            >
                                <h2 style={sectionTitleStyle}>My Pending Requests</h2>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
                                    gap: theme.spacing.lg,
                                }}>
                                    {myPendingBorrowed.map((loan) => (
                                        <LoanCard
                                            key={loan.id}
                                            loan={loan}
                                            actionLabel={actionLoading === `cancel-${loan.id}` ? 'Cancelling...' : 'Cancel'}
                                            onAction={handleCancelLoan}
                                            disabled={actionLoading === `cancel-${loan.id}`}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* -- My Active Loans -- */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            style={{ marginBottom: theme.spacing.xxxl }}
                        >
                            <h2 style={sectionTitleStyle}>My Active Loans</h2>

                            {!walletAddr ? (
                                <EmptyState message="Connect your wallet to see your active loans." />
                            ) : myBorrowedQuery.isLoading ? (
                                <LoadingState />
                            ) : myBorrowedQuery.isError ? (
                                <ErrorState message="Failed to load your loans. Is the indexer running?" />
                            ) : myActiveBorrowed.length === 0 ? (
                                <EmptyState message="You have no active loans. Create a loan request above." />
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
                                    gap: theme.spacing.lg,
                                }}>
                                    {myActiveBorrowed.map((loan) => (
                                        <LoanCard
                                            key={loan.id}
                                            loan={loan}
                                            actionLabel={actionLoading === `repay-${loan.id}` ? 'Repaying...' : 'Repay'}
                                            onAction={handleRepayLoan}
                                            disabled={actionLoading === `repay-${loan.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}

                {/* ======== Lend Tab ======== */}
                {activeTab === 'lend' && (
                    <div>
                        {/* -- Available Loan Requests -- */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            style={{ marginBottom: theme.spacing.xxl }}
                        >
                            <h2 style={sectionTitleStyle}>Available Loan Requests</h2>

                            {pendingLoansQuery.isLoading ? (
                                <LoadingState />
                            ) : pendingLoansQuery.isError ? (
                                <ErrorState message="Failed to load loan requests. Is the indexer running?" />
                            ) : pendingLoans.length === 0 ? (
                                <EmptyState message="No loan requests available right now. Check back later." />
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
                                    gap: theme.spacing.lg,
                                }}>
                                    {pendingLoans.map((loan) => (
                                        <LoanCard
                                            key={loan.id}
                                            loan={loan}
                                            actionLabel={
                                                !walletAddr ? 'Connect Wallet'
                                                : actionLoading === `fund-${loan.id}` ? 'Funding...'
                                                : 'Fund Loan'
                                            }
                                            onAction={handleFundLoan}
                                            showBorrower
                                            disabled={!walletAddr || actionLoading === `fund-${loan.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.div>

                        {/* -- My Funded Loans -- */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            style={{ marginBottom: theme.spacing.xxxl }}
                        >
                            <h2 style={sectionTitleStyle}>My Funded Loans</h2>

                            {!walletAddr ? (
                                <EmptyState message="Connect your wallet to see your funded loans." />
                            ) : myFundedQuery.isLoading ? (
                                <LoadingState />
                            ) : myFundedQuery.isError ? (
                                <ErrorState message="Failed to load your funded loans." />
                            ) : myFundedLoans.length === 0 ? (
                                <EmptyState message="You have not funded any loans yet. Browse available requests above." />
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
                                    gap: theme.spacing.lg,
                                }}>
                                    {myFundedLoans.map((loan) => (
                                        <LoanCard
                                            key={loan.id}
                                            loan={loan}
                                            actionLabel={
                                                actionLoading === `claim-${loan.id}` ? 'Claiming...'
                                                : isLoanExpired(loan) ? 'Claim Default'
                                                : 'Active'
                                            }
                                            onAction={handleClaimDefault}
                                            showBorrower
                                            disabled={actionLoading === `claim-${loan.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </motion.section>

            {/* ======== How It Works ======== */}
            <section style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '64px 48px 96px',
            }}>
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    style={{ textAlign: 'center', marginBottom: '48px' }}
                >
                    <div style={{
                        fontSize: '11px', fontWeight: 700, fontFamily: theme.fonts.mono,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: theme.colors.brand.orange, marginBottom: '12px',
                    }}>
                        Simple Process
                    </div>
                    <h2 style={{
                        fontSize: theme.fontSize['3xl'],
                        fontWeight: 800,
                        color: theme.colors.text.primary,
                        margin: 0,
                        letterSpacing: theme.letterSpacing.tight,
                        fontFamily: theme.fonts.heading,
                    }}>
                        How It Works
                    </h2>
                </motion.div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))',
                    gap: '20px',
                }}>
                    <HowItWorksStep
                        step={1}
                        icon="🔒"
                        title="Deposit NFT"
                        description="Borrower deposits their NFT as collateral into the lending contract, locking it securely on-chain."
                    />
                    <HowItWorksStep
                        step={2}
                        icon="💰"
                        title="Get Funded"
                        description="A lender reviews the loan request and funds it by sending OP20 tokens directly to the borrower."
                    />
                    <HowItWorksStep
                        step={3}
                        icon="🔄"
                        title="Repay"
                        description="Borrower repays the principal plus interest before the deadline to unlock and reclaim their NFT."
                    />
                    <HowItWorksStep
                        step={4}
                        icon="🛡️"
                        title="Default Protection"
                        description="If the borrower fails to repay on time, the lender can claim the NFT collateral as compensation."
                    />
                </div>
            </section>
        </div>
    );
}
