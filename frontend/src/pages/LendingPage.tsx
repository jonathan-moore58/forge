import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useNetwork } from '@/hooks/useNetwork';
import { useLendingActions } from '@/hooks/useLendingActions';
import { useApprovalCheck } from '@/hooks/useApprovalCheck';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import { IndexerAPI } from '@/services/IndexerAPI';
import {
    useLendingStats,
    usePendingLoans,
    useMyPendingLoans,
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

/** OP-20 token name → contract hex address */
const PAYMENT_TOKEN_MAP: Record<string, string> = {
    MOTO: '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd',
    PILL: '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb',
};

const PAYMENT_TOKEN_NAMES = Object.keys(PAYMENT_TOKEN_MAP);

const STATUS_LABELS: Record<number, string> = {
    0: 'pending',
    1: 'active',
    2: 'repaid',
    3: 'defaulted',
    4: 'cancelled',
};

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

/** Resolve a payment token: if it's a known name (MOTO, PILL), return its hex address; otherwise pass through */
function resolvePaymentTokenAddress(input: string): string {
    const upper = input.trim().toUpperCase();
    if (PAYMENT_TOKEN_MAP[upper]) return PAYMENT_TOKEN_MAP[upper];
    return input.trim();
}

/** Reverse-lookup: hex address → display name (or shortened address) */
function paymentTokenDisplayName(addr: string): string {
    const cleanAddr = addr.replace(/^0x/i, '').toLowerCase();
    for (const [name, hex] of Object.entries(PAYMENT_TOKEN_MAP)) {
        const cleanHex = hex.replace(/^0x/i, '').toLowerCase();
        if (cleanHex === cleanAddr) return name;
    }
    return shortenAddr(addr);
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
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function LoanCard({
    loan,
    actionLabel,
    onAction,
    showBorrower,
    disabled,
    onApproveTokens,
    isApproving,
}: {
    readonly loan: LoanItem;
    readonly actionLabel: string;
    readonly onAction: (loan: LoanItem) => void;
    readonly showBorrower?: boolean;
    readonly disabled?: boolean;
    readonly onApproveTokens?: (loan: LoanItem) => void;
    readonly isApproving?: boolean;
}): JSX.Element {
    const [hovered, setHovered] = useState(false);
    const statusLabel = getStatusLabel(loan.status);

    // Fetch collection name from indexer (cached indefinitely — names don't change)
    const collectionQuery = useQuery({
        queryKey: ['collectionName', loan.collection],
        queryFn: async () => {
            const res = await IndexerAPI.collection(loan.collection);
            return res.data;
        },
        staleTime: Infinity,
        enabled: !!loan.collection,
    });
    const collectionName = collectionQuery.data?.name || collectionQuery.data?.symbol || null;

    const tokenName = paymentTokenDisplayName(loan.paymentToken);

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
            {/* Header: Collection name + status badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '4px' }}>Collection</div>
                    {collectionName ? (
                        <div style={{ fontSize: theme.fontSize.base, color: theme.colors.text.primary, fontWeight: 700, fontFamily: theme.fonts.heading }}>
                            {collectionName}
                        </div>
                    ) : (
                        <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.secondary, fontFamily: theme.fonts.mono }}>
                            {shortenAddr(loan.collection)}
                        </div>
                    )}
                    {/* Show shortened address below name for context */}
                    {collectionName && (
                        <div style={{ fontSize: '10px', color: theme.colors.text.tertiary, fontFamily: theme.fonts.mono, marginTop: '2px' }}>
                            {shortenAddr(loan.collection)}
                        </div>
                    )}
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
                    flexShrink: 0,
                    marginLeft: '12px',
                }}>
                    {statusLabel}
                </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: theme.spacing.md }}>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Token ID</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.text.primary, fontWeight: 600 }}>#{loan.tokenId}</div>
                </div>
                <div>
                    <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.tertiary, marginBottom: '2px' }}>Loan Amount</div>
                    <div style={{ fontSize: theme.fontSize.base, color: theme.colors.brand.orange, fontWeight: 600 }}>
                        {formatAmount(loan.amount)}{' '}
                        <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.secondary, fontWeight: 500 }}>{tokenName}</span>
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

            {/* Footer: payment info + action buttons */}
            <div style={{
                borderTop: `1px solid ${theme.colors.border.subtle}`,
                paddingTop: theme.spacing.md,
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <div style={{ fontSize: '10px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                            Payment Token
                        </div>
                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, fontWeight: 600 }}>
                            {tokenName}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Approve Tokens button (shown for lenders on pending loans) */}
                        {onApproveTokens && loan.status === 0 && (
                            <button
                                style={{
                                    ...(isApproving ? buttonDisabledStyle : {
                                        ...buttonStyle,
                                        background: 'transparent',
                                        border: `1px solid ${theme.colors.brand.orange}`,
                                        color: theme.colors.brand.orange,
                                    }),
                                    padding: '8px 14px',
                                    fontSize: theme.fontSize.xs,
                                }}
                                onClick={() => !isApproving && onApproveTokens(loan)}
                                disabled={isApproving}
                            >
                                {isApproving ? 'Approving...' : 'Approve Tokens'}
                            </button>
                        )}
                        <button
                            style={disabled ? buttonDisabledStyle : actionLabel === 'Claim Default' ? buttonDangerStyle : buttonStyle}
                            onClick={() => !disabled && onAction(loan)}
                            disabled={disabled}
                        >
                            {actionLabel}
                        </button>
                    </div>
                </div>
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
                    border: '1px solid rgba(255, 107, 0, 0.15)',
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
            <p style={{ color: theme.colors.status.error, margin: 0, fontSize: theme.fontSize.base, fontFamily: theme.fonts.body }}>{message}</p>
        </GlassCard>
    );
}

