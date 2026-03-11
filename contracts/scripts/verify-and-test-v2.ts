#!/usr/bin/env tsx
/**
 * Verify setTemplate is confirmed, then test deployCollection simulation.
 * Polls every 30s until template is non-zero.
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

const TESTNET_RPC = 'https://testnet.opnet.org';
const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';

const FACTORY_ADDR = 'opt1sqqne3fnvy92xuy9l5sglxnmg678xps27hya29csp';
const TEMPLATE_ADDR = 'opt1sqrahnd2hu7cuu2gj2drl8dqj0kyawgd50crw4hmd';

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
        payable: true,
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'mintPrice', type: ABIDataTypes.UINT256 },
            { name: 'maxPerWallet', type: ABIDataTypes.UINT256 },
            { name: 'hiddenURI', type: ABIDataTypes.STRING },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'teamReserve', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
    },
];

async function main(): Promise<void> {
    console.log('\n  ═══ FORGE v2 — Verify & Test ═══\n');

    const wallet = new Mnemonic(
        MNEMONIC_PHRASE, '', networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);

    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });

    const block = await provider.getBlockNumber();
    console.log(`  Block: ${block}`);
    console.log(`  Factory: ${FACTORY_ADDR}`);
    console.log(`  Template: ${TEMPLATE_ADDR}\n`);

    const factory = getContract<any>(
        FACTORY_ADDR,
        FACTORY_ABI,
        provider,
        networks.opnetTestnet,
    );
    factory.setSender(wallet.address);

    // ── Poll for template ──
    const ZERO_ADDR = '0x' + '0'.repeat(64);
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        const tmpl = await factory.getTemplate();
        const templateValue = tmpl.properties?.template?.toString() ?? 'undefined';
        console.log(`  [Attempt ${attempts}] getTemplate() = ${templateValue}`);

        if (templateValue !== ZERO_ADDR && templateValue !== 'undefined' && templateValue !== '0') {
            console.log('  ✅ Template is SET!\n');
            break;
        }

        if (attempts >= MAX_ATTEMPTS) {
            console.log('  ❌ Template still zero after all attempts. setTemplate may not have confirmed.');
            console.log('  Try running the setTemplate script again.\n');
            return;
        }

        console.log('  ⏳ Template still zero. Waiting 30s...\n');
        await new Promise(r => setTimeout(r, 30_000));
    }

    // ── Test deployCollection simulation ──
    console.log('  ▶ Testing deployCollection simulation...');
    factory.setTransactionDetails({
        inputs: [],
        outputs: [{ index: 1, to: FACTORY_ADDR, value: 500_000n, flags: 0 }],
    });

    try {
        const result = await factory.deployCollection(
            'Test Collection', 'TEST', 100n, 10000n, 5n,
            'ipfs://placeholder', 500n, 10n,
        );

        if (result.revert) {
            console.log(`  ❌ Simulation REVERTED: ${result.revert}\n`);
        } else {
            console.log('  ✅ SIMULATION SUCCEEDED!');
            console.log(`  Properties: ${JSON.stringify(result.properties)}\n`);
        }
    } catch (err: any) {
        console.error(`  ❌ Simulation FAILED: ${err.message}\n`);

        // If OOM, check contract sizes
        if (err.message.includes('out of memory')) {
            console.log('  ℹ  OOM persists even without Blockchain.call(initialize).');
            console.log('  ℹ  The template WASM (45KB) + factory WASM (25KB) = 70KB total');
            console.log('  ℹ  This exceeds the VM memory limit.');
            console.log('  ℹ  Need to further reduce CollectionTemplate size.\n');
        }
    }
}

main().catch((err) => {
    console.error('\n  ❌ Failed:\n');
    console.error(err);
    process.exit(1);
});
