#!/usr/bin/env tsx
/**
 * FORGE — Redeploy Marketplace v3 + AuctionHouse v2 (post-audit fixes)
 *
 * Deploys:
 *   1. Marketplace v3  — royalty event emission + address encoding fixes
 *   2. AuctionHouse v2 — address encoding fix in getAuction()
 *
 * Keeps Factory, Template, StakingRewards unchanged.
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/deploy-audit-fixes.ts
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

/** Delay between deployments to let the first TX propagate */
const DEPLOY_DELAY_MS = 15_000;

// ─── Existing deployed addresses (NOT being redeployed) ─────────────────────

const EXISTING_FACTORY = 'opt1sqqq34d94cf540p7mck6muzg4j9zp5hnttqmaxd97';

// Old addresses being replaced
const OLD_MARKETPLACE = 'opt1sqqtgyxxfmjfnq9q2npgfaq3y6gthtxrvzqcnclrv';
const OLD_AUCTION_HOUSE = 'opt1sqqhkycklr6q4vs37gf2pjjl3mm729w9gh5tf7z37';

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

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function deployContract(
    label: string,
    wasmFile: string,
    calldata: BinaryWriter,
    wallet: any,
    provider: JSONRpcProvider,
): Promise<string> {
    console.log(`  Deploying ${label}...`);

    const bytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, wasmFile)),
    );
    console.log(`    Bytecode: ${bytecode.length.toLocaleString()} bytes`);

    const txFactory = new TransactionFactory();
    const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs available for ${label}. Fund: ${wallet.p2tr}`);
    }
    const totalSats = utxos.reduce((sum: bigint, u: any) => sum + BigInt(u.value), 0n);
    console.log(`    UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)`);

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
        calldata: calldata.getBuffer(),
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    console.log(`    Contract address: ${deployment.contractAddress}`);

    // Broadcast funding TX
    const fundingResult = await provider.sendRawTransaction(
        deployment.transaction[0], false,
    );
    const fid = typeof fundingResult === 'object'
        ? (fundingResult as any).result ?? (fundingResult as any).txid ?? JSON.stringify(fundingResult)
        : fundingResult;
    console.log(`    Funding TX: ${fid}`);
    if (typeof fundingResult === 'object' && !(fundingResult as any).success) {
        console.error(`    Warning: ${(fundingResult as any).error}`);
    }

    // Broadcast reveal TX
    const revealResult = await provider.sendRawTransaction(
        deployment.transaction[1], false,
    );
    const rid = typeof revealResult === 'object'
        ? (revealResult as any).result ?? (revealResult as any).txid ?? JSON.stringify(revealResult)
        : revealResult;
    console.log(`    Reveal TX:  ${rid}`);
    if (typeof revealResult === 'object' && !(revealResult as any).success) {
        console.error(`    Warning: ${(revealResult as any).error}`);
    }

    return deployment.contractAddress;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Post-Audit Deployment (Marketplace + Auction)   ║');
    console.log('  ╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // ── 1. Restore wallet ────────────────────────────────────────────

    console.log('[1/5] Restoring wallet from mnemonic...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}`);
    console.log('');

    // ── 2. Connect to testnet ────────────────────────────────────────

    console.log('[2/5] Connecting to OPNet testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });

    const blockNumber = await provider.getBlockNumber();
    console.log(`  RPC:          ${TESTNET_RPC}`);
    console.log(`  Block height: ${blockNumber}`);
    console.log('');

    // ── 3. Precompute calldata ───────────────────────────────────────

    const factoryU256 = bytesToBigInt(decodeOPNetAddress(EXISTING_FACTORY));
    const treasuryU256 = bytesToBigInt(decodeOPNetAddress(TREASURY_ADDRESS));
    console.log('[3/5] Calldata:');
    console.log(`  Factory u256:  ${padHex(factoryU256)}`);
    console.log(`  Treasury u256: ${padHex(treasuryU256)}`);
    console.log('');

    // ── 4. Deploy Marketplace v3 ─────────────────────────────────────

    console.log('[4/5] Marketplace v3 (royalty events + address encoding fix)');
    const mktCalldata = new BinaryWriter();
    mktCalldata.writeU256(factoryU256);
    mktCalldata.writeU256(treasuryU256);

    const newMarketplace = await deployContract(
        'Marketplace v3',
        'Marketplace.wasm',
        mktCalldata,
        wallet,
        provider,
    );

    console.log('');
    console.log(`  Waiting ${DEPLOY_DELAY_MS / 1000}s for UTXO propagation...`);
    await delay(DEPLOY_DELAY_MS);
    console.log('');

    // ── 5. Deploy AuctionHouse v2 ────────────────────────────────────

    console.log('[5/5] AuctionHouse v2 (address encoding fix in getAuction)');
    const auctionCalldata = new BinaryWriter();
    auctionCalldata.writeU256(factoryU256);

    const newAuctionHouse = await deployContract(
        'AuctionHouse v2',
        'AuctionHouse.wasm',
        auctionCalldata,
        wallet,
        provider,
    );

    // ── Output ───────────────────────────────────────────────────────

    console.log('');
    console.log('  ╔═══════════════════════════════════════════════════════════════╗');
    console.log('  ║   Post-Audit Deployment Complete!                              ║');
    console.log('  ╠═══════════════════════════════════════════════════════════════╣');
    console.log(`  ║  NEW Marketplace:   ${newMarketplace}`);
    console.log(`  ║  OLD Marketplace:   ${OLD_MARKETPLACE}`);
    console.log(`  ║  NEW AuctionHouse:  ${newAuctionHouse}`);
    console.log(`  ║  OLD AuctionHouse:  ${OLD_AUCTION_HOUSE}`);
    console.log('  ╠═══════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Factory (unchanged):  ${EXISTING_FACTORY}`);
    console.log(`  ║  Treasury:             ${TREASURY_ADDRESS}`);
    console.log('  ╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Save result
    const outputPath = path.resolve(__dirname, '..', 'deployed-audit-fixes.json');
    const output = {
        network: 'testnet',
        rpc: TESTNET_RPC,
        fixes: 'H2-H3 address encoding, C4 royalty events, H5 dead constant',
        old: {
            marketplace: OLD_MARKETPLACE,
            auctionHouse: OLD_AUCTION_HOUSE,
        },
        new: {
            marketplace: newMarketplace,
            auctionHouse: newAuctionHouse,
        },
        unchanged: {
            factory: EXISTING_FACTORY,
            template: 'opt1sqqcxeylzfcnghw8ju0prcup8mezle9np2ufq8cx0',
            staking: 'opt1sqz25ym058asfxwjy79aqv46vmalv2e35tuf63sx4',
            treasury: TREASURY_ADDRESS,
        },
        deployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`  Saved to: ${outputPath}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Update MARKETPLACE_ADDRESS + AUCTION_HOUSE_ADDRESS in backend/.env');
    console.log('    2. Update marketplace + auctionHouse in frontend/src/config/contracts.ts');
    console.log('    3. Update deployed-testnet.json with new addresses');
    console.log('    4. Restart backend indexer');
    console.log('');
}

main().catch((err) => {
    console.error('\n  Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
