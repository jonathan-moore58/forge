#!/usr/bin/env tsx
/**
 * FORGE — Redeploy Marketplace Only (v2 — with registration gates)
 *
 * Deploys ONLY the updated Marketplace contract, keeping all other
 * contracts (Factory, Template, AuctionHouse, StakingRewards) unchanged.
 *
 * The Marketplace constructor calldata: [factoryAddr(u256), feeRecipient(u256)]
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/deploy-marketplace-v2.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    Mnemonic,
    TransactionFactory,
    BinaryWriter,
    AddressTypes,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';
import { bech32m } from 'bech32';

// ─── Configuration ───────────────────────────────────────────────────────────

const TESTNET_RPC = 'https://testnet.opnet.org';

const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';

/** Platform treasury wallet — receives marketplace + auction fees */
const TREASURY_ADDRESS =
    'opt1pee9mrlhfxkmfqdssjsr8gwedewn2mgk08rrqla29rg0fjry29ths0cjdrz';

/** Gas fee for deployment (in sats). */
const GAS_SAT_FEE = 50_000n;

/** Fee rate in sat/vB. */
const FEE_RATE = 10;

// ─── Existing deployed addresses (NOT being redeployed) ─────────────────────

const EXISTING_FACTORY = 'opt1sqqq34d94cf540p7mck6muzg4j9zp5hnttqmaxd97';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// ─── Utilities ───────────────────────────────────────────────────────────────

function decodeOPNetAddress(addr: string): Uint8Array {
    const decoded = bech32m.decode(addr, addr.length);
    const rawBytes = bech32m.fromWords(decoded.words.slice(1));
    const padded = new Uint8Array(32);
    padded.set(rawBytes, 32 - rawBytes.length);
    return padded;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
    let hex = '0x';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return BigInt(hex);
}

function padHex(n: bigint): string {
    return '0x' + n.toString(16).padStart(64, '0');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Marketplace v2 Deployment (registration)   ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');

    // ── 1. Restore wallet ────────────────────────────────────────────

    console.log('[1/4] Restoring wallet from mnemonic...');
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
    console.log(`  RPC:          ${TESTNET_RPC}`);
    console.log(`  Block height: ${blockNumber}`);
    console.log('');

    // ── 3. Check UTXOs ───────────────────────────────────────────────

    console.log('[3/4] Checking UTXOs...');
    const txFactory = new TransactionFactory();
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs available. Fund the deployer wallet:\n  ${wallet.p2tr}`);
    }
    const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)`);
    console.log('');

    // ── 4. Deploy Marketplace ────────────────────────────────────────

    console.log('[4/4] Deploying Marketplace v2 (with registration gates)...');

    // Prepare calldata: [factoryAddress(u256), feeRecipient(u256)]
    const factoryU256 = bytesToBigInt(decodeOPNetAddress(EXISTING_FACTORY));
    const treasuryU256 = bytesToBigInt(decodeOPNetAddress(TREASURY_ADDRESS));
    console.log(`  Factory u256:  ${padHex(factoryU256)}`);
    console.log(`  Treasury u256: ${padHex(treasuryU256)}`);

    const mktCalldata = new BinaryWriter();
    mktCalldata.writeU256(factoryU256);
    mktCalldata.writeU256(treasuryU256);

    const bytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'Marketplace.wasm')),
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
        calldata: mktCalldata.getBuffer(),
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    console.log(`  Contract address: ${deployment.contractAddress}`);

    // Broadcast funding TX
    const fundingResult = await provider.sendRawTransaction(
        deployment.transaction[0], false,
    );
    const fid = typeof fundingResult === 'object'
        ? (fundingResult as any).result ?? (fundingResult as any).txid ?? JSON.stringify(fundingResult)
        : fundingResult;
    console.log(`  Funding TX: ${fid}`);
    if (typeof fundingResult === 'object' && !(fundingResult as any).success) {
        console.error(`  ⚠️  Funding error: ${(fundingResult as any).error}`);
    }

    // Broadcast reveal TX
    const revealResult = await provider.sendRawTransaction(
        deployment.transaction[1], false,
    );
    const rid = typeof revealResult === 'object'
        ? (revealResult as any).result ?? (revealResult as any).txid ?? JSON.stringify(revealResult)
        : revealResult;
    console.log(`  Reveal TX:  ${rid}`);
    if (typeof revealResult === 'object' && !(revealResult as any).success) {
        console.error(`  ⚠️  Reveal error: ${(revealResult as any).error}`);
    }

    // ── Output ───────────────────────────────────────────────────────

    console.log('');
    console.log('  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║   Marketplace v2 Deployed!                                      ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  NEW Marketplace: ${deployment.contractAddress}`);
    console.log(`  ║  OLD Marketplace: opt1sqpsl40d4t68uvzpzu7zaapmj5wrfrus4jskcm979`);
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Factory (unchanged):      ${EXISTING_FACTORY}`);
    console.log(`  ║  Treasury:                 ${TREASURY_ADDRESS}`);
    console.log('  ╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Save result
    const outputPath = path.resolve(__dirname, '..', 'deployed-marketplace-v2.json');
    const output = {
        network: 'testnet',
        rpc: TESTNET_RPC,
        oldMarketplace: 'opt1sqpsl40d4t68uvzpzu7zaapmj5wrfrus4jskcm979',
        newMarketplace: deployment.contractAddress,
        factory: EXISTING_FACTORY,
        treasury: TREASURY_ADDRESS,
        deployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`  Saved to: ${outputPath}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Update MARKETPLACE_ADDRESS in backend/.env');
    console.log('    2. Update marketplace in frontend/src/config/contracts.ts');
    console.log('    3. Restart backend (to pick up new address + schema migration)');
    console.log('    4. Delete the old DB if you want a fresh index: rm backend/forge-indexer.db');
    console.log('');
}

main().catch((err) => {
    console.error('\n  ❌ Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
