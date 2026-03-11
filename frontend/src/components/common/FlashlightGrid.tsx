import { useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface FlashlightGridProps {
    children: ReactNode;
    style?: CSSProperties;
    glowColor?: string;
    glowSize?: number;
}

export function FlashlightGrid({
    children,
    style,
    glowColor = 'rgba(255, 107, 0, 0.06)',
    glowSize = 400,
}: FlashlightGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
    const [isHovering, setIsHovering] = useState(false);

    function handleMouseMove(e: React.MouseEvent) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{ position: 'relative', ...style }}
        >
            {/* Cursor-following glow */}
            {isHovering && (
                <div
                    style={{
                        position: 'absolute',
                        width: `${glowSize}px`,
                        height: `${glowSize}px`,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                        left: mousePos.x - glowSize / 2,
                        top: mousePos.y - glowSize / 2,
                        pointerEvents: 'none',
                        zIndex: 1,
                        transition: 'opacity 0.15s ease',
                    }}
                    aria-hidden="true"
                />
            )}
            {children}
        </div>
    );
}
