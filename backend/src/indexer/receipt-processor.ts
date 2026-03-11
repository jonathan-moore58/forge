/* ------------------------------------------------------------------ */
/*  Receipt processor: decode raw events → route to handlers           */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../utils/logger.js';
import { resolveContractHex, paddedHexToBech32m } from '../utils/address.js';
import {
    type DecodedEvent,
    type RawReceiptEvent,
    decodeReceiptEvent,
    flattenEvents,
} from './event-decoder.js';
import { createFactoryHandler } from './handlers/factory.js';
import { createCollectionHandler } from './handlers/collection.js';
import { createMarketplaceHandler } from './handlers/marketplace.js';
import { createAuctionHandler } from './handlers/auction.js';
import { createStakingHandler } from './handlers/staking.js';
import { createLendingHandler } from './handlers/lending.js';

const log = createLogger('receipt-processor');

// Events emitted directly by collection contracts (need contractAddress)
const COLLECTION_EVENTS = new Set(['Minted', 'Transfer', 'PhaseChanged', 'Revealed']);

// Self-registration event: emitted by CollectionTemplate.initialize()
// Handled as catch-all (ANY contract can emit this to auto-register itself)
const SELF_REGISTER_EVENT = 'CollectionConfigured';

// Events we route by name (contract address is in event data)
const FACTORY_EVENTS = new Set(['CollectionCreated', 'CollectionVerified']);
const MARKETPLACE_EVENTS = new Set([
    'NFTListed', 'NFTSold', 'ListingCancelled',
    'OfferMade', 'OfferAccepted', 'OfferCancelled',
    'CollectionRegistered',
]);
const AUCTION_EVENTS = new Set(['AuctionCreated', 'BidPlaced', 'AuctionSettled']);
const STAKING_EVENTS = new Set(['NFTStaked', 'NFTUnstaked', 'RewardsClaimed']);
const LENDING_EVENTS = new Set([
    'LoanRequestCreated', 'LoanFunded', 'LoanRepaid', 'LoanDefaulted', 'LoanCancelled',
]);

/**
 * Normalize an RPC hex contract address (0x-prefixed) to raw lowercase hex.
 * This is a SIMPLE synchronous strip — no bech32m decoding needed here
 * because the RPC already returns hex.
 */
function stripHex(addr: string): string {
    return addr.replace(/^0x/i, '').toLowerCase();
}

/**
 * Async factory — resolves bech32m config addresses to their on-chain
 * contract public key hex via `btc_getCode()` before starting.
 */
