/* ------------------------------------------------------------------ */
/*  Address conversion: raw 32-byte hex ↔ Bech32m (opt1.../bcrt1...)   */
/* ------------------------------------------------------------------ */

import { address as btcAddress, Network, networks } from '@btc-vision/bitcoin';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('address');

let _network: Network;

/** Initialise the network config once at startup */
export function initAddressNetwork(): void {
    const nets = networks as Record<string, Network>;

    switch (config.network) {
        case 'regtest':
            _network = nets['opnetRegtest'] ?? nets['regtest'] ?? networks.regtest;
            break;
        case 'testnet':
            _network = nets['opnetTestnet'] ?? nets['testnet'] ?? networks.testnet;
            break;
        case 'mainnet':
            _network = nets['opnet'] ?? nets['bitcoin'] ?? networks.bitcoin;
            break;
        default:
            _network = networks.testnet;
    }

    log.info(`Address network: bech32=${(_network as any).bech32 ?? 'unknown'}`);
}

/** Get the active network config */
export function getNetwork(): Network {
    if (!_network) initAddressNetwork();
    return _network;
}

/**
 * Convert a raw 32-byte hex string to a Bech32m (Taproot) address.
 * Returns the hex unchanged if conversion fails.
 */
export function rawHexToAddress(hex: string): string {
    try {
        const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
        if (clean.length !== 64) return hex;
        const buf = Buffer.from(clean, 'hex');
        // Build P2TR output script: OP_1 (0x51) + PUSH_32 (0x20) + 32 bytes
        const script = Buffer.concat([Buffer.from([0x51, 0x20]), buf]);
        return btcAddress.fromOutputScript(script, getNetwork());
    } catch {
        return hex; // fallback: return raw hex
    }
}

/**
 * Convert a Bech32m address to raw 32-byte lowercase hex.
 * Returns the input unchanged if it already looks like hex.
 */
export function addressToRawHex(addr: string): string {
    // Already looks like hex
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(addr)) {
        return addr.replace(/^0x/, '').toLowerCase();
    }

    try {
        const script = btcAddress.toOutputScript(addr, getNetwork());
        // Script = OP_1 (0x51) + PUSH_32 (0x20) + 32 bytes
        return Buffer.from(script.subarray(2)).toString('hex');
    } catch {
        return addr.toLowerCase();
    }
}

/**
 * Normalise any address (Bech32 or hex) to the Bech32m format used
 * throughout the database and API responses.
 *
 * Handles two hex formats:
 *  - Padded witness program (from BytesWriter.writeAddress):
 *      32 bytes = 11 zero bytes + 21-byte witness program
 *      Detected by first 22 hex chars being '0'. Convert via paddedHexToBech32m().
 *  - Contract public key (from RPC `contractAddress`):
 *      32-byte actual public key. Cannot be converted to bech32m synchronously
 *      (requires btc_getCode RPC). Falls back to rawHexToAddress() (P2TR encoding).
 */
export function normalizeAddress(addr: string): string {
    // If it already looks like a Bech32 address, return as-is
    if (addr.startsWith('opt1') || addr.startsWith('bcrt1') || addr.startsWith('tb1') || addr.startsWith('bc1')) {
        return addr;
    }

    // Detect padded hex from event data (BytesWriter.writeAddress):
    // First 11 bytes (22 hex chars) are zeros → padded 21-byte witness program
    const clean = addr.startsWith('0x') ? addr.slice(2) : addr;
    if (clean.length === 64 && clean.startsWith('0'.repeat(22))) {
        const bech32mAddr = paddedHexToBech32m(addr);
        if (bech32mAddr) return bech32mAddr;
    }

    return rawHexToAddress(addr);
}

/* ------------------------------------------------------------------ */
/*  Event data hex → bech32m conversion                                */
/* ------------------------------------------------------------------ */

import { bech32m } from 'bech32';

/** OPNet bech32m prefix per network */
function getBech32Prefix(): string {
    switch (config.network) {
        case 'regtest': return 'bcrt';
        case 'testnet': return 'opt';
        case 'mainnet': return 'opt';
        default: return 'opt';
    }
}

/**
 * Convert a 32-byte padded hex from event data (BytesWriter.writeAddress)
 * back to a bech32m OPNet contract address.
 *
 * OPNet addresses use witness version 16 with a 21-byte witness program.
 * The 32-byte padded hex has the 21-byte program right-aligned (11 zero-byte prefix).
 */
export function paddedHexToBech32m(paddedHex: string): string | null {
    try {
        const clean = paddedHex.startsWith('0x') ? paddedHex.slice(2) : paddedHex;
        if (clean.length !== 64) return null;
        const buf = Buffer.from(clean, 'hex');
        // Extract 21-byte witness program from offset 11 (32 - 21 = 11)
        const witnessProgram = buf.subarray(11, 32);
        const words = bech32m.toWords(witnessProgram);
        // Prepend witness version 16
        return bech32m.encode(getBech32Prefix(), [16, ...words], 200);
    } catch (err) {
        log.warn(`paddedHexToBech32m failed for ${paddedHex}:`, err);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Contract public key resolution (bech32m → RPC hex)                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve a bech32m contract address to the 32-byte hex "contract public key"
 * that the OPNet RPC uses as `contractAddress` in event receipts.
 *
 * Calls `btc_getCode(bech32mAddr)` → decodes `contractPublicKey` (base64) → hex.
 * Returns null if the contract doesn't exist on-chain.
 */
export async function resolveContractHex(
    bech32mAddr: string,
    maxRetries = 3,
): Promise<string | null> {
    if (!bech32mAddr) return null;

    // Already hex — strip 0x prefix
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(bech32mAddr)) {
        return bech32mAddr.replace(/^0x/, '').toLowerCase();
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(config.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'btc_getCode',
                    params: [bech32mAddr],
                }),
            });
            const json = (await res.json()) as {
                result?: { contractPublicKey?: string };
                error?: { message: string };
            };
            if (json.error || !json.result?.contractPublicKey) {
                log.warn(`resolveContractHex: could not resolve ${bech32mAddr}`);
                return null;
            }
            // contractPublicKey is base64 → decode to 32-byte hex
            const hex = Buffer.from(json.result.contractPublicKey, 'base64').toString('hex');
            log.info(`Resolved ${bech32mAddr} → ${hex}`);
            return hex;
        } catch (err) {
            log.warn(
                `resolveContractHex RPC error for ${bech32mAddr} (attempt ${attempt + 1}/${maxRetries}):`,
                (err as Error).message ?? err,
            );
            if (attempt < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
            }
        }
    }
    return null;
}
