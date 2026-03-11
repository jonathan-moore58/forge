#!/usr/bin/env tsx
/**
 * FORGE — Testnet Deployment Script (v5 — Factory Cloning)
 *
 * Deploys 6 platform contracts in dependency order:
 *   1. CollectionTemplate  (no calldata — this is the clone source)
 *   2. NFTFactory          (no calldata — collection factory + registry)
 *      2b. factory.setTemplate(templateAddr)
 *   3. Marketplace         (calldata: factoryAddr u256, treasuryAddr u256)
 *   4. AuctionHouse        (calldata: factoryAddr u256)
 *   5. StakingRewards      (no calldata)
 *   6. NFTLending          (no calldata)
 *
 * After deployment, creators use factory.createCollection() to deploy
 * new collections in a single transaction (factory cloning pattern).
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/deploy-testnet.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

// ─── VPN Workaround ─────────────────────────────────────────────────────────
// Hotspot Shield VPN routes traffic via Windows Schannel (used by curl) but
// Node.js uses its own bundled OpenSSL which bypasses the VPN adapter.
// Override global fetch to shell out to curl so all RPC calls go through VPN.

let _globalReqCounter = 0;
const _originalFetch = globalThis.fetch;
globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> => {
    const url =
        typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.toString()
                : (input as Request).url;

    const method = init?.method ?? 'GET';
    const body = init?.body;

    const args: string[] = ['-s', '-S', '--connect-timeout', '30', '-X', method];

    // Forward headers
    if (init?.headers) {
        const h =
            init.headers instanceof Headers
                ? Object.fromEntries(init.headers.entries())
                : Array.isArray(init.headers)
                    ? Object.fromEntries(init.headers)
                    : (init.headers as Record<string, string>);
        for (const [k, v] of Object.entries(h)) {
            args.push('-H', `${k}: ${v}`);
        }
    }

    // Forward body — use temp file for large payloads (Windows 32KB cmd limit)
    let tmpFile: string | null = null;
    if (body) {
        const bodyStr =
            typeof body === 'string'
                ? body
                : body instanceof ArrayBuffer || body instanceof Uint8Array
                    ? Buffer.from(body as ArrayBuffer).toString('utf8')
                    : String(body);
        if (bodyStr.length > 8000) {
            tmpFile = path.join(os.tmpdir(), `curl-gfetch-${process.pid}-${++_globalReqCounter}.json`);
            fs.writeFileSync(tmpFile, bodyStr, 'utf8');
            args.push('-d', `@${tmpFile}`);
        } else {
            args.push('-d', bodyStr);
        }
    }

    // Include response headers so we can parse status
    args.push('-w', '\n%{http_code}');
    args.push(url);

    try {
        const raw = execFileSync('curl', args, {
            encoding: 'utf8',
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
        });

        // Last line is the HTTP status code
        const lines = raw.trimEnd().split('\n');
        const statusCode = parseInt(lines.pop() ?? '200', 10);
        const responseBody = lines.join('\n');

        return new Response(responseBody, {
            status: statusCode,
            headers: { 'content-type': 'application/json' },
        });
    } catch (err) {
        console.error('[curl-fetch] Error:', (err as Error).message);
        throw new TypeError('fetch failed (curl fallback)');
    } finally {
        if (tmpFile) {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
    }
};

import {
    Mnemonic,
    TransactionFactory,
    BinaryWriter,
    AddressTypes,
    Address,
} from '@btc-vision/transaction';
import { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
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

/** Gas fee for each deployment (in sats). */
const GAS_SAT_FEE = 50_000n;

/** Fee rate in sat/vB for the Bitcoin transactions. */
const FEE_RATE = 10;

/** Max sats for contract calls (setTemplate) */
const MAX_SATS_PER_TX = 100_000n;

// ─── Resume: already-deployed addresses (set to skip re-deployment) ──────────
// Set to empty string '' to deploy fresh, or set to the contract address to skip.
const ALREADY_DEPLOYED = {
    template: 'opt1sqp8wuaggm9zwcjkwmqgprgnaqv3ahpxhu5rnmkqc',
    factory: 'opt1sqqewmpmd2vwg67fflwdmu202nwhajrqw2yd9esez',
    marketplace: 'opt1sqrj0pqrzjvytds6l09r8n3mpfwzp0qpqsgy6a70q',
    auctionHouse: 'opt1sqrnk0fma3tkpkfgpsqswhcn5n5zhpcmdnyeanrf3',
    staking: 'opt1sqrnqrnxwcyg6ge6f6j2efhmsjfg6xa7u6yyhs6rz',
    lending: 'opt1sqp49e6ftwtpt8f9sc8plzqu5rtdrp7zn05wyjzrp',
};

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// ─── setTemplate ABI ─────────────────────────────────────────────────────────

