import { Suspense, lazy, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Layout } from '@/components/common/Layout';
import { HomePage } from '@/pages/HomePage';

/* Lazy-load heavyweight pages (charts, particles, complex forms) */
const LaunchpadPage = lazy(() => import('@/pages/LaunchpadPage').then(m => ({ default: m.LaunchpadPage })));
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const CollectionPage = lazy(() => import('@/pages/CollectionPage').then(m => ({ default: m.CollectionPage })));
const NFTDetailPage = lazy(() => import('@/pages/NFTDetailPage').then(m => ({ default: m.NFTDetailPage })));
const AuctionPage = lazy(() => import('@/pages/AuctionPage').then(m => ({ default: m.AuctionPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const CreateCollectionPage = lazy(() => import('@/pages/CreateCollectionPage').then(m => ({ default: m.CreateCollectionPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const StakingPage = lazy(() => import('@/pages/StakingPage').then(m => ({ default: m.StakingPage })));
const RegisterCollectionPage = lazy(() => import('@/pages/RegisterCollectionPage').then(m => ({ default: m.RegisterCollectionPage })));
const LendingPage = lazy(() => import('@/pages/LendingPage').then(m => ({ default: m.LendingPage })));

function PageLoader(): JSX.Element {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
        }}>
            <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '3px solid rgba(255, 107, 0, 0.15)',
                borderTopColor: '#ff6b00',
                animation: 'spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

/* ── F-M10: ErrorBoundary ──────────────────────────────────────────── */

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[FORGE] Uncaught error:', error, info.componentStack);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    gap: '16px',
                    padding: '32px',
                    textAlign: 'center',
                }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Something went wrong</h2>
                    <p style={{ color: '#999', maxWidth: '400px' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.href = '/';
                        }}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            background: '#ff6b00',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        Back to Home
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

/* ── F-M9: 404 Page ────────────────────────────────────────────────── */

function NotFoundPage(): JSX.Element {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: '16px',
            textAlign: 'center',
        }}>
            <h1 style={{ fontSize: '64px', fontWeight: 700, color: '#ff6b00', lineHeight: 1 }}>404</h1>
            <h2 style={{ fontSize: '20px', fontWeight: 500 }}>Page not found</h2>
            <p style={{ color: '#999' }}>The page you're looking for doesn't exist.</p>
            <Link
                to="/"
                style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    background: '#ff6b00',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 500,
                }}
            >
                Back to Home
            </Link>
        </div>
    );
}

/* ── App ───────────────────────────────────────────────────────────── */

export function App(): JSX.Element {
    return (
        <Layout>
            <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/launchpad" element={<LaunchpadPage />} />
                        <Route path="/marketplace" element={<MarketplacePage />} />
                        <Route path="/collection/:address" element={<CollectionPage />} />
                        <Route path="/nft/:collection/:tokenId" element={<NFTDetailPage />} />
                        <Route path="/auctions" element={<AuctionPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/create" element={<CreateCollectionPage />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/register" element={<RegisterCollectionPage />} />
                        <Route path="/staking" element={<StakingPage />} />
                        <Route path="/lending" element={<LendingPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Suspense>
            </ErrorBoundary>
        </Layout>
    );
}
