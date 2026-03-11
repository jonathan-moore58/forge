/* ------------------------------------------------------------------ */
/*  Event decoder: raw binary → typed FORGE events                     */
/*  Reads the exact BytesWriter format from our contracts:             */
/*    - writeAddress  → 32 bytes (OPNet taproot x-only pubkey)         */
/*    - writeU256     → 32 bytes (big-endian unsigned integer)         */
/*    - writeStringWithLength → u32-BE length + UTF-8 bytes           */
/* ------------------------------------------------------------------ */

import { createLogger } from '../utils/logger.js';

const log = createLogger('event-decoder');

// ── Raw event from RPC receipt ──────────────────────────────────────

export interface RawReceiptEvent {
    contractAddress: string;
    type: string;
    data: string; // Base64-encoded binary (OPNet RPC format)
}

// ── Decoded event ──────────────────────────────────────────────────

export interface DecodedEvent {
    eventName: string;
    contractAddress: string;
    params: Record<string, string | bigint>;
}

// ── Field definitions ───────────────────────────────────────────────

type FieldType = 'address' | 'u256' | 'string';

interface FieldDef {
    name: string;
    type: FieldType;
}

/**
 * Event field definitions — matches the deployed contract BytesWriter order.
 *
 * v6 factory (registry) — CollectionCreatedEvent writes:
 *   writeAddress(creator)
 *   writeU256(collectionId)
 *   writeAddress(collectionAddress)
 */
const EVENT_FIELDS: Record<string, FieldDef[]> = {
    // Factory / Registry (v6)
    CollectionCreated: [
        { name: 'creator', type: 'address' },
        { name: 'collectionId', type: 'u256' },
        { name: 'collectionAddress', type: 'address' },
    ],
    CollectionVerified: [
        { name: 'collectionId', type: 'u256' },
    ],
    // Self-registration: emitted by CollectionTemplate.initialize()
    CollectionConfigured: [
        { name: 'collectionAddress', type: 'address' },
        { name: 'creator', type: 'address' },
        { name: 'maxSupply', type: 'u256' },
        { name: 'mintPrice', type: 'u256' },
    ],

    // Collection Template (OP721)  — 96 bytes (3 × 32)
    Minted: [
        { name: 'minter', type: 'address' },
        { name: 'quantity', type: 'u256' },
        { name: 'startTokenId', type: 'u256' },
    ],
    Transfer: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'u256' },
    ],
    PhaseChanged: [
        { name: 'newPhase', type: 'u256' },
    ],
    Revealed: [
        { name: 'baseURI', type: 'string' },
    ],

    // Marketplace
    NFTListed: [
        { name: 'listingId', type: 'u256' },
        { name: 'seller', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'price', type: 'u256' },
    ],
    NFTSold: [
        { name: 'listingId', type: 'u256' },
        { name: 'buyer', type: 'address' },
        { name: 'seller', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'price', type: 'u256' },
    ],
    ListingCancelled: [
        { name: 'listingId', type: 'u256' },
    ],
    OfferMade: [
        { name: 'offerId', type: 'u256' },
        { name: 'offerer', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'price', type: 'u256' },
        { name: 'expiryBlock', type: 'u256' },
    ],
    OfferAccepted: [
        { name: 'offerId', type: 'u256' },
        { name: 'seller', type: 'address' },
        { name: 'buyer', type: 'address' },
        { name: 'price', type: 'u256' },
    ],
    OfferCancelled: [
        { name: 'offerId', type: 'u256' },
    ],
    CollectionRegistered: [
        { name: 'collection', type: 'address' },
        { name: 'creator', type: 'address' },
    ],

    // Auction House
    AuctionCreated: [
        { name: 'auctionId', type: 'u256' },
        { name: 'seller', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'startPrice', type: 'u256' },
        { name: 'endBlock', type: 'u256' },
    ],
    BidPlaced: [
        { name: 'auctionId', type: 'u256' },
        { name: 'bidder', type: 'address' },
        { name: 'amount', type: 'u256' },
        { name: 'newEndBlock', type: 'u256' },
    ],
    AuctionSettled: [
        { name: 'auctionId', type: 'u256' },
        { name: 'winner', type: 'address' },
        { name: 'finalPrice', type: 'u256' },
    ],

    // Staking Rewards
    NFTStaked: [
        { name: 'staker', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'poolId', type: 'u256' },
    ],
    NFTUnstaked: [
        { name: 'staker', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'rewardsClaimed', type: 'u256' },
    ],
    RewardsClaimed: [
        { name: 'staker', type: 'address' },
        { name: 'amount', type: 'u256' },
    ],

    // NFT Lending
    LoanRequestCreated: [
        { name: 'loanId', type: 'u256' },
        { name: 'borrower', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
        { name: 'paymentToken', type: 'address' },
        { name: 'amount', type: 'u256' },
        { name: 'interestBps', type: 'u256' },
        { name: 'durationBlocks', type: 'u256' },
    ],
    LoanFunded: [
        { name: 'loanId', type: 'u256' },
        { name: 'lender', type: 'address' },
        { name: 'borrower', type: 'address' },
        { name: 'amount', type: 'u256' },
    ],
    LoanRepaid: [
        { name: 'loanId', type: 'u256' },
        { name: 'borrower', type: 'address' },
        { name: 'lender', type: 'address' },
        { name: 'repayAmount', type: 'u256' },
    ],
    LoanDefaulted: [
        { name: 'loanId', type: 'u256' },
        { name: 'lender', type: 'address' },
        { name: 'collection', type: 'address' },
        { name: 'tokenId', type: 'u256' },
    ],
    LoanCancelled: [
        { name: 'loanId', type: 'u256' },
        { name: 'borrower', type: 'address' },
    ],
};

