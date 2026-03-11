# OPNet Development Bible

You are building on **OPNet** — a Bitcoin L1 smart contract platform using Tapscript-encoded calldata. This is **NOT Ethereum. NOT a sidechain. NOT OP_RETURN or inscriptions.**

**Read this ENTIRE file before writing any code. Every rule is NON-NEGOTIABLE.**

---

## WHAT IS OPNet

- Bitcoin L1 consensus layer — smart contracts directly on Bitcoin PoW
- Contracts: AssemblyScript → WASM → deterministic execution
- **NON-CUSTODIAL**: contracts NEVER hold BTC. They verify L1 tx outputs.
- **Partial reverts**: contract execution can revert; Bitcoin transfers are always valid
- **No gas token**: uses Bitcoin directly
- **CSV timelocks MANDATORY** for all swap recipient addresses (anti-pinning)
- **Quantum resistance** via ML-DSA (FIPS 204) / P2MR addresses (BIP-360)
- Method selectors: **SHA256** first 4 bytes (NOT Keccak256 — this is Bitcoin)

---

## ABSOLUTE RULES — NEVER VIOLATE

### 1. TYPESCRIPT EVERYWHERE
- **Frontend**: TypeScript + React + **Vite** (mandatory — no webpack, parcel, or rollup)
- **Backend**: TypeScript + Node.js + `@btc-vision/hyper-express` (NO Express/Fastify/Koa)
- **Contracts**: AssemblyScript (btc-runtime)
- No exceptions. Not even for "quick examples."

### 2. NO RAW PSBT CONSTRUCTION
- NEVER `new Psbt()`, `Psbt.fromBase64()`, or manual PSBT construction. FORBIDDEN.
- **Contract calls**: `getContract()` → simulate → `sendTransaction()`. That's it.
- **`@btc-vision/transaction`**: ONLY for `TransactionFactory` (deployments, BTC transfers).

### 3. SIGNER RULES (CONTEXT-DEPENDENT)
- **FRONTEND**: `signer: null`, `mldsaSigner: null` — ALWAYS. OP_WALLET handles ALL signing. NEVER put private keys in frontend code.
- **BACKEND**: `signer: wallet.keypair`, `mldsaSigner: wallet.mldsaKeypair` — BOTH required.
- Wrong context = critical security bug or broken transactions.

### 4. ALWAYS SIMULATE BEFORE SENDING
- BTC transfers are irreversible. Contract revert = your BTC is gone.
- `const sim = await contract.method(args)` → check errors → `sim.sendTransaction(params)`

### 5. BUFFER IS GONE
- `Buffer` is completely removed from the OPNet stack. No `Buffer.from()`, `Buffer.alloc()`, nothing.
- Use `Uint8Array` everywhere.
- Hex conversions: `BufferHelper.fromHex()` / `BufferHelper.toHex()` from `@btc-vision/transaction`
- OR: `fromHex()` / `toHex()` from `@btc-vision/bitcoin`

### 6. NO `any` TYPE — TYPESCRIPT LAW
- Forbidden: `any`, `!` (non-null assertion), `@ts-ignore`, `eslint-disable`, `Function`, `{}`, `object`
- TSDoc for EVERY class, method, property (`@param`, `@returns`, `@throws`, `@example`)
- No section separator comments (`// ====== SECTION ======`). Use proper class design.
- No inline CSS. Use CSS modules, styled-components, or external stylesheets.

### 7. SIGNATURES: ECDSA AND SCHNORR ARE DEPRECATED
- NEVER use `verifyECDSASignature` or `verifySchnorrSignature` directly.
- ALWAYS: `Blockchain.verifySignature(address, signature, hash)` — consensus-aware, auto-selects.
- Client-side signing: ONLY `*Auto()` methods: `MessageSigner.signMessageAuto()`, `tweakAndSignMessageAuto()`, `signMLDSAMessageAuto()`.

### 8. NETWORK CONFIGURATION
- NEVER hardcode network strings. Use `networks` from `@btc-vision/bitcoin`:
  - `networks.bitcoin` = mainnet
  - `networks.opnetTestnet` = OPNet testnet (Signet fork, HRP: `opt`)
  - `networks.regtest` = regtest
