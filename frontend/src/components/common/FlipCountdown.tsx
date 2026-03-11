import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';

interface FlipCountdownProps {
    value: number;
    label: string;
    urgent?: boolean;
    suffix?: string;
}

function FlipDigit({ digit, urgent }: { digit: string; urgent: boolean }) {
    return (
        <motion.div
            key={digit}
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 90, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '48px',
                background: urgent ? 'rgba(239,68,68,0.08)' : theme.colors.bg.overlay,
                border: `1px solid ${urgent ? 'rgba(239,68,68,0.2)' : theme.colors.border.subtle}`,
                borderRadius: theme.radii.sm,
                fontFamily: theme.fonts.mono,
                fontSize: '22px',
                fontWeight: 700,
                color: urgent ? theme.colors.status.error : theme.colors.text.primary,
                fontVariantNumeric: 'tabular-nums',
                perspective: '200px',
                transformStyle: 'preserve-3d',
            }}
        >
            {digit}
        </motion.div>
    );
}

export function FlipCountdown({ value, label, urgent = false, suffix }: FlipCountdownProps) {
    const str = Math.max(0, value).toString().padStart(2, '0');
    const digits = str.split('');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                {digits.map((d, i) => (
                    <FlipDigit key={`${i}-${d}`} digit={d} urgent={urgent} />
                ))}
                {suffix && (
                    <span style={{
                        fontFamily: theme.fonts.mono,
                        fontSize: '12px',
                        color: theme.colors.text.tertiary,
                        marginLeft: '2px',
                    }}>
                        {suffix}
                    </span>
                )}
            </div>
            <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: theme.colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: theme.letterSpacing.wider,
            }}>
                {label}
            </span>
        </div>
    );
}

export function BlockCountdown({ blocksRemaining }: { blocksRemaining: number }) {
    const isUrgent = blocksRemaining <= 10 && blocksRemaining > 0;
    const minutes = blocksRemaining * 10;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <FlipCountdown value={blocksRemaining} label="Blocks" urgent={isUrgent} />
            <div style={{
                fontSize: '12px',
                color: theme.colors.text.tertiary,
                fontFamily: theme.fonts.mono,
                paddingBottom: '6px',
            }}>
                {blocksRemaining <= 0 ? 'Ended' : hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`}
            </div>
        </div>
    );
}
