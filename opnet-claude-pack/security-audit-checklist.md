# OPNet Security Audit Checklist

Use this checklist before deploying ANY OPNet code.

---

## Critical Vulnerability Checks (Contracts)

- [ ] All u256 arithmetic uses SafeMath (no raw `+`, `-`, `*`, `/`)
- [ ] Raw u64 arithmetic with user input converted to u256 + SafeMath first
- [ ] No `while` loops (FORBIDDEN)
- [ ] All `for` loops have hard upper bounds
- [ ] No unbounded array iteration (pagination required)
- [ ] No map key iteration (store aggregates instead)
- [ ] Checks-effects-interactions pattern (state changes BEFORE external calls)
- [ ] ReentrancyGuard on contracts with `Blockchain.call()`
- [ ] Access control on all admin/sensitive methods via `Blockchain.tx.sender`
- [ ] No `tx.origin` for authentication (phishing risk)
- [ ] No public uncapped mint functions
- [ ] No floating point (`f32`/`f64`) in contracts

---

## OPNet-Specific Checks

- [ ] `Blockchain.block.number` used for time logic (NOT `medianTimestamp` — miner-manipulable ±2hr)
- [ ] Constructor contains ONLY storage declarations (ALL logic in `onDeployment`)
- [ ] Constructor gas limit (20M hardcoded) respected — no heavy logic in constructor
- [ ] No `approve()` — use `increaseAllowance()` / `decreaseAllowance()`
- [ ] No `Buffer` usage — `Uint8Array` only
- [ ] `Blockchain.verifySignature()` used (NOT deprecated `verifyECDSASignature`/`verifySchnorrSignature`)
- [ ] `Address.fromString()` uses TWO hex params (`hashedMLDSAKey`, `tweakedPubKey`)
- [ ] No bare `Map<Address, T>` — use `AddressMemoryMap` (reference equality bug)
- [ ] `save()` called after `StoredU256Array`/`StoredAddressArray` mutations
- [ ] `@method`, `@returns`, `@emit`, `ABIDataTypes` are NOT imported (compile-time globals)
- [ ] Event payloads under 352-byte limit
- [ ] `Blockchain.log()` removed before production
- [ ] `throw new Revert('msg')` used (NOT `throw Revert('msg')`)

---

## Payable Method Security (CRITICAL)

- [ ] Every payable method that verifies BTC outputs BLOCKS contract callers:
  ```typescript
  if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
      throw new Revert('Direct calls only');
  }
  ```
- [ ] Without this check: malicious contracts can replay BTC outputs across multiple calls
- [ ] This is the most commonly missed OPNet-specific security rule

---

## NativeSwap / DEX Checks

- [ ] Queue Impact (logarithmic scaling) understood as the anti-manipulation mechanism
- [ ] No references to slashing (removed from NativeSwap)
- [ ] No references to `cancelListing()` (removed — use `withdrawListing()` for emergency only)
- [ ] CSV timelocks on ALL swap recipient addresses (anti-pinning)
- [ ] Reservation system: prices locked at reservation, not execution
- [ ] Partial fills: atomic coordination of multi-provider payments

---

## Data Layout & Calldata Compaction

- [ ] Token decimals use `u8` (not `u256`) — max value is 18
- [ ] Boolean params use `bool` (not `u256`)
- [ ] Basis point fields (fees, slippage) use `u16` (not `u256`) — max 10000
- [ ] Block height/deadline fields use `u32` (not `u256`)
- [ ] Enum/flag params use `u8` (not `u256`)
- [ ] Sequential nonces use `u64` (not `u256` unless cryptographic)
- [ ] `StoredBoolean` for boolean storage (not `StoredU256` with 0/1)
- [ ] u16 arithmetic casts to u32 before addition (overflow prevention)

---

## Storage Audit

- [ ] All storage pointers unique (via `Blockchain.nextPointer`)
- [ ] Parent class pointers allocated before child class pointers
- [ ] No pointer collisions between storage variables
- [ ] Cache coherence: setters load from storage before comparison
- [ ] Deletion markers use 32-byte EMPTY_BUFFER
- [ ] No hex encoding of binary data (2x storage waste)
- [ ] Small fixed indices use distinct pointers (not sub-keyed StoredU256)

---

## Serialization Audit

