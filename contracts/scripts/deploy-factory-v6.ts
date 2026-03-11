#!/usr/bin/env tsx
/**
 * FORGE — Deploy NFTFactory v6 (Registry) to Testnet
 *
 * Deploys ONLY the new registry-based factory. No template needed.
 * CollectionTemplate is now deployed directly from user wallets.
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/deploy-factory-v6.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    Mnemonic,
    TransactionFactory,
    AddressTypes,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';

// ─── Configuration ───────────────────────────────────────────────────────────

const TESTNET_RPC = 'https://testnet.opnet.org';

const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';

const GAS_SAT_FEE = 50_000n;
const FEE_RATE = 10;

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Deploy NFTFactory v6 (Registry)                 ║');
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // 1. Restore wallet
    console.log('[1/3] Restoring wallet...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}\n`);

    // 2. Connect
    console.log('[2/3] Connecting to testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const blockNumber = await provider.getBlockNumber();
    console.log(`  Block: ${blockNumber}`);

    const txFactory = new TransactionFactory();
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs. Fund: ${wallet.p2tr}`);
    }
    const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)\n`);

    // 3. Deploy NFTFactory v6
    console.log('[3/3] Deploying NFTFactory v6 (registry)...');
    const bytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'NFTFactory.wasm')),
    );
    console.log(`  Bytecode: ${bytecode.length.toLocaleString()} bytes`);

    const challenge = await provider.getChallenge();
    const deployment = await txFactory.signDeployment({
        from: wallet.p2tr,
        utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: networks.opnetTestnet,
        feeRate: FEE_RATE,
        priorityFee: 0n,
        gasSatFee: GAS_SAT_FEE,
        bytecode,
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    const factoryAddress = deployment.contractAddress;
    console.log(`  Factory: ${factoryAddress}`);

    // Broadcast funding
    const fundRes = await provider.sendRawTransaction(
        deployment.transaction[0], false,
    );
    const fid = typeof fundRes === 'object'
        ? (fundRes as any).result ?? (fundRes as any).txid ?? JSON.stringify(fundRes)
        : fundRes;
    console.log(`  Funding TX: ${fid}`);

    // Broadcast reveal
    const revealRes = await provider.sendRawTransaction(
        deployment.transaction[1], false,
    );
    const rid = typeof revealRes === 'object'
        ? (revealRes as any).result ?? (revealRes as any).txid ?? JSON.stringify(revealRes)
        : revealRes;
    console.log(`  Reveal TX:  ${rid}`);

    console.log('  Factory v6 deployed!\n');

    // ── Output ───────────────────────────────────────────────────────

    console.log('  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — NFTFactory v6 (Registry) Deployed!                    ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Factory: ${factoryAddress}`);
    console.log('  ╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Update deployed-testnet.json
    const outputPath = path.resolve(__dirname, '..', 'deployed-testnet.json');
    let existing: Record<string, any> = {};
    try {
        existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    } catch {
        // ignore
    }
    if (!existing.contracts) {
        existing.contracts = {};
    }
    existing.contracts.factory = factoryAddress;
    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`  Updated: ${outputPath}`);
    console.log('');
    console.log('  Next: Update frontend/src/config/contracts.ts with new factory address');
    console.log('');
}

main().catch((err) => {
    console.error('\n  Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
