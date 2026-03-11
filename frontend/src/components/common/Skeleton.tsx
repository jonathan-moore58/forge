import { type CSSProperties } from 'react';
import { theme } from '@/styles/theme';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string;
    style?: CSSProperties;
}

export function Skeleton({
    width = '100%',
    height = '20px',
    borderRadius = theme.radii.md,
    style,
}: SkeletonProps): JSX.Element {
    return (
        <div
            className="skeleton"
            style={{
                width,
                height,
                borderRadius,
                ...style,
            }}
        />
    );
}

export function NFTCardSkeleton(): JSX.Element {
    return (
        <div style={{
            background: theme.colors.bg.card,
            border: `1px solid ${theme.colors.border.subtle}`,
            borderRadius: theme.radii.lg,
            overflow: 'hidden',
        }}>
            <div style={{ aspectRatio: '1', position: 'relative' }}>
                <Skeleton height="100%" borderRadius="0" style={{ position: 'absolute', inset: 0 }} />
            </div>
            <div style={{ padding: '14px 16px' }}>
                <Skeleton width="50%" height="12px" style={{ marginBottom: '8px' }} />
                <Skeleton width="75%" height="16px" style={{ marginBottom: '14px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: `1px solid ${theme.colors.border.subtle}` }}>
                    <div>
                        <Skeleton width="40px" height="10px" style={{ marginBottom: '4px' }} />
                        <Skeleton width="70px" height="16px" />
                    </div>
                    <Skeleton width="60px" height="28px" borderRadius={theme.radii.sm} />
                </div>
            </div>
        </div>
    );
}

export function CollectionRowSkeleton(): JSX.Element {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 120px 120px 100px 100px',
            padding: '16px 20px',
            background: theme.colors.bg.raised,
            alignItems: 'center',
            gap: '12px',
        }}>
            <Skeleton width="24px" height="24px" borderRadius={theme.radii.xs} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton width="40px" height="40px" borderRadius={theme.radii.md} />
                <Skeleton width="120px" height="16px" />
            </div>
            <Skeleton width="80px" height="16px" />
            <Skeleton width="80px" height="16px" />
            <Skeleton width="60px" height="16px" />
            <Skeleton width="60px" height="16px" />
        </div>
    );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }): JSX.Element {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            padding: '14px 18px',
            gap: '12px',
            alignItems: 'center',
        }}>
            {Array.from({ length: columns }).map((_, i) => (
                <Skeleton key={i} width={`${60 + Math.random() * 40}%`} height="14px" />
            ))}
        </div>
    );
}

export function StatCardSkeleton(): JSX.Element {
    return (
        <div style={{
            padding: '20px 24px',
            background: theme.colors.bg.card,
            border: `1px solid ${theme.colors.border.subtle}`,
            borderRadius: theme.radii.lg,
        }}>
            <Skeleton width="80px" height="10px" style={{ marginBottom: '12px' }} />
            <Skeleton width="120px" height="28px" style={{ marginBottom: '6px' }} />
            <Skeleton width="50px" height="14px" />
        </div>
    );
}
