import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';
import { Button } from './Button';

interface EmptyStateProps {
    icon?: string;
    title: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({
    icon = '📭',
    title,
    message,
    actionLabel,
    onAction,
}: EmptyStateProps): JSX.Element {
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
            <div style={{
                width: '64px',
                height: '64px',
                borderRadius: theme.radii.xl,
                background: theme.colors.bg.overlay,
                border: `1px solid ${theme.colors.border.subtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                fontSize: '28px',
            }}>
                {icon}
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

            {message && (
                <p style={{
                    fontSize: theme.fontSize.sm,
                    color: theme.colors.text.tertiary,
                    lineHeight: 1.6,
                    marginBottom: onAction ? '24px' : '0',
                }}>
                    {message}
                </p>
            )}

            {onAction && actionLabel && (
                <Button variant="primary" size="md" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </motion.div>
    );
}
