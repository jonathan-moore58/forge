# Complete OP20 Token Contract Example

A full mintable token with per-address limits, block deadline, and proper validation.

---

## File: src/index.ts

```typescript
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { MyToken } from './MyToken';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

Blockchain.contract = (): MyToken => {
    return new MyToken();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
```

---

## File: src/MyToken.ts

```typescript
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    OP20,
    OP20InitParameters,
    Revert,
    Selector,
    StoredU256,
    StoredBoolean,
    AddressMemoryMap,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';

// Constants — calculate offline, use fromString for large values
const TOKENS_PER_MINT: u256 = u256.fromString('1000000000000000000000');       // 1000 * 10^18
const MAX_SUPPLY: u256 = u256.fromString('100000000000000000000000000');       // 100M * 10^18
const MAX_MINTS_PER_ADDRESS: u256 = u256.fromU32(5);
const MINT_PERIOD_BLOCKS: u256 = u256.fromU32(14400);                         // ~100 days

// NOTE: @method, @returns, @emit, @final, ABIDataTypes are compile-time globals.
// Do NOT import them.

@final
export class MyToken extends OP20 {
    // Storage pointers (ALWAYS use Blockchain.nextPointer)
    private readonly deploymentBlockPointer: u16 = Blockchain.nextPointer;
    private readonly mintClosedPointer: u16 = Blockchain.nextPointer;
    private readonly totalMintedPointer: u16 = Blockchain.nextPointer;
    private readonly mintsPerAddressPointer: u16 = Blockchain.nextPointer;

    // Storage instances
    private readonly deploymentBlock: StoredU256 = new StoredU256(
        this.deploymentBlockPointer, u256.Zero
    );
    private readonly mintClosed: StoredBoolean = new StoredBoolean(
        this.mintClosedPointer, false
    );
    private readonly totalMinted: StoredU256 = new StoredU256(
        this.totalMintedPointer, u256.Zero
    );
    private readonly mintsPerAddress: AddressMemoryMap<Address, StoredU256> =
        new AddressMemoryMap(this.mintsPerAddressPointer, Address.dead());

    // Selectors
    private readonly freeMintSelector: Selector = encodeSelector('freeMint()');
    private readonly mintInfoSelector: Selector = encodeSelector('mintInfo()');

    public constructor() {
        super();
        // ONLY super() here — gas limit is HARDCODED 20M in constructor
        // ALL init logic goes in onDeployment()
    }

    // Runs ONCE on deployment — full gas budget here
    public override onDeployment(_calldata: Calldata): void {
        this.instantiate(new OP20InitParameters(MAX_SUPPLY, 18, 'My Token', 'MTK'));
        this.deploymentBlock.set(Blockchain.block.numberU256);
    }

    // Route method calls — ALWAYS call super for inherited methods
    public override callMethod(calldata: Calldata): BytesWriter {
        const selector = calldata.readSelector();
        switch (selector) {
            case this.freeMintSelector:
                return this.freeMint(calldata);
            case this.mintInfoSelector:
                return this.mintInfo(calldata);
            default:
                return super.callMethod(calldata);
        }
    }

    /**
     * Free mint with validation.
     * @returns success boolean
     */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private freeMint(_calldata: Calldata): BytesWriter {
        // Check: mint not closed
        if (this.mintClosed.get()) {
            throw new Revert('Mint is closed');
        }

        // Check: within mint period (ALWAYS use block.number, NEVER medianTimestamp)
        const deadline = SafeMath.add(this.deploymentBlock.get(), MINT_PERIOD_BLOCKS);
        if (u256.gte(Blockchain.block.numberU256, deadline)) {
            throw new Revert('Mint period ended');
        }

        // Check: per-address limit
        const sender: Address = Blockchain.tx.sender;
        const currentMints: u256 = this.mintsPerAddress.get(sender).get();
        if (u256.gte(currentMints, MAX_MINTS_PER_ADDRESS)) {
            throw new Revert('Max mints reached for this address');
        }

        // Check: supply cap
        const newTotal = SafeMath.add(this.totalMinted.get(), TOKENS_PER_MINT);
        if (u256.gt(newTotal, MAX_SUPPLY)) {
            throw new Revert('Would exceed max supply');
        }

        // Effects: update state BEFORE external calls (checks-effects-interactions)
        this.mintsPerAddress.get(sender).set(SafeMath.add(currentMints, u256.One));
        this.totalMinted.set(newTotal);

        // Interaction: mint tokens
        this._mint(sender, TOKENS_PER_MINT);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Read-only: get mint info.
     * @returns isClosed, totalMinted, remainingBlocks, deployBlock
     */
    @method()
    @returns(
        { name: 'isClosed', type: ABIDataTypes.BOOL },
        { name: 'totalMinted', type: ABIDataTypes.UINT256 },
        { name: 'remainingBlocks', type: ABIDataTypes.UINT256 },
        { name: 'deployBlock', type: ABIDataTypes.UINT256 },
    )
    private mintInfo(_calldata: Calldata): BytesWriter {
        const isClosed = this.mintClosed.get();
        const minted = this.totalMinted.get();
        const deployBlock = this.deploymentBlock.get();
        const deadline = SafeMath.add(deployBlock, MINT_PERIOD_BLOCKS);
        const currentBlock = Blockchain.block.numberU256;

        let remaining: u256;
        if (u256.gte(currentBlock, deadline)) {
            remaining = u256.Zero;
        } else {
            remaining = SafeMath.sub(deadline, currentBlock);
        }

        const writer = new BytesWriter(1 + 32 + 32 + 32);
        writer.writeBoolean(isClosed);
        writer.writeU256(minted);
        writer.writeU256(remaining);
        writer.writeU256(deployBlock);
        return writer;
    }
}
```

---

## File: asconfig.json

```json
{
    "targets": {
        "my-token": {
            "outFile": "build/MyToken.wasm",
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

---

## Key Patterns Demonstrated

1. **Entry point**: factory function + runtime exports + abort handler
2. **Constructor**: ONLY `super()` — no logic (20M gas hardcoded limit)
3. **onDeployment**: all init logic here — `instantiate()`, storage writes, minting
4. **OP20InitParameters**: maxSupply, decimals, name, symbol
5. **Blockchain.nextPointer**: automatic unique pointer allocation
6. **Storage types**: StoredU256, StoredBoolean, AddressMemoryMap
7. **callMethod with super**: routes selectors, falls through to parent
8. **SafeMath**: ALL u256 arithmetic
9. **Blockchain.block.numberU256**: time-based logic (NEVER medianTimestamp)
10. **Checks-effects-interactions**: validate → update state → interact
11. **BytesWriter sizing**: exact byte count for return values
12. **throw new Revert()**:  Revert is a class (NOT a function)
13. **@method/@returns**: compile-time globals — NOT imported
14. **@final**: prevents inheritance (best practice for deployed contracts)

---

## OP20 Built-in Methods (No Need to Implement)

These are inherited from `OP20` and work automatically:
- `transfer()`, `transferFrom()`
- `increaseAllowance()`, `decreaseAllowance()` (NO `approve()` on OPNet)
- `balanceOf()`, `allowance()`
- `totalSupply()`, `name()`, `symbol()`, `decimals()`
- `metadata()` — returns ALL of the above in ONE RPC call
- `burn()`
