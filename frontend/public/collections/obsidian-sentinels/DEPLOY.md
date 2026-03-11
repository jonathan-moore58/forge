# Obsidian Sentinels — Deployment Guide

## How Token URIs Work (IMPORTANT)

OP721's `tokenURI(tokenId)` returns: **`baseURI + tokenId.toString()`**

This means:
- `baseURI = "ipfs://QmFolderCID/"` → `tokenURI(1)` = `"ipfs://QmFolderCID/1"`
- Files inside the IPFS folder must be named **`1`, `2`, `3`** — NO `.json` extension
- The `hiddenURI` field in the deploy form becomes the initial `baseURI`
- There is **no per-token `setTokenURI()`** — only `setBaseURI()` to change all tokens at once

### Two-Phase URI Pattern

| Phase | baseURI | tokenURI(1) resolves to |
|-------|---------|-------------------------|
| **Hidden** (deploy) | `ipfs://QmHiddenFolderCID/` | Hidden placeholder metadata JSON |
| **Revealed** (after) | `ipfs://QmRevealedFolderCID/` | Real NFT #1 metadata JSON |

---

## IPFS Upload Steps (In Order)

### Step 0: Generate NFTs
```bash
node generate-nfts.cjs
```
Creates 50 SVGs + 50 metadata JSONs in `nfts/`.

### Step 1: Upload SVG images to IPFS
```bash
node upload-nfts.cjs
```
Uploads each SVG individually. Creates `ipfs-cids.json`.

### Step 2: Upload metadata JSONs (updates image fields)
```bash
node upload-metadata.cjs
```
Updates each JSON's `image` field with the IPFS CID, then uploads individually.
Creates `ipfs-metadata-cids.json`. (These individual CIDs are for reference only.)

### Step 3: Upload hidden metadata folder
```bash
node upload-hidden-folder.cjs
```
Creates a folder of 50 identical hidden placeholder JSONs (files named `1`-`50`).
Saves folder CID to `ipfs-hidden-folder-cid.json`.
**Use this CID as the `hiddenURI` at deploy time.**

### Step 4: Upload revealed metadata folder
```bash
node upload-metadata-folder.cjs
```
Creates a folder of 50 real metadata JSONs (files named `1`-`50`, no `.json` extension).
Saves folder CID to `ipfs-folder-cid.json`.
**Use this CID for `setBaseURI()` when revealing.**

---

## IPFS Assets