export async function createReceiptProcessor(db: DatabaseSync) {
    // ── Resolve our contract addresses (bech32m → RPC hex) ──
    // The RPC returns `contractAddress` as 0x-prefixed hex (the contract public key).
    // Config has bech32m addresses (opt1s…). We resolve them via btc_getCode.
    const { config } = await import('../config.js');

    const factoryAddr = await resolveContractHex(config.contracts.factory);
    const marketplaceAddr = await resolveContractHex(config.contracts.marketplace);
    const auctionAddr = await resolveContractHex(config.contracts.auctionHouse);
    const stakingAddr = await resolveContractHex(config.contracts.staking);
    const lendingAddr = await resolveContractHex(config.contracts.lending);

    if (!factoryAddr) {
        throw new Error(
            'FACTORY_ADDRESS could not be resolved — contract not deployed or RPC unreachable',
        );
    }

    log.info(`Resolved contract hex addresses:`);
    log.info(`  factory     = ${factoryAddr}`);
    log.info(`  marketplace = ${marketplaceAddr || '(none)'}`);
    log.info(`  auctionHouse= ${auctionAddr || '(none)'}`);
    log.info(`  staking     = ${stakingAddr || '(none)'}`);
    log.info(`  lending     = ${lendingAddr || '(none)'}`);

    // ── Create handlers ──
    const factory = createFactoryHandler(db);
    const collection = createCollectionHandler(db);
    const marketplace = createMarketplaceHandler(db);
    const auction = createAuctionHandler(db);
    const staking = createStakingHandler(db);
    const lending = createLendingHandler(db);

    // ── Dynamic collection address set (hex format for matching) ──
    const knownContracts = new Set<string>();
    const collectionAddresses = new Set<string>();
    // Reverse map: RPC hex (contract public key) → bech32m address
    // Used to pass the correct bech32m to collection handlers
    const hexToBech32m = new Map<string, string>();

    // Populate known static contracts
    if (factoryAddr) knownContracts.add(factoryAddr);
    if (marketplaceAddr) knownContracts.add(marketplaceAddr);
    if (auctionAddr) knownContracts.add(auctionAddr);
    if (stakingAddr) knownContracts.add(stakingAddr);
    if (lendingAddr) knownContracts.add(lendingAddr);

    // Load existing collection addresses from DB
    // These are stored as bech32m — resolve each to hex
    const existingCollections = db.prepare(
        'SELECT collection_address FROM collections',
    ).all() as { collection_address: string }[];

    for (const row of existingCollections) {
        const hex = await resolveContractHex(row.collection_address);
        if (hex) {
            collectionAddresses.add(hex);
            hexToBech32m.set(hex, row.collection_address);
        }
    }

    log.info(`Loaded ${collectionAddresses.size} existing collection addresses`);

    // ── Pending collection hex resolutions (filled during sync processReceipt) ──
    const pendingCollections: string[] = [];

    // ── Expire stale offers ──
    const expireOffers = db.prepare(`
        UPDATE offers SET status = 3
        WHERE status = 0 AND expiry_block < @blockNumber
    `);

    return {
        /** Get the full set of watched addresses (static contracts + dynamic collections) */
        getWatchedAddresses(): Set<string> {
            const all = new Set(knownContracts);
            for (const addr of collectionAddresses) all.add(addr);
            return all;
        },

        /**
         * Process all events from a single transaction receipt.
         */
        processReceipt(
            rawEvents: unknown,
            blockNumber: number,
            txHash: string,
        ): void {
            const events = flattenEvents(rawEvents);
            if (events.length === 0) return;

            let logIndex = 0;

            for (const raw of events) {
                const decoded = decodeReceiptEvent(raw);
                if (!decoded) {
                    logIndex++;
                    continue;
                }

                try {
                    this.routeEvent(decoded, blockNumber, txHash, logIndex);
                } catch (err) {
                    log.error(`Error handling ${decoded.eventName} at block ${blockNumber}:`, err);
                }

                logIndex++;
            }
        },

        /** Route a decoded event to the correct handler */
        routeEvent(
            decoded: DecodedEvent,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const { eventName, contractAddress, params } = decoded;
            // RPC contractAddress is 0x-prefixed hex → strip to raw lowercase
            const source = stripHex(contractAddress);

            // ── Self-registration: CollectionConfigured (from ANY contract) ──
            // Emitted by CollectionTemplate.initialize() — auto-registers the
            // collection in the DB + watch set. Fully on-chain, survives DB wipe.
            if (eventName === SELF_REGISTER_EVENT) {
                const collAddr = params['collectionAddress'] as string | undefined;
                const creator = params['creator'] as string | undefined;
                if (collAddr && creator) {
                    const normalizedColl = paddedHexToBech32m(collAddr.replace(/^0x/i, ''));
                    const normalizedCreator = paddedHexToBech32m(creator.replace(/^0x/i, ''));
                    if (normalizedColl) {
                        // Insert into DB (idempotent — IGNORE on duplicate)
                        const maxSupply = params['maxSupply'] ? Number(params['maxSupply']) : 0;
                        factory.handleCollectionConfigured(
                            normalizedColl,
                            normalizedCreator ?? '',
                            maxSupply,
                            blockNumber,
                            txHash,
                            logIndex,
                        );
                        // Queue for watch set resolution
                        pendingCollections.push(collAddr.replace(/^0x/i, ''));
                        log.info(`CollectionConfigured → auto-registered ${normalizedColl}`);
                    }
                }
                return;
            }

            // ── Factory — ONLY from OUR factory contract ──
            if (FACTORY_EVENTS.has(eventName)) {
                if (source !== factoryAddr) {
                    return;
                }
                if (eventName === 'CollectionCreated') {
                    const newAddr = factory.handleCollectionCreated(params, blockNumber, txHash, logIndex);
                    // Queue async resolution of the collection's RPC hex.
                    // Event data has the padded witness program, but the RPC
                    // uses the contractPublicKey as contractAddress in events.
                    // We resolve via: paddedHex → bech32m → getCode → pubKeyHex
                    const rawHex = params['collectionAddress'] as string;
                    pendingCollections.push(rawHex);
                } else {
                    factory.handleCollectionVerified(params, blockNumber, txHash, logIndex);
                }
                return;
            }

            // ── Collection — ONLY from collections deployed by OUR factory ──
            if (COLLECTION_EVENTS.has(eventName)) {
                if (!collectionAddresses.has(source)) {
                    return;
                }
                // Look up the bech32m address for this collection.
                // The DB stores bech32m (opt1s…), but the RPC gives us hex (contractPublicKey).
                // Use the reverse map to pass the correct format to handlers.
                const collAddr = hexToBech32m.get(source) ?? contractAddress;
                switch (eventName) {
                    case 'Minted':
                        collection.handleMinted(collAddr, params, blockNumber, txHash, logIndex);
                        break;
                    case 'Transfer':
                        collection.handleTransfer(collAddr, params, blockNumber, txHash, logIndex);
                        break;
                    case 'PhaseChanged':
                        collection.handlePhaseChanged(collAddr, params, blockNumber, txHash, logIndex);
                        break;
                    case 'Revealed':
                        collection.handleRevealed(collAddr, params, blockNumber, txHash, logIndex);
                        break;
                }
                return;
            }

            // ── Marketplace — ONLY from OUR marketplace contract ──
            if (MARKETPLACE_EVENTS.has(eventName)) {
                if (source !== marketplaceAddr) {
                    return;
                }

                // Fix address mismatch: Marketplace events emit collection addresses
                // as the raw 32-byte contract public key, but Factory events use padded
                // witness programs. Resolve via hexToBech32m so all DB rows use the
                // same bech32m format (opt1sq...) that the Factory created.
                if (params['collection'] && typeof params['collection'] === 'string') {
                    const rawCollHex = (params['collection'] as string).replace(/^0x/i, '').toLowerCase();
                    const existingBech32m = hexToBech32m.get(rawCollHex);
                    if (existingBech32m) {
                        params['collection'] = existingBech32m;
                        log.debug(`Resolved marketplace collection hex → ${existingBech32m}`);
                    }
                }

                switch (eventName) {
                    case 'NFTListed':
                        marketplace.handleNFTListed(params, blockNumber, txHash, logIndex);
                        break;
                    case 'NFTSold':
                        marketplace.handleNFTSold(params, blockNumber, txHash, logIndex);
                        break;
                    case 'ListingCancelled':
                        marketplace.handleListingCancelled(params, blockNumber, txHash, logIndex);
                        break;
                    case 'OfferMade':
                        marketplace.handleOfferMade(params, blockNumber, txHash, logIndex);
                        break;
                    case 'OfferAccepted':
                        marketplace.handleOfferAccepted(params, blockNumber, txHash, logIndex);
                        break;
                    case 'OfferCancelled':
                        marketplace.handleOfferCancelled(params, blockNumber, txHash, logIndex);
                        break;
                    case 'CollectionRegistered':
                        marketplace.handleCollectionRegistered(params, blockNumber, txHash, logIndex);
                        break;
                }
                return;
            }

            // ── Auctions — ONLY from OUR auction house contract ──
            if (AUCTION_EVENTS.has(eventName)) {
                if (source !== auctionAddr) {
                    return;
                }
                switch (eventName) {
                    case 'AuctionCreated':
                        auction.handleAuctionCreated(params, blockNumber, txHash, logIndex);
                        break;
                    case 'BidPlaced':
                        auction.handleBidPlaced(params, blockNumber, txHash, logIndex);
                        break;
                    case 'AuctionSettled':
                        auction.handleAuctionSettled(params, blockNumber, txHash, logIndex);
                        break;
                }
                return;
            }

            // ── Staking — ONLY from OUR staking contract ──
            if (STAKING_EVENTS.has(eventName)) {
                if (source !== stakingAddr) {
                    return;
                }
                switch (eventName) {
                    case 'NFTStaked':
                        staking.handleNFTStaked(params, blockNumber, txHash, logIndex);
                        break;
                    case 'NFTUnstaked':
                        staking.handleNFTUnstaked(params, blockNumber, txHash, logIndex);
                        break;
                    case 'RewardsClaimed':
                        staking.handleRewardsClaimed(params, blockNumber, txHash, logIndex);
                        break;
                }
                return;
            }

            // ── Lending — ONLY from OUR lending contract ──
            if (LENDING_EVENTS.has(eventName)) {
                if (source !== lendingAddr) {
                    return;
                }

                // Resolve collection addresses in lending events
                if (params['collection'] && typeof params['collection'] === 'string') {
                    const rawCollHex = (params['collection'] as string).replace(/^0x/i, '').toLowerCase();
                    const existingBech32m = hexToBech32m.get(rawCollHex);
                    if (existingBech32m) {
                        params['collection'] = existingBech32m;
                    }
                }

                switch (eventName) {
                    case 'LoanRequestCreated':
                        lending.handleLoanRequestCreated(params, blockNumber, txHash, logIndex);
                        break;
                    case 'LoanFunded':
                        lending.handleLoanFunded(params, blockNumber, txHash, logIndex);
                        break;
                    case 'LoanRepaid':
                        lending.handleLoanRepaid(params, blockNumber, txHash, logIndex);
                        break;
                    case 'LoanDefaulted':
                        lending.handleLoanDefaulted(params, blockNumber, txHash, logIndex);
                        break;
                    case 'LoanCancelled':
                        lending.handleLoanCancelled(params, blockNumber, txHash, logIndex);
                        break;
                }
                return;
            }
        },

        /** Expire offers whose expiry_block has passed */
        expireStaleOffers(blockNumber: number): void {
            const result = expireOffers.run({ blockNumber });
            if (result.changes > 0) {
                log.info(`Expired ${result.changes} stale offers at block ${blockNumber}`);
            }
        },

        /**
         * Resolve any newly-discovered collection addresses to their RPC hex.
         * Called by the poller AFTER block processing (async-safe).
         *
         * Flow: padded event hex → bech32m → getCode → contractPublicKey → hex
         */
        async resolvePendingCollections(): Promise<void> {
            if (pendingCollections.length === 0) return;
            const batch = pendingCollections.splice(0);
            for (const paddedHex of batch) {
                const bech32mAddr = paddedHexToBech32m(paddedHex);
                if (!bech32mAddr) {
                    log.warn(`Could not encode bech32m from event hex: ${paddedHex}`);
                    continue;
                }
                const rpcHex = await resolveContractHex(bech32mAddr);
                if (rpcHex) {
                    collectionAddresses.add(rpcHex);
                    hexToBech32m.set(rpcHex, bech32mAddr);
                    log.info(`Added collection to watch set: ${bech32mAddr} → ${rpcHex}`);
                } else {
                    log.warn(`Could not resolve collection hex for ${bech32mAddr}`);
                }
            }
        },

        /**
         * Re-scan the collections table for any newly-registered addresses
         * that aren't yet in the in-memory watch set.
         *
         * This handles directly-deployed collections registered via the
         * POST /api/collections/register endpoint. Without this, the
         * receipt processor wouldn't see their Minted/Transfer events.
         */
        async reloadCollectionAddresses(): Promise<number> {
            const rows = db.prepare(
                'SELECT collection_address FROM collections',
            ).all() as { collection_address: string }[];

            // Build lookup set once (not inside loop)
            const knownBech32m = new Set(hexToBech32m.values());

            let added = 0;
            for (const row of rows) {
                // Skip if already in watch set
                if (knownBech32m.has(row.collection_address)) continue;

                // Contract may not be deployed yet (TX still in mempool)
                // resolveContractHex returns null in that case — we'll retry next cycle
                const hex = await resolveContractHex(row.collection_address);
                if (hex && !collectionAddresses.has(hex)) {
                    collectionAddresses.add(hex);
                    hexToBech32m.set(hex, row.collection_address);
                    knownBech32m.add(row.collection_address);
                    log.info(`Reloaded collection into watch set: ${row.collection_address} → ${hex}`);
                    added++;
                }
            }

            if (added > 0) {
                log.info(`Reloaded ${added} new collection(s) into watch set (total: ${collectionAddresses.size})`);
            }
            return added;
        },
    };
}
