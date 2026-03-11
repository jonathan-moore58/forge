/**
 * NetworkContext — Shared network state across the entire app.
 *
 * F-C1: Previously useNetwork() was a plain hook, meaning each component
 * that called it had its own independent state. Switching networks in the
 * header wouldn't propagate to other components.
 *
 * Now all network state lives in this context, and useNetwork() is a thin
 * wrapper that reads from it.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { DEFAULT_NETWORK, type ForgeNetwork } from '@/config/contracts';
import { ProviderService } from '@/services/ProviderService';
import { ContractService } from '@/services/ContractService';

export interface NetworkContextValue {
    /** Current active network */
    network: ForgeNetwork;
    /** Switch to a different network */
    switchNetwork: (network: ForgeNetwork) => void;
    /** Convenience booleans */
    isRegtest: boolean;
    isTestnet: boolean;
    isMainnet: boolean;
    /** Display-friendly network name */
    networkName: string;
}

const NETWORK_NAMES: Record<ForgeNetwork, string> = {
    regtest: 'Regtest (Local)',
    testnet: 'Testnet (Signet)',
    mainnet: 'Mainnet',
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }): JSX.Element {
    const [network, setNetwork] = useState<ForgeNetwork>(DEFAULT_NETWORK);

    const switchNetwork = useCallback((newNetwork: ForgeNetwork) => {
        if (newNetwork === network) return;

        // Clear all cached providers and contract instances
        ProviderService.clearAll();
        ContractService.clearCache();

        setNetwork(newNetwork);
    }, [network]);

    const value = useMemo<NetworkContextValue>(() => ({
        network,
        switchNetwork,
        isRegtest: network === 'regtest',
        isTestnet: network === 'testnet',
        isMainnet: network === 'mainnet',
        networkName: NETWORK_NAMES[network],
    }), [network, switchNetwork]);

    return (
        <NetworkContext.Provider value={value}>
            {children}
        </NetworkContext.Provider>
    );
}

export function useNetworkContext(): NetworkContextValue {
    const ctx = useContext(NetworkContext);
    if (!ctx) {
        throw new Error('useNetworkContext must be used within a NetworkProvider');
    }
    return ctx;
}
