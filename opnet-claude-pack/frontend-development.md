# OPNet Frontend Development Guide

React + Vite + TypeScript. No exceptions. Vite is MANDATORY — no webpack, parcel, or rollup.

---

## CRITICAL FRONTEND RULES

1. **NEVER use raw PSBT.** No `new Psbt()`, no manual PSBT construction. FORBIDDEN.
2. **NEVER use `@btc-vision/transaction` for contract calls.** Use `getContract()` from `opnet`.
3. **`signer: null` and `mldsaSigner: null` in `sendTransaction()`. ALWAYS.**
4. **Always simulate before sending.** NEVER skip simulation.
5. **WalletConnect v2 API**: `useWalletConnect()` + `WalletConnectProvider` (NOT v1 `useWallet()`/`WalletProvider`).
6. **WalletConnect popup CSS fix** is MANDATORY — include in global CSS (see CLAUDE.md).
7. **Buffer is removed** — use `Uint8Array` and `BufferHelper`.

---

## Project Structure

```
my-frontend/
├── src/
│   ├── main.tsx              # Entry point with WalletConnectProvider
│   ├── App.tsx               # Main app component
│   ├── components/           # React components
│   ├── hooks/                # Custom hooks
│   ├── services/             # Singleton services (ProviderService, ContractService)
│   ├── utils/                # Utility classes
│   ├── types/                # TypeScript interfaces
│   ├── config/               # Network config, contract addresses
│   └── abi/                  # Contract ABIs
├── public/
├── index.html
├── package.json
├── vite.config.ts            # CRITICAL — use the complete config below
├── tsconfig.json
└── eslint.config.js          # Copy from eslint-configs/eslint-react.js
```

---

## Vite Config (COMPLETE — USE THIS EXACTLY)

```typescript
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import eslint from 'vite-plugin-eslint2';

export default defineConfig({
    base: '/',
    plugins: [
        // Node.js polyfills MUST come first
        nodePolyfills({
            globals: { Buffer: true, global: true, process: true },
            overrides: { crypto: 'crypto-browserify' },  // REQUIRED for signing
        }),
        react(),
        eslint({ cache: false }),
    ],
    resolve: {
        alias: {
            global: 'global',
            // opnet uses undici for fetch — REQUIRED browser shim
            undici: resolve(__dirname, 'node_modules/opnet/src/fetch/fetch-browser.js'),
        },
        mainFields: ['module', 'main', 'browser'],
        dedupe: ['@noble/curves', '@noble/hashes', '@scure/base', 'buffer', 'react', 'react-dom'],
    },
    build: {
        commonjsOptions: { strictRequires: true, transformMixedEsModules: true },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'js/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.names?.[0] ?? '';
                    const ext = name.split('.').pop() ?? '';
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) return 'images/[name][extname]';
                    if (/woff|woff2|eot|ttf|otf/i.test(ext)) return 'fonts/[name][extname]';
                    if (/css/i.test(ext)) return 'css/[name][extname]';
                    return 'assets/[name][extname]';
                },
                manualChunks(id) {
                    if (id.includes('crypto-browserify') || id.includes('randombytes')) return undefined;
                    if (id.includes('node_modules')) {
                        if (id.includes('@noble/curves')) return 'noble-curves';
                        if (id.includes('@noble/hashes')) return 'noble-hashes';
                        if (id.includes('@scure/')) return 'scure';
                        if (id.includes('@btc-vision/transaction')) return 'btc-transaction';
                        if (id.includes('@btc-vision/bitcoin')) return 'btc-bitcoin';
                        if (id.includes('@btc-vision/bip32')) return 'btc-bip32';
                        if (id.includes('@btc-vision/post-quantum')) return 'btc-post-quantum';
                        if (id.includes('@btc-vision/wallet-sdk')) return 'btc-wallet-sdk';
                        if (id.includes('@btc-vision/walletconnect')) return 'btc-walletconnect';
                        if (id.includes('node_modules/opnet')) return 'opnet';
                        if (id.includes('react')) return 'react-vendor';
                    }
                },
            },
            external: [
                'node:crypto', 'node:buffer', 'node:stream', 'node:util',
                'node:path', 'node:fs', 'node:os', 'node:net', 'node:tls',
                'node:http', 'node:https', 'node:events', 'node:url',
                'node:zlib', 'node:worker_threads', 'node:child_process',
            ],
        },
        target: 'esnext',
        modulePreload: false,
        cssCodeSplit: false,
        assetsInlineLimit: 10000,
        chunkSizeWarningLimit: 3000,
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'buffer', 'process'],
        exclude: ['crypto-browserify', '@btc-vision/transaction'],
    },
});
```

