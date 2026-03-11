# OPNet Project Setup Guide

---

## Contract Project Setup

### Directory Structure

```
my-contract/
├── src/
│   ├── index.ts           # Entry point (factory + abort)
│   └── MyContract.ts      # Contract implementation
├── build/                 # Compiled WASM output
├── package.json
├── asconfig.json          # AssemblyScript config (CRITICAL)
├── tsconfig.json          # For IDE support
└── eslint.config.js       # Copy from eslint-configs/eslint-contract.js
```

### asconfig.json (CRITICAL — use this exactly)

```json
{
    "targets": {
        "my-contract": {
            "outFile": "build/MyContract.wasm",
            "use": ["abort=src/index/abort"]
        }
    },
    "options": {
        "transform": "@btc-vision/opnet-transform",
        "sourceMap": false,
        "optimizeLevel": 3,
        "shrinkLevel": 1,
        "converge": true,
        "noAssert": false,
        "enable": [
            "sign-extension",
            "mutable-globals",
            "nontrapping-f2i",
            "bulk-memory",
            "simd",
            "reference-types",
            "multi-value"
        ],
        "runtime": "stub",
        "memoryBase": 0,
        "initialMemory": 1,
        "exportStart": "start"
    }
}
```

Key points:
- `transform`: Must be `@btc-vision/opnet-transform` in the `options` block (NOT a subpath, NOT an array)
- `enable`: ALL listed features are required
- `use`: Each target's `use` points to its abort handler
- `runtime`: Must be `"stub"`
- `exportStart`: Must be `"start"`
- `shrinkLevel`: Use `1` (NOT `2`)
- `noAssert`: Use `false` (NOT `true`)

### Multi-Contract Project

```json
{
    "targets": {
        "token": {
            "outFile": "build/MyToken.wasm",
            "use": ["abort=src/token/index/abort"]
        },
        "nft": {
            "outFile": "build/MyNFT.wasm",
            "use": ["abort=src/nft/index/abort"]
        }
    },
    "options": {
        "transform": "@btc-vision/opnet-transform",
        "sourceMap": false,
        "optimizeLevel": 3,
        "shrinkLevel": 1,
        "converge": true,
        "noAssert": false,
        "enable": [
            "sign-extension", "mutable-globals", "nontrapping-f2i",
            "bulk-memory", "simd", "reference-types", "multi-value"
        ],
        "runtime": "stub",
        "memoryBase": 0,
        "initialMemory": 1,
        "exportStart": "start"
    }
}
```

Build specific target: `asc --config asconfig.json --target token`

### Contract package.json

```json
{
    "name": "my-contract",
    "version": "1.0.0",
    "scripts": {
        "build": "asc --config asconfig.json --target my-contract",
        "lint": "eslint src",
        "clean": "rm -rf build/*"
    },
    "dependencies": {
        "@btc-vision/as-bignum": "0.1.2",
        "@btc-vision/btc-runtime": "rc"
    },
    "devDependencies": {
        "@btc-vision/assemblyscript": "^0.29.2",
        "@btc-vision/opnet-transform": "1.1.0",
        "eslint": "^10.0.0",
        "@eslint/js": "^10.0.1",
        "typescript-eslint": "^8.56.0"
    },
    "overrides": {
        "@noble/hashes": "2.0.1"
    }
}
```

### Contract Install Command

```bash
rm -rf node_modules package-lock.json

# MANDATORY: uninstall upstream assemblyscript FIRST
# Both @btc-vision/assemblyscript and assemblyscript provide the `asc` binary.
# Having both installed causes version conflicts and build failures.
npm uninstall assemblyscript 2>/dev/null

npx npm-check-updates -u && npm i \
  @btc-vision/btc-runtime@rc \
  @btc-vision/as-bignum@latest \
  @btc-vision/assemblyscript \
  @btc-vision/opnet-transform@latest \
  @assemblyscript/loader@latest \
  --prefer-online

npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0
```

---

## Frontend Project Setup

### Directory Structure

```
my-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── utils/
│   ├── types/
│   ├── config/
│   └── abi/
├── public/
├── index.html
├── package.json
├── vite.config.ts          # See frontend-development.md for COMPLETE config
├── tsconfig.json
└── eslint.config.js        # Copy from eslint-configs/eslint-react.js
```

### Frontend package.json

