# Complete OPNet dApp Example

Minimal but complete token viewer + transfer dApp with OP_WALLET. Copy-paste ready.

---

## File: src/index.css (GLOBAL STYLES — INCLUDE WALLET FIX)

```css
/* WalletConnect popup fix — MANDATORY, modal renders at page bottom without this */
.wallet-connect-modal,
[class*="walletconnect"] [class*="modal"],
[class*="WalletConnect"] [class*="Modal"] {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 99999 !important;
    background: rgba(0, 0, 0, 0.7) !important;
}

.wallet-connect-modal > div,
[class*="walletconnect"] [class*="modal"] > div,
[class*="WalletConnect"] [class*="Modal"] > div {
    position: relative !important;
    max-width: 420px !important;
    max-height: 80vh !important;
    overflow-y: auto !important;
    border-radius: 16px !important;
}
```

---

## File: main.tsx

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <WalletConnectProvider theme="dark">
            <App />
        </WalletConnectProvider>
    </StrictMode>
);
```

---

## File: services/ProviderService.ts

```typescript
import { JSONRpcProvider } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';

/**
 * Singleton provider service. NEVER create multiple provider instances.
 */
class ProviderService {
    private static instance: ProviderService;
    private providers: Map<string, JSONRpcProvider> = new Map();

    private constructor() {}

    public static getInstance(): ProviderService {
        if (!ProviderService.instance) {
            ProviderService.instance = new ProviderService();
        }
        return ProviderService.instance;
    }

    /**
     * Get or create provider for network. ALWAYS reused.
     */
    public getProvider(network: Network): JSONRpcProvider {
        const key = this.networkKey(network);
        if (!this.providers.has(key)) {
            // CORRECT constructor: config object, NOT positional args
            const provider = new JSONRpcProvider({ url: this.rpcUrl(network), network });
            this.providers.set(key, provider);
        }
        return this.providers.get(key)!;
    }

    public clearAll(): void {
        this.providers.clear();
    }

    private rpcUrl(network: Network): string {
        if (network === networks.bitcoin) return 'https://mainnet.opnet.org';
        if (network === networks.opnetTestnet) return 'https://testnet.opnet.org';
        if (network === networks.regtest) return 'http://localhost:9001';
        throw new Error('Unsupported network');
    }

    private networkKey(network: Network): string {
        if (network === networks.bitcoin) return 'mainnet';
        if (network === networks.opnetTestnet) return 'testnet';
        if (network === networks.regtest) return 'regtest';
        return 'unknown';
    }
}

export const providerService = ProviderService.getInstance();
```

---

## File: services/ContractService.ts

```typescript
import { IOP20Contract, getContract, OP_20_ABI } from 'opnet';
import { Network } from '@btc-vision/bitcoin';
import { providerService } from './ProviderService';

/**
 * Contract instance cache. getContract is called ONCE per address.
 */
class ContractService {
    private static instance: ContractService;
    private cache: Map<string, IOP20Contract> = new Map();

    private constructor() {}

    public static getInstance(): ContractService {
        if (!ContractService.instance) {
            ContractService.instance = new ContractService();
        }
        return ContractService.instance;
    }

    /**
     * Get or create contract instance. ALWAYS reused.
     */
    public getToken(address: string, network: Network, sender?: string): IOP20Contract {
        const key = `${address}:${sender ?? 'anon'}`;
        if (!this.cache.has(key)) {
            const provider = providerService.getProvider(network);
            // getContract: 4 required + 1 optional param
            this.cache.set(key, getContract<IOP20Contract>(
                address, OP_20_ABI, provider, network, sender
            ));
        }
        return this.cache.get(key)!;
    }

    public clearCache(): void {
        this.cache.clear();
    }
}

export const contractService = ContractService.getInstance();
```

---

## File: hooks/useTokenContract.ts

```typescript
import { useMemo } from 'react';
import { IOP20Contract } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { contractService } from '../services/ContractService';

/**
 * Returns a cached contract instance for the given address.
 */
export function useTokenContract(contractAddress: string): IOP20Contract | null {
    const { network, walletAddress } = useWalletConnect();

    return useMemo(() => {
        if (!network || !contractAddress) return null;
        return contractService.getToken(
            contractAddress,
            network,
            walletAddress ?? undefined
        );
    }, [contractAddress, network, walletAddress]);
}
```

---

## File: hooks/useTokenData.ts

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useTokenContract } from './useTokenContract';

interface TokenMetadata {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
    readonly totalSupply: bigint;
}

/**
 * Fetches token metadata using single metadata() call (not 4 separate calls).
 */
export function useTokenData(contractAddress: string) {
    const contract = useTokenContract(contractAddress);
    const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!contract) return;
        setLoading(true);
        setError(null);
        try {
            // ONE RPC call returns name, symbol, decimals, totalSupply, icon, domainSeparator
            const result = await contract.metadata();
            setMetadata({
                name: result.properties.name,
                symbol: result.properties.symbol,
                decimals: result.properties.decimals,
                totalSupply: result.properties.totalSupply,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch metadata');
        } finally {
            setLoading(false);
        }
    }, [contract]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { metadata, loading, error, refresh: fetchData };
}
```

