# OP_WALLET & WalletConnect Integration Guide

OP_WALLET is the official wallet for OPNet. ALL OPNet dApps MUST integrate it.

---

## Why OP_WALLET is Required

| Feature | OP_WALLET | Other Wallets |
|---------|-----------|---------------|
| Official Support | Yes | No |
| MLDSA Signatures | Yes | No |
| Quantum-Resistant Keys | Yes | No |
| Full OPNet Integration | Yes | Partial |

Install from: [Chrome Web Store — search "OP_WALLET"](https://chromewebstore.google.com/search/OP_WALLET)

---

## Installation

```bash
npm install @btc-vision/walletconnect
```

Peer dependencies: React 19+

---

## Quick Start

### 1. Wrap Your App (WalletConnectProvider, NOT WalletProvider)

```tsx
// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
// NOT: WalletProvider — that's the old v1 API (removed)
import App from './App';
import './index.css';
// INCLUDE THE POPUP CSS FIX IN index.css — see CLAUDE.md

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <WalletConnectProvider theme="dark">
            <App />
        </WalletConnectProvider>
    </StrictMode>
);
```

### 2. Use the Hook (useWalletConnect, NOT useWallet)

```tsx
import { useWalletConnect } from '@btc-vision/walletconnect';
// NOT: useWallet — that's the old v1 API (removed)

function WalletButton() {
    const { openConnectModal, disconnect, walletAddress, connecting, network } = useWalletConnect();

    if (connecting) return <button disabled>Connecting...</button>;

    if (walletAddress) {
        return (
            <div>
                <p>Connected: {walletAddress.slice(0, 8)}...{walletAddress.slice(-4)}</p>
                <button onClick={disconnect}>Disconnect</button>
            </div>
        );
    }

    return <button onClick={openConnectModal}>Connect Wallet</button>;
}
```

---

## Full Hook API (v2)

```typescript
const {
    // State
    walletAddress,       // string | null — connected Bitcoin address
    publicKey,           // string | null — hex public key
    network,             // WalletConnectNetwork | null — current network
    address,             // Address | null — with MLDSA support
    connecting,          // boolean — connection in progress
    provider,            // AbstractRpcProvider | null — pre-configured provider
    mldsaPublicKey,      // string | null — raw MLDSA key (OP_WALLET only, ~5000 chars)
    hashedMLDSAKey,      // string | null — SHA256 hash of MLDSA key (32 bytes hex)
    walletBalance,       // WalletBalance | null

    // Methods
    openConnectModal,    // () => void — open wallet selection modal
    disconnect,          // () => void — disconnect wallet
    signMLDSAMessage,    // (msg: string) => Promise<MLDSASignature | null>
    verifyMLDSASignature // (msg: string, sig: MLDSASignature) => Promise<boolean>
} = useWalletConnect();
```

**Connection check:** `publicKey !== null` means connected. There is no `isConnected` boolean.

---

## WalletConnect Popup CSS Fix (MANDATORY)

The `@btc-vision/walletconnect` modal renders broken at the bottom of the page by default. This is a **known issue**. You MUST add this CSS to your global styles:

```css
/* Add to index.css or App.css — REQUIRED */
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

**NEVER ship a frontend without this fix.**

---

## MLDSA Quantum-Resistant Signatures (OP_WALLET Only)

```typescript
const { mldsaPublicKey, hashedMLDSAKey, publicKey, signMLDSAMessage } = useWalletConnect();

// For Address.fromString — use hashedMLDSAKey (32-byte hash), NOT mldsaPublicKey (raw ~5000 chars)
import { Address } from '@btc-vision/transaction';
if (hashedMLDSAKey && publicKey) {
    const senderAddress = Address.fromString(hashedMLDSAKey, publicKey);
}

// Signing (use Auto methods — they auto-detect browser vs backend)
import { MessageSigner } from '@btc-vision/transaction';
const signed = await MessageSigner.tweakAndSignMessageAuto('My message');
// OR for MLDSA specifically:
const mldsaSigned = await MessageSigner.signMLDSAMessageAuto('My message');
```

**linkMLDSAPublicKeyToAddress is hardcoded to `true` in OPWallet by design.** This is not a bug and not configurable.

---

## Key Behaviors

- `getSigner()` returns `null` BY DESIGN on frontend — wallet handles signing internally
- `getPublicKey()` may return MLDSA key (~5000+ hex chars) — always check length before processing
- Extension may load AFTER DOMContentLoaded — use retry logic for auto-reconnect:

```typescript
useEffect(() => {
    const stored = localStorage.getItem('op_wallet_connected');
    if (!stored) return;

    const tryConnect = () => {
        if (window.opnet) {
            // Wallet available — trigger reconnect
            openConnectModal();
        }
    };

    // Retry a few times — extension loads async
    if (!window.opnet) {
        setTimeout(tryConnect, 500);
        setTimeout(tryConnect, 1500);
        setTimeout(tryConnect, 3000);
    } else {
        tryConnect();
    }
}, []);
```

---

## Network Auto-Detection (No Page Refresh)

```typescript
// hooks/useNetwork.ts
import { useState, useEffect } from 'react';
import { networks, Network } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { contractService } from '../services/ContractService';

export function useNetwork() {
    const { network: walletNetwork, publicKey } = useWalletConnect();
    const [network, setNetwork] = useState<Network>(networks.bitcoin);
    const isConnected = publicKey !== null;

    useEffect(() => {
        if (isConnected && walletNetwork) {
            if (walletNetwork !== network) {
                contractService.clearCache(); // Clear cached contract instances
                setNetwork(walletNetwork);
            }
        }
    }, [walletNetwork, isConnected, network]);

    return { network, isConnected };
}
```

---

## Theme Options

```tsx
<WalletConnectProvider theme="dark">   {/* Dark theme */}
<WalletConnectProvider theme="light">  {/* Light theme */}
<WalletConnectProvider theme="moto">   {/* MotoSwap theme */}
```

---

## Network Configuration Reference

| Network | RPC Endpoint | `networks.*` const | OPNet Address HRP |
|---------|-------------|---------------------|-------------------|
| Mainnet | `https://mainnet.opnet.org` | `networks.bitcoin` | `op` |
| Testnet | `https://testnet.opnet.org` | `networks.opnetTestnet` | `opt` |
| Regtest | `http://localhost:9001` | `networks.regtest` | — |

**OPNet Testnet HRP is `opt`** — addresses look like `opt1q...`, `opt1p...`, `opt1z...`. NOT `op1`.

---

## Signing: Always Use Auto Methods

```typescript
import { MessageSigner } from '@btc-vision/transaction';

// CORRECT — Auto methods work in both browser (OPWallet) AND backend (local keypair)
const result = await MessageSigner.signMessageAuto('message');
const result = await MessageSigner.tweakAndSignMessageAuto('message');
const result = await MessageSigner.signMLDSAMessageAuto('message');

// WRONG — environment-specific, crashes in wrong context
const result = await MessageSigner.signMessage(keypair, 'message');      // backend only
const result = await MessageSigner.signMLDSAMessage(keypair, 'message'); // backend only
```

---

## Deriving OPWallet Keys (Backend)

```typescript
// CORRECT — OPWallet-compatible derivation
import { Mnemonic, AddressTypes } from '@btc-vision/transaction';

const mnemonic = Mnemonic.fromPhrase('word1 word2 ...');
const wallet = await mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

// WRONG — different derivation path, keys won't match OPWallet
// const wallet = await mnemonic.deriveUnisat(...); // Does NOT EXIST
const wallet = await mnemonic.derive(AddressTypes.P2TR, 0); // Different path
```

`deriveUnisat()` does NOT exist. Use `deriveOPWallet()`. `deriveMultipleUnisat()` exists internally and calls `deriveOPWallet()`.
