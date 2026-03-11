# FORGE - New Session Prompt

Paste this into a new Claude Code session:

---

You are working on **FORGE** — an NFT marketplace platform built on **OPNet** (Bitcoin L1 smart contracts). Use the Bob MCP tools (`opnet_opnet_dev`, `opnet_knowledge_search`, `opnet_opnet_audit`, etc.) for all OPNet-related development guidance.

## Project Structure

```
D:\forge\
├── contracts/           # 8 AssemblyScript smart contracts (WASM on Bitcoin L1)
│   ├── CollectionTemplate.ts   # OP721 NFT standard implementation
│   ├── NFTFactory.ts           # Deploys new collections via CREATE opcode
│   ├── CollectionRegistry.ts   # On-chain registry of all collections
│   ├── Marketplace.ts          # Fixed-price listings + offers
│   ├── AuctionHouse.ts         # English & Dutch auctions
│   ├── StakingRewards.ts       # Stake NFTs, earn OP20 rewards
│   ├── NFTLending.ts           # Collateralized NFT lending
│   └── FeeRouter.ts            # Trustless fee distribution (platform/creator/stakers)
├── frontend/            # React + TypeScript + Vite + TailwindCSS
│   ├── src/pages/       # HomePage, CollectionPage, NFTDetailPage, CreatePage, etc.
│   ├── src/components/  # Reusable UI components
│   ├── src/services/    # IndexerAPI.ts (REST client for backend)
│   ├── src/hooks/       # React hooks for wallet, contracts
│   └── src/stores/      # Zustand stores
├── backend/             # Express + TypeScript backend / indexer
└── docs/                # Architecture docs, FLOW.md
```

## Tech Stack

- **Contracts**: AssemblyScript → WASM, `@btc-vision/btc-runtime`, deployed on Bitcoin L1 via OPNet
- **Frontend**: React 18, TypeScript (strict), Vite, TailwindCSS, Framer Motion, `@tanstack/react-query`
- **Backend**: Express, TypeScript, PostgreSQL (indexer for on-chain events)
- **Wallet**: OPNet wallet integration via `@btc-vision/transaction`

## Design Theme

- **Dark theme** — deep navy/charcoal backgrounds (#0a0b1a, #12132a range)
- **Accent**: Vibrant gradient (cyan → violet → magenta), used on CTAs, highlights, borders
- **Glass morphism**: Backdrop-blur panels with subtle borders
- **Animations**: Framer Motion for page transitions, hover effects, staggered reveals
- **Typography**: Clean, modern, monospace for addresses/numbers
- **Responsive**: Mobile-first, bento grid layouts on home page

## Key OPNet Rules (CRITICAL)

- ECDSA is DEPRECATED → use ML-DSA (`Blockchain.verifySignature` with `SignaturesMethods.MLDSA`)
- `Address.fromString()` requires TWO params: `(hashedMLDSAKey, tweakedPubKey)`
- Contract interactions: use `getContract` from `opnet` npm package, simulate before sending
- NEVER use raw PSBT construction — FORBIDDEN
- Frontend: `signer=null, mldsaSigner=null` in sendTransaction (wallet handles signing)
- Use `@btc-vision/bitcoin` (never `bitcoinjs-lib`)
- SafeMath is mandatory for ALL u256 arithmetic in contracts
- `onDeployment()` for one-time init (constructor runs every call)
- No unbounded iteration in contracts

## What's Done

- All 8 contracts written and TypeScript-checked
- Full frontend with: HomePage (hero, trending, stats, live activity ticker), CollectionPage (stats, items grid, activity tab, offers tab, price chart), NFTDetailPage (price history, attributes, offers), CreatePage, ProfilePage
- Activity data wired to real IndexerAPI endpoints with react-query polling
- Price charts (SVG) on collection and NFT detail pages
- LiveTicker component on homepage showing real on-chain events
- Backend indexer running with real data (collections, tokens, activity)

## What's Pending

- Deploy contracts to OPNet testnet (user is finishing features first)
- AuctionHouse `settleAuction` has a `sellerU256` variable that needs fixing
- StakingRewards `claimRewards` needs token transfer call added
- Full security audit before mainnet

## How to Work

1. Always read files before editing
2. Use Bob MCP tools for OPNet guidance (`opnet_knowledge_search`, `opnet_opnet_dev`)
3. Check `opnet_incident_query({ action: "recent" })` before OPNet work
4. TypeScript strict mode — zero errors tolerance
5. Follow existing code patterns and design theme
6. Don't add mock data — wire to real IndexerAPI endpoints