// ── Binary readers (matching BytesWriter format) ────────────────────

function readU256(data: Uint8Array, offset: number): [bigint, number] {
    let val = 0n;
    for (let i = 0; i < 32; i++) {
        val = (val << 8n) | BigInt(data[offset + i]!);
    }
    return [val, offset + 32];
}

function readAddressRaw(data: Uint8Array, offset: number): [string, number] {
    // 32-byte raw address → lowercase hex (64 chars)
    const slice = data.slice(offset, offset + 32);
    const hex = Buffer.from(slice).toString('hex');
    return [hex, offset + 32];
}

function readString(data: Uint8Array, offset: number): [string, number] {
    // u32 BE length prefix + UTF-8 bytes  (BytesWriter.writeStringWithLength uses BE)
    const view = new DataView(data.buffer, data.byteOffset + offset, 4);
    const len = view.getUint32(0, false); // big-endian
    offset += 4;
    const str = new TextDecoder().decode(data.slice(offset, offset + len));
    return [str, offset + len];
}

// ── Core decode function ────────────────────────────────────────────

function decodeFields(
    data: Uint8Array,
    fields: FieldDef[],
): Record<string, string | bigint> {
    const result: Record<string, string | bigint> = {};
    let offset = 0;

    for (const field of fields) {
        switch (field.type) {
            case 'address': {
                const [val, next] = readAddressRaw(data, offset);
                result[field.name] = val;
                offset = next;
                break;
            }
            case 'u256': {
                const [val, next] = readU256(data, offset);
                result[field.name] = val;
                offset = next;
                break;
            }
            case 'string': {
                const [val, next] = readString(data, offset);
                result[field.name] = val;
                offset = next;
                break;
            }
        }
    }

    return result;
}

// ── Public API ──────────────────────────────────────────────────────

/** Check if an event type is one of our FORGE events */
export function isKnownEvent(eventType: string): boolean {
    return eventType in EVENT_FIELDS;
}

/** All recognized event names */
export function getKnownEventNames(): string[] {
    return Object.keys(EVENT_FIELDS);
}

/** Calculate expected data size for an event based on its field definitions */
function expectedSize(fields: FieldDef[]): number {
    let size = 0;
    for (const f of fields) {
        if (f.type === 'address' || f.type === 'u256') size += 32;
        // 'string' is variable-length — skip size check
        else return -1;
    }
    return size;
}

/** Decode a single raw receipt event into a structured object */
export function decodeReceiptEvent(raw: RawReceiptEvent): DecodedEvent | null {
    const fields = EVENT_FIELDS[raw.type];
    if (!fields) return null;

    try {
        const dataBytes = decodeEventData(raw.data);

        // Validate data length matches expected field sizes
        // (catches OP20 "Minted" at 64 bytes vs our OP721 "Minted" at 96 bytes, etc.)
        const expected = expectedSize(fields);
        if (expected > 0 && dataBytes.length < expected) {
            // Silently skip — likely a different contract's event with the same name
            return null;
        }

        const params = decodeFields(dataBytes, fields);
        return {
            eventName: raw.type,
            contractAddress: raw.contractAddress,
            params,
        };
    } catch (err) {
        log.warn(`Failed to decode ${raw.type} event:`, err);
        return null;
    }
}

/**
 * Normalize raw RPC receipt events into a flat array.
 * Handles both flat array and keyed-object formats.
 */
export function flattenEvents(rawEvents: unknown): RawReceiptEvent[] {
    if (!rawEvents) return [];

    // Flat array of { contractAddress, type, data }
    if (Array.isArray(rawEvents)) {
        return rawEvents as RawReceiptEvent[];
    }

    // Grouped: { [key]: RawReceiptEvent[] }
    if (typeof rawEvents === 'object') {
        const events: RawReceiptEvent[] = [];
        for (const group of Object.values(rawEvents as Record<string, unknown>)) {
            if (Array.isArray(group)) {
                events.push(...(group as RawReceiptEvent[]));
            }
        }
        return events;
    }

    return [];
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Decode event data — OPNet RPC sends it as Base64 */
function decodeEventData(data: string): Uint8Array {
    // Try Base64 first (OPNet RPC format), fall back to hex
    if (/^[A-Za-z0-9+/=]+$/.test(data) && !data.startsWith('0x')) {
        return Buffer.from(data, 'base64');
    }
    const clean = data.startsWith('0x') ? data.slice(2) : data;
    return Buffer.from(clean, 'hex');
}
