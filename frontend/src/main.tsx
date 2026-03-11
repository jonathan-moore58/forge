import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { NetworkProvider } from './contexts/NetworkContext';
import { App } from './App';
import './styles/global.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
    <StrictMode>
        <WalletConnectProvider theme="dark">
            <QueryClientProvider client={queryClient}>
                <NetworkProvider>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </NetworkProvider>
            </QueryClientProvider>
        </WalletConnectProvider>
    </StrictMode>,
);
