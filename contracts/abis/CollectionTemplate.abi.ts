import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const CollectionTemplateEvents = [
    {
        name: 'Minted',
        values: [
            { name: 'minter', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
            { name: 'startTokenId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PhaseChanged',
        values: [{ name: 'newPhase', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Event,
    },
];

export const CollectionTemplateAbi = [
    {
        name: 'initialize',
        inputs: [
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'mintPrice', type: ABIDataTypes.UINT256 },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setCollectionInfo',
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'publicMint',
        payable: true,
        inputs: [{ name: 'quantity', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'startTokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'airdrop',
        inputs: [
            { name: 'recipient', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'startTokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setSalePhase',
        inputs: [{ name: 'phase', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setMintOpen',
        inputs: [{ name: 'open', type: ABIDataTypes.BOOL }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setMintPrice',
        inputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'collectionOwner',
        constant: true,
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'currentPrice',
        constant: true,
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isMintOpen',
        constant: true,
        inputs: [],
        outputs: [{ name: 'open', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'salePhase',
        constant: true,
        inputs: [],
        outputs: [{ name: 'phase', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'royaltyInfo',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isInitialized',
        constant: true,
        inputs: [],
        outputs: [{ name: 'initialized', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...CollectionTemplateEvents,
    ...OP_NET_ABI,
];

export default CollectionTemplateAbi;
