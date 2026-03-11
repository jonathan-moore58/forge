import { theme } from '@/styles/theme';

interface GradientMeshProps {
    variant?: 'default' | 'hero' | 'warm' | 'cool';
    opacity?: number;
}

const meshes: Record<string, string> = {
    default: [
        'radial-gradient(ellipse at 20% 0%, rgba(255, 107, 0, 0.04) 0%, transparent 50%)',
        'radial-gradient(ellipse at 80% 100%, rgba(0, 212, 255, 0.03) 0%, transparent 50%)',
        'radial-gradient(ellipse at 50% 50%, rgba(153, 69, 255, 0.02) 0%, transparent 60%)',
    ].join(', '),
    hero: theme.gradients.heroMesh,
    warm: theme.gradients.meshWarm,
    cool: theme.gradients.meshCool,
};

export function GradientMesh({ variant = 'default', opacity = 1 }: GradientMeshProps) {
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                background: meshes[variant],
                opacity,
                pointerEvents: 'none',
                zIndex: 0,
            }}
            aria-hidden="true"
        />
    );
}
