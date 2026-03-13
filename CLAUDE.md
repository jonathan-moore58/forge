# FORGE — Bitcoin NFT Launchpad + Marketplace on OPNet

## What Is This Project?

FORGE is a full-stack NFT platform on OPNet (Bitcoin L1 smart contracts via Tapscript). It has three major parts:

1. **Contracts** (`/contracts/`) — 6 AssemblyScript smart contracts
2. **Backend** (`/backend/`) — Node.js indexer + REST API (Express + SQLite)
3. **Frontend** (`/frontend/`) — React 19 SPA (Vite + Framer Motion + OPNet SDK)

No npm workspaces — each directory has its own `package.json` and `node_modules`.

---

## Quick Start

```bash
# Backend (indexer + API on port 3420)
cd /d/forge/backend
npm run dev

# Frontend (Vite dev server on port 5173 or 5192)
cd /d/forge/frontend
npm run dev

# Contracts (build all)
cd /d/forge/contracts
npm run build
```

---

## Architecture Overview

### Flow: Launchpad (Minting) vs Marketplace (Trading)

- **Launchpad** = where creators deploy collections and users mint NFTs (primary sale)
- **Marketplace** = where users list/buy/sell minted NFTs (secondary trading)
- These are SEPARATE concerns. The marketplace does NOT show collections for browsing/minting.

### Data Flow

```
On-chain contracts → Backend indexer (polls blocks) → SQLite DB → REST API → Frontend (React Query)
```

The frontend uses **two data sources**:
1. **IndexerAPI** (`/services/IndexerAPI.ts`) — HTTP calls to backend for read-heavy queries (collections, tokens, listings)
2. **Direct contract calls** via OPNet SDK — for write operations (mint, list, buy) and some reads (collection stats)

---

## Smart Contracts

| Contract | File | WASM Output | Testnet Address |
|----------|------|-------------|-----------------|
| CollectionTemplate | `index-collection.ts` | `build/CollectionTemplate.wasm` | `opt1sqpg6vk03dcnur3d7c2fqgrfuk7tp4xuvkqufgwz9` |
| NFTFactory | `index-factory.ts` | `build/NFTFactory.wasm` | `opt1sqr6sqjc0rgwcwtxschks7cmau0ya54tz5vhccaun` |
| Marketplace | `index-marketplace.ts` | `build/Marketplace.wasm` | `opt1sqpj37ym9rx7ud0spwgpf68mwpmxs8dpgxu204jek` |
| AuctionHouse | `index-auction.ts` | `build/AuctionHouse.wasm` | `opt1sqqvah7sfn8snf7cj0rypzgxnwxklt6dv3sdghxff` |
| StakingRewards | `index-staking.ts` | `build/StakingRewards.wasm` | `opt1sqzqqmlxlq5tmmrs933905dxuu93l604s2skqgq6d` |
| NFTLending | `index-lending.ts` | `build/NFTLending.wasm` | `opt1sqpvakn6n4s3y3ejx3sjpudxu39jgngw6pslu7f3x` |
| CollectionRegistry | `index-registry.ts` | `build/CollectionRegistry.wasm` | (not deployed, indexer replaces it) |

### Factory Cloning Pattern (v7)

Collections are deployed via `factory.createCollection()` — single TX:
1. Factory calls `Blockchain.deployContractFromExisting(template, salt, empty)` to clone
2. Template's `onDeployment()` is minimal — only stores owner (low gas)
3. Factory calls `initialize()` on the new contract with all 11 config params
4. Factory auto-registers the collection and emits `CollectionCreated` event
5. `registerCollection()` still exists for backward compat (manual 2-TX flow)

### Build Commands

```bash
cd /d/forge/contracts
npm run build:factory
npm run build:collection
npm run build:marketplace
npm run build:auction
npm run build:staking
npm run build:registry
npm run build          # all of the above
```

### Contract Entry Point Pattern (ALL contracts follow this)

```typescript
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { MyContract } from './contracts/MyContract';

Blockchain.contract = (): MyContract => new MyContract();

// MUST be this exact path — NOT /runtime
export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
```

### asconfig.json

Each target needs `"abort": "index-{name}/abort"` matching the entry file name.

---

## Backend (Indexer + API)

**Port**: 3420 (configurable via `PORT` env)
**DB**: SQLite via `node:sqlite` DatabaseSync (file: `./forge-indexer.db`)

### Key Files

- `src/index.ts` — Entry point (starts poller + Express server)
- `src/indexer/poller.ts` — Polls blocks, processes receipts, enriches metadata
- `src/indexer/metadata-enricher.ts` — Fetches collection name/symbol/supply from chain; `refreshLiveState()` periodically re-checks `isMintOpen()` and `totalSupply` for ALL collections
- `src/indexer/receipt-processor.ts` — Decodes events from TX receipts
- `src/api/routes/` — All REST endpoints

