import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';

interface TimelineStep {
    label: string;
    sublabel?: string;
    status: 'completed' | 'active' | 'upcoming';
    detail?: string;
}

interface TimelineStepperProps {
    steps: TimelineStep[];
    compact?: boolean;
}

export function TimelineStepper({ steps, compact = false }: TimelineStepperProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                const dotSize = compact ? 10 : 14;
                const lineWidth = compact ? 1 : 2;

                const dotColor =
                    step.status === 'completed' ? theme.colors.brand.green :
                    step.status === 'active' ? theme.colors.brand.orange :
                    theme.colors.text.tertiary;

                const lineColor =
                    step.status === 'completed' ? 'rgba(20, 241, 149, 0.3)' :
                    'rgba(255, 255, 255, 0.06)';

                return (
                    <div key={i} style={{ display: 'flex', gap: compact ? '12px' : '16px', position: 'relative' }}>
                        {/* Dot + Line */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flexShrink: 0,
                            width: `${dotSize + 6}px`,
                        }}>
                            {/* Dot */}
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: i * 0.1, type: 'spring', stiffness: 400, damping: 25 }}
                                style={{
                                    width: `${dotSize}px`,
                                    height: `${dotSize}px`,
                                    borderRadius: '50%',
                                    background: dotColor,
                                    flexShrink: 0,
                                    marginTop: compact ? '4px' : '5px',
                                    boxShadow: step.status === 'active'
                                        ? `0 0 8px ${theme.colors.brand.orange}40, 0 0 16px ${theme.colors.brand.orange}20`
                                        : step.status === 'completed'
                                            ? `0 0 6px rgba(20, 241, 149, 0.3)`
                                            : 'none',
                                    position: 'relative',
                                }}
                            >
                                {step.status === 'active' && (
                                    <motion.div
                                        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        style={{
                                            position: 'absolute',
                                            inset: '-3px',
                                            borderRadius: '50%',
                                            border: `1px solid ${theme.colors.brand.orange}`,
                                        }}
                                    />
                                )}
                                {step.status === 'completed' && (
                                    <svg
                                        width={dotSize - 4}
                                        height={dotSize - 4}
                                        viewBox="0 0 12 12"
                                        style={{ position: 'absolute', top: '2px', left: '2px' }}
                                    >
                                        <path
                                            d="M3 6l2 2 4-4"
                                            fill="none"
                                            stroke="#fff"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                )}
                            </motion.div>

                            {/* Connecting line */}
                            {!isLast && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: '100%' }}
                                    transition={{ delay: i * 0.1 + 0.1, duration: 0.3 }}
                                    style={{
                                        width: `${lineWidth}px`,
                                        flex: 1,
                                        background: lineColor,
                                        minHeight: compact ? '20px' : '28px',
                                    }}
                                />
                            )}
                        </div>

                        {/* Content */}
                        <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 + 0.05 }}
                            style={{
                                paddingBottom: isLast ? 0 : (compact ? '12px' : '20px'),
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div style={{
                                fontSize: compact ? '13px' : '14px',
                                fontWeight: step.status === 'active' ? 600 : 500,
                                color: step.status === 'upcoming'
                                    ? theme.colors.text.tertiary
                                    : theme.colors.text.primary,
                                lineHeight: 1.4,
                            }}>
                                {step.label}
                            </div>
                            {step.sublabel && (
                                <div style={{
                                    fontSize: compact ? '11px' : '12px',
                                    color: theme.colors.text.tertiary,
                                    marginTop: '2px',
                                    fontFamily: theme.fonts.mono,
                                }}>
                                    {step.sublabel}
                                </div>
                            )}
                            {step.detail && (
                                <div style={{
                                    marginTop: '6px',
                                    padding: '8px 12px',
                                    background: step.status === 'active'
                                        ? 'rgba(255, 107, 0, 0.06)'
                                        : theme.colors.bg.interactive,
                                    border: `1px solid ${step.status === 'active'
                                        ? 'rgba(255, 107, 0, 0.12)'
                                        : theme.colors.border.subtle}`,
                                    borderRadius: theme.radii.sm,
                                    fontSize: '12px',
                                    color: theme.colors.text.secondary,
                                    fontFamily: theme.fonts.mono,
                                }}>
                                    {step.detail}
                                </div>
                            )}
                        </motion.div>
                    </div>
                );
            })}
        </div>
    );
}
