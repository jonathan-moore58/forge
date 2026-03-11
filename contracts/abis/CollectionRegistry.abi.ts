import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const CollectionRegistryEvents = [];

export const CollectionRegistryAbi = [
    {
        name: 'register',
        inputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setVerified',
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'verified', type: ABIDataTypes.BOOL },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'removeCollection',
        inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'totalCollections',
        constant: true,
        inputs: [],
        outputs: [{ name: 'total', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCollection',
        constant: true,
        inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'registeredAt', type: ABIDataTypes.UINT256 },
            { name: 'verified', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCollectionByAddress',
        constant: true,
        inputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...CollectionRegistryEvents,
    ...OP_NET_ABI,
];

export default CollectionRegistryAbi;