### API Endpoints

```
GET /api/health
GET /api/collections?verified=&creator=&page=&limit=
GET /api/collections/:address
GET /api/collections/:address/tokens?page=&limit=
GET /api/tokens/owner/:owner?collection=&page=&limit=
GET /api/listings?status=&collection=&seller=&minPrice=&maxPrice=&page=&limit=
GET /api/listings/:id
GET /api/offers?status=&offerer=&collection=&tokenId=&page=&limit=
GET /api/auctions?status=&collection=&page=&limit=
GET /api/auctions/:id
GET /api/auctions/:id/bids?page=&limit=
GET /api/activity?collection=&address=&type=&page=&limit=
GET /api/staking/positions?staker=&collection=&status=&page=&limit=
GET /api/stats/collection/:address
GET /api/stats/global
```

All responses use envelope: `{ data: T, meta?: { total, page, limit } }`

### Database Tables

`collections`, `tokens`, `listings`, `offers`, `auctions`, `bids`, `staking_positions`, `activity`, `collection_stats_snapshots`, `sync_state`

### Environment Variables

```
NETWORK=testnet          # regtest | testnet | mainnet
RPC_URL=https://testnet.opnet.org/api/v1/json-rpc
PORT=3420
DB_PATH=./forge-indexer.db
START_BLOCK=0
POLL_INTERVAL_MS=30000
FACTORY_ADDRESS=opt1sqr6sqjc0rgwcwtxschks7cmau0ya54tz5vhccaun
MARKETPLACE_ADDRESS=opt1sqpj37ym9rx7ud0spwgpf68mwpmxs8dpgxu204jek
AUCTION_HOUSE_ADDRESS=opt1sqqvah7sfn8snf7cj0rypzgxnwxklt6dv3sdghxff
STAKING_ADDRESS=opt1sqzqqmlxlq5tmmrs933905dxuu93l604s2skqgq6d
```

---

## Frontend

### Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | HomePage | Landing + featured drops |
| `/launchpad` | LaunchpadPage | Browse/create collections, mint NFTs |
| `/marketplace` | MarketplacePage | Secondary market — listed NFTs only |
| `/collection/:address` | CollectionPage | Collection detail + token grid |
| `/nft/:collection/:tokenId` | NFTDetailPage | Single NFT view + buy/offer |
| `/auctions` | AuctionPage | Auction discovery + bidding |
| `/profile` | ProfilePage | User portfolio |
| `/create` | CreateCollectionPage | Factory deployment form |
| `/dashboard` | DashboardPage | Creator analytics |
| `/staking` | StakingPage | NFT staking pools |

### Key Config

```typescript
// frontend/src/config/contracts.ts
API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3420';

CONTRACT_ADDRESSES.testnet = {
    factory: 'opt1sqqewmpmd2vwg67fflwdmu202nwhajrqw2yd9esez',
    marketplace: 'opt1sqpj37ym9rx7ud0spwgpf68mwpmxs8dpgxu204jek',
    auctionHouse: 'opt1sqqvah7sfn8snf7cj0rypzgxnwxklt6dv3sdghxff',
    staking: 'opt1sqzqqmlxlq5tmmrs933905dxuu93l604s2skqgq6d',
};
```

### Important Hook Patterns

**useTransaction.ts** — Central TX execution wrapper:
```typescript
execute(simulateCall, maxSats?, extraOutputs?) → receipt
```
- Calls `simulateCall()` to get `CallResult`
- Calls `callResult.sendTransaction()` with signer=null (wallet handles signing)
- `extraOutputs` is required for **payable** contract calls (mint, buy, bid)

**useMint.ts** — Minting with payment:
```typescript
const extraOutputs = totalPrice > 0n
    ? [{ address: collectionAddress, value: toSatoshi(totalPrice) }]
    : undefined;
tx.execute(simulateFn, undefined, extraOutputs);
```

**Payable calls pattern** (mint, buyNFT, placeBid, makeOffer):
1. `contract.setTransactionDetails({ outputs: [...] })` — for simulation
2. Build `extraOutputs: PsbtOutputExtended[]` — for actual TX
3. Pass `extraOutputs` to `tx.execute()` which passes to `sendTransaction()`

### Data Hooks

- `useLaunchpadDrops` — Fetches from IndexerAPI.collections(), maps to LaunchpadDrop
- `useAllCollections` — Fetches from IndexerAPI.collections() for registry data
- `useAllListings` — Fetches from IndexerAPI.listings() for marketplace
- `useCollectionStats` — On-chain call to marketplace.collectionStats()
- CollectionPage uses `IndexerAPI.collection()` + `IndexerAPI.collectionTokens()` directly via useQuery

---

