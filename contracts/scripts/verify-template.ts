#!/usr/bin/env tsx
import { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const FACTORY_ABI = [
    { name: 'getTemplate', type: BitcoinAbiTypes.Function, constant: true, inputs: [], outputs: [{ name: 'template', type: ABIDataTypes.ADDRESS }] },
    { name: 'deploymentCount', type: BitcoinAbiTypes.Function, constant: true, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
    { name: 'totalCollections', type: BitcoinAbiTypes.Function, constant: true, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
];

async function main() {
    const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });
    const factory = getContract<any>(
        'opt1sqz4yznmc2g38hmyygpjn42f5cwjw4k35ds0g0jzw',
        FACTORY_ABI,
        provider,
        networks.opnetTestnet,
    );

    console.log('Querying factory state...\n');

    const template = await factory.getTemplate();
    console.log('getTemplate:', JSON.stringify(template.properties));
    console.log('revert:', template.revert ?? '(none)');
    console.log('');

    const count = await factory.deploymentCount();
    console.log('deploymentCount:', JSON.stringify(count.properties));
    console.log('');

    const total = await factory.totalCollections();
    console.log('totalCollections:', JSON.stringify(total.properties));
}

main().catch(console.error);
