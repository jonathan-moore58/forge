#!/usr/bin/env tsx
/**
 * FORGE — Fix setTemplate on NFTFactory
 *
 * The original setTemplate call during deployment used manual signInteraction()
 * with an incorrect 'contract' hex parameter, causing "Contract not found" revert.
 *
 * This script uses the HIGH-LEVEL SDK pattern:
 *   getContract() → contract.setTemplate() → simulation.sendTransaction()
 * which handles the contract parameter internally.
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/fix-set-template.ts
 */

import {
    Mnemonic,
    AddressTypes,
    Address,
} from '@btc-vision/transaction';
import {
    JSONRpcProvider,
    getContract,
    ABIDataTypes,
    BitcoinAbiTypes,
    type BitcoinInterfaceAbi,
} from 'opnet';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';
import { bech32m } from 'bech32';

// ─── Configuration ───────────────────────────────────────────────────────────

const TESTNET_RPC = 'https://testnet.opnet.org';

const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';

// Already-deployed addresses
const DEPLOYED_TEMPLATE = 'opt1sqzyyz9qupmrquf4hfnaeywpw9z4k4nla8ysz8k5y';
const DEPLOYED_FACTORY  = 'opt1sqz4yznmc2g38hmyygpjn42f5cwjw4k35ds0g0jzw';

// ─── ABI (only need setTemplate + getTemplate for this script) ───────────────

const FACTORY_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setTemplate',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'templateAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'getTemplate',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'template', type: ABIDataTypes.ADDRESS }],
    },
];

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Decode an OPNet bech32m address to raw bytes, left-padded to 32 bytes. */
function decodeOPNetAddress(addr: string): Uint8Array {
    const decoded = bech32m.decode(addr, addr.length);
    const rawBytes = bech32m.fromWords(decoded.words.slice(1));
    const padded = new Uint8Array(32);
    padded.set(rawBytes, 32 - rawBytes.length);
    return padded;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Fix setTemplate on NFTFactory               ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Template: ${DEPLOYED_TEMPLATE}`);
    console.log(`  Factory:  ${DEPLOYED_FACTORY}`);
    console.log('');

    // ── 1. Restore wallet from mnemonic ──────────────────────────────
    console.log('[1/4] Restoring wallet...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}`);
    console.log('');

    // ── 2. Connect to testnet ────────────────────────────────────────
    console.log('[2/4] Connecting to OPNet testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const blockNumber = await provider.getBlockNumber();
    console.log(`  Block: ${blockNumber}`);
    console.log('');

    // ── 3. Check current template (should be all zeros) ──────────────
    console.log('[3/4] Checking current template...');

    // Use the high-level SDK: getContract() → call methods
    const factory = getContract<any>(
        DEPLOYED_FACTORY,
        FACTORY_ABI,
        provider,
        networks.opnetTestnet,
    );

    // Set sender (owner) for write operations
    factory.setSender(wallet.address);

    // Read current template
    const currentTemplate = await factory.getTemplate();
    console.log(`  Current template: ${JSON.stringify(currentTemplate.properties)}`);
    console.log(`  Revert: ${currentTemplate.revert ?? '(none)'}`);
    console.log('');

    // ── 4. Call setTemplate(templateAddress) via high-level SDK ───────
    console.log('[4/4] Calling factory.setTemplate(templateAddress)...');

    // Convert template bech32m address to Address object
    const templateBytes = decodeOPNetAddress(DEPLOYED_TEMPLATE);
    const templateHex = bytesToHex(templateBytes);
    const templateAddr = Address.fromString(templateHex);
    console.log(`  Template Address object: ${templateAddr.toString()}`);

    // Call setTemplate — this is a SIMULATION first
    const simulation = await factory.setTemplate(templateAddr);

    if (simulation.revert) {
        console.error(`  ❌ Simulation reverted: ${simulation.revert}`);
        process.exit(1);
    }

    console.log('  ✓ Simulation succeeded');
    console.log(`  Properties: ${JSON.stringify(simulation.properties)}`);

    // Send the transaction using the high-level SDK
    // This handles the 'contract' parameter internally!
    const receipt = await simulation.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 50_000n,
        network: networks.opnetTestnet,
        feeRate: 10,
    });

    console.log(`  TX ID: ${receipt.transactionId}`);
    console.log('');

    // ── Verify ───────────────────────────────────────────────────────
    console.log('  Waiting 5 seconds for confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const updatedTemplate = await factory.getTemplate();
    console.log(`  Updated template: ${JSON.stringify(updatedTemplate.properties)}`);
    console.log('');

    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║   ✔ setTemplate fix complete!                         ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
}

main().catch((err) => {
    console.error('\n  ❌ Failed:\n');
    console.error(err);
    process.exit(1);
});
