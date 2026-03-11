#!/usr/bin/env tsx
/**
 * Test simulating a deployCollection call to see if it OOMs on the VM.
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
const DEPLOYED_FACTORY = 'opt1sqz4yznmc2g38hmyygpjn42f5cwjw4k35ds0g0jzw';

const FACTORY_ABI: BitcoinInterfaceAbi = [
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
    {
        name: 'getTemplate',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'template', type: ABIDataTypes.ADDRESS }],
    },
];

async function main() {
    console.log('Setting up wallet...');
    const wallet = new Mnemonic(
        MNEMONIC_PHRASE,
        '',
        networks.opnetTestnet,
        MLDSASecurityLevel.LEVEL2,
    ).deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);

    console.log('Connecting to testnet...');
    const provider = new JSONRpcProvider({
        url: TESTNET_RPC,
        network: networks.opnetTestnet,
    });

    const factory = getContract<any>(
        DEPLOYED_FACTORY,
        FACTORY_ABI,
        provider,
        networks.opnetTestnet,
    );
    factory.setSender(wallet.address);

    // First verify template is set
    console.log('Checking template...');
    const template = await factory.getTemplate();
    console.log(`Template: ${JSON.stringify(template.properties)}`);

    if (template.properties?.template === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.error('Template not set!');
        process.exit(1);
    }

    // Set payment details (platform fee: 500,000 sats)
    factory.setTransactionDetails({
        inputs: [],
        outputs: [{
            index: 1,
            to: DEPLOYED_FACTORY,
            value: 500_000n,
            flags: 0,
        }],
    });

    // Try simulating deployCollection
    console.log('\nSimulating deployCollection...');
    console.log('  name: "Test Collection"');
    console.log('  symbol: "TEST"');
    console.log('  maxSupply: 100');
    console.log('  mintPrice: 10000 (sats)');
    console.log('  maxPerWallet: 5');
    console.log('  hiddenURI: "ipfs://placeholder"');
    console.log('  royaltyBps: 500 (5%)');
    console.log('  teamReserve: 10');

    try {
        const result = await factory.deployCollection(
            'Test Collection',
            'TEST',
            100n,
            10000n,
            5n,
            'ipfs://placeholder',
            500n,
            10n,
        );

        console.log('\n✅ Simulation succeeded!');
        console.log(`Properties: ${JSON.stringify(result.properties)}`);
        console.log(`Revert: ${result.revert ?? '(none)'}`);
        console.log(`Gas used: ${result.gasUsed}`);
    } catch (err: any) {
        console.error(`\n❌ Simulation failed: ${err.message}`);
        console.error(err);
    }
}

main().catch(console.error);
