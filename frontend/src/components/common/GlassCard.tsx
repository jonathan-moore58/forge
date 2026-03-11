import { type ReactNode, type CSSProperties, useState } from 'react';
import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';

interface GlassCardProps {
    children: ReactNode;
    style?: CSSProperties;
    hover?: boolean;
    elevated?: boolean;
    glow?: 'orange' | 'purple' | 'green' | 'cyan';
    onClick?: () => void;
}

export function GlassCard({
    children,
    style,
    hover = false,
    elevated = false,
    glow,
    onClick,
}: GlassCardProps): JSX.Element {
    const [isHovered, setIsHovered] = useState(false);
    const glowShadow = glow ? theme.shadows.glow[glow] : undefined;

    return (
        <motion.div
            whileHover={hover ? {
                y: -4,
                transition: { duration: 0.2 },
            } : undefined}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            onClick={onClick}
            style={{
                background: elevated ? theme.colors.bg.overlay : theme.colors.bg.card,
                backdropFilter: 'blur(24px) saturate(150%)',
                WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                border: `1px solid ${isHovered && hover ? theme.colors.border.strong : theme.colors.border.subtle}`,
                borderRadius: theme.radii.lg,
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : undefined,
                boxShadow: isHovered && hover
                    ? `${glowShadow ?? ''}, ${theme.shadows.cardHover}`
                    : glowShadow ?? (elevated ? theme.shadows.elevated : theme.shadows.card),
                transition: `box-shadow ${theme.transitions.base}, border-color ${theme.transitions.base}`,
                ...style,
            }}
        >
            {children}
        </motion.div>
    );
}
