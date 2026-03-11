/**
 * ProviderService — Singleton JSONRpcProvider per network.
 *
 * CRITICAL: Never create multiple providers for the same network.
 * This service caches one provider per network and reuses it.
 */

import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { RPC_URLS, type ForgeNetwork } from '@/config/contracts';

/** Map OPNet network name → bitcoin-js network object */
function getNetworkConfig(network: ForgeNetwork) {
    switch (network) {
        case 'regtest':
            return networks.regtest;
        case 'testnet':
            // OPNet testnet is a Signet fork — NEVER use networks.testnet (Testnet4)
            return networks.opnetTestnet;
        case 'mainnet':
            return networks.bitcoin;
        default:
            throw new Error(`Unknown network: ${network}`);
    }
}

class _ProviderService {
    /** One provider per network, keyed by string (never Map<Address, T>) */
    private providers: Record<string, JSONRpcProvider> = {};

    /**
     * Get or create a JSONRpcProvider for the given network.
     */
    getProvider(network: ForgeNetwork): JSONRpcProvider {
        const key = network;

        if (!this.providers[key]) {
            const rpcUrl = RPC_URLS[network];
            const netConfig = getNetworkConfig(network);

            this.providers[key] = new JSONRpcProvider({
                url: rpcUrl,
                network: netConfig,
            });
        }

        return this.providers[key];
    }

    /**
     * Clear all cached providers (e.g., on network switch).
     */
    clearAll(): void {
        this.providers = {};
    }

    /**
     * Clear provider for a specific network.
     */
    clear(network: ForgeNetwork): void {
        delete this.providers[network];
    }
}

/** Singleton instance */
export const ProviderService = new _ProviderService();
