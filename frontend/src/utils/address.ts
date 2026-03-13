/**
 * Address resolution utility for OPNet.
 *
 * `Address.fromString()` only accepts 64-char hex strings.
 * Bech32m addresses (opt1..., bc1..., tb1...) must be resolved via
 * `provider.getPublicKeyInfo(addr, true)` which does an RPC call.
 *
 * This helper handles both formats transparently.
 */

import { Address } from '@btc-vision/transaction';
import { ProviderService } from '@/services/ProviderService';
import type { ForgeNetwork } from '@/config/contracts';

/**
 * Resolve any address string (hex or bech32m) to a 32-byte Address object.
 *
 * - Hex (64 chars, optional 0x prefix): uses Address.fromString() directly (no RPC)
 * - Bech32m (opt1..., bc1..., tb1...): resolves via provider.getPublicKeyInfo()
 */
export async function resolveAddress(input: string, network: ForgeNetwork): Promise<Address> {
    const trimmed = input.trim();

    // Try hex first (fast, no RPC needed)
    const hex = trimmed.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        return Address.fromString(hex);
    }

    // Bech32m — resolve via RPC
    const provider = ProviderService.getProvider(network);
    return await provider.getPublicKeyInfo(trimmed, true);
}

/* ------------------------------------------------------------------ */
/*  Cached hex resolution for API queries                              */
/* ------------------------------------------------------------------ */

/**
 * Module-level cache: "network:bech32mAddr" → "64-char lowercase hex"
 *
 * OPNet wallet addresses (P2TR bech32m like opt1p...) cannot be converted
 * to the 32-byte OPNet identity hex deterministically. The x-only pubkey
 * from the P2TR witness program != the OPNet sender identity stored by
 * contract events. Resolution requires an RPC call (getPublicKeyInfo).
 *
 * This cache prevents repeated RPC calls for the same address.
 */
const _hexCache = new Map<string, string>();

/**
 * Resolve any address string to its 32-byte OPNet identity hex (lowercase, no 0x).
 *
 * For bech32m wallet addresses: calls `getPublicKeyInfo` RPC (cached).
 * For raw hex: returns cleaned lowercase hex immediately.
 *
 * Used by useLending hooks to pass resolved hex to the IndexerAPI so that
 * queries match the hex stored in the DB (from contract event normalisation).
 */
export async function resolveAddressToHex(input: string, network: ForgeNetwork): Promise<string> {
    const trimmed = input.trim();

    // Already hex — return immediately
    const maybeHex = trimmed.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]{64}$/.test(maybeHex)) {
        return maybeHex.toLowerCase();
    }

    // Check cache
    const cacheKey = `${network}:${trimmed}`;
    const cached = _hexCache.get(cacheKey);
    if (cached) return cached;

    // Resolve via RPC — same call as resolveAddress but we extract hex
    const addr = await resolveAddress(trimmed, network);
    const hex = String(addr).replace(/^0x/i, '').toLowerCase();
    _hexCache.set(cacheKey, hex);
    return hex;
}
