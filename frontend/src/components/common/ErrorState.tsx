import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';
import { Button } from './Button';

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    retryLabel?: string;
}

export function ErrorState({
    title = 'Something went wrong',
    message = 'An unexpected error occurred. Please try again.',
    onRetry,
    retryLabel = 'Try Again',
}: ErrorStateProps): JSX.Element {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 24px',
                textAlign: 'center',
                maxWidth: '420px',
                margin: '0 auto',
            }}
        >
            {/* Error icon */}
            <div style={{
                width: '64px',
                height: '64px',
                borderRadius: theme.radii.xl,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
            }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.error} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>

            <h3 style={{
                fontFamily: theme.fonts.heading,
                fontSize: theme.fontSize.lg,
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: '8px',
            }}>
                {title}
            </h3>

            <p style={{
                fontSize: theme.fontSize.sm,
                color: theme.colors.text.tertiary,
                lineHeight: 1.6,
                marginBottom: onRetry ? '24px' : '0',
            }}>
                {message}
            </p>

            {onRetry && (
                <Button variant="primary" size="md" onClick={onRetry}>
                    {retryLabel}
                </Button>
            )}
        </motion.div>
    );
}
