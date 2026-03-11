import { type ReactNode, type CSSProperties, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'shine';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    icon?: ReactNode;
    style?: CSSProperties;
    onClick?: () => void;
}

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
    primary: {
        background: theme.colors.brand.orange,
        color: '#fff',
        border: 'none',
    },
    secondary: {
        background: theme.colors.bg.raised,
        color: theme.colors.text.primary,
        border: `1px solid ${theme.colors.border.default}`,
    },
    ghost: {
        background: 'transparent',
        color: theme.colors.text.secondary,
        border: `1px solid ${theme.colors.border.subtle}`,
    },
    danger: {
        background: 'rgba(239, 68, 68, 0.1)',
        color: theme.colors.status.error,
        border: '1px solid rgba(239, 68, 68, 0.25)',
    },
    shine: {
        background: 'transparent',
        color: '#fff',
        border: '1px solid rgba(255, 107, 0, 0.4)',
    },
};

const HOVER_SHADOWS: Partial<Record<ButtonVariant, string>> = {
    primary: '0 0 8px rgba(255, 107, 0, 0.3), 0 0 24px rgba(255, 107, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.3)',
    shine: '0 0 8px rgba(255, 107, 0, 0.25), 0 0 24px rgba(255, 107, 0, 0.1)',
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
    sm: { padding: '7px 16px', fontSize: '13px', borderRadius: theme.radii.sm, gap: '6px' },
    md: { padding: '10px 24px', fontSize: '14px', borderRadius: theme.radii.md, gap: '8px' },
    lg: { padding: '14px 32px', fontSize: '16px', borderRadius: theme.radii.lg, gap: '10px' },
};

export function Button({
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    icon,
    style,
    onClick,
}: ButtonProps): JSX.Element {
    const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    function handleClick(e: React.MouseEvent) {
        if (disabled || loading) return;
        // Ripple effect
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
            setTimeout(() => setRipple(null), 600);
        }
        onClick?.();
    }

    return (
        <motion.button
            ref={btnRef}
            whileHover={disabled ? undefined : { scale: 1.015, y: -1 }}
            whileTap={disabled ? undefined : { scale: 0.98 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            onClick={handleClick}
            disabled={disabled || loading}
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: theme.fonts.body,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                width: fullWidth ? '100%' : undefined,
                overflow: 'hidden',
                transition: `box-shadow ${theme.transitions.fast}, border-color ${theme.transitions.fast}`,
                boxShadow: isHovered && !disabled ? (HOVER_SHADOWS[variant] ?? '') : 'none',
                ...VARIANT_STYLES[variant],
                ...SIZE_STYLES[size],
                ...style,
            }}
        >
            {/* Shine gradient overlay for 'shine' variant */}
            {variant === 'shine' && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(105deg, transparent 30%, rgba(255, 107, 0, 0.08) 45%, rgba(255, 107, 0, 0.15) 50%, rgba(255, 107, 0, 0.08) 55%, transparent 70%)',
                    backgroundSize: '250% 100%',
                    animation: 'gradient-shift 3s ease infinite',
                    pointerEvents: 'none',
                }} />
            )}

            {/* Ripple */}
            {ripple && (
                <span
                    key={ripple.id}
                    style={{
                        position: 'absolute',
                        left: ripple.x,
                        top: ripple.y,
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.3)',
                        transform: 'translate(-50%, -50%) scale(0)',
                        animation: 'ripple-expand 0.6s ease-out forwards',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {loading ? (
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
            ) : icon ? (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
            ) : null}
            <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>

            <style>{`
                @keyframes ripple-expand {
                    to { transform: translate(-50%, -50%) scale(80); opacity: 0; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </motion.button>
    );
}