### Why Every Setting Matters

| Setting | Why Required |
|---------|--------------|
| `nodePolyfills` before `react()` | Plugin order matters |
| `crypto: 'crypto-browserify'` | Browser crypto for signing |
| `undici` alias | opnet uses undici internally, needs browser shim |
| `dedupe` for noble/scure libs | Multiple copies break signatures |
| `manualChunks` | Proper code splitting |
| `external` for `node:` modules | Cannot run in browser |
| `exclude: ['crypto-browserify']` | Circular deps break pre-bundling |

---

## TypeScript Config (tsconfig.json)

```json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "noUncheckedIndexedAccess": true,
        "module": "ESNext",
        "target": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "react-jsx",
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "outDir": "dist",
        "baseUrl": ".",
        "paths": { "@/*": ["src/*"] },
        "lib": ["ESNext", "DOM", "DOM.Iterable"]
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist"]
}
```

---

## Caching Rules (CRITICAL)

- **Provider**: ONE singleton per network. Never create multiple instances.
- **Contract instances**: ONE per address. Cache in a service — never in component state.
- **RPC results**: Cache metadata, invalidate on block or network change.
- **NEVER `Map<Address, T>` for caches.** Use `AddressMap` from `@btc-vision/transaction` or key by `string`.

---

## Address Handling Rules

- Contract addresses: both `op1...` and `0x...` formats are valid for `getContract()`
- Use `AddressVerificator` from `@btc-vision/transaction` for ALL validation
- Public keys for transfers MUST be hexadecimal (`0x...`)
- If you have a Bitcoin address, resolve the public key first via `provider.getPublicKeyInfo(addr, false)`
- Handle P2TR, P2WPKH, P2MR, and **P2OP** (`op1...`) address types

### P2OP Addresses

P2OP is a **real address type** — witness version 16 (OP_16, bech32m encoding):
- Mainnet: `op1...` 
- Testnet: `opt1...` (HRP is `opt`, NOT `op1`)

Always use `AddressVerificator.detectAddressType()` — never `startsWith()` checks.

---

## Deployment Rules

1. Use `TransactionFactory.signDeployment()` — never `web3.deployContract()` directly
2. ALWAYS pass `network` from `useWalletConnect()` — without it, wallet defaults to wrong address validation
3. Never use any Signer class on frontend — OP_WALLET handles signing
4. Deployment is TWO transactions — funding TX then deploy TX, with 3s delay
5. Limit UTXOs to top 5 by value — large UTXO sets create oversized transactions
6. `gasSatFee: 10_000n` minimum for deployments
7. ALWAYS check `BroadcastedTransaction.success` — broadcasts can return without throwing but still fail

---

## Common Frontend Mistakes

1. **Multiple provider instances** — use singleton service
2. **`getContract()` every render** — cache in service, use `useMemo`
3. **Hardcoding network strings** — use `networks` from `@btc-vision/bitcoin`
4. **Not handling network switch** — clear caches, refetch data on network change
5. **Missing loading states** — always show skeleton/spinner while fetching
6. **Incomplete vite config** — use the complete config above, every setting matters
7. **Missing `crypto-browserify` override** — signatures will fail silently
8. **Missing `undici` alias** — opnet RPC calls will fail
9. **Using `number` for satoshi amounts** — use `bigint`
10. **Old WalletConnect API** — use `useWalletConnect()` not `useWallet()`
11. **Missing wallet popup CSS fix** — modal renders at page bottom
12. **Not calling `metadata()`** — making 4 separate calls for name/symbol/decimals/supply
