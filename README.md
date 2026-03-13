<h1 align="center">FORGE</h1>

<p align="center">
  <strong>Bitcoin-native NFT platform built on OPNet</strong>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> &bull;
  <a href="#smart-contracts">Contracts</a> &bull;
  <a href="#backend">Backend</a> &bull;
  <a href="#frontend">Frontend</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bitcoin-L1-orange?logo=bitcoin&logoColor=white" alt="Bitcoin L1" />
  <img src="https://img.shields.io/badge/OPNet-Tapscript-blue" alt="OPNet" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

---

## What is FORGE?

FORGE is a full-stack NFT platform running entirely on **Bitcoin L1** via [OPNet](https://opnet.org) smart contracts (Tapscript-based VM). No sidechains, no bridges — pure Bitcoin.

### Features

| Module | Description |
|--------|-------------|
| **Launchpad** | Deploy NFT collections, configure mint phases, public minting |
| **Marketplace** | Secondary trading with listings, offers, and collection registration |
| **Auctions** | English auctions and Dutch (declining price) auctions |
| **Staking** | Stake NFTs into reward pools with lock bonuses and rarity multipliers |
| **Lending** | Collateralize NFTs to borrow OP-20 tokens, peer-to-peer loan matching |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FORGE Architecture                    │
└─────────────────────────────────────────────────────────┘

  ┌──────────┐    Tapscript TX    ┌───────────────────────┐
  │  Wallet  │◄──────────────────►│  OPNet Smart Contracts│
  │(UniSat / │    (Bitcoin L1)    │                       │
  │ OPNet)   │                    │  ┌─────────────────┐  │
  └────┬─────┘                    │  │ CollectionTpl   │  │
       │                          │  │ NFTFactory      │  │
       │ WalletConnect            │  │ Marketplace     │  │
       │                          │  │ AuctionHouse    │  │
  ┌────▼──────────────┐           │  │ StakingRewards  │  │
  │  Frontend (React) │           │  │ NFTLending      │  │
  │  Vite + OPNet SDK │           │  └─────────────────┘  │
  │                   │           └───────────┬───────────┘
  │  forge.vercel.app │                       │
  └────────┬──────────┘                       │ Events
           │ REST API                         │
           │                           ┌──────▼──────────┐
  ┌────────▼──────────┐                │  OPNet Node      │
  │  Backend Indexer   │◄──────────────│  (JSON-RPC)      │
  │  Express + SQLite  │  Poll blocks  └──────────────────┘
  │  Port 3420         │
  └────────────────────┘
```

### Data Flow

1. **Write path** — User connects wallet → Frontend simulates contract call via OPNet SDK → Wallet signs → TX broadcast to Bitcoin
2. **Read path** — Backend polls OPNet node for new blocks → Decodes events from TX receipts → Stores in SQLite → Serves via REST API → Frontend queries with React Query

---

## Project Structure

```
forge/
├── contracts/               # OPNet smart contracts (AssemblyScript)
│   ├── src/
│   │   ├── contracts/       # Contract implementations
│   │   │   ├── CollectionTemplate.ts
│   │   │   ├── Marketplace.ts
│   │   │   ├── AuctionHouse.ts
│   │   │   ├── StakingRewards.ts
│   │   │   └── NFTLending.ts
│   │   └── index-*.ts       # Entry points per contract
│   ├── abis/                # Generated ABI files
│   └── asconfig.json        # AssemblyScript build config
│
├── backend/                 # Indexer + REST API
│   ├── src/
│   │   ├── api/routes/      # Express route handlers
│   │   ├── db/              # SQLite schema + connection
│   │   ├── indexer/         # Block poller, event handlers, enricher
│   │   └── utils/           # Address conversion, logging
│   └── .env.example         # Environment template
│
├── frontend/                # React 19 SPA
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── contracts/abis/  # TypeScript ABI definitions
│   │   ├── contexts/        # React contexts (toast, theme)
│   │   ├── hooks/           # Custom hooks (staking, lending, mint, etc.)
│   │   ├── pages/           # Route pages
│   │   ├── services/        # ContractService, IndexerAPI, ProviderService
│   │   ├── styles/          # Theme tokens
│   │   └── utils/           # Address resolution, P2TR helpers, formatting
│   ├── public/              # Static assets
│   └── vite.config.ts       # Vite configuration
│
└── README.md
```

---

## Smart Contracts

Seven AssemblyScript contracts compiled to WASM and deployed via OPNet:

| Contract | Purpose | Standard |
|----------|---------|----------|
| `CollectionTemplate` | NFT collection with mint phases, royalties, metadata | OP-721 |
| `NFTFactory` | Factory pattern — clones CollectionTemplate per collection | — |
| `Marketplace` | List / buy / offer on NFTs (secondary market) | — |
| `AuctionHouse` | English + Dutch auctions for NFTs | — |
| `StakingRewards` | Stake NFTs into pools, earn OP-20 token rewards | — |
| `NFTLending` | Collateralize NFTs for peer-to-peer OP-20 loans | — |
| `CollectionRegistry` | On-chain registry (replaced by indexer) | — |

### Build

```bash
cd contracts
npm install
npm run build          # Builds all contracts
npm run build:marketplace  # Build individual contract
```

---

## Backend

Node.js indexer that polls OPNet blocks, decodes smart contract events, and serves data via REST.

**Stack**: Express &bull; SQLite (via `node:sqlite`) &bull; OPNet SDK

### API Endpoints

```
GET  /api/collections              # Browse collections
GET  /api/collections/:address     # Collection details
GET  /api/collections/:addr/tokens # Tokens in a collection
GET  /api/tokens/owner/:owner      # NFTs owned by address
GET  /api/listings                 # Marketplace listings
GET  /api/auctions                 # Active auctions
GET  /api/auctions/:id/bids        # Bids on an auction
GET  /api/loans                    # Lending loans
GET  /api/lending/stats            # Lending platform stats
GET  /api/staking/positions        # Staking positions
GET  /api/activity                 # On-chain activity feed
GET  /api/stats/global             # Platform-wide statistics
```

### Setup

```bash
cd backend
npm install
cp .env.example .env   # Configure RPC URL and contract addresses
npm run dev            # Starts on port 3420
```

---

## Frontend

Single-page React application with wallet integration and real-time contract interaction.

**Stack**: React 19 &bull; Vite &bull; Framer Motion &bull; React Query &bull; OPNet SDK &bull; WalletConnect

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with featured drops |
| `/launchpad` | Launchpad | Browse collections, mint NFTs |
| `/marketplace` | Marketplace | Secondary trading |
| `/collection/:addr` | Collection | Collection detail + token grid |
| `/nft/:col/:id` | NFT Detail | Single NFT + buy/offer |
| `/auctions` | Auctions | Auction discovery + bidding |
| `/staking` | Staking | NFT staking pools |
| `/lending` | Lending | NFT-collateralized loans |
| `/create` | Create | Deploy new collection |
| `/profile` | Profile | User portfolio |
| `/dashboard` | Dashboard | Creator analytics |

### Setup

```bash
cd frontend
npm install
npm run dev            # Starts on port 5173
npm run build          # Production build → dist/
```

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- An OPNet-compatible wallet (UniSat with OPNet support)

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/jonathan-moore58/forge.git
cd forge

# 2. Start the backend
cd backend
npm install
cp .env.example .env    # Edit with your RPC URL
npm run dev

# 3. Start the frontend (new terminal)
cd frontend
npm install
npm run dev

# 4. Open http://localhost:5173
```

### Environment Variables

**Backend** (`backend/.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `NETWORK` | `regtest` / `testnet` / `mainnet` | `testnet` |
| `RPC_URL` | OPNet JSON-RPC endpoint | — |
| `PORT` | API server port | `3420` |
| `POLL_INTERVAL_MS` | Block polling interval | `30000` |
| `FACTORY_ADDRESS` | NFTFactory contract address | — |
| `MARKETPLACE_ADDRESS` | Marketplace contract address | — |

**Frontend** (set in Vercel or `.env.local`):

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:3420` |

---

## Deployment

### Frontend (Vercel)

The frontend deploys automatically on push via Vercel:

- **Framework**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output**: `dist/`

### Backend

The backend indexer runs as a long-lived Node.js process. Deploy to any VPS, Railway, Render, or similar:

```bash
cd backend
npm install
npm run build
npm start
```

---

## OPNet Patterns

Key patterns used throughout the codebase:

- **P2TR Payments** — All payable contract calls use Taproot scriptPubKey format
- **ML-DSA Signatures** — Quantum-resistant signing (ECDSA is deprecated on OPNet)
- **2-Phase Collection Init** — `onDeployment()` (minimal) + `initialize()` (full config)
- **OP-20 Token Standard** — Uses `increaseAllowance()` / `decreaseAllowance()` (no `approve()`)
- **Address Resolution** — Wallet bech32m addresses resolved to OPNet identity via `getPublicKeyInfo` RPC

---

## License

[MIT](LICENSE) — Built with Bitcoin.