---

## File: components/TokenTransfer.tsx

```tsx
import { useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTokenContract } from '../hooks/useTokenContract';
import { AddressVerificator } from '@btc-vision/transaction';

const TOKEN_ADDRESS = 'YOUR_TOKEN_CONTRACT_ADDRESS';

export function TokenTransfer() {
    const { walletAddress, network, provider } = useWalletConnect();
    const contract = useTokenContract(TOKEN_ADDRESS);

    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleTransfer = async () => {
        if (!contract || !walletAddress || !network || !provider) {
            setStatus('Wallet not connected');
            return;
        }

        // Validate address — use AddressVerificator, never startsWith() checks
        if (!AddressVerificator.isValidAddress(recipient, network)) {
            setStatus('Invalid recipient address');
            return;
        }

        setLoading(true);
        setStatus('Resolving public key...');

        try {
            // 1. Resolve recipient public key (transfers need hex pubkey, not address)
            const pubKeyInfo = await provider.getPublicKeyInfo(recipient, false);
            if (!pubKeyInfo?.publicKey) {
                setStatus('Could not find public key for recipient. Ask them for their hex public key (0x...).');
                return;
            }

            // 2. Parse amount (assuming 18 decimals)
            const rawAmount = BigInt(Math.floor(parseFloat(amount) * 1e18));

            // 3. Simulate — NEVER skip this
            setStatus('Simulating transaction...');
            const sim = await contract.transfer(pubKeyInfo.publicKey, rawAmount);

            if ('error' in sim) {
                setStatus(`Simulation failed: ${sim.error}`);
                return;
            }

            // 4. Send — signer ALWAYS null on frontend
            setStatus('Sending transaction (approve in wallet)...');
            const receipt = await sim.sendTransaction({
                signer: null,           // FRONTEND: always null
                mldsaSigner: null,      // FRONTEND: always null
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100000n,
                feeRate: 10,
                network,
            });

            setStatus(`Transaction sent! ID: ${receipt.transactionId}`);
        } catch (err) {
            setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="transfer-form">
            <h2>Transfer Tokens</h2>
            <input
                type="text"
                placeholder="Recipient Bitcoin address"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                disabled={loading}
                className="input-field"
            />
            <input
                type="text"
                placeholder="Amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={loading}
                className="input-field"
            />
            <button
                onClick={handleTransfer}
                disabled={loading || !walletAddress}
                className="button-primary"
            >
                {loading ? 'Processing...' : 'Transfer'}
            </button>
            {status && <p className="status-message">{status}</p>}
        </div>
    );
}
```

---

## File: App.tsx

```tsx
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTokenData } from './hooks/useTokenData';
import { TokenTransfer } from './components/TokenTransfer';

const TOKEN_ADDRESS = 'YOUR_TOKEN_CONTRACT_ADDRESS';

function App() {
    const { openConnectModal, disconnect, walletAddress, connecting } = useWalletConnect();
    const { metadata, loading } = useTokenData(TOKEN_ADDRESS);

    return (
        <div className="app">
            <header className="app-header">
                <h1>My OPNet dApp</h1>
                {connecting ? (
                    <button disabled className="button-primary">Connecting...</button>
                ) : walletAddress ? (
                    <div className="wallet-info">
                        <span className="address">
                            {walletAddress.slice(0, 8)}...{walletAddress.slice(-4)}
                        </span>
                        <button onClick={disconnect} className="button-secondary">
                            Disconnect
                        </button>
                    </div>
                ) : (
                    <button onClick={openConnectModal} className="button-primary">
                        Connect Wallet
                    </button>
                )}
            </header>

            <main className="app-main">
                {metadata && !loading && (
                    <div className="token-info">
                        <p>{metadata.name} ({metadata.symbol})</p>
                        <p>Decimals: {metadata.decimals}</p>
                    </div>
                )}

                {walletAddress ? (
                    <TokenTransfer />
                ) : (
                    <p className="connect-prompt">Connect your wallet to get started</p>
                )}
            </main>
        </div>
    );
}

export default App;
```

---

## Key Patterns Demonstrated

1. **`WalletConnectProvider`** — not the old `WalletProvider`
2. **`useWalletConnect()`** — not the old `useWallet()`
3. **Singleton provider** — one instance per network, cached
4. **Cached contracts** — one instance per address+sender, reused across renders
5. **`new JSONRpcProvider({ url, network })`** — config object, not positional args
6. **`getContract<T>(addr, abi, provider, network, sender?)`** — all 4-5 params
7. **`contract.metadata()`** — single call for all token info
8. **Public key resolution** — resolve before transfer, handle not-found case
9. **Simulation before send** — always
10. **`signer: null`** — wallet handles signing on frontend
11. **`AddressVerificator`** — proper validation, not `startsWith()`
12. **WalletConnect popup CSS fix** — in index.css (mandatory)
13. **Loading states** — always show progress
14. **No `Buffer`** — removed from OPNet stack
15. **No inline CSS** — className only, styles in CSS files
