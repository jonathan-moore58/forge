# OPNet Smart Contract Development Guide

Contracts are written in AssemblyScript and compiled to WebAssembly. They run in the OPNet VM with deterministic execution.

---

## Entry Point (REQUIRED for every contract)

Every contract needs `src/index.ts` with THREE required elements:

```typescript
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { MyContract } from './MyContract';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// 1. Factory function — REQUIRED (must return NEW instance via arrow function)
Blockchain.contract = (): MyContract => {
    return new MyContract();
};

// 2. Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// 3. Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
```

### Entry Point Mistakes

```typescript
// WRONG — direct instance assignment (type error)
Blockchain.contract = new MyContract();

// WRONG — missing abort function (contract crashes)
Blockchain.contract = (): MyContract => new MyContract();
export * from '@btc-vision/btc-runtime/runtime/exports';
// MISSING: export function abort(...)
```

---

## Constructor vs onDeployment — CRITICAL

| | Constructor | onDeployment |
|---|---|---|
| **When it runs** | EVERY contract interaction | ONCE on deployment only |
| **Gas limit** | **HARDCODED 20M** (cannot override) | Full transaction gas (up to 150B) |
| **Use for** | Storage pointer declarations, `super()` | Init logic, storage writes, minting |

**The constructor has a HARDCODED gas limit of 20,000,000 gas.** No flag or fee can override this. If it exceeds 20M gas, deployment REVERTS and no bytecode is stored.

```typescript
export class MyContract extends OP_NET {
    // Storage DECLARATIONS in constructor — OK (no gas cost)
    private readonly deploymentBlockPointer: u16 = Blockchain.nextPointer;
    private readonly deploymentBlock: StoredU256 = new StoredU256(
        this.deploymentBlockPointer, u256.Zero
    );

    public constructor() {
        super();
        // ONLY storage declarations here. No logic. No writes. No loops.
    }

    public override onDeployment(_calldata: Calldata): void {
        // ALL init logic goes here — runs once, full gas budget
        this.deploymentBlock.set(Blockchain.block.numberU256);
        this._mint(Blockchain.tx.origin, INITIAL_SUPPLY);
    }
}
```

---

## Contract Class Patterns

### Extending OP20 (Token Contract)

```typescript
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address, Blockchain, BytesWriter, Calldata, encodeSelector,
    OP20, OP20InitParameters, Revert, Selector, StoredU256,
    AddressMemoryMap, SafeMath,
} from '@btc-vision/btc-runtime/runtime';

@final
export class MyToken extends OP20 {
    public constructor() {
        super();
        // NO logic here — see onDeployment
    }

    public override onDeployment(_calldata: Calldata): void {
        const maxSupply: u256 = u256.fromString('100000000000000000000000000'); // 100M * 10^18
        this.instantiate(new OP20InitParameters(maxSupply, 18, 'My Token', 'MTK'));
        this._mint(Blockchain.tx.origin, maxSupply);
    }
}
```

### Extending OP_NET (Generic Contract)

```typescript
import { OP_NET, Blockchain, Calldata, BytesWriter, Selector, encodeSelector } from '@btc-vision/btc-runtime/runtime';

@final
export class MyContract extends OP_NET {
    private readonly myMethodSelector: Selector = encodeSelector('myMethod(address,uint256)');

    public constructor() {
        super();
    }

    public override callMethod(calldata: Calldata): BytesWriter {
        const selector = calldata.readSelector();
        switch (selector) {
            case this.myMethodSelector:
                return this.myMethod(calldata);
            default:
                return super.callMethod(calldata); // ALWAYS call super for inherited methods
        }
    }
}
```

---

## Method Decorators

`@method`, `@returns`, `@emit`, `@final`, and `ABIDataTypes` are **compile-time globals** injected by `@btc-vision/opnet-transform`.

**Do NOT import them.** They are available automatically in all contract files.

```typescript
// NO import needed — these are transform globals

@method({ name: 'to', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public transfer(calldata: Calldata): BytesWriter {
    const to: Address = calldata.readAddress();
    const amount: u256 = calldata.readU256();
    // ... implementation
}
```

### CRITICAL: @method() MUST Declare ALL Params

**`@method()` with no arguments = ZERO ABI inputs = BROKEN CONTRACT.**

Callers must hand-roll calldata with `signInteraction`. The contract is untyped, unauditable, and cannot be used with `getContract`. A deployed contract with missing params **requires redeployment**.

| Pattern | Result |
|---------|--------|
| `@method()` (no args) | Zero ABI inputs. **FORBIDDEN.** |
| `@method({ name, type })` | Correct — ABI declared, SDK works |
| `@method(param1, param2, ...)` | Correct — all inputs declared |

Tuples/structs are fully supported:

