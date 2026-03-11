import { type ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { theme } from '@/styles/theme';

const NAV_ITEMS = [
    { path: '/', label: 'Discover', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { path: '/launchpad', label: 'Launchpad', icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699-5.959V3.614' },
    { path: '/marketplace', label: 'Market', icon: 'M19.5 21a3 3 0 003-3V9a3 3 0 00-3-3h-15a3 3 0 00-3 3v9a3 3 0 003 3h15zM3 9h18M9 15h6' },
    { path: '/auctions', label: 'Auctions', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
    { path: '/staking', label: 'Staking', icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z' },
    { path: '/lending', label: 'Lending', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
    { path: '/dashboard', label: 'Dashboard', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
] as const;

const FOOTER_LINKS = [
    { label: 'Docs', href: 'https://docs.opnet.org' },
    { label: 'GitHub', href: 'https://github.com/nicejamil/forge' },
    { label: 'Discord', href: 'https://discord.gg/opnet' },
    { label: 'Twitter', href: 'https://x.com/nicejamil' },
];

function formatBTC(sats: number): string {
    const btc = sats / 1e8;
    return btc.toFixed(btc < 0.001 ? 8 : 4);
}

function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isMobile;
}

function useIsTablet(): boolean {
    const [isTablet, setIsTablet] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)');
        setIsTablet(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isTablet;
}

/* ── Hamburger → X animated icon ── */
function HamburgerIcon({ open }: { open: boolean }) {
    return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <motion.line
                x1="3" x2="19"
                y1={open ? '11' : '6'}
                y2={open ? '11' : '6'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={{
                    y1: open ? 4 : 6,
                    y2: open ? 18 : 6,
                }}
                transition={{ duration: 0.25 }}
            />
            <motion.line
                x1="3" x2="19" y1="11" y2="11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={{ opacity: open ? 0 : 1, scaleX: open ? 0 : 1 }}
                transition={{ duration: 0.15 }}
            />
            <motion.line
                x1="3" x2="19"
                y1={open ? '11' : '16'}
                y2={open ? '11' : '16'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={{
                    y1: open ? 18 : 16,
                    y2: open ? 4 : 16,
                }}
                transition={{ duration: 0.25 }}
            />
        </svg>
    );
}

/* ── Mobile Bottom Nav ── */
function MobileBottomNav() {
    const location = useLocation();
    return (
        <nav className="mobile-bottom-nav" style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.overlay + 1,
            background: 'rgba(10, 10, 15, 0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderTop: `1px solid ${theme.colors.border.subtle}`,
            padding: '6px 0 env(safe-area-inset-bottom, 8px)',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
        }}>
            {NAV_ITEMS.map((item) => {
                const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '6px 12px',
                            color: isActive ? theme.colors.brand.orange : theme.colors.text.tertiary,
                            transition: `color ${theme.transitions.fast}`,
                            position: 'relative',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d={item.icon} />
                        </svg>
                        <span style={{
                            fontSize: '10px',
                            fontWeight: isActive ? 600 : 400,
                            letterSpacing: '0.02em',
                        }}>
                            {item.label}
                        </span>
                        {isActive && (
                            <motion.div
                                layoutId="mobile-nav-dot"
                                style={{
                                    position: 'absolute',
                                    top: '2px',
                                    width: '4px',
                                    height: '4px',
                                    borderRadius: '50%',
                                    background: theme.colors.brand.orange,
                                    boxShadow: '0 0 6px rgba(255, 107, 0, 0.4)',
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}

export function Layout({ children }: { children: ReactNode }): JSX.Element {
    const location = useLocation();
    const {
        walletAddress,
        walletBalance,
        openConnectModal,
        disconnect,
        connecting,
    } = useWalletConnect();
    const isConnected = !!walletAddress;
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    // Lenis smooth scroll disabled — was causing auto-scroll on page load
    // useLenis();

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* ══════ Global Loading Bar ══════ */}
            <div className="global-loading-bar" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                zIndex: theme.zIndex.modal + 1,
                pointerEvents: 'none',
            }}>
                <motion.div
                    key={location.pathname}
                    initial={{ scaleX: 0, transformOrigin: 'left' }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        height: '100%',
                        background: `linear-gradient(90deg, ${theme.colors.brand.orange}, ${theme.colors.brand.orangeLight})`,
                        boxShadow: '0 0 12px rgba(255, 107, 0, 0.4)',
                    }}
                />
            </div>

            {/* ══════ Navbar ══════ */}
            <nav style={{
                position: 'sticky',
                top: 0,
                zIndex: theme.zIndex.overlay,
                background: 'rgba(10, 10, 15, 0.8)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                borderBottom: `1px solid ${theme.colors.border.subtle}`,
            }}>
                <div style={{
                    maxWidth: '1440px',
                    margin: '0 auto',
                    padding: isMobile ? '0 16px' : '0 24px',
                    height: isMobile ? '60px' : '72px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: isMobile ? '12px' : '32px',
                }}>
                    {/* Logo */}
                    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <div style={{
                            width: isMobile ? '30px' : '34px',
                            height: isMobile ? '30px' : '34px',
                            borderRadius: theme.radii.md,
                            background: theme.colors.brand.orange,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: theme.fonts.heading,
                            fontWeight: 700,
                            fontSize: isMobile ? '15px' : '17px',
                            color: '#fff',
                            boxShadow: '0 0 12px rgba(255, 107, 0, 0.3)',
                        }}>F</div>
                        <span style={{
                            fontFamily: theme.fonts.heading,
                            fontWeight: 700,
                            fontSize: isMobile ? '18px' : '21px',
                            letterSpacing: theme.letterSpacing.tight,
                            color: theme.colors.text.primary,
                        }}>FORGE</span>
                    </Link>

                    {/* Desktop Nav with sliding indicator */}
                    {!isTablet && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '4px',
                            borderRadius: theme.radii.lg,
                            background: 'rgba(255, 255, 255, 0.02)',
                        }}>
                            {NAV_ITEMS.map((item) => {
                                const isActive = item.path === '/'
                                    ? location.pathname === '/'
                                    : location.pathname.startsWith(item.path);
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        style={{
                                            position: 'relative',
                                            padding: '8px 18px',
                                            borderRadius: theme.radii.md,
                                            fontSize: '14px',
                                            fontWeight: isActive ? 600 : 400,
                                            color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
                                            whiteSpace: 'nowrap',
                                            transition: `color ${theme.transitions.fast}`,
                                        }}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="nav-active"
                                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    borderRadius: theme.radii.md,
                                                    background: 'rgba(255, 107, 0, 0.08)',
                                                    border: '1px solid rgba(255, 107, 0, 0.12)',
                                                    zIndex: -1,
                                                }}
                                            />
                                        )}
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* Right side */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px', flexShrink: 0 }}>
                        {/* Create button — hidden on mobile */}
                        {!isMobile && (
                            <Link
                                to="/create"
                                style={{
                                    position: 'relative',
                                    padding: '8px 20px',
                                    borderRadius: theme.radii.full,
                                    border: '1px solid rgba(255, 107, 0, 0.3)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: theme.colors.brand.orange,
                                    background: 'rgba(255, 107, 0, 0.06)',
                                    overflow: 'hidden',
                                    transition: `box-shadow ${theme.transitions.fast}`,
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(105deg, transparent 30%, rgba(255,107,0,0.1) 48%, rgba(255,107,0,0.18) 50%, rgba(255,107,0,0.1) 52%, transparent 70%)',
                                    backgroundSize: '250% 100%',
                                    animation: 'gradient-shift 3s ease infinite',
                                    pointerEvents: 'none',
                                }} />
                                <span style={{ position: 'relative', zIndex: 1 }}>Create</span>
                            </Link>
                        )}

                        {isConnected ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {!isMobile && walletBalance && (
                                    <div style={{
                                        padding: '7px 14px',
                                        borderRadius: theme.radii.full,
                                        background: 'rgba(20, 241, 149, 0.06)',
                                        border: '1px solid rgba(20, 241, 149, 0.15)',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        fontFamily: theme.fonts.mono,
                                        fontVariantNumeric: 'tabular-nums',
                                        color: theme.colors.brand.green,
                                        boxShadow: '0 0 12px rgba(20, 241, 149, 0.08)',
                                    }}>
                                        {formatBTC(walletBalance.total)} BTC
                                    </div>
                                )}
                                <Link to="/profile" style={{
                                    padding: isMobile ? '6px 12px' : '7px 16px',
                                    borderRadius: theme.radii.full,
                                    border: `1px solid ${theme.colors.border.default}`,
                                    fontSize: isMobile ? '12px' : '13px',
                                    fontWeight: 500,
                                    fontFamily: theme.fonts.mono,
                                    color: theme.colors.text.primary,
                                    background: theme.colors.bg.raised,
                                }}>
                                    {truncateAddress(walletAddress!)}
                                </Link>
                                <button
                                    onClick={() => disconnect()}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: theme.radii.full,
                                        border: `1px solid ${theme.colors.border.subtle}`,
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        color: theme.colors.text.tertiary,
                                        background: 'transparent',
                                        cursor: 'pointer',
                                    }}
                                    title="Disconnect wallet"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => openConnectModal()}
                                disabled={connecting}
                                style={{
                                    padding: isMobile ? '7px 16px' : '8px 22px',
                                    borderRadius: theme.radii.full,
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: theme.colors.brand.orange,
                                    boxShadow: '0 0 16px rgba(255, 107, 0, 0.2)',
                                    opacity: connecting ? 0.6 : 1,
                                    cursor: connecting ? 'wait' : 'pointer',
                                }}
                            >
                                {connecting ? 'Connecting...' : isMobile ? 'Connect' : 'Connect Wallet'}
                            </motion.button>
                        )}

                        {/* Mobile menu toggle — visible on tablet */}
                        {isTablet && (
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                aria-label="Toggle menu"
                                style={{
                                    padding: '6px',
                                    color: mobileMenuOpen ? theme.colors.brand.orange : theme.colors.text.secondary,
                                    transition: `color ${theme.transitions.fast}`,
                                }}
                            >
                                <HamburgerIcon open={mobileMenuOpen} />
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* ══════ Fullscreen Mobile Menu ══════ */}
            <AnimatePresence>
                {mobileMenuOpen && isTablet && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            top: isMobile ? '60px' : '72px',
                            zIndex: theme.zIndex.overlay - 1,
                            background: 'rgba(10, 10, 15, 0.96)',
                            backdropFilter: 'blur(32px)',
                            WebkitBackdropFilter: 'blur(32px)',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '32px 24px',
                            gap: '4px',
                            overflowY: 'auto',
                        }}
                    >
                        {NAV_ITEMS.map((item, i) => {
                            const isActive = item.path === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(item.path);
                            return (
                                <motion.div
                                    key={item.path}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.25, delay: i * 0.05 }}
                                >
                                    <Link
                                        to={item.path}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '14px',
                                            padding: '16px 12px',
                                            borderRadius: theme.radii.lg,
                                            fontSize: '18px',
                                            fontWeight: isActive ? 600 : 400,
                                            fontFamily: theme.fonts.heading,
                                            color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
                                            background: isActive ? 'rgba(255, 107, 0, 0.06)' : 'transparent',
                                            borderLeft: isActive ? `3px solid ${theme.colors.brand.orange}` : '3px solid transparent',
                                            transition: `all ${theme.transitions.fast}`,
                                        }}
                                    >
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d={item.icon} />
                                        </svg>
                                        {item.label}
                                    </Link>
                                </motion.div>
                            );
                        })}

                        {/* Mobile menu extras */}
                        <div style={{
                            marginTop: '24px',
                            paddingTop: '24px',
                            borderTop: `1px solid ${theme.colors.border.subtle}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        }}>
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.25, delay: 0.3 }}
                            >
                                <Link
                                    to="/create"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '14px',
                                        padding: '16px 12px',
                                        borderRadius: theme.radii.lg,
                                        fontSize: '18px',
                                        fontWeight: 500,
                                        fontFamily: theme.fonts.heading,
                                        color: theme.colors.brand.orange,
                                    }}
                                >
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Create Collection
                                </Link>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.25, delay: 0.35 }}
                            >
                                <Link
                                    to="/profile"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '14px',
                                        padding: '16px 12px',
                                        borderRadius: theme.radii.lg,
                                        fontSize: '18px',
                                        fontWeight: 500,
                                        fontFamily: theme.fonts.heading,
                                        color: theme.colors.text.secondary,
                                    }}
                                >
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                    Profile
                                </Link>
                            </motion.div>
                        </div>

                        {/* Wallet info on mobile */}
                        {isConnected && isMobile && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                style={{
                                    marginTop: '16px',
                                    padding: '16px',
                                    borderRadius: theme.radii.lg,
                                    background: theme.colors.bg.raised,
                                    border: `1px solid ${theme.colors.border.subtle}`,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: theme.colors.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Balance</span>
                                    <span style={{
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        fontFamily: theme.fonts.mono,
                                        color: theme.colors.brand.green,
                                    }}>{formatBTC(walletBalance?.total ?? 0)} BTC</span>
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    fontFamily: theme.fonts.mono,
                                    color: theme.colors.text.secondary,
                                    wordBreak: 'break-all',
                                }}>{walletAddress}</div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ Main content ══════ */}
            <main style={{
                flex: 1,
                position: 'relative',
                zIndex: 1,
                paddingBottom: isMobile ? '72px' : '0',
            }}>
                {children}
            </main>

            {/* ══════ Mobile Bottom Nav ══════ */}
            {isMobile && <MobileBottomNav />}

            {/* ══════ Footer ══════ */}
            <footer style={{
                position: 'relative',
                zIndex: 1,
                padding: isMobile ? '48px 16px 100px' : '64px 24px 40px',
            }}>
                {/* Gradient top border */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '10%',
                    right: '10%',
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${theme.colors.brand.orange}40, ${theme.colors.brand.cyan}30, transparent)`,
                }} />

                <div style={{
                    maxWidth: '1440px',
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '2fr 1fr 1fr 1fr',
                    gap: isMobile ? '32px' : '48px',
                    alignItems: 'start',
                }}>
                    {/* Brand column */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: theme.radii.sm,
                                background: theme.colors.brand.orange,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: theme.fonts.heading,
                                fontWeight: 700,
                                fontSize: '14px',
                                color: '#fff',
                            }}>F</div>
                            <span style={{
                                fontFamily: theme.fonts.heading,
                                fontWeight: 700,
                                fontSize: '18px',
                                color: theme.colors.text.primary,
                            }}>FORGE</span>
                        </div>
                        <p style={{ fontSize: '13px', color: theme.colors.text.tertiary, lineHeight: 1.7, maxWidth: '320px' }}>
                            The most advanced NFT Launchpad and Marketplace built natively on Bitcoin L1 using OPNet smart contracts.
                        </p>
                    </div>

                    {/* Marketplace column */}
                    <div>
                        <h4 style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: theme.colors.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '16px',
                        }}>Marketplace</h4>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '16px' : '10px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Marketplace', to: '/marketplace' },
                                { label: 'Launchpad', to: '/launchpad' },
                                { label: 'Auctions', to: '/auctions' },
                                { label: 'Lending', to: '/lending' },
                            ].map((link) => (
                                <Link key={link.label} to={link.to} style={{
                                    fontSize: '13px',
                                    color: theme.colors.text.tertiary,
                                    transition: `color ${theme.transitions.fast}`,
                                }}>{link.label}</Link>
                            ))}
                        </div>
                    </div>

                    {/* Resources column */}
                    <div>
                        <h4 style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: theme.colors.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '16px',
                        }}>Resources</h4>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '16px' : '10px', flexWrap: 'wrap' }}>
                            {FOOTER_LINKS.map((link) => (
                                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" style={{
                                    fontSize: '13px',
                                    color: theme.colors.text.tertiary,
                                    transition: `color ${theme.transitions.fast}`,
                                    textDecoration: 'none',
                                }}>{link.label}</a>
                            ))}
                        </div>
                    </div>

                    {/* Protocol column */}
                    <div>
                        <h4 style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: theme.colors.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '16px',
                        }}>Protocol</h4>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '16px' : '10px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Smart Contracts', href: 'https://docs.opnet.org/how-it-works/smart-contracts' },
                                { label: 'OPNet', href: 'https://opnet.org' },
                                { label: 'Bitcoin L1', href: 'https://bitcoin.org' },
                            ].map((item) => (
                                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" style={{
                                    fontSize: '13px',
                                    color: theme.colors.text.tertiary,
                                    textDecoration: 'none',
                                    transition: `color ${theme.transitions.fast}`,
                                }}>{item.label}</a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div style={{
                    maxWidth: '1440px',
                    margin: '48px auto 0',
                    paddingTop: '24px',
                    borderTop: `1px solid ${theme.colors.border.subtle}`,
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    gap: isMobile ? '8px' : '0',
                }}>
                    <span style={{ fontSize: '12px', color: theme.colors.text.tertiary }}>
                        Built on OPNet — Bitcoin L1 Smart Contracts
                    </span>
                    <span style={{ fontSize: '12px', color: theme.colors.text.tertiary }}>
                        FORGE {new Date().getFullYear()}
                    </span>
                </div>
            </footer>
        </div>
    );
}
