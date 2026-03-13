/**
 * TxToastContext — Global transaction notification system.
 *
 * Shows a toast when any transaction succeeds or fails,
 * with a clickable link to OPScan for tracking.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Explorer Config                                                    */
/* ------------------------------------------------------------------ */

const EXPLORER_BASE = 'https://opscan.org';

/** Build an OPScan transaction URL */
function txExplorerUrl(txHash: string, network: string = 'op_testnet'): string {
    return `${EXPLORER_BASE}/transactions/${txHash}?network=${network}`;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ToastType = 'success' | 'error' | 'info';

export interface TxToastData {
    id: number;
    type: ToastType;
    title: string;
    message?: string;
    txHash?: string;
    network?: string;
    duration?: number;
}

interface TxToastContextValue {
    showTxToast: (toast: Omit<TxToastData, 'id'>) => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const TxToastContext = createContext<TxToastContextValue | null>(null);

export function useTxToast(): TxToastContextValue {
    const ctx = useContext(TxToastContext);
    if (!ctx) throw new Error('useTxToast must be used within TxToastProvider');
    return ctx;
}

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG — no extra deps)                                 */
/* ------------------------------------------------------------------ */

function SuccessIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#14f195" fillOpacity="0.15" />
            <path d="M6 10.5L8.5 13L14 7" stroke="#14f195" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ErrorIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#ff4444" fillOpacity="0.15" />
            <path d="M7 7L13 13M13 7L7 13" stroke="#ff4444" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#ff6b00" fillOpacity="0.15" />
            <path d="M10 6V6.01M10 9V14" stroke="#ff6b00" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function ExternalLinkIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5.5 2.5H3C2.44772 2.5 2 2.94772 2 3.5V11C2 11.5523 2.44772 12 3 12H10.5C11.0523 12 11.5 11.5523 11.5 11V8.5M8.5 2.5H11.5V5.5M11.5 2.5L6.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/*  Single Toast Component                                             */
/* ------------------------------------------------------------------ */

function Toast({ toast, onDismiss }: { toast: TxToastData; onDismiss: (id: number) => void }) {
    const icon = toast.type === 'success' ? <SuccessIcon /> : toast.type === 'error' ? <ErrorIcon /> : <InfoIcon />;
    const borderColor = toast.type === 'success' ? 'rgba(20, 241, 149, 0.3)' : toast.type === 'error' ? 'rgba(255, 68, 68, 0.3)' : 'rgba(255, 107, 0, 0.3)';
    const truncatedHash = toast.txHash ? `${toast.txHash.slice(0, 10)}...${toast.txHash.slice(-8)}` : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            style={{
                background: 'rgba(18, 18, 26, 0.95)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${borderColor}`,
                borderRadius: '12px',
                padding: '14px 16px',
                minWidth: '340px',
                maxWidth: '440px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                position: 'relative',
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {icon}
                <span style={{
                    flex: 1,
                    fontWeight: 600,
                    fontSize: '14px',
                    color: '#F0F0F5',
                    letterSpacing: '0.01em',
                }}>
                    {toast.title}
                </span>
                <button
                    onClick={() => onDismiss(toast.id)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#555570',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#F0F0F5')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#555570')}
                >
                    <CloseIcon />
                </button>
            </div>

            {/* Message */}
            {toast.message && (
                <p style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#8888A0',
                    lineHeight: 1.4,
                    paddingLeft: '30px',
                }}>
                    {toast.message}
                </p>
            )}

            {/* TX Hash + Explorer Link */}
            {toast.txHash && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    paddingLeft: '30px',
                }}>
                    <span style={{
                        fontSize: '12px',
                        color: '#555570',
                        fontFamily: 'monospace',
                    }}>
                        TX: {truncatedHash}
                    </span>
                    <a
                        href={txExplorerUrl(toast.txHash, toast.network)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on OPScan"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#ff6b00',
                            textDecoration: 'none',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255, 107, 0, 0.08)',
                            border: '1px solid rgba(255, 107, 0, 0.15)',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
                            e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 107, 0, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(255, 107, 0, 0.15)';
                        }}
                    >
                        <ExternalLinkIcon />
                        OPScan
                    </a>
                </div>
            )}
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

let _toastId = 0;

export function TxToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<TxToastData[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showTxToast = useCallback((toast: Omit<TxToastData, 'id'>) => {
        const id = ++_toastId;
        const duration = toast.duration ?? (toast.type === 'error' ? 8000 : 6000);
        setToasts((prev) => [...prev, { ...toast, id }]);

        // Auto-dismiss
        setTimeout(() => dismiss(id), duration);
    }, [dismiss]);

    return (
        <TxToastContext.Provider value={{ showTxToast }}>
            {children}

            {/* Toast container — top-right */}
            <div
                style={{
                    position: 'fixed',
                    top: '80px',
                    right: '20px',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    pointerEvents: 'none',
                }}
            >
                <AnimatePresence mode="popLayout">
                    {toasts.map((toast) => (
                        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
                            <Toast toast={toast} onDismiss={dismiss} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>
        </TxToastContext.Provider>
    );
}
