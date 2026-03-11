import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { theme } from '@/styles/theme';

interface StatCardProps {
    label: string;
    value: string | number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    change?: number;
    icon?: string;
    sparklineData?: number[];
}

function Sparkline({ data }: { data: number[] }) {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 60;
    const h = 24;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${x},${y}`;
    }).join(' ');
    const isUp = (data[data.length - 1] ?? 0) >= (data[0] ?? 0);
    const color = isUp ? theme.colors.brand.green : theme.colors.status.error;

    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.5 }}>
            <defs>
                <linearGradient id={`spark-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <polygon
                points={`0,${h} ${points} ${w},${h}`}
                fill={`url(#spark-${isUp ? 'up' : 'down'})`}
            />
        </svg>
    );
}

export function StatCard({ label, value, decimals = 1, prefix, suffix, change, icon, sparklineData }: StatCardProps): JSX.Element {
    const glowBorder = change !== undefined && change >= 0
        ? 'rgba(20, 241, 149, 0.12)'
        : change !== undefined && change < 0
            ? 'rgba(239, 68, 68, 0.12)'
            : theme.colors.border.subtle;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            style={{
                padding: '20px 24px',
                background: theme.colors.bg.card,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${glowBorder}`,
                borderRadius: theme.radii.lg,
                position: 'relative',
                overflow: 'hidden',
                transition: `border-color ${theme.transitions.base}`,
            }}
        >
            {/* Sparkline background */}
            {sparklineData && (
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '16px',
                    opacity: 0.6,
                }}>
                    <Sparkline data={sparklineData} />
                </div>
            )}

            <div style={{
                fontSize: theme.fontSize.xs,
                fontWeight: 500,
                color: theme.colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: theme.letterSpacing.wider,
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            }}>
                {icon ? <span style={{ fontSize: '14px' }}>{icon}</span> : null}
                {label}
            </div>
            <div style={{
                fontFamily: theme.fonts.heading,
                fontSize: theme.fontSize['2xl'],
                fontWeight: 700,
                letterSpacing: theme.letterSpacing.tight,
                fontVariantNumeric: 'tabular-nums',
                display: 'flex',
                alignItems: 'baseline',
                gap: '6px',
            }}>
                {prefix && <span style={{ fontSize: theme.fontSize.md, color: theme.colors.text.secondary }}>{prefix}</span>}
                {typeof value === 'number' ? (
                    <CountUp
                        end={value}
                        decimals={decimals}
                        duration={1.8}
                        separator=","
                        enableScrollSpy
                        scrollSpyOnce
                    />
                ) : (
                    <span>{value}</span>
                )}
                {suffix && (
                    <span style={{ fontSize: theme.fontSize.base, color: theme.colors.text.secondary, fontWeight: 500 }}>
                        {suffix}
                    </span>
                )}
            </div>
            {change !== undefined && (
                <div style={{
                    marginTop: '4px',
                    fontSize: theme.fontSize.sm,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: change >= 0 ? theme.colors.brand.green : theme.colors.status.error,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                }}>
                    <span>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
                </div>
            )}
        </motion.div>
    );
}