- **NEVER use `networks.testnet`** — that's Testnet4, OPNet does NOT support it.

### 9. PACKAGES — ALWAYS USE @rc TAG (LATEST)
- OPNet packages use `@rc` release candidate tags. Always install with `@rc` for latest.
- After every `npm install`, run: `npx npm-check-updates -u && npm install`
- Never use `bitcoinjs-lib`. Use `@btc-vision/bitcoin`.
- ALWAYS add to every `package.json`:
  ```json
  { "overrides": { "@noble/hashes": "2.0.1" } }
  ```

### 10. CONSTRUCTOR GAS LIMIT IS HARDCODED AT 20M
- The constructor runs on EVERY contract interaction, not just deployment.
- **HARDCODED 20M gas limit** — no flag or fee can override this.
- Constructor: ONLY storage pointer declarations and `super()`.
- ALL initialization logic (storage writes, loops, minting) goes in `onDeployment()`.

### 11. VERIFICATION ORDER (MANDATORY)
1. `npm run lint` — fix ALL errors
2. `npm run typecheck` (or `tsc --noEmit`) — fix ALL type errors
3. `npm run build` — only after lint + types pass
4. `npm run test` — run on clean build

---

## COMMON MISTAKES TABLE

| Mistake | Why Wrong | Correct |
|---------|-----------|---------|
| `approve()` on OP-20 | Doesn't exist | `increaseAllowance()` / `decreaseAllowance()` |
| `new JSONRpcProvider(url, network)` | Wrong constructor | `new JSONRpcProvider({ url, network })` |
| `getContract(addr, abi, provider)` | Missing network param | `getContract<T>(addr, abi, provider, network, sender?)` |
| `useWallet()` / `WalletProvider` | Old v1 API | `useWalletConnect()` / `WalletConnectProvider` |
| `deriveUnisat()` | Does NOT exist | `deriveOPWallet()` |
| `Buffer.from()` | Removed | `Uint8Array` + `BufferHelper` |
| `throw Revert('msg')` | Revert is a class | `throw new Revert('msg')` |
| `verifyECDSASignature()` | Deprecated | `Blockchain.verifySignature()` |
| `bitcoinjs-lib` | Not supported | `@btc-vision/bitcoin` |
| `networks.testnet` | Testnet4, not OPNet | `networks.opnetTestnet` |
| `Blockchain.block.medianTimestamp` | Miner-manipulable ±2hr | `Blockchain.block.number` (tamper-proof) |
| Keccak256 selectors | Wrong hash | SHA256 first 4 bytes |
| Express/Fastify/Koa | Forbidden | `@btc-vision/hyper-express` |
| `Map<Address, T>` | Reference equality bug | `AddressMemoryMap` (contracts) or string key |
| Skipping simulation | Irreversible BTC loss | Always simulate first |
| `@method()` bare (no args) | Zero ABI inputs — broken | Declare ALL params in `@method(...)` |
| `import ABIDataTypes` | Compile-time global | Don't import — injected by opnet-transform |
| `import @method/@returns/@emit` | Compile-time globals | Don't import — injected by opnet-transform |
| 4 calls for name/symbol/decimals/supply | Wasteful | `contract.metadata()` — one call |
| `assemblyscript` (upstream) | Conflicts with fork | `npm uninstall assemblyscript` first |
| Webpack/parcel/rollup | Wrong build tool | Vite ONLY |
| `approve()` spender = wallet | Using wallet as spender | Contract address is the spender |
| `@method()` bare (no args) | Zero ABI inputs | Declare ALL params in `@method(...)` |
| P2OP addresses (`op1...`) | Ignore/reject them | Handle them — witness v16 (OP_16, bech32m) |
| `linkMLDSAPublicKeyToAddress` = false | Not configurable | Hardcoded true in OPWallet. Not a bug. |
| OPNet testnet prefix = `op1` | Wrong prefix | HRP is `opt` → addresses are `opt1q...` etc. |
| `cancelListing()` on NativeSwap | Removed | `withdrawListing()` (emergency mode only) |
| Slashing in NativeSwap | Removed | Queue Impact (logarithmic scaling) deters abuse |

