/**
 * Payment output utilities for OPNet payable contract calls.
 *
 * Contract verifyPaymentToSelf() handles 3 scenarios:
 *   1a. Hex match on output.to (not used — VM rejects hex in `to` field)
 *   1b. Bech32m decode of output.to → extract 32-byte P2TR program (on-chain)
 *   2.  P2TR byte match on output.scriptPublicKey (simulation with flags=hasScriptPubKey)
 *
 * SIMULATION:  flags=hasScriptPubKey (2) + scriptPubKey=P2TR bytes [0x51, 0x20, ...32]
 * PSBT:        { script: P2TR scriptPubKey } — creates P2TR output on Bitcoin
 *
 * We use P2TR (not P2OP) for payment outputs because:
 *   - P2TR witness program = 32 bytes = contract address (easy to compare)
 *   - P2OP witness program = 21 bytes = version + hash160 (needs hash computation)
 *
 * IMPORTANT: Do NOT use flags=hasTo (1) with hex addresses — the VM rejects hex
 * strings in the `to` field with "public keys outputs should be scriptPubKey and not to".
 */

import type { PsbtOutputExtended, Script } from '@btc-vision/bitcoin';
import { toSatoshi } from '@btc-vision/bitcoin';

/**
 * Build a P2TR scriptPubKey from a 32-byte contract address.
 * Format: OP_1 (0x51) + PUSH32 (0x20) + 32 address bytes = 34 bytes.
 *
 * Used for BOTH simulation (setTransactionDetails) and PSBT extraOutputs.
 */
export function buildP2TRScriptPubKey(address32: Uint8Array): Uint8Array {
    const script = new Uint8Array(34);
    script[0] = 0x51; // OP_1 (witness version 1 = P2TR)
    script[1] = 0x20; // PUSH32
    script.set(address32.subarray(0, 32), 2);
    return script;
}

/**
 * Resolve a contract's 32-byte address and P2TR scriptPubKey.
 *
 * @param contract - Any OPNet contract instance (has `contractAddress` getter)
 * @param label - Label for console logs (e.g. 'mint', 'marketplace')
 */
export async function resolveContractPaymentInfo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contract: any,
    label: string,
): Promise<{ address32: Uint8Array; p2trScript: Uint8Array; hexAddress: string } | undefined> {
    try {
        const contractAddr: Uint8Array = await contract.contractAddress;
        const p2trScript = buildP2TRScriptPubKey(contractAddr);
        const hexRaw = Array.from(contractAddr, (b: number) => b.toString(16).padStart(2, '0')).join('');
        const hexAddress = '0x' + hexRaw;
        console.log(`[FORGE][${label}] Resolved contract address: ${hexAddress.substring(0, 18)}...`);
        return { address32: contractAddr, p2trScript, hexAddress };
    } catch (e) {
        console.warn(`[FORGE][${label}] Failed to resolve contract address:`, e);
        return undefined;
    }
}

/**
 * Legacy alias — resolves just the P2TR scriptPubKey.
 */
export async function resolveP2TRScript(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contract: any,
    label: string,
): Promise<Uint8Array | undefined> {
    const info = await resolveContractPaymentInfo(contract, label);
    return info?.p2trScript;
}

/**
 * Build simulation output for a payable contract call.
 *
 * Uses flags=hasScriptPubKey (2) with P2TR script bytes.
 * The contract's verifyPaymentToSelf() matches via Method 2 (byte comparison).
 *
 * DO NOT use flags=hasTo (1) with hex — VM rejects it with:
 * "public keys outputs should be scriptPubKey and not to"
 *
 * @param p2trScript - P2TR scriptPubKey (34 bytes) from resolveContractPaymentInfo()
 * @param fallbackAddress - Contract P2OP address string (used as `to` for RPC validation)
 * @param value - Payment amount in sats (bigint)
 */
export function buildSimulationOutput(
    p2trScript: Uint8Array | undefined,
    fallbackAddress: string,
    value: bigint,
    _hexAddress?: string, // kept for API compat, no longer used
): {
    index: number;
    to: string;
    value: bigint;
    scriptPubKey?: Uint8Array;
    flags: number;
} {
    // TransactionOutputFlags: hasScriptPubKey = 2
    //
    // Use P2TR scriptPubKey bytes for simulation. The contract checks
    // output.scriptPublicKey bytes: [0x51, 0x20, ...32 address bytes].
    if (p2trScript) {
        return {
            index: 1,
            to: fallbackAddress, // RPC requires `to` field, but VM uses scriptPubKey with flags=2
            value,
            scriptPubKey: p2trScript,
            flags: 2, // hasScriptPubKey
        };
    }

    // FALLBACK: flags=hasTo with P2OP address.
    // On-chain, the contract's bech32m decode (Method 1b) handles this.
    return {
        index: 1,
        to: fallbackAddress,
        value,
        flags: 1,
    };
}

/**
 * Build PSBT extraOutputs for a payable contract call.
 *
 * Creates a P2TR output using the raw scriptPubKey bytes.
 * On-chain, the VM reads this P2TR output and provides the 32-byte
 * witness program to the contract via output.to (as bech32m address).
 */
export function buildPaymentOutputs(
    p2trScript: Uint8Array | undefined,
    fallbackAddress: string,
    valueSats: bigint,
): PsbtOutputExtended[] {
    const satValue = toSatoshi(valueSats);
    if (p2trScript) {
        // Cast to branded Script type — creates P2TR output in PSBT
        return [{ script: p2trScript as unknown as Script, value: satValue }];
    }
    // Fallback to address-based output (P2OP format)
    return [{ address: fallbackAddress, value: satValue }];
}
