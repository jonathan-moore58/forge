#!/usr/bin/env tsx
/**
 * Poll for setTemplate confirmation, then test deployCollection on NanoFactory v3.
 */

import {
    Mnemonic,
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

const TESTNET_RPC = 'https://testnet.opnet.org';
const MNEMONIC_PHRASE =
    'boring this wonder armor almost illegal front dance latin naive camp mushroom';

// v3 addresses from deployed-testnet-v3.json
const FACTORY_ADDR = 'opt1sqquz6n9935t60ttc825769n6qrgnytvhryzrymy3';

const FACTORY_ABI: BitcoinInterfaceAbi = [
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
    {
        name: 'deploymentCount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
];

async function main(): Promise<void> {
    console.log('\n  ═══ FORGE v3 — Verify & Test NanoFactory ═══\n');

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
    console.log(`  Factory: ${FACTORY_ADDR}\n`);

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
    const MAX_ATTEMPTS = 12;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
            const tmpl = await factory.getTemplate();
            const templateValue = tmpl.properties?.template?.toString() ?? 'undefined';
            console.log(`  [Attempt ${attempts}] Block ${await provider.getBlockNumber()} — getTemplate() = ${templateValue}`);

            if (templateValue !== ZERO_ADDR && templateValue !== 'undefined' && templateValue !== '0') {
                console.log('  ✅ Template is SET!\n');

                // ── Test deployCollection ──
                console.log('  ▶ Testing deployCollection simulation...');
                try {
                    const result = await factory.deployCollection();

                    if (result.revert) {
                        console.log(`  ❌ Simulation REVERTED: ${result.revert}\n`);
                    } else {
                        console.log('  ✅✅✅ SIMULATION SUCCEEDED! ✅✅✅');
                        console.log(`  Collection address: ${JSON.stringify(result.properties)}`);
                        console.log('  The OOM bug is FIXED! NanoFactory works.\n');
                    }
                } catch (err: any) {
                    console.error(`  ❌ Simulation FAILED: ${err.message}`);
                    if (err.message.includes('out of memory')) {
                        console.log('\n  ℹ  OOM still occurs even with NanoFactory (19KB + 45KB = 64KB).');
                        console.log('  ℹ  VM limit may be lower than expected.');
                        console.log('  ℹ  Need to further reduce CollectionTemplate size.\n');
                    }
                }
                return;
            }
        } catch (err: any) {
            console.log(`  [Attempt ${attempts}] Error: ${err.message}`);
        }

        if (attempts >= MAX_ATTEMPTS) {
            console.log('  ❌ Template still zero after all attempts.\n');
            return;
        }

        console.log('  ⏳ Template still zero. Waiting 30s...\n');
        await new Promise(r => setTimeout(r, 30_000));
    }
}

main().catch((err) => {
    console.error('\n  ❌ Failed:\n');
    console.error(err);
    process.exit(1);
});