| Asset | IPFS URI | Gateway |
|-------|----------|---------|
| **Icon** | `ipfs://QmTgBDEmaTGo46k5u1EpeTV6Vg2q1YxLHc2UTxQhzzAiEw` | [View](https://ipfs.opnet.org/ipfs/QmTgBDEmaTGo46k5u1EpeTV6Vg2q1YxLHc2UTxQhzzAiEw) |
| **Banner** | `ipfs://QmcMHTqhBQZ3QCBN2eNEVt3VunE6H39tV77oWMeSzmP31R` | [View](https://ipfs.opnet.org/ipfs/QmcMHTqhBQZ3QCBN2eNEVt3VunE6H39tV77oWMeSzmP31R) |
| **Hidden SVG** | `ipfs://QmWFevwmW2A7u2j5sBeS4DDiXKLe3eWmbaFHBCG5jasTkK` | [View](https://ipfs.opnet.org/ipfs/QmWFevwmW2A7u2j5sBeS4DDiXKLe3eWmbaFHBCG5jasTkK) |
| **Hidden Folder** | `ipfs://<RUN upload-hidden-folder.cjs>/` | 50 identical hidden JSONs |
| **Metadata Folder** | `ipfs://<RUN upload-metadata-folder.cjs>/` | 50 real metadata JSONs |
| **50 NFT SVGs** | See `ipfs-cids.json` | Individual CIDs per image |

---

## Quick Deploy (Copy-Paste Values)

Go to **http://localhost:5193/create** and fill in these values:

### Step 1: Collection Info

| Field | Value |
|-------|-------|
| **Collection Name** | `Obsidian Sentinels` |
| **Symbol** | `OBSN` |
| **Total Supply** | `50` |
| **Base URI** | `ipfs://<HIDDEN_FOLDER_CID>/` *(from Step 3 above — trailing slash required!)* |

### Step 2: Pricing & Royalties

| Field | Value |
|-------|-------|
| **Mint Price (BTC)** | `0.0001` |
| **Royalty %** | `5` |
| **Royalty Address** | *(your wallet address — auto-filled)* |
| **Icon URI** | `ipfs://QmTgBDEmaTGo46k5u1EpeTV6Vg2q1YxLHc2UTxQhzzAiEw` |
| **Banner URI** | `ipfs://QmcMHTqhBQZ3QCBN2eNEVt3VunE6H39tV77oWMeSzmP31R` |
| **Description** | `Ancient guardians forged from obsidian and infused with elemental energy. 50 unique sentinels standing watch over the Bitcoin blockchain.` |
| **Website** | `https://forge.opnet.org` |

### Step 3: Review & Deploy

Click "Deploy Collection" — this triggers **1 wallet confirmation**:
- TX1: WASM deployment (deploys the contract on-chain with all config in calldata)

The backend indexer automatically detects the new collection (~10 min after next block).

**Estimated cost:** ~0.002 BTC (deploy fee + gas)

---

## After Deployment

### 1. Enable Minting
Go to **Launchpad** → find your collection → **Owner Controls** → click **"Enable Minting"**

### 2. Mint Some NFTs
Click "Mint Now" on the launchpad card. Each mint costs 0.0001 BTC.

### 3. Reveal Collection
Once minted, go to collection page → Owner Controls → **"Set Base URI"**:
```
ipfs://<METADATA_FOLDER_CID>/
```
*(Get the CID from `ipfs-folder-cid.json` after running `upload-metadata-folder.cjs`)*

This single `setBaseURI()` call reveals ALL tokens. `tokenURI(N)` now resolves to the real metadata.

### 4. Register on Marketplace
Go to **/register** → paste the collection contract address → pay 0.01 BTC registration fee → collection appears on marketplace for secondary trading.

### 5. List an NFT for Sale
Go to collection page → click "List for Sale" on any NFT you own → set price → confirm TX.

---

## Asset Files

```
obsidian-sentinels/
├── icon.svg                      # Collection avatar (512x512)
├── banner.svg                    # Collection banner (1536x512)
├── hidden.svg                    # Unrevealed placeholder (animated)
├── collection.json               # Full metadata + deployment config
├── ipfs-cids.json                # SVG CID mapping (50 entries)
├── ipfs-metadata-cids.json       # Individual JSON CID mapping (50 entries)
├── ipfs-folder-cid.json          # Revealed metadata folder CID (after upload)
├── ipfs-hidden-folder-cid.json   # Hidden metadata folder CID (after upload)
├── generate-nfts.cjs             # NFT generator script
├── upload-nfts.cjs               # IPFS upload: individual SVGs
├── upload-metadata.cjs           # IPFS upload: individual JSONs (updates image fields)
├── upload-metadata-folder.cjs    # IPFS upload: metadata as FOLDER (for tokenURI)
├── upload-hidden-folder.cjs      # IPFS upload: hidden placeholder FOLDER
├── DEPLOY.md                     # This file
└── nfts/
    ├── 1.svg + 1.json            # NFT #1 art + metadata
    ├── 2.svg + 2.json            # NFT #2 art + metadata
    ├── ...
    └── 50.svg + 50.json          # NFT #50 art + metadata
```

## Trait Distribution (50 NFTs)

| Trait | Values |
|-------|--------|
| **Element** | Fire (40%), Void (22%), Frost (18%), Venom (14%), Phantom (4%), Eclipse (2%) |
| **Rarity** | Common (40%), Uncommon (40%), Rare (14%), Legendary (4%), Epic (2%) |
| **Helm** | Spiked (28%), Peaked (26%), Flat (20%), Horned (16%), Crown (10%) |
| **Build** | Lean (30%), Standard (28%), Titan (28%), Heavy (14%) |
| **Eyes** | Round (38%), Slit (26%), Diamond (22%), Angular (14%) |
| **Vein Density** | Standard (34%), Overcharged (28%), Sparse (20%), Dense (18%) |
| **Background** | Obsidian Cavern (24%), Volcanic Rift (22%), Deep Abyss/Frozen Void/Ash Wastes (18% each) |