```json
{
    "name": "my-dapp",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "npm run lint && tsc --noEmit && vite build",
        "lint": "eslint src",
        "lint:fix": "eslint src --fix",
        "typecheck": "tsc --noEmit",
        "preview": "vite preview"
    },
    "dependencies": {
        "@btc-vision/bitcoin": "rc",
        "@btc-vision/bip32": "latest",
        "@btc-vision/ecpair": "latest",
        "@btc-vision/transaction": "rc",
        "@btc-vision/walletconnect": "latest",
        "opnet": "rc",
        "react": "^19.0.0",
        "react-dom": "^19.0.0"
    },
    "devDependencies": {
        "@types/react": "latest",
        "@types/react-dom": "latest",
        "@vitejs/plugin-react": "latest",
        "eslint": "^10.0.0",
        "@eslint/js": "^10.0.1",
        "typescript-eslint": "^8.56.0",
        "eslint-plugin-react-hooks": "latest",
        "eslint-plugin-react-refresh": "latest",
        "typescript": "latest",
        "vite": "latest",
        "vite-plugin-node-polyfills": "latest",
        "vite-plugin-eslint2": "latest",
        "crypto-browserify": "latest",
        "stream-browserify": "latest"
    },
    "overrides": {
        "@noble/hashes": "2.0.1"
    }
}
```

### Frontend Install Command

```bash
rm -rf node_modules package-lock.json
npx npm-check-updates -u && npm i \
  @btc-vision/bitcoin@rc \
  @btc-vision/bip32@latest \
  @btc-vision/ecpair@latest \
  @btc-vision/transaction@rc \
  opnet@rc \
  @btc-vision/walletconnect@latest \
  --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0 \
  eslint-plugin-react-hooks eslint-plugin-react-refresh
```

---

## Backend / Plugin / Unit Test Setup

### Install Command

```bash
rm -rf node_modules package-lock.json
npx npm-check-updates -u && npm i \
  @btc-vision/bitcoin@rc \
  @btc-vision/bip32@latest \
  @btc-vision/ecpair@latest \
  @btc-vision/transaction@rc \
  opnet@rc \
  --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0
```

For backends: NEVER use Express/Fastify/Koa. Use `@btc-vision/hyper-express` and `@btc-vision/uwebsocket.js` ONLY.

---

## Package Version Reference

| Package | Tag | Used In |
|---------|-----|---------|
| `opnet` | `@rc` | Frontend, Backend, Plugins, Tests |
| `@btc-vision/transaction` | `@rc` | Frontend, Backend, Plugins, Tests |
| `@btc-vision/bitcoin` | `@rc` | Frontend, Backend, Plugins, Tests |
| `@btc-vision/bip32` | `latest` | Frontend, Backend |
| `@btc-vision/ecpair` | `latest` | Frontend, Backend |
| `@btc-vision/walletconnect` | `latest` | Frontend |
| `@btc-vision/btc-runtime` | `@rc` | Contracts |
| `@btc-vision/opnet-transform` | `1.1.0` | Contracts |
| `@btc-vision/assemblyscript` | `^0.29.2` | Contracts |
| `@btc-vision/as-bignum` | `0.1.2` | Contracts |

**ALWAYS use `@rc` tag — it tracks the latest release candidate. Never pin to a specific RC number.**

---

## TypeScript Config (Backend/Frontend)

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
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "outDir": "dist"
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist"]
}
```

---

## Buffer is REMOVED — Use Uint8Array

```typescript
import { BufferHelper } from '@btc-vision/transaction';

const bytes: Uint8Array = BufferHelper.fromHex('deadbeef');
const hex: string = BufferHelper.toHex(bytes);

// Alternative from @btc-vision/bitcoin
import { fromHex, toHex } from '@btc-vision/bitcoin';
const bytes = fromHex('deadbeef');
const hex = toHex(bytes);
```

---

## Common Setup Mistakes

1. **Wrong transform path**: Must be `@btc-vision/opnet-transform` in options block
2. **Missing WASM features**: All features in the `enable` array are required
3. **Using npm workspaces**: Don't. Install each project separately.
4. **Missing abort handler**: `asconfig.json` must have `"use"` AND `src/index.ts` must export `abort`
5. **Upstream assemblyscript installed**: MUST uninstall first — both provide `asc` binary
6. **Pinning specific RC numbers**: Use `@rc` tag, not `@1.8.1-rc.12` — RC versions change constantly
7. **Vite plugin version mismatch**: Use `"latest"` for all Vite tooling packages
8. **shrinkLevel: 2**: Use `1` only — `2` can cause runtime issues
9. **noAssert: true**: Use `false` — assertions are needed during development