- [ ] Write/read type pairs match (`writeU16` ↔ `readU16`, NOT `readU32`)
- [ ] Calldata read in exact order it was written
- [ ] Array length prefix type consistent between write and read
- [ ] `BytesWriter` buffer size matches total bytes written
- [ ] Generic methods handle `sizeof<T>()` as BYTES not bits
- [ ] Signed/unsigned types not confused in generic methods

---

## Signature & Quantum Security

- [ ] `Blockchain.verifySignature()` used (consensus-aware, auto-selects algorithm)
- [ ] ML-DSA preferred for new contracts
- [ ] Domain separation in signed data (contract address included in message)
- [ ] Nonce-based replay protection (nonce consumed atomically)
- [ ] Signature deadlines use block number, NOT `medianTimestamp`

---

## Bitcoin-Specific Checks

- [ ] CSV timelocks on ALL swap recipient addresses (anti-pinning)
- [ ] Partial revert awareness (BTC transfers irreversible even if contract reverts)
- [ ] Sufficient confirmation depth before acting on transactions
- [ ] P2WPKH: only 33-byte compressed pubkeys accepted
- [ ] P2MR and P2OP address types handled alongside P2TR/P2WPKH

---

## Transaction Generation Checks (CRITICAL)

- [ ] No raw PSBT construction (`new Psbt()`, `Psbt.fromBase64()`)
- [ ] Contract calls use `getContract()` from `opnet` — NOT `@btc-vision/transaction`
- [ ] `@btc-vision/transaction` used ONLY for `TransactionFactory`
- [ ] Frontend: `signer: null`, `mldsaSigner: null` in `sendTransaction()`
- [ ] Backend: `signer: wallet.keypair`, `mldsaSigner: wallet.mldsaKeypair`
- [ ] No private keys in frontend code
- [ ] Payable: `setTransactionDetails()` called BEFORE simulate
- [ ] `setTransactionDetails()` output index starts at 1 (index 0 RESERVED)
- [ ] Always simulate before sending
- [ ] Deployment `gasSatFee` >= 10_000n

---

## Frontend/Backend Checks

- [ ] No `any` types
- [ ] No non-null assertions (`!` operator)
- [ ] No `@ts-ignore` or `eslint-disable`
- [ ] `bigint` for all satoshi/token amounts (not `number`)
- [ ] No floats for financial calculations
- [ ] `JSONRpcProvider({ url, network })` config object (NOT positional args)
- [ ] Provider singleton per network
- [ ] `getContract<T>(address, abi, provider, network, sender?)` — 4-5 params (NOT 3)
- [ ] `useWalletConnect()` used (NOT old `useWallet()`)
- [ ] `WalletConnectProvider` used (NOT old `WalletProvider`)
- [ ] `AddressVerificator` for address validation (not `startsWith()` checks)
- [ ] `BroadcastedTransaction.success` always checked after broadcast
- [ ] `metadata()` used for token info (not 4 separate calls)
- [ ] WalletConnect popup CSS fix included in global styles
- [ ] `deriveOPWallet()` used (NOT `deriveUnisat()` — does not exist)
- [ ] Vite used as build tool (NOT webpack, parcel, rollup)

---

## Critical Runtime Vulnerability Patterns

### C-07: Serialization Mismatch [CRITICAL]
Write/read type pairs must match exactly. `writeU16` + `readU32` = data corruption.

### C-08: sizeof<T>() Misinterpretation [CRITICAL]
`sizeof<T>()` returns BYTES, not bits.

### C-09: Signed/Unsigned Type Confusion [CRITICAL]
Generic methods may confuse signed and unsigned integers.

### C-10: Cache Coherence in Lazy-Loaded Storage [CRITICAL]
Storage setters must load current value from storage (getter) before comparison.

### C-11: Wrong Deletion Marker Size [HIGH]
Storage deletion uses 32-byte EMPTY_BUFFER.

### H-06: Index Out of Bounds [HIGH]
Always validate array indices before access.

### H-07: Off-by-One (`>` instead of `>=`) [HIGH]
Use `>=` for max index checks to prevent buffer overflow.

### H-08: Pointer Collision [HIGH]
All storage pointers must be unique via `Blockchain.nextPointer`.

### M-05: Taylor Series Divergence [MEDIUM]
Math approximations can diverge — validate inputs stay in convergence range.

---

## DISCLAIMER

This checklist is a guide and may miss vulnerabilities. It is NOT a substitute for professional security audit by experienced human auditors. Do NOT deploy to production based solely on this checklist. Always engage professional auditors for contracts handling real value.
