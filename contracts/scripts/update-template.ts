#!/usr/bin/env tsx
/**
 * FORGE — Update CollectionTemplate on Testnet
 *
 * Deploys the new CollectionTemplate WASM and calls factory.setTemplate()
 * to point the existing factory at the new template.
 *
 * Usage:
 *   cd D:\forge\contracts
 *   npx tsx scripts/update-template.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    Mnemonic,
    TransactionFactory,
    Address,
    AddressTypes,
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

const GAS_SAT_FEE = 50_000n;
const INTERACTION_GAS_SAT_FEE = 10_000n;
const FEE_RATE = 10;

// Existing factory address (already deployed, NOT changing)
const FACTORY_ADDRESS = 'opt1sqpjjmwccs72nxwvsfez60nfh7etlj72xzqy225va';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');

// ─── ABI for setTemplate ─────────────────────────────────────────────────────

const SET_TEMPLATE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setTemplate',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'templateAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];

// ─── Utilities ───────────────────────────────────────────────────────────────

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
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Update CollectionTemplate on Testnet            ║');
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // 1. Restore wallet
    console.log('[1/4] Restoring wallet...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  Deployer: ${wallet.p2tr}\n`);

    // 2. Connect
    console.log('[2/4] Connecting to testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });
    const blockNumber = await provider.getBlockNumber();
    console.log(`  Block: ${blockNumber}\n`);

    const txFactory = new TransactionFactory();
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs. Fund: ${wallet.p2tr}`);
    }
    const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    console.log(`  UTXOs: ${utxos.length}  (${totalSats.toLocaleString()} sats)\n`);

    // 3. Deploy new CollectionTemplate
    console.log('[3/4] Deploying updated CollectionTemplate...');
    const bytecode = new Uint8Array(
        fs.readFileSync(path.join(BUILD_DIR, 'CollectionTemplate.wasm')),
    );
    console.log(`  Bytecode: ${bytecode.length.toLocaleString()} bytes`);

    const deployChallenge = await provider.getChallenge();
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
        challenge: deployChallenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    const newTemplateAddress = deployment.contractAddress;
    console.log(`  New template: ${newTemplateAddress}`);

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

    utxos = deployment.utxos;
    console.log('  Template deployed!\n');

    // 4. Wait a bit for indexing, then call factory.setTemplate()
    console.log('[4/4] Calling factory.setTemplate(newTemplateAddress)...');
    console.log('  Waiting 30s for indexing...');
    await new Promise((r) => setTimeout(r, 30_000));

    const templateBytes = decodeOPNetAddress(newTemplateAddress);
    const templateAddr = Address.fromString(bytesToHex(templateBytes));

    const factoryProxy = getContract(
        FACTORY_ADDRESS,
        SET_TEMPLATE_ABI,
        provider,
        networks.opnetTestnet,
    );
    const setTemplateCalldata = factoryProxy.encodeCalldata(
        'setTemplate',
        [templateAddr],
    );

    const factoryBytes = decodeOPNetAddress(FACTORY_ADDRESS);
    const factoryHex = '0x' + bytesToHex(factoryBytes);

    const interactionChallenge = await provider.getChallenge();
    const interaction = await txFactory.signInteraction({
        from: wallet.p2tr,
        to: FACTORY_ADDRESS,
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

    if (interaction.fundingTransaction) {
        const intFundRes = await provider.sendRawTransaction(
            interaction.fundingTransaction, false,
        );
        const intFid = typeof intFundRes === 'object'
            ? (intFundRes as any).result ?? (intFundRes as any).txid ?? JSON.stringify(intFundRes)
            : intFundRes;
        console.log(`  Funding TX:     ${intFid}`);
    }
    const intRes = await provider.sendRawTransaction(
        interaction.interactionTransaction, false,
    );
    const intId = typeof intRes === 'object'
        ? (intRes as any).result ?? (intRes as any).txid ?? JSON.stringify(intRes)
        : intRes;
    console.log(`  Interaction TX: ${intId}`);
    console.log('  Template set on factory!\n');

    // ── Output ───────────────────────────────────────────────────────

    console.log('  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║   FORGE — Template Updated!                                     ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log(`  ║  Old Template:  opt1sqzzrvtxm36vp0ce60v3qfcyhyja4cf3r9sphk4y2`);
    console.log(`  ║  New Template:  ${newTemplateAddress}`);
    console.log(`  ║  Factory:       ${FACTORY_ADDRESS}`);
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
    if (existing.contracts) {
        existing.contracts.template = newTemplateAddress;
    } else {
        existing.contracts = { template: newTemplateAddress, factory: FACTORY_ADDRESS };
    }
    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`  Updated: ${outputPath}`);
    console.log('');
    console.log('  Next: Update frontend/src/config/contracts.ts with new template address');
    console.log('');
}

main().catch((err) => {
    console.error('\n  Deployment failed:\n');
    console.error(err);
    process.exit(1);
});