function ConnectWalletBanner(): JSX.Element {
    return (
        <GlassCard glow="orange" style={{ textAlign: 'center', padding: '56px 32px' }}>
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
    const { walletAddress: rawAddr } = useWalletConnect();
    const walletAddr = rawAddr ? (typeof rawAddr === 'string' ? rawAddr : String(rawAddr)) : undefined;
    const lendingActions = useLendingActions({ network });

    /* ----- Data queries ----- */
    const statsQuery = useLendingStats(network);
    const pendingLoansQuery = usePendingLoans(network);
    const myPendingQuery = useMyPendingLoans(network, walletAddr);
    const myBorrowedQuery = useMyBorrowedLoans(network, walletAddr);
    const myFundedQuery = useMyFundedLoans(network, walletAddr);

    /* ----- Local state ----- */
    const [activeTab, setActiveTab] = useState<LendingTab>('borrow');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const [form, setForm] = useState<BorrowFormState>({
        collection: '',
        tokenId: '',
        paymentToken: 'MOTO',
        loanAmount: '',
        interestBps: 1000,
        durationKey: '1w',
    });

    /* ----- NFT Approval check ----- */
    const lendingAddress = CONTRACT_ADDRESSES[network].lending;
    const tokenIdForApproval = form.tokenId ? BigInt(form.tokenId) : undefined;
    const approval = useApprovalCheck(
        form.collection || undefined,
        tokenIdForApproval,
        lendingAddress || undefined,
    );

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
        // TODO: compare current block vs loan.startBlock + loan.durationBlocks
        return true;
    };

    /* ----- Form handlers ----- */
    function updateField<K extends keyof BorrowFormState>(key: K, value: BorrowFormState[K]): void {
        setForm((prev) => ({ ...prev, [key]: value }));
        setFormError(null);
    }

    async function handleCreateLoan(): Promise<void> {
        if (!walletAddr) return;
        if (!form.collection || !form.tokenId || !form.loanAmount) return;

        const durationOpt = DURATION_OPTIONS.find((o) => o.value === form.durationKey);
        if (!durationOpt) return;

        // Resolve payment token name → address
        const paymentTokenAddr = resolvePaymentTokenAddress(form.paymentToken);
        if (!paymentTokenAddr) {
            setFormError('Please select or enter a valid payment token address.');
            return;
        }

        setActionLoading('create');
        setFormError(null);
        try {
            await lendingActions.createLoanRequest(
                form.collection,
                BigInt(form.tokenId),
                paymentTokenAddr,
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
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to create loan request.');
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

    /**
     * Approve the lending contract to spend OP-20 tokens for a specific loan.
     * Uses a large approval amount (type(uint256).max equivalent) for convenience.
     */
    const handleApproveTokens = useCallback(async (loan: LoanItem): Promise<void> => {
        setActionLoading(`approve-${loan.id}`);
        try {
            // Approve a large amount so the lender doesn't need to re-approve
            const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
            await lendingActions.approveOP20ForLending(loan.paymentToken, maxApproval);
        } catch {
            // Error handled by useTransaction
        } finally {
            setActionLoading(null);
        }
    }, [lendingActions]);

    /* ----- Derived data ----- */
    const myPendingBorrowed = myPendingQuery.data ?? [];
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
            `}</style>

            {/* ======== Page Header ======== */}
            <section style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '48px 48px 0',
            }}>
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <div style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: theme.fonts.mono,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: theme.colors.brand.orange,
                        marginBottom: '12px',
                    }}>
                        Peer-to-Peer
                    </div>
                    <h1 style={{
                        fontSize: theme.fontSize['3xl'],
                        fontWeight: 800,
                        color: theme.colors.text.primary,
                        margin: '0 0 12px 0',
                        letterSpacing: theme.letterSpacing.tight,
                        fontFamily: theme.fonts.heading,
                    }}>
                        NFT Lending
                    </h1>
                    <p style={{
                        color: theme.colors.text.secondary,
                        maxWidth: '560px',
                        margin: 0,
                        fontSize: theme.fontSize.md,
                        lineHeight: 1.7,
                    }}>
                        Collateralize your NFTs to borrow OP-20 tokens instantly.
                        Earn yield by funding loan requests. All on Bitcoin L1.
                    </p>
                </motion.div>
            </section>

            {/* ======== Stats Bar ======== */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                style={{
                    maxWidth: '1200px',
                    margin: '32px auto 48px',
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
                    <StatCard label="Total Volume" value={stats.totalVolume} decimals={0} suffix="tokens" icon="📊" />
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

                                    {/* Approval status + Approve button */}
                                    {form.collection && form.tokenId && (
                                        <div style={{
                                            padding: '12px 16px',
                                            borderRadius: theme.radii.md,
                                            background: approval.isApproved
                                                ? 'rgba(20, 241, 149, 0.06)'
                                                : 'rgba(255, 107, 0, 0.06)',
                                            border: `1px solid ${approval.isApproved
                                                ? 'rgba(20, 241, 149, 0.15)'
                                                : 'rgba(255, 107, 0, 0.12)'}`,
                                            marginBottom: '20px',
                                            fontSize: theme.fontSize.sm,
                                            color: theme.colors.text.secondary,
                                            lineHeight: 1.5,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '16px',
                                        }}>
                                            <div>
                                                {approval.isChecking ? (
                                                    'Checking NFT approval status...'
                                                ) : approval.isApproved ? (
                                                    <span style={{ color: theme.colors.status.success }}>
                                                        ✓ NFT approved for lending contract
                                                    </span>
                                                ) : (
                                                    'NFT must be approved before creating a loan. Click "Approve" to authorize.'
                                                )}
                                                {approval.error && (
                                                    <div style={{ color: theme.colors.status.error, marginTop: '4px', fontSize: theme.fontSize.xs }}>
                                                        {approval.error}
                                                    </div>
                                                )}
                                            </div>
                                            {!approval.isApproved && !approval.isChecking && (
                                                <button
                                                    onClick={() => approval.approve()}
                                                    disabled={approval.isPending}
                                                    style={{
                                                        ...(approval.isPending ? buttonDisabledStyle : buttonStyle),
                                                        padding: '8px 20px',
                                                        fontSize: theme.fontSize.sm,
                                                        whiteSpace: 'nowrap',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {approval.isPending ? 'Approving...' : 'Approve NFT'}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Info note (shown when no collection/token entered yet) */}
                                    {(!form.collection || !form.tokenId) && (
                                        <div style={{
                                            padding: '12px 16px',
                                            borderRadius: theme.radii.md,
                                            background: 'rgba(255, 107, 0, 0.06)',
                                            border: '1px solid rgba(255, 107, 0, 0.12)',
                                            marginBottom: '20px',
                                            fontSize: theme.fontSize.sm,
                                            color: theme.colors.text.secondary,
                                            lineHeight: 1.5,
                                        }}>
                                            Enter collection address and token ID to check approval status.
                                            The NFT will be locked as collateral until the loan is repaid or cancelled.
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {/* Collection Address */}
                                        <div>
                                            <label style={labelStyle}>Collection Address</label>
                                            <input
                                                type="text"
                                                placeholder="opt1... or 0x..."
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
                                                <input
                                                    type="text"
                                                    list="payment-token-suggestions"
                                                    placeholder="MOTO, PILL, or paste address (opt1...)"
                                                    value={form.paymentToken}
                                                    onChange={(e) => updateField('paymentToken', e.target.value)}
                                                    style={inputStyle}
                                                />
                                                <datalist id="payment-token-suggestions">
                                                    {PAYMENT_TOKEN_NAMES.map((token) => (
                                                        <option key={token} value={token} />
                                                    ))}
                                                </datalist>
                                            </div>
                                        </div>

                                        {/* Loan Amount + Duration — side by side */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={labelStyle}>Loan Amount (tokens)</label>
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

                                        {/* Error display */}
                                        {formError && (
                                            <div style={{
                                                padding: '10px 14px',
                                                borderRadius: theme.radii.md,
                                                background: 'rgba(239, 68, 68, 0.08)',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: theme.colors.status.error,
                                                fontSize: theme.fontSize.sm,
                                            }}>
                                                {formError}
                                            </div>
                                        )}

                                        {/* Submit Button */}
                                        <button
                                            onClick={handleCreateLoan}
                                            disabled={actionLoading === 'create' || !form.collection || !form.tokenId || !form.loanAmount || !form.paymentToken}
                                            style={{
                                                ...(actionLoading === 'create' || !form.collection || !form.tokenId || !form.loanAmount || !form.paymentToken
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
                                            onApproveTokens={walletAddr ? handleApproveTokens : undefined}
                                            isApproving={actionLoading === `approve-${loan.id}`}
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
