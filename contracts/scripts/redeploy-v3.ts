#!/usr/bin/env tsx
/**
 * FORGE — Redeploy CollectionTemplate + NanoFactory v3 + setTemplate
 *
 * v3 changes:
 * - NanoFactory extends OP_NET (not ReentrancyGuard) — 19KB vs 25KB
 * - ALL registry/royalty/verification logic removed from factory
 * - deployCollection() takes NO params — just clones the template
 * - deployCollection() is NOT payable — no platform fee
 * - User calls collection.initialize() as a separate TX
 * - Total WASM: 19KB + 45KB = 64KB (under ~67KB VM limit)
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/redeploy-v3.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    Mnemonic,
    TransactionFactory,
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

// ─── Config ─────────────────────────────────────────────────────────────────

const TESTNET_RPC = 'https://testnet.opnet.org';
const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';
const GAS_SAT_FEE = 50_000n;
const FEE_RATE = 10;

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
    {
        name: 'deployCollection',
        type: BitcoinAbiTypes.Function,
        // NOT payable — no platform fee in NanoFactory
        inputs: [],
        outputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'deploymentCount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
];

// ─── Paths ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// ─── Utilities ──────────────────────────────────────────────────────────────

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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('\n  ═══ FORGE v3 — Redeploy Template + NanoFactory ═══\n');

    // Wallet
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE, '', networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}`);

    // Provider
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const block = await provider.getBlockNumber();
    console.log(`  Block: ${block}\n`);

    // UTXOs
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) throw new Error(`No UTXOs. Fund: ${wallet.p2tr}`);
    const totalSats = utxos.reduce((s, u) => s + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length} (${totalSats.toLocaleString()} sats)\n`);

    const txFactory = new TransactionFactory();

    // Deploy helper
    async function deploy(name: string, wasmPath: string): Promise<string> {
        const bytecode = new Uint8Array(fs.readFileSync(wasmPath));
        console.log(`  ▶ Deploying ${name} (${bytecode.length.toLocaleString()} bytes)...`);

        const challenge = await provider.getChallenge();
        const deployment = await txFactory.signDeployment({
            from: wallet.p2tr, utxos,
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network: networks.opnetTestnet,
            feeRate: FEE_RATE, priorityFee: 0n, gasSatFee: GAS_SAT_FEE,
            bytecode, challenge,
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: true,
        });

        console.log(`    Address: ${deployment.contractAddress}`);

        await provider.sendRawTransaction(deployment.transaction[0], false);
        await provider.sendRawTransaction(deployment.transaction[1], false);

        utxos = deployment.utxos;
        console.log(`    ✔ ${name} deployed!\n`);
        return deployment.contractAddress;
    }

    // ── 1. Deploy CollectionTemplate ─────────────────────────────────
    const templateAddr = await deploy(
        'CollectionTemplate',
        path.join(BUILD_DIR, 'CollectionTemplate.wasm'),
    );

    // ── 2. Deploy NanoFactory v3 ─────────────────────────────────────
    const factoryAddr = await deploy(
        'NanoFactory v3',
        path.join(BUILD_DIR, 'NFTFactory.wasm'),
    );

    // ── 3. Set template (high-level SDK) ────────────────────────────
    console.log('  ▶ Waiting 2 minutes for block confirmation...');
    await new Promise(r => setTimeout(r, 120_000));

    console.log('  ▶ Calling factory.setTemplate(templateAddress)...');
    const factory = getContract<any>(
        factoryAddr,
        FACTORY_ABI,
        provider,
        networks.opnetTestnet,
    );
    factory.setSender(wallet.address);

    const templateHex = bytesToHex(decodeOPNetAddress(templateAddr));
    const templateAddrObj = Address.fromString(templateHex);

    const sim = await factory.setTemplate(templateAddrObj);
    if (sim.revert) throw new Error(`setTemplate reverted: ${sim.revert}`);
    console.log('    ✓ Simulation OK');

    const receipt = await sim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 50_000n,
        network: networks.opnetTestnet,
        feeRate: FEE_RATE,
    });
    console.log(`    TX: ${receipt.transactionId}`);

    // ── 4. Wait for confirmation and test deployCollection ──────────
    console.log('\n  ▶ Waiting 2.5 minutes for setTemplate confirmation...');
    await new Promise(r => setTimeout(r, 150_000));

    // Verify template is set
    const tmpl = await factory.getTemplate();
    const tmplValue = tmpl.properties?.template?.toString() ?? 'undefined';
    console.log(`    getTemplate() = ${tmplValue}`);

    const ZERO_ADDR = '0x' + '0'.repeat(64);
    if (tmplValue === ZERO_ADDR || tmplValue === 'undefined') {
        console.log('    ⚠  Template still zero — setTemplate may not be confirmed yet.');
        console.log('    Run verify-and-test-v3.ts after a few more blocks.\n');
    } else {
        console.log('    ✅ Template is set!\n');
    }

    // Test deployCollection simulation (NO params, NOT payable)
    console.log('  ▶ Testing deployCollection simulation...');
    try {
        const deployResult = await factory.deployCollection();

        if (deployResult.revert) {
            console.log(`    ❌ Simulation REVERTED: ${deployResult.revert}`);
        } else {
            console.log('    ✅ SIMULATION SUCCEEDED!');
            console.log(`    Properties: ${JSON.stringify(deployResult.properties)}`);
        }
    } catch (err: any) {
        console.error(`    ❌ Simulation failed: ${err.message}`);
    }

    // ── Save results ────────────────────────────────────────────────
    const output = {
        network: 'testnet',
        rpc: TESTNET_RPC,
        contracts: {
            template: templateAddr,
            factory: factoryAddr,
        },
        version: 'v3-nanofactory',
        deployedAt: new Date().toISOString(),
    };

    const outputPath = path.resolve(__dirname, '..', 'deployed-testnet-v3.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`\n  Saved to: ${outputPath}`);
    console.log(`\n  Template: ${templateAddr}`);
    console.log(`  Factory:  ${factoryAddr}`);
    console.log('');
}

main().catch((err) => {
    console.error('\n  ❌ Failed:\n');
    console.error(err);
    process.exit(1);
});