```typescript
@method({ name: 'entries', type: ABIDataTypes.TUPLE, components: [
    { name: 'recipient', type: ABIDataTypes.ADDRESS },
    { name: 'amount', type: ABIDataTypes.UINT64 },
]})
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public airdrop(calldata: Calldata): BytesWriter { ... }
```

---

## OP20 Token Standard

### Key Differences from ERC-20

| ERC-20 | OP-20 |
|--------|-------|
| `approve()` | **Does NOT exist** — use `increaseAllowance()` / `decreaseAllowance()` |
| `transfer()` | Same concept, uses public key hex not address string |
| Keccak256 selectors | SHA256 first 4 bytes |

### Built-in OP20 Methods (inherited, no need to implement)

```
transfer()          transferFrom()      increaseAllowance()    decreaseAllowance()
balanceOf()         allowance()         totalSupply()          name()
symbol()            decimals()          metadata()             burn()
```

### metadata() — Use This, Not 4 Separate Calls

```typescript
// WRONG — 4 RPC calls, 4-10x slower
const name = await contract.name();
const symbol = await contract.symbol();
const decimals = await contract.decimals();
const totalSupply = await contract.totalSupply();

// CORRECT — 1 RPC call
const result = await contract.metadata();
const { name, symbol, decimals, totalSupply, icon, domainSeparator } = result.properties;
```

---

## Storage and Pointers

### Pointer Allocation (ALWAYS use Blockchain.nextPointer)

```typescript
@final
export class MyContract extends OP_NET {
    // Pointers declared as class fields — automatic unique allocation
    private readonly valuePointer: u16 = Blockchain.nextPointer;
    private readonly mapPointer: u16 = Blockchain.nextPointer;

    // Storage instances
    private readonly myValue: StoredU256 = new StoredU256(this.valuePointer, u256.Zero);
    private readonly myMap: AddressMemoryMap<Address, StoredU256> = new AddressMemoryMap(
        this.mapPointer, Address.dead()
    );
}
```

### Storage Types

| Type | Use Case |
|------|----------|
| `StoredU256` | Single u256 value (supply, prices) |
| `StoredBoolean` | Boolean flag (paused, closed) |
| `StoredString` | String value (name, symbol) |
| `StoredU64` | Single u64 value |
| `AddressMemoryMap` | Address → value mapping (balances) |
| `StoredMapU256` | u256 → u256 mapping |

**CRITICAL: NEVER use bare `Map<Address, T>`.** AssemblyScript's Map uses reference equality — two Address instances with identical bytes are different references. Use `AddressMemoryMap` or `StoredMapU256`.

**CRITICAL: For small fixed-size arrays (8 tier thresholds, etc.), use distinct pointer numbers.** Sub-keyed StoredU256 with small u256 indices can cause storage slot collisions.

```typescript
// WRONG — sub-key collision for small indices
new StoredU256(basePointer, u256.fromU32(0))  // may collide

// CORRECT — distinct pointer per index
new StoredU256(<u16>(basePointer + idx.toU64()), EMPTY_POINTER)
```

---

## u256 and SafeMath (MANDATORY)

### ALWAYS use SafeMath for u256 operations

```typescript
import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

// WRONG — raw operations forbidden (overflow/underflow)
const result = a + b;
const result = a - b;

// CORRECT — SafeMath reverts on overflow/underflow/divzero
const result = SafeMath.add(a, b);
const result = SafeMath.sub(a, b);
const result = SafeMath.mul(a, b);
const result = SafeMath.div(a, b);
```

### Creating u256 Values

```typescript
// For large values: always fromString (calculate offline)
const TOKENS_PER_MINT: u256 = u256.fromString('1000000000000000000000');  // 1000 * 10^18
const MAX_SUPPLY: u256 = u256.fromString('100000000000000000000000000'); // 100M * 10^18

// For small values
const MAX_MINTS: u256 = u256.fromU32(5);
const ONE: u256 = u256.One;
const ZERO: u256 = u256.Zero;
```

---

## Error Handling

```typescript
import { Revert } from '@btc-vision/btc-runtime/runtime';

// CORRECT — Revert is a class, use new
throw new Revert('Insufficient balance');
throw new Revert('Only deployer');
throw new Revert('Mint period ended');

// WRONG — Revert is NOT a function
throw Revert('msg');   // WRONG
```

---

## Security Patterns

### Checks-Effects-Interactions (MANDATORY)

```typescript
// CORRECT order: validate → update state → external call
public withdraw(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;
    const amount = this.balances.get(sender).get();

    // 1. CHECKS
    if (u256.eq(amount, u256.Zero)) throw new Revert('Nothing to withdraw');

    // 2. EFFECTS (state changes BEFORE external calls)
    this.balances.get(sender).set(u256.Zero);

    // 3. INTERACTION (external call last)
    this._transfer(this.address, sender, amount);

    return new BytesWriter(1).writeBoolean(true);
}
```