---

## TRANSACTION FLOW CHEAT SHEET

| Task | Tool | Package |
|------|------|---------|
| Contract calls (transfer, mint, etc.) | `getContract()` → simulate → `sendTransaction()` | `opnet` |
| Contract deployment | `TransactionFactory.signDeployment()` | `@btc-vision/transaction` |
| BTC transfer | `TransactionFactory.createBTCTransfer()` | `@btc-vision/transaction` |
| Reading contract data | `getContract()` → `.metadata()`, `.balanceOf()`, etc. | `opnet` |

### Frontend Contract Call (Canonical Pattern)

```typescript
import { getContract, IOP20Contract, OP_20_ABI, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

// Provider: config object, NOT positional args
const provider = new JSONRpcProvider({ url: 'https://mainnet.opnet.org', network: networks.bitcoin });

// getContract: 4 required + 1 optional param
const contract = getContract<IOP20Contract>(
    contractAddress,    // string or Address
    OP_20_ABI,          // BitcoinInterfaceAbi
    provider,           // JSONRpcProvider
    networks.bitcoin,   // Network — REQUIRED
    senderAddress,      // string | Address — optional, needed for writes
);

// ALWAYS simulate first
const sim = await contract.transfer(recipientPubKey, amount);
if ('error' in sim) throw new Error(sim.error);

// FRONTEND: signer and mldsaSigner are ALWAYS null
await sim.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: walletAddress,
    maximumAllowedSatToSpend: 100000n,
    feeRate: 10,
    network: networks.bitcoin,
});
```

### Backend Contract Call

```typescript
await sim.sendTransaction({
    signer: wallet.keypair,            // BACKEND: required
    mldsaSigner: wallet.mldsaKeypair,  // BACKEND: required
    from: wallet.address,
    refundTo: wallet.p2tr,
    utxos,
    challenge: await provider.getChallenge(),
    feeRate: 50,
    priorityFee: 50_000n,
    maximumAllowedSatToSpend: 500_000n,
    network,
});
```

### Frontend Deployment

```typescript
const factory = new TransactionFactory();
const result = await factory.signDeployment({
    network,                // from useWalletConnect() — CRITICAL
    bytecode: wasmBytes,
    calldata,
    utxos: limitedUtxos,    // Top 5 UTXOs by value only
    from: walletAddress,
    feeRate: 10,
    priorityFee: 1000n,
    gasSatFee: 10_000n,     // Minimum for deployments
} as unknown as IDeploymentParameters);

const [fundingHex, deployHex] = result.transaction;
await provider.sendRawTransaction(fundingHex, false);
await new Promise<void>(r => setTimeout(r, 3000));  // Wait for propagation
await provider.sendRawTransaction(deployHex, false);
```

### Frontend BTC Transfer (TransactionFactory, NOT getContract)

```typescript
import { TransactionFactory } from '@btc-vision/transaction';

const factory = new TransactionFactory();
const result = await factory.createBTCTransfer({
    signer: null,       // null on frontend — OPWallet signs
    mldsaSigner: null,
    network,
    utxos,              // utxos: [] is fine for OPWallet-managed signing
    from: userAddress,
    to: 'bc1p...recipient',
    feeRate: 10,
    amount: 50000n,
});
await provider.sendRawTransaction(result.tx, false);
```

---

## PAYABLE FUNCTIONS: VERIFY-DON'T-CUSTODY PATTERN

OPNet contracts NEVER hold BTC. They **verify** that expected BTC outputs exist in the transaction.

### How it works
1. User includes a BTC output to a designated address in the same Bitcoin transaction
2. Contract reads `Blockchain.tx.outputs` to verify the output exists
3. Contract updates internal state accordingly
4. If contract reverts — BTC transfer still goes through (partial revert)

### Frontend Pattern (setTransactionDetails → simulate → sendTransaction)