## Critical OPNet Patterns (MUST FOLLOW)

1. **Entry point**: `export * from '@btc-vision/btc-runtime/runtime/exports'` (NOT `/runtime`)
2. **Abort handler**: `abort=index-{name}/abort` in asconfig per target
3. **ECDSA is DEPRECATED** — Use ML-DSA: `Blockchain.verifySignature` with `SignaturesMethods.MLDSA`
4. **No Buffer** — Use `Uint8Array` + `BufferHelper` from `@btc-vision/transaction`
5. **Block.number for timing** — NEVER `medianTimestamp` (miners can manipulate MTP)
6. **StoredU256 sub-key collision** — Use distinct pointers for small u256 indices
7. **Frontend signing**: `signer: null, mldsaSigner: null` in `sendTransaction()` — wallet handles it
8. **Backend signing**: `signer: wallet.keypair, mldsaSigner: wallet.mldsaKeypair`
9. **Always `contract.setSender(walletAddress)`** before simulation
10. **Payable functions**: Need BOTH `setTransactionDetails()` (simulation) AND `extraOutputs` in `sendTransaction()` (actual TX)
11. **gasSatFee >= 10_000n** for contract deployments
12. **Use `@btc-vision/bitcoin`**, NOT `bitcoinjs-lib`
13. **Testnet = `networks.opnetTestnet`**, NOT `networks.testnet` (that's Testnet4)
14. **No raw PSBT** — Never use `new Psbt()`, `Psbt.fromBase64()`, etc.
15. **Contract calls**: Use `getContract()` from opnet npm package → simulate → sendTransaction
16. **`@btc-vision/transaction`** is ONLY for `TransactionFactory` (deployments, BTC transfers)
17. **CollectionTemplate** uses 2-phase init: `onDeployment()` (minimal, stores owner) + `initialize()` (all 11 config params)
18. **Factory cloning**: `factory.createCollection()` deploys + initializes + registers in 1 TX

---

## Sale Phase Values

| Phase | Meaning |
|-------|---------|
| 0 | Inactive / Paused |
| 1 | Whitelist mint |
| 2 | Public mint |
| 3 | Ended |

The enricher's `refreshLiveState()` periodically polls `isMintOpen()` on all collections because `setMintOpen()` emits no event.

---

## Recent Work Completed (as of 2026-03-01)

### Indexer Enricher Fix
- Added `refreshLiveState()` to `metadata-enricher.ts` — polls `isMintOpen()` + `totalSupply` every cycle for ALL enriched collections
- Integrated into `poller.ts` loop after `enrichPending()`
- Fixes: `sale_phase` was never updating after `setMintOpen(true)` TX confirmed

### Mint Flow
- Wired `useMint` hook into LaunchpadPage DropCard/FeaturedDrop with onClick handlers
- Fixed stale closure in `useMint.ts` using `useRef` pattern for `walletAddr`
- Added `extraOutputs` support to `useTransaction.ts` for payable calls
- Fixed same pattern in `useMarketplaceActions.ts` and `useAuctionActions.ts`

### Marketplace Cleanup
- Removed "Collections" tab from MarketplacePage — marketplace is secondary trading only
- Marketplace shows ONLY individually listed NFTs with sidebar filters

### CollectionPage
- Replaced broken on-chain hooks with IndexerAPI calls (`collection()` + `collectionTokens()`)
- Token grid now shows minted NFTs from indexer DB
- Added sale phase badge (Public/Whitelist/Inactive/Ended)
- Supply stat shows `minted / maxSupply`

### Launchpad Fixes
- Fixed "View Collection" link: uses `drop.address` (not `drop.id`)
- Made collection names clickable links to collection page
- Added `mintPriceSats` to LaunchpadDrop interface
- Reduced staleTime/refetchInterval for faster UI updates

### Owner Controls
- `useCollectionActions` hook with `setMintOpen(true/false)` toggle
- Pause/resume minting works correctly as a toggle
- `invalidateKeys` refreshes launchpad drops after state change

---

## Gotchas & Known Issues

1. **Port conflicts**: Backend runs on 3420. Kill old process if EADDRINUSE: `taskkill //PID <pid> //F` (Windows)
2. **Testnet sync**: Backend syncs from block 0 on first run. Set `START_BLOCK` env to skip old blocks.
3. **Collection tokens only appear after mint TX is indexed** — there's a delay equal to `POLL_INTERVAL_MS`
4. **`toSatoshi()` returns branded bigint** — import from `@btc-vision/bitcoin`, not plain BigInt
5. **React Query cache**: LaunchpadPage uses 15s staleTime, 30s refetchInterval
6. **CORS**: Backend allows localhost:5173, 5192, 4173
7. **Windows paths**: Use forward slashes in bash commands (`D:/forge/` not `D:\forge\`)
