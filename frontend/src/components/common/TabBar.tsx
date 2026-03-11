import { motion } from 'framer-motion';
import { theme } from '@/styles/theme';

interface Tab {
    id: string;
    label: string;
    count?: number;
}

interface TabBarProps {
    tabs: Tab[];
    activeTab: string;
    onChange: (id: string) => void;
    layoutId?: string;
}

export function TabBar({ tabs, activeTab, onChange, layoutId = 'tab-indicator' }: TabBarProps) {
    return (
        <div style={{
            display: 'flex',
            gap: '2px',
            borderBottom: `1px solid ${theme.colors.border.subtle}`,
            position: 'relative',
        }}>
            {tabs.map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        style={{
                            position: 'relative',
                            padding: '12px 20px',
                            fontSize: '14px',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: `color ${theme.transitions.fast}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: theme.radii.full,
                                background: isActive ? 'rgba(255, 107, 0, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                                color: isActive ? theme.colors.brand.orange : theme.colors.text.tertiary,
                            }}>
                                {tab.count}
                            </span>
                        )}
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                style={{
                                    position: 'absolute',
                                    bottom: '-1px',
                                    left: 0,
                                    right: 0,
                                    height: '2px',
                                    background: theme.colors.brand.orange,
                                    borderRadius: '1px 1px 0 0',
                                    boxShadow: '0 0 8px rgba(255, 107, 0, 0.4)',
                                }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
