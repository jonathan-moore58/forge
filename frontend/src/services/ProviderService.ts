/**
 * ProviderService — Singleton JSONRpcProvider per network.
 *
 * CRITICAL: Never create multiple providers for the same network.
 * This service caches one provider per network and reuses it.
 *
 * WORKAROUND: Patches the provider's internal `_send` to strip the
 * spurious "Revert error too long" revert that the OPNet VM attaches
 * to EVERY response for large WASM contracts — even when the call
 * succeeds and produces a valid result. Without this patch the SDK
 * sees the `revert` field, ignores the valid `result`, and throws.
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

/**
 * Patch a provider to strip the spurious "OP_NET: Revert error too long."
 * revert from RPC responses that ALSO contain a valid result.
 *
 * Root cause: The OPNet VM attaches this revert to all btc_call
 * responses for contracts whose WASM triggers certain memory/size
 * thresholds, even when the call executes successfully. The opnet SDK
 * checks `result.revert` BEFORE `result.result`, so it wrongly
 * treats every call as a failure.
 *
 * Fix: intercept the raw JSON-RPC response array coming back from
 * `_send()`. If a response has both `.result.result` (valid output)
 * and `.result.revert` containing the known spurious message, AND the
 * result is large enough to be genuine method output (> 1 byte), delete
 * the `revert` field so the SDK falls through to the success path.
 *
 * When result is only 1 byte (0x00), it's a VM placeholder — the call
 * genuinely failed. In that case we keep the revert so the SDK can
 * properly report the error.
 */
function patchProviderForSpuriousRevert(provider: JSONRpcProvider): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = provider as any;
    const originalSend = p._send.bind(provider);

    p._send = async function (payload: unknown): Promise<unknown[]> {
        const responses: unknown[] = await originalSend(payload);

        for (const responseSet of responses) {
            if (!responseSet || typeof responseSet !== 'object') continue;

            const processOne = (resp: Record<string, unknown>) => {
                const r = resp.result;
                if (!r || typeof r !== 'object') return;

                const inner = r as Record<string, unknown>;
                if (!inner.result || !inner.revert) return;
                if (typeof inner.revert !== 'string') return;
                if (typeof inner.result !== 'string') return;

                // Decode the base64 revert and check for the known VM message
                try {
                    const decoded = atob(inner.revert);
                    if (!decoded.includes('Revert error too long')) return;

                    // Decode the result to check its size.
                    // A 1-byte result (0x00 → "AA==") is a VM placeholder —
                    // the call genuinely failed.  Only strip the revert when
                    // the result is large enough to contain real method output.
                    const resultBytes = atob(inner.result as string);
                    if (resultBytes.length <= 1) {
                        console.warn(
                            '[FORGE] VM "Revert error too long" with 1-byte result — call genuinely failed',
                        );
                        return; // keep the revert — it's real
                    }

                    console.warn(
                        `[FORGE] Stripped spurious VM "Revert error too long" — result has ${resultBytes.length} bytes of valid data`,
                    );
                    delete inner.revert;
                } catch {
                    // Not valid base64 — leave it alone
                }
            };

            if (Array.isArray(responseSet)) {
                for (const item of responseSet) {
                    if (item && typeof item === 'object') {
                        processOne(item as Record<string, unknown>);
                    }
                }
            } else {
                processOne(responseSet as Record<string, unknown>);
            }
        }

        return responses;
    };
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

            const provider = new JSONRpcProvider({
                url: rpcUrl,
                network: netConfig,
            });

            // Apply the workaround for the OPNet VM revert bug
            patchProviderForSpuriousRevert(provider);

            this.providers[key] = provider;
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
