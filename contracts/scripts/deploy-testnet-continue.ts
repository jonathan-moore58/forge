#!/usr/bin/env tsx
/**
 * FORGE — Testnet Deployment Continuation
 *
 * Picks up after CollectionTemplate + NFTFactory were deployed.
 * Steps:
 *   1. Call factory.setTemplate(templateAddress)
 *   2. Deploy Marketplace   (calldata: factoryAddr, treasuryAddr)
 *   3. Deploy AuctionHouse  (calldata: factoryAddr)
 *   4. Deploy StakingRewards (no calldata)
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/deploy-testnet-continue.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    Mnemonic,
    TransactionFactory,
    BinaryWriter,
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

const TREASURY_ADDRESS =
    'opt1pee9mrlhfxkmfqdssjsr8gwedewn2mgk08rrqla29rg0fjry29ths0cjdrz';

const GAS_SAT_FEE = 50_000n;
const INTERACTION_GAS_SAT_FEE = 10_000n;
const FEE_RATE = 10;

// ─── Already-deployed addresses from previous run ────────────────────────────

const DEPLOYED_TEMPLATE = 'opt1sqzzrvtxm36vp0ce60v3qfcyhyja4cf3r9sphk4y2';
const DEPLOYED_FACTORY  = 'opt1sqpjjmwccs72nxwvsfez60nfh7etlj72xzqy225va';

// ─── ABI for setTemplate ─────────────────────────────────────────────────────

const SET_TEMPLATE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setTemplate',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'templateAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];

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

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

function padHex(n: bigint): string {
    return '0x' + n.toString(16).padStart(64, '0');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Testnet Deployment (Continuation)               ║');
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Template:  ${DEPLOYED_TEMPLATE}`);
    console.log(`  Factory:   ${DEPLOYED_FACTORY}`);
    console.log('');

    // ── 1. Restore wallet ────────────────────────────────────────────

    console.log('[1/5] Restoring wallet...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}\n`);

    // ── 2. Connect ───────────────────────────────────────────────────

    console.log('[2/5] Connecting to testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const blockNumber = await provider.getBlockNumber();
    console.log(`  Block: ${blockNumber}\n`);

    // ── Setup ────────────────────────────────────────────────────────

    const txFactory = new TransactionFactory();
    const deployed: Record<string, string> = {
        template: DEPLOYED_TEMPLATE,
        factory: DEPLOYED_FACTORY,
    };

    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs. Fund: ${wallet.p2tr}`);
    }
    const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)\n`);

    // Prepare treasury
    const treasuryBytes = decodeOPNetAddress(TREASURY_ADDRESS);
    const treasuryU256 = bytesToBigInt(treasuryBytes);

    // ── Deploy helper ────────────────────────────────────────────────

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

        // Broadcast funding
        const fundingResult = await provider.sendRawTransaction(
            deployment.transaction[0], false,
        );
        const fid = typeof fundingResult === 'object'
            ? (fundingResult as any).result ?? (fundingResult as any).txid ?? JSON.stringify(fundingResult)
            : fundingResult;
        console.log(`    Funding TX: ${fid}`);

        // Broadcast reveal
        const revealResult = await provider.sendRawTransaction(
            deployment.transaction[1], false,
        );
        const rid = typeof revealResult === 'object'
            ? (revealResult as any).result ?? (revealResult as any).txid ?? JSON.stringify(revealResult)
            : revealResult;
        console.log(`    Reveal TX:  ${rid}`);

        utxos = deployment.utxos;
        console.log(`    ✔ ${name} deployed!\n`);
        return deployment.contractAddress;
    }

    // ── 3. Call factory.setTemplate(templateAddress) ─────────────────

    console.log('[3/5] Calling factory.setTemplate(templateAddress)...');

    // Convert template bech32m to Address object
    const templateBytes = decodeOPNetAddress(DEPLOYED_TEMPLATE);
    const templateAddr = Address.fromString(bytesToHex(templateBytes));

    // Encode calldata via contract proxy
    const factoryProxy = getContract(
        DEPLOYED_FACTORY,
        SET_TEMPLATE_ABI,
        provider,
        networks.opnetTestnet,
    );
    const setTemplateCalldata = factoryProxy.encodeCalldata(
        'setTemplate',
        [templateAddr],
    );

    // The 'contract' param must be a 32-byte hex string of the contract address
    const factoryBytes = decodeOPNetAddress(DEPLOYED_FACTORY);
    const factoryHex = '0x' + bytesToHex(factoryBytes);
    console.log(`  Factory hex: ${factoryHex}`);

    // Sign interaction with chained UTXOs
    const interactionChallenge = await provider.getChallenge();
    const interaction = await txFactory.signInteraction({
        from: wallet.p2tr,
        to: DEPLOYED_FACTORY,
        contract: factoryHex,
        utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: networks.opnetTestnet,
        feeRate: FEE_RATE,
        priorityFee: 0n,
        gasSatFee: INTERACTION_GAS_SAT_FEE,
        calldata: setTemplateCalldata,
        challenge: interactionChallenge,
    });

    // Broadcast
    if (interaction.fundingTransaction) {
        const fundRes = await provider.sendRawTransaction(
            interaction.fundingTransaction, false,
        );
        const fid = typeof fundRes === 'object'
            ? (fundRes as any).result ?? (fundRes as any).txid ?? JSON.stringify(fundRes)
            : fundRes;
        console.log(`  Funding TX:     ${fid}`);
    }
    const intRes = await provider.sendRawTransaction(
        interaction.interactionTransaction, false,
    );
    const intId = typeof intRes === 'object'
        ? (intRes as any).result ?? (intRes as any).txid ?? JSON.stringify(intRes)
        : intRes;
    console.log(`  Interaction TX: ${intId}`);
    utxos = interaction.nextUTXOs;
    console.log('  ✔ Template set on factory!\n');

    // ── 4. Deploy Marketplace + AuctionHouse ─────────────────────────

    console.log('[4/5] Deploying Marketplace + AuctionHouse...');

    const factoryU256 = bytesToBigInt(decodeOPNetAddress(DEPLOYED_FACTORY));
    console.log(`  Factory u256: ${padHex(factoryU256)}`);

    // Marketplace calldata: [factoryAddress, feeRecipient]
    const mktCalldata = new BinaryWriter();
    mktCalldata.writeU256(factoryU256);
    mktCalldata.writeU256(treasuryU256);

    const mktBytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'Marketplace.wasm')),
    );
    deployed.marketplace = await deployContract(
        'Marketplace', mktBytecode, mktCalldata.getBuffer(),
    );

    // AuctionHouse calldata: [factoryAddress]
    const auctionCalldata = new BinaryWriter();
    auctionCalldata.writeU256(factoryU256);

    const auctionBytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'AuctionHouse.wasm')),
    );
    deployed.auctionHouse = await deployContract(
        'AuctionHouse', auctionBytecode, auctionCalldata.getBuffer(),
    );

    // ── 5. Deploy StakingRewards ─────────────────────────────────────

    console.log('[5/5] Deploying StakingRewards...');
    const stakingBytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'StakingRewards.wasm')),
    );
    deployed.staking = await deployContract('StakingRewards', stakingBytecode);

    // ── Output ───────────────────────────────────────────────────────

    console.log('');
    console.log('  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Testnet Deployment Complete!                          ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  CollectionTemplate: ${deployed.template}`);
    console.log(`  ║  NFTFactory:         ${deployed.factory}`);
    console.log(`  ║  Marketplace:        ${deployed.marketplace}`);
    console.log(`  ║  AuctionHouse:       ${deployed.auctionHouse}`);
    console.log(`  ║  StakingRewards:     ${deployed.staking}`);
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Treasury:           ${TREASURY_ADDRESS}`);
    console.log(`  ║  Template set:       ✔ factory.setTemplate() called`);
    console.log('  ╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Write addresses to JSON
    const outputPath = path.resolve(__dirname, '..', 'deployed-testnet.json');
    const output = {
        network: 'testnet',
        rpc: TESTNET_RPC,
        treasury: TREASURY_ADDRESS,
        contracts: deployed,
        deployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`  Addresses saved to: ${outputPath}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Copy addresses into frontend/src/config/contracts.ts');
    console.log('    2. Run: cd ../frontend && npm run build');
    console.log('');
}

main().catch((err) => {
    console.error('\n  ❌ Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