### Block Contract Callers on Payable Methods (CRITICAL SECURITY)

```typescript
// If your method verifies BTC outputs, ALWAYS add this check:
if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
    throw new Revert('Direct calls only — contract callers blocked');
}
// Prevents malicious contracts from replaying BTC outputs across multiple calls
```

### Access Control

```typescript
// Use tx.sender (the direct caller)
this.onlyDeployer(Blockchain.tx.sender);

// NEVER use tx.origin for authorization (phishing risk)
// tx.origin is the original transaction signer — a malicious contract
// can trick users into calling it, then your contract sees tx.origin = victim
```

### Signature Verification (DEPRECATED APIs)

```typescript
// WRONG — ECDSA is deprecated, will break when consensus disables it
verifyECDSASignature(address, sig, hash);
verifySchnorrSignature(address, sig, hash);

// CORRECT — consensus-aware, auto-selects algorithm
Blockchain.verifySignature(address, signature, hash);
```

---

## Gas Optimization

### FORBIDDEN Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `while` loops | Unbounded gas | Bounded `for` loops |
| Iterating all map keys | O(n) explosion | Store aggregates |
| Unbounded arrays | Grows forever | Cap size, pagination |

### Max Iterations Pattern

```typescript
const MAX_ITERATIONS: u32 = 100;
for (let i: u32 = 0; i < MAX_ITERATIONS; i++) {
    if (!condition) break;
    // process
}
```

---

## Data Layout Compaction

Use the smallest type that fits:

| Field | Wrong | Correct | Why |
|-------|-------|---------|-----|
| Token decimals | u256 | u8 | Max is 18 |
| Basis points (fees) | u256 | u16 | Max is 10000 |
| Boolean | u256 | bool/StoredBoolean | 1 byte |
| Block height | u256 | u32 | ~4B max |
| Enum/flag | u256 | u8 | Max 255 |

**CAUTION with u16 arithmetic:** Always cast to u32 before addition:

```typescript
// WRONG — u16 overflow
if (startX + width > GRID_WIDTH) { }

// CORRECT — safe u32 math
if (u32(startX) + u32(width) > u32(GRID_WIDTH)) { }
```

---

## Common Imports Reference

```typescript
// From btc-runtime
import {
    Blockchain, OP_NET, OP20, OP721,
    Address, Calldata, BytesWriter, Selector,
    StoredU256, StoredBoolean, StoredString, StoredU64,
    AddressMemoryMap, StoredMapU256, EMPTY_POINTER,
    encodeSelector, SafeMath, Revert,
    OP20InitParameters,
} from '@btc-vision/btc-runtime/runtime';

// From as-bignum
import { u256, u128 } from '@btc-vision/as-bignum/assembly';

// Abort handler
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// NOTE: @method, @returns, @emit, @final, ABIDataTypes
// are compile-time globals from @btc-vision/opnet-transform.
// DO NOT import them.
```

---

## Upgradeable Contracts

```typescript
import { Upgradeable, Calldata } from '@btc-vision/btc-runtime/runtime';

@final
export class MyContract extends Upgradeable {
    public constructor() { super(); }

    public override onUpdate(_oldVersion: u256, calldata: Calldata): void {
        // Migration logic here — runs once on upgrade
    }
}
```

**Pointer stability is CRITICAL:** Storage pointer assignments MUST remain in the same order across versions. Append new pointers — never insert between existing ones.

---

## Security Checklist (Pre-Deployment)

- [ ] All u256 ops use SafeMath (no raw `+`, `-`, `*`, `/`)
- [ ] All loops are bounded (no `while`)
- [ ] State changes BEFORE external calls (checks-effects-interactions)
- [ ] All user inputs validated
- [ ] Access control via `Blockchain.tx.sender` (never `tx.origin`)
- [ ] ReentrancyGuard on contracts with `Blockchain.call()`
- [ ] No floating point (`f32`/`f64`)
- [ ] `Blockchain.block.number` for time logic (NEVER `medianTimestamp`)
- [ ] Constructor: ONLY storage declarations (ALL logic in `onDeployment`)
- [ ] No `approve()` — use `increaseAllowance()` / `decreaseAllowance()`
- [ ] `@method()` declares ALL params (no bare `@method()`)
- [ ] `@method`, `@returns`, `@emit`, `ABIDataTypes` NOT imported
- [ ] No bare `Map<Address, T>` — use `AddressMemoryMap`
- [ ] Event payloads under 352-byte limit
- [ ] `Blockchain.log()` removed before production
- [ ] `save()` called after `StoredU256Array`/`StoredAddressArray` mutations
- [ ] Payable methods block contract-to-contract calls (`sender == origin`)
- [ ] `throw new Revert('msg')` (NOT `throw Revert('msg')`)