```typescript
import { getContract, TransactionOutputFlags } from 'opnet';

// STEP 1: Set expected outputs BEFORE simulate (cleared after each call)
contract.setTransactionDetails({
    inputs: [],
    outputs: [{
        to: 'bc1p...recipient',    // BTC destination
        value: 5000n,               // satoshis
        index: 1,                   // index 0 is RESERVED — start at 1
        flags: TransactionOutputFlags.hasTo,
    }],
});

// STEP 2: Simulate
const sim = await contract.myPayableMethod(args);
if ('error' in sim) throw new Error(sim.error);

// STEP 3: Send with matching extraOutputs
await sim.sendTransaction({
    signer: null, mldsaSigner: null,
    refundTo: walletAddress,
    maximumAllowedSatToSpend: 200000n,
    feeRate: 10, network,
    extraOutputs: [{ to: 'bc1p...recipient', value: 5000n, index: 1 }],
});
```

### CRITICAL SECURITY: Block Contract Callers on Payable Methods

**If a payable method verifies BTC outputs, it MUST check that the caller is an EOA (externally owned account), not another contract.**

A malicious contract can call your payable method and replay the same BTC output across multiple calls — draining your system.

```typescript
// IN EVERY PAYABLE METHOD THAT CHECKS BTC OUTPUTS:
@method(...)
public buyTokens(calldata: Calldata): BytesWriter {
    // MANDATORY: block contract-to-contract calls
    if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
        throw new Revert('Direct calls only');
    }

    // Now verify BTC output
    const outputs = Blockchain.tx.outputs;
    // ... verify expected output exists
}
```

---

## EXTRA INPUTS/OUTPUTS

```typescript
// setTransactionDetails() CLEARS AFTER EACH CALL — set before EVERY simulate
contract.setTransactionDetails({
    inputs: [],
    outputs: [{
        to: 'bc1p...', value: 5000n,
        index: 1,  // 0 is RESERVED
        flags: TransactionOutputFlags.hasTo,
    }],
});
```

---

## ADDRESS SYSTEMS (CRITICAL)

OPNet has TWO address systems:

| System | Format | Used For |
|--------|--------|----------|
| Bitcoin Address | P2TR `bc1p...`, P2OP `op1...`, testnet `opt1...` | External identity, UTXO ownership |
| OPNet Address | ML-DSA public key hash (32 bytes hex) | Contract balances, internal state |

### P2OP Addresses (`op1...` on mainnet, `opt1...` on testnet)
- Witness version 16 output type (OP_16, bech32m encoding)
- These are OPNet contract addresses — ALWAYS handle them alongside P2TR/P2WPKH
- Use `AddressVerificator.detectAddressType()` — never `startsWith()` checks

### Address Construction

```typescript
// WRONG — Address.fromString takes hex params, not bech32
Address.fromString('bc1p...');

// CORRECT — hashedMLDSAKey (32-byte hash) + tweakedPublicKey (hex)
const { hashedMLDSAKey, publicKey } = useWalletConnect();
const addr = Address.fromString(hashedMLDSAKey, publicKey);

// Import Address from @btc-vision/transaction (NOT from opnet)
import { Address } from '@btc-vision/transaction';
```

### Resolving Wallet Address → Address Object

```typescript
// false = wallet address, true = contract address
const addr = await provider.getPublicKeyInfo(bech32Address, false);
```

### OPNet Testnet HRP

- Testnet HRP is `opt` → addresses are `opt1q...`, `opt1p...`, `opt1z...`
- NOT `op1` — that's mainnet OPNet contracts only

---

## WALLETCONNECT v2 API

```typescript
import { useWalletConnect, WalletConnectProvider } from '@btc-vision/walletconnect';
// NOT: useWallet(), WalletProvider — those are v1 (REMOVED)

const {
    walletAddress,      // string | null — Bitcoin address
    publicKey,          // string | null — hex public key
    network,            // Network object — ALWAYS destructure this
    provider,           // AbstractRpcProvider — pre-configured
    address,            // Address | null — with MLDSA support
    mldsaPublicKey,     // string | null — raw MLDSA key (OPWallet only)
    hashedMLDSAKey,     // string | null — SHA256 hash of MLDSA key
    openConnectModal,   // () => void
    disconnect,         // () => void
    signMLDSAMessage,   // (msg) => Promise<MLDSASignature | null>
} = useWalletConnect();
```

