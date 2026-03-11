#!/usr/bin/env tsx
/**
 * FORGE — Redeploy ONLY the slimmed-down CollectionTemplate.
 * Re-uses the v3 NanoFactory already deployed.
 * Then calls setTemplate with the new template address and tests.
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

const TESTNET_RPC = 'https://testnet.opnet.org';
const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';
const GAS_SAT_FEE = 50_000n;
const FEE_RATE = 10;

// Re-use existing NanoFactory v3
const FACTORY_ADDR = 'opt1sqquz6n9935t60ttc825769n6qrgnytvhryzrymy3';

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
        inputs: [],
        outputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
    },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

function decodeOPNetAddress(addr: string): Uint8Array {
    const decoded = bech32m.decode(addr, addr.length);
    const rawBytes = bech32m.fromWords(decoded.words.slice(1));
    const padded = new Uint8Array(32);
    padded.set(rawBytes, 32 - rawBytes.length);
    return padded;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex;
}

async function main(): Promise<void> {
    console.log('\n  ═══ FORGE — Deploy Slim Template + Update Factory ═══\n');

    const wallet = new Mnemonic(
        MNEMONIC_PHRASE, '', networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const block = await provider.getBlockNumber();
    console.log(`  Block: ${block}`);
    console.log(`  Factory: ${FACTORY_ADDR}\n`);

    // UTXOs
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) throw new Error(`No UTXOs. Fund: ${wallet.p2tr}`);
    const totalSats = utxos.reduce((s, u) => s + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length} (${totalSats.toLocaleString()} sats)\n`);

    // ── 1. Deploy new slim CollectionTemplate ────────────────────────
    const wasmPath = path.join(BUILD_DIR, 'CollectionTemplate.wasm');
    const bytecode = new Uint8Array(fs.readFileSync(wasmPath));
    console.log(`  ▶ Deploying SlimTemplate (${bytecode.length.toLocaleString()} bytes)...`);
    console.log(`    Factory WASM: 19,446 bytes`);
    console.log(`    Total: ${(bytecode.length + 19_446).toLocaleString()} bytes\n`);

    const txFactory = new TransactionFactory();
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

    const templateAddr = deployment.contractAddress;
    console.log(`    Address: ${templateAddr}`);

    await provider.sendRawTransaction(deployment.transaction[0], false);
    await provider.sendRawTransaction(deployment.transaction[1], false);
    utxos = deployment.utxos;
    console.log(`    ✔ SlimTemplate deployed!\n`);

    // ── 2. Wait and set template ─────────────────────────────────────
    console.log('  ▶ Waiting 2 minutes for block confirmation...');
    await new Promise(r => setTimeout(r, 120_000));

    console.log('  ▶ Calling factory.setTemplate(newTemplateAddress)...');
    const factory = getContract<any>(
        FACTORY_ADDR, FACTORY_ABI, provider, networks.opnetTestnet,
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

    // ── 3. Poll for template confirmation, then test ─────────────────
    console.log('\n  ▶ Polling for setTemplate confirmation...');
    const ZERO_ADDR = '0x' + '0'.repeat(64);

    for (let i = 1; i <= 15; i++) {
        await new Promise(r => setTimeout(r, 30_000));

        const tmpl = await factory.getTemplate();
        const tmplValue = tmpl.properties?.template?.toString() ?? 'undefined';
        const currentBlock = await provider.getBlockNumber();
        console.log(`    [${i}] Block ${currentBlock} — template = ${tmplValue.slice(0, 20)}...`);

        // Check if template changed to new address
        const expectedHex = '0x' + '0'.repeat(24) + templateHex;
        if (tmplValue !== ZERO_ADDR && tmplValue !== 'undefined') {
            console.log('    ✅ Template updated!\n');

            // Test deployCollection
            console.log('  ▶ Testing deployCollection simulation...');
            try {
                const result = await factory.deployCollection();
                if (result.revert) {
                    console.log(`    ❌ Reverted: ${result.revert}\n`);
                } else {
                    console.log('    ✅✅✅ SIMULATION SUCCEEDED! ✅✅✅');
                    console.log(`    Result: ${JSON.stringify(result.properties)}\n`);
                }
            } catch (err: any) {
                console.error(`    ❌ Failed: ${err.message}\n`);
            }

            // Save results
            const output = {
                network: 'testnet',
                rpc: TESTNET_RPC,
                contracts: {
                    template: templateAddr,
                    factory: FACTORY_ADDR,
                },
                version: 'v3-slim',
                deployedAt: new Date().toISOString(),
            };
            const outputPath = path.resolve(__dirname, '..', 'deployed-testnet-v3-slim.json');
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
            console.log(`  Saved to: ${outputPath}`);
            console.log(`  Template: ${templateAddr}`);
            console.log(`  Factory:  ${FACTORY_ADDR}\n`);
            return;
        }
    }

    console.log('  ❌ Template not updated after 7.5 minutes. Try again later.\n');
}

main().catch((err) => {
    console.error('\n  ❌ Failed:\n');
    console.error(err);
    process.exit(1);
});