const SET_TEMPLATE_ABI = [
    {
        name: 'setTemplate',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'templateAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Decode an OPNet bech32m address to raw bytes, left-padded to 32 bytes.
 */
function decodeOPNetAddress(addr: string): Uint8Array {
    const decoded = bech32m.decode(addr, addr.length);
    const rawBytes = bech32m.fromWords(decoded.words.slice(1));
    const padded = new Uint8Array(32);
    padded.set(rawBytes, 32 - rawBytes.length);
    return padded;
}

/** Convert raw bytes (big-endian) to a BigInt. */
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

/** Convert a bech32m address to a hex string for Address.fromString() */
function bech32mToHex(addr: string): string {
    const bytes = decodeOPNetAddress(addr);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Testnet Deployment (v5 Factory Cloning)    ║');
    console.log('  ╚═══════════════════════════════════════════════════════╝');
    console.log('');

    // ── 1. Restore wallet from mnemonic ──────────────────────────────

    console.log('[1/9] Restoring wallet from mnemonic...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',                          // no passphrase
        networks.opnetTestnet,       // OPNet testnet (opt1 addresses)
        MLDSASecurityLevel.LEVEL2,   // ML-DSA-65 (quantum-resistant)
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer taproot: ${wallet.p2tr}`);
    console.log('');

    // ── 2. Connect to testnet ────────────────────────────────────────

    console.log('[2/9] Connecting to OPNet testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });

    const blockNumber = await provider.getBlockNumber();
    console.log(`  RPC:          ${TESTNET_RPC}`);
    console.log(`  Block height: ${blockNumber}`);
    console.log('');

    // ── 3. Load WASM bytecodes ───────────────────────────────────────

    console.log('[3/9] Loading contract bytecodes...');
    const contractNames = [
        'CollectionTemplate',
        'NFTFactory',
        'Marketplace',
        'AuctionHouse',
        'StakingRewards',
        'NFTLending',
    ] as const;
    const bytecodes: Record<string, Uint8Array> = {};

    for (const name of contractNames) {
        const wasmPath = path.join(BUILD_DIR, `${name}.wasm`);
        if (!fs.existsSync(wasmPath)) {
            throw new Error(
                `Missing WASM: ${wasmPath}\n  Run 'npm run build' first.`,
            );
        }
        bytecodes[name] = new Uint8Array(fs.readFileSync(wasmPath));
        console.log(`  ${name}.wasm — ${bytecodes[name].length.toLocaleString()} bytes`);
    }
    console.log('');

    // ── 4. Prepare treasury address ──────────────────────────────────

    console.log('[4/9] Preparing treasury address...');
    const treasuryBytes = decodeOPNetAddress(TREASURY_ADDRESS);
    const treasuryU256 = bytesToBigInt(treasuryBytes);
    console.log(`  Treasury bech32m: ${TREASURY_ADDRESS}`);
    console.log(`  Treasury u256:    ${padHex(treasuryU256)}`);
    console.log('');

    // ── Deploy helper ────────────────────────────────────────────────

    const txFactory = new TransactionFactory();
    const deployed: Record<string, string> = {};

    // Fetch initial UTXOs
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(
            `No UTXOs available. Fund the deployer wallet on OPNet testnet:\n` +
            `  Address: ${wallet.p2tr}`,
        );
    }
    const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)\n`);

    async function deployContract(
        name: string,
        bytecode: Uint8Array,
        calldata?: Uint8Array,
    ): Promise<string> {
        console.log(`  ▶ Deploying ${name}...`);
        console.log(`    Bytecode: ${bytecode.length.toLocaleString()} bytes`);

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
            calldata,
            challenge,
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: true,
        });

        console.log(`    Contract: ${deployment.contractAddress}`);

        // Broadcast funding transaction
        const fundingResult = await provider.sendRawTransaction(
            deployment.transaction[0],
            false,
        );
        const fid = typeof fundingResult === 'object'
            ? (fundingResult as any).result ?? (fundingResult as any).txid ?? JSON.stringify(fundingResult)
            : fundingResult;
        console.log(`    Funding TX: ${fid}`);
        if (typeof fundingResult === 'object' && !(fundingResult as any).success) {
            console.error(`    Warning: ${(fundingResult as any).error}`);
        }

        // Broadcast reveal transaction
        const revealResult = await provider.sendRawTransaction(
            deployment.transaction[1],
            false,
        );
        const rid = typeof revealResult === 'object'
            ? (revealResult as any).result ?? (revealResult as any).txid ?? JSON.stringify(revealResult)
            : revealResult;
        console.log(`    Reveal TX:  ${rid}`);
        if (typeof revealResult === 'object' && !(revealResult as any).success) {
            console.error(`    Warning: ${(revealResult as any).error}`);
        }

        // Chain UTXOs from deployment for next contract
        utxos = deployment.utxos;

        console.log(`    ✔ ${name} deployed!\n`);
        return deployment.contractAddress;
    }

    // ── Helper: wait for next block ──────────────────────────────────

    async function waitForNextBlock(label: string): Promise<void> {
        const startBlock = await provider.getBlockNumber();
        console.log(`  ⏳ Waiting for next block after ${label} (current: ${startBlock})...`);
        const maxWait = 180_000; // 3 minutes
        const pollInterval = 10_000; // 10 seconds
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            await new Promise((r) => setTimeout(r, pollInterval));
            const current = await provider.getBlockNumber();
            if (current > startBlock) {
                console.log(`  ✔ Block ${current} mined.\n`);
                return;
            }
        }
        console.log('  ⚠ Timeout waiting for block — continuing anyway...\n');
    }

    // ── 5. Deploy CollectionTemplate (clone source) ──────────────────

    console.log('[5/9] Deploying CollectionTemplate (clone source)...');
    if (ALREADY_DEPLOYED.template) {
        deployed.template = ALREADY_DEPLOYED.template;
        console.log(`  ⏭ Skipping (already deployed): ${deployed.template}\n`);
    } else {
        deployed.template = await deployContract('CollectionTemplate', bytecodes.CollectionTemplate);
    }

    // ── 6. Deploy NFTFactory (factory + registry) ────────────────────

    console.log('[6/9] Deploying NFTFactory...');
    if (ALREADY_DEPLOYED.factory) {
        deployed.factory = ALREADY_DEPLOYED.factory;
        console.log(`  ⏭ Skipping (already deployed): ${deployed.factory}\n`);
    } else {
        deployed.factory = await deployContract('NFTFactory', bytecodes.NFTFactory);
        // Wait for the factory deployment to be mined before calling setTemplate
        await waitForNextBlock('NFTFactory deploy');
    }

    // Ensure factory is confirmed before calling setTemplate
    // (even when resuming, if block hasn't advanced the contract isn't queryable yet)
    {
        let factoryReady = false;
        const maxRetries = 30; // 30 × 10s = 5 minutes
        for (let i = 0; i < maxRetries; i++) {
            try {
                const info = await provider.getPublicKeyInfo(deployed.factory, true);
                console.log(`  ✔ Got public key info:`, info?.toString?.() ?? String(info));
                factoryReady = true;
                break;
            } catch (err) {
                const msg = (err as Error).message ?? String(err);
                if (i === 0) {
                    console.log('  ⏳ Waiting for factory to be confirmed (needs next block)...');
                }
                if (i % 3 === 0) {
                    console.log(`    Attempt ${i + 1}: ${msg.slice(0, 150)}`);
                }
                await new Promise((r) => setTimeout(r, 10_000));
            }
        }
        if (!factoryReady) {
            throw new Error('Factory contract not confirmed after 5 minutes. Try again later.');
        }
        console.log('  ✔ Factory confirmed on-chain.\n');
    }

    // Refresh UTXOs
    utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

    // ── 6b. Call factory.setTemplate(templateAddr) ───────────────────

    console.log('  ▶ Setting template on factory...');
    const templateHex = bech32mToHex(deployed.template);
    const templateAddress = Address.fromString(templateHex);

    // Resolve sender address to Address object (needed for simulation call)
    const senderAddress = await provider.getPublicKeyInfo(wallet.p2tr, false);

    const factory = getContract(
        deployed.factory,
        SET_TEMPLATE_ABI,
        provider,
        networks.opnetTestnet,
        senderAddress,
    );

    const setTemplateSim = await (factory as any).setTemplate(templateAddress);
    if (setTemplateSim.revert) {
        throw new Error(`setTemplate reverted: ${setTemplateSim.revert}`);
    }

    const setTemplateReceipt = await setTemplateSim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: MAX_SATS_PER_TX,
        network: networks.opnetTestnet,
        feeRate: FEE_RATE,
    });
    console.log(`    setTemplate TX: ${setTemplateReceipt.transactionId}`);
    console.log(`    ✔ Template set on factory!\n`);

    // Refresh UTXOs after setTemplate TX
    utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

    // ── 7. Deploy Marketplace + AuctionHouse ─────────────────────────

    console.log('[7/9] Deploying Marketplace + AuctionHouse...');

    const factoryBytes = decodeOPNetAddress(deployed.factory);
    const factoryU256 = bytesToBigInt(factoryBytes);
    console.log(`  Factory u256: ${padHex(factoryU256)}`);

    if (ALREADY_DEPLOYED.marketplace) {
        deployed.marketplace = ALREADY_DEPLOYED.marketplace;
        console.log(`  ⏭ Skipping Marketplace (already deployed): ${deployed.marketplace}\n`);
    } else {
        // Marketplace calldata: [factoryAddress(u256), feeRecipient(u256)]
        const mktCalldata = new BinaryWriter();
        mktCalldata.writeU256(factoryU256);
        mktCalldata.writeU256(treasuryU256);
        deployed.marketplace = await deployContract(
            'Marketplace',
            bytecodes.Marketplace,
            mktCalldata.getBuffer(),
        );
    }

    if (ALREADY_DEPLOYED.auctionHouse) {
        deployed.auctionHouse = ALREADY_DEPLOYED.auctionHouse;
        console.log(`  ⏭ Skipping AuctionHouse (already deployed): ${deployed.auctionHouse}\n`);
    } else {
        // AuctionHouse calldata: [factoryAddress(u256)]
        const auctionCalldata = new BinaryWriter();
        auctionCalldata.writeU256(factoryU256);
        deployed.auctionHouse = await deployContract(
            'AuctionHouse',
            bytecodes.AuctionHouse,
            auctionCalldata.getBuffer(),
        );
    }

    // ── 8. Deploy StakingRewards (no calldata) ───────────────────────

    console.log('[8/9] Deploying StakingRewards...');
    if (ALREADY_DEPLOYED.staking) {
        deployed.staking = ALREADY_DEPLOYED.staking;
        console.log(`  ⏭ Skipping (already deployed): ${deployed.staking}\n`);
    } else {
        deployed.staking = await deployContract(
            'StakingRewards',
            bytecodes.StakingRewards,
        );
    }

    // ── 9. Deploy NFTLending (calldata: feeRecipient u256) ───────────

    console.log('[9/9] Deploying NFTLending...');
    if (ALREADY_DEPLOYED.lending) {
        deployed.lending = ALREADY_DEPLOYED.lending;
        console.log(`  ⏭ Skipping (already deployed): ${deployed.lending}\n`);
    } else {
        const lendingCalldata = new BinaryWriter();
        lendingCalldata.writeU256(treasuryU256); // feeRecipient = treasury
        deployed.lending = await deployContract(
            'NFTLending',
            bytecodes.NFTLending,
            lendingCalldata.getBuffer(),
        );
    }

    // ── Output results ───────────────────────────────────────────────

    console.log('');
    console.log('  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Testnet Deployment Complete! (v5 Factory Cloning)   ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  CollectionTemplate: ${deployed.template}`);
    console.log(`  ║  NFTFactory:         ${deployed.factory}`);
    console.log(`  ║  Marketplace:        ${deployed.marketplace}`);
    console.log(`  ║  AuctionHouse:       ${deployed.auctionHouse}`);
    console.log(`  ║  StakingRewards:     ${deployed.staking}`);
    console.log(`  ║  NFTLending:         ${deployed.lending}`);
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Treasury:           ${TREASURY_ADDRESS}`);
    console.log('  ║  Factory cloning:    factory.createCollection() → 1 TX!');
    console.log('  ╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Write addresses to JSON for easy consumption
    const outputPath = path.resolve(__dirname, '..', 'deployed-testnet.json');
    const output = {
        network: 'testnet',
        rpc: TESTNET_RPC,
        treasury: TREASURY_ADDRESS,
        contracts: deployed,
        note: '2-TX flow: TX1 factory.createCollection(salt), TX2 collection.initialize(11 params).',
        deployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`  Addresses saved to: ${outputPath}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Copy addresses into frontend/src/config/contracts.ts');
    console.log('    2. Update backend/.env with new contract addresses');
    console.log('    3. Restart backend indexer');
    console.log('');
}

main().catch((err) => {
    console.error('\n  Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
