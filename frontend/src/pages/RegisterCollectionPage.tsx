import { useState, useCallback, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { theme } from '@/styles/theme';
import { GlassCard } from '@/components/common/GlassCard';
import { Button } from '@/components/common/Button';
import { useNetwork } from '@/hooks/useNetwork';
import { useRegisterCollection, REGISTRATION_FEE_SATS } from '@/hooks/useRegisterCollection';

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const pageStyle: CSSProperties = {
    maxWidth: '640px',
    margin: '0 auto',
    padding: `${theme.spacing.xxl} ${theme.spacing.lg}`,
};

const headerStyle: CSSProperties = {
    textAlign: 'center',
    marginBottom: theme.spacing.xxl,
};

const titleStyle: CSSProperties = {
    fontSize: theme.fontSize['3xl'],
    fontWeight: 700,
    background: theme.gradients.orangeToPurple,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: theme.spacing.sm,
};

const subtitleStyle: CSSProperties = {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 1.6,
};

const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: theme.letterSpacing.wider,
    marginBottom: theme.spacing.xs,
    fontWeight: 500,
};

const inputStyle: CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.bg.tertiary,
    border: `1px solid ${theme.colors.border.primary}`,
    borderRadius: theme.radii.lg,
    color: theme.colors.text.primary,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fonts.mono,
    outline: 'none',
    boxSizing: 'border-box',
};

const errorBoxStyle: CSSProperties = {
    padding: theme.spacing.md,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: theme.radii.lg,
    color: '#ef4444',
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.md,
};

const previewCardStyle: CSSProperties = {
    padding: theme.spacing.lg,
    background: theme.colors.bg.tertiary,
    borderRadius: theme.radii.lg,
    border: `1px solid ${theme.colors.border.primary}`,
    marginTop: theme.spacing.lg,
};

const previewRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${theme.spacing.xs} 0`,
};

const previewLabelStyle: CSSProperties = {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.tertiary,
};

const previewValueStyle: CSSProperties = {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text.primary,
    fontWeight: 600,
};

const successBoxStyle: CSSProperties = {
    textAlign: 'center',
    padding: theme.spacing.xl,
};

const checkIconStyle: CSSProperties = {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(34, 197, 94, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    marginBottom: theme.spacing.md,
    color: '#22c55e',
    fontSize: '28px',
};

const buttonRowStyle: CSSProperties = {
    display: 'flex',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RegisterCollectionPage(): JSX.Element {
    const navigate = useNavigate();
    const { address: walletAddr } = useWalletConnect();
    const { network } = useNetwork();

    const [addressInput, setAddressInput] = useState('');

    const {
        status,
        txHash,
        error: txError,
        isPending,
        preview,
        isValidating,
        validationError,
        isAlreadyRegistered,
        validateCollection,
        registerCollection,
        reset,
    } = useRegisterCollection({
        network,
        onSuccess: () => {
            // Success handled in UI
        },
    });

    const handleValidate = useCallback(async () => {
        const trimmed = addressInput.trim();
        if (!trimmed) return;
        await validateCollection(trimmed);
    }, [addressInput, validateCollection]);

    const handleRegister = useCallback(async () => {
        const trimmed = addressInput.trim();
        if (!trimmed) return;
        await registerCollection(trimmed);
    }, [addressInput, registerCollection]);

    const handleReset = useCallback(() => {
        setAddressInput('');
        reset();
    }, [reset]);

    const isConnected = !!walletAddr;
    const hasPreview = !!preview;
    const isSuccess = status === 'confirmed';

    return (
        <motion.div
            style={pageStyle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            {/* Header */}
            <div style={headerStyle}>
                <h1 style={titleStyle}>Register Collection</h1>
                <p style={subtitleStyle}>
                    Register your OPNet NFT collection on the FORGE marketplace for trading.
                    Only the collection owner can register. Registration fee: {(Number(REGISTRATION_FEE_SATS) / 1e8).toFixed(3)} BTC.
                </p>
            </div>

            <GlassCard>
                <div style={{ padding: theme.spacing.xl }}>
                    {isSuccess ? (
                        /* ── Success State ── */
                        <div style={successBoxStyle}>
                            <div style={checkIconStyle}>&#10003;</div>
                            <h2 style={{
                                fontSize: theme.fontSize.xl,
                                fontWeight: 700,
                                color: theme.colors.text.primary,
                                marginBottom: theme.spacing.sm,
                            }}>
                                Collection Registered!
                            </h2>
                            <p style={{
                                fontSize: theme.fontSize.sm,
                                color: theme.colors.text.secondary,
                                marginBottom: theme.spacing.xs,
                            }}>
                                {preview?.name ?? 'Your collection'} is now listed on the FORGE marketplace.
                            </p>
                            {txHash && (
                                <p style={{
                                    fontSize: theme.fontSize.xs,
                                    color: theme.colors.text.tertiary,
                                    fontFamily: theme.fonts.mono,
                                    wordBreak: 'break-all',
                                }}>
                                    TX: {txHash}
                                </p>
                            )}
                            <div style={buttonRowStyle}>
                                <Button
                                    variant="primary"
                                    onClick={() => navigate('/marketplace')}
                                    style={{ flex: 1 }}
                                >
                                    View Marketplace
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handleReset}
                                    style={{ flex: 1 }}
                                >
                                    Register Another
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* ── Registration Form ── */
                        <>
                            {/* Wallet check */}
                            {!isConnected && (
                                <div style={{
                                    ...errorBoxStyle,
                                    background: 'rgba(255, 107, 0, 0.1)',
                                    borderColor: 'rgba(255, 107, 0, 0.3)',
                                    color: theme.colors.brand.orange,
                                    marginTop: 0,
                                    marginBottom: theme.spacing.lg,
                                }}>
                                    Connect your wallet to register a collection.
                                </div>
                            )}

                            {/* Address input */}
                            <div style={{ marginBottom: theme.spacing.lg }}>
                                <label style={labelStyle}>Collection Contract Address</label>
                                <input
                                    type="text"
                                    value={addressInput}
                                    onChange={(e) => setAddressInput(e.target.value)}
                                    placeholder="Enter OPNet contract address (hex)"
                                    style={inputStyle}
                                    disabled={isPending || isValidating}
                                />
                                <p style={{
                                    fontSize: theme.fontSize.xs,
                                    color: theme.colors.text.tertiary,
                                    marginTop: theme.spacing.xs,
                                }}>
                                    The 64-character hex address of the deployed NFT collection contract.
                                </p>
                            </div>

                            {/* Validate button (step 1) */}
                            {!hasPreview && (
                                <Button
                                    variant="primary"
                                    onClick={handleValidate}
                                    disabled={!isConnected || !addressInput.trim() || isValidating}
                                    style={{ width: '100%' }}
                                >
                                    {isValidating ? 'Validating...' : 'Validate Collection'}
                                </Button>
                            )}

                            {/* Validation error */}
                            {validationError && (
                                <div style={errorBoxStyle}>{validationError}</div>
                            )}

                            {/* Preview card (step 2) */}
                            {hasPreview && !isAlreadyRegistered && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <div style={previewCardStyle}>
                                        <h3 style={{
                                            fontSize: theme.fontSize.md,
                                            fontWeight: 600,
                                            color: theme.colors.text.primary,
                                            marginBottom: theme.spacing.md,
                                        }}>
                                            Collection Preview
                                        </h3>
                                        <div style={previewRowStyle}>
                                            <span style={previewLabelStyle}>Name</span>
                                            <span style={previewValueStyle}>{preview.name}</span>
                                        </div>
                                        <div style={{
                                            ...previewRowStyle,
                                            borderTop: `1px solid ${theme.colors.border.primary}`,
                                            marginTop: theme.spacing.xs,
                                            paddingTop: theme.spacing.xs,
                                        }}>
                                            <span style={previewLabelStyle}>Symbol</span>
                                            <span style={previewValueStyle}>{preview.symbol}</span>
                                        </div>
                                        <div style={{
                                            ...previewRowStyle,
                                            borderTop: `1px solid ${theme.colors.border.primary}`,
                                            marginTop: theme.spacing.xs,
                                            paddingTop: theme.spacing.xs,
                                        }}>
                                            <span style={previewLabelStyle}>Total Supply</span>
                                            <span style={previewValueStyle}>
                                                {preview.supply.toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{
                                            ...previewRowStyle,
                                            borderTop: `1px solid ${theme.colors.border.primary}`,
                                            marginTop: theme.spacing.xs,
                                            paddingTop: theme.spacing.xs,
                                        }}>
                                            <span style={previewLabelStyle}>Registration Fee</span>
                                            <span style={{
                                                ...previewValueStyle,
                                                color: theme.colors.brand.orange,
                                                fontFamily: theme.fonts.mono,
                                            }}>
                                                {(Number(REGISTRATION_FEE_SATS) / 1e8).toFixed(3)} BTC
                                            </span>
                                        </div>
                                    </div>

                                    {/* Register button */}
                                    <Button
                                        variant="shine"
                                        onClick={handleRegister}
                                        disabled={isPending}
                                        style={{ width: '100%', marginTop: theme.spacing.lg }}
                                    >
                                        {isPending
                                            ? status === 'simulating' ? 'Simulating...'
                                            : status === 'signing' ? 'Signing...'
                                            : 'Broadcasting...'
                                            : 'Register on Marketplace'
                                        }
                                    </Button>
                                </motion.div>
                            )}

                            {/* TX error */}
                            {txError && (
                                <div style={errorBoxStyle}>{txError}</div>
                            )}
                        </>
                    )}
                </div>
            </GlassCard>
        </motion.div>
    );
}