### WalletConnect Popup CSS Fix (MANDATORY)

The modal renders broken at page bottom by default. Add this CSS globally:

```css
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

**Include in your global CSS or App.css. NEVER ship without this fix.**

---

## PACKAGE INSTALLATION

### Frontend

```bash
rm -rf node_modules package-lock.json
npx npm-check-updates -u && npm i @btc-vision/bitcoin@rc @btc-vision/bip32@latest \
  @btc-vision/ecpair@latest @btc-vision/transaction@rc opnet@rc \
  @btc-vision/walletconnect@latest --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0 \
  eslint-plugin-react-hooks eslint-plugin-react-refresh
```

### Contract (AssemblyScript)

```bash
rm -rf node_modules package-lock.json
npm uninstall assemblyscript 2>/dev/null  # MANDATORY — both provide asc binary, causes conflicts
npx npm-check-updates -u && npm i @btc-vision/btc-runtime@rc @btc-vision/as-bignum@latest \
  @btc-vision/assemblyscript @btc-vision/opnet-transform@latest \
  @assemblyscript/loader@latest --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0
```

### Backend / Plugins / Unit Tests

```bash
rm -rf node_modules package-lock.json
npx npm-check-updates -u && npm i @btc-vision/bitcoin@rc @btc-vision/bip32@latest \
  @btc-vision/ecpair@latest @btc-vision/transaction@rc opnet@rc --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0
```

---

## OPNet RPC REFERENCE

All JSON-RPC methods use the `btc_` prefix. Params are positional arrays.

```
btc_blockNumber    btc_gas           btc_getBalance    btc_getUTXOs
btc_getBlockByNumber   btc_getTransactionByHash   btc_getTransactionReceipt
btc_call           btc_getCode       btc_getStorageAt  btc_getMempoolInfo
```

### Network Endpoints

| Network | RPC URL | Network Const | Testnet HRP |
|---------|---------|---------------|-------------|
| Mainnet | `https://mainnet.opnet.org` | `networks.bitcoin` | — |
| Testnet | `https://testnet.opnet.org` | `networks.opnetTestnet` | `opt` |
| Regtest | `http://localhost:9001` | `networks.regtest` | — |

---

## NUMERIC TYPES

| Use `number` for | Use `bigint` for |
|------------------|------------------|
| Array lengths | Satoshi amounts |
| Loop counters | Block heights |
| Small flags | Timestamps |
| Ports, pixels | Token amounts (all) |

**FORBIDDEN: Floats for financial values.** Use `bigint` with explicit decimal scaling.

---

## BROADCAST RESULTS — ALWAYS CHECK

```typescript
interface BroadcastedTransaction {
    readonly success: boolean;
    readonly result?: string;   // txid on success
    readonly error?: string;
    readonly peers?: number;
}
// ALWAYS check `success`. A non-throwing broadcast can still have success: false.
```

---

## PROJECT DELIVERY

### Never Include in Zips
- `node_modules/`, `package-lock.json`, `build/`, `dist/`, `.git/`

### Zip Command

```bash
zip -r project.zip . -x "node_modules/*" "package-lock.json" "build/*" "dist/*" ".git/*" "*.wasm" ".env"
```

---

## FILE READING ORDER

Read all provided files in this order before writing ANY code:

1. `CLAUDE.md` — absolute rules (this file)
2. `contract-development.md` — AssemblyScript contract patterns
3. `frontend-development.md` — React/Vite dApp patterns
4. `contract-interaction-guide.md` — how to call contracts from a website
5. `wallet-connect-guide.md` — OP_WALLET integration
6. `project-setup.md` — package versions, configs, directory structures
7. `security-audit-checklist.md` — checklist before deployment
8. `eslint-configs/` — copy appropriate config for your project type
9. `examples/` — reference implementations
