import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult } from 'opnet';
import { IOP721Contract } from 'opnet';
import { OP_721_ABI } from 'opnet';
import type { Address } from '@btc-vision/transaction';

/**
 * CollectionTemplate v14 ABI — Lightweight OP721 for FORGE.
 *
 * initialize() takes 6 params (name, symbol, maxSupply, mintPrice, royaltyBps, royaltyRecipient).
 * Custom abort handler keeps error messages short — no more "Revert error too long".
 * Branding via changeMetadata() (OP721 base, optional separate TX).
 */
const COLLECTION_TEMPLATE_CUSTOM: BitcoinInterfaceAbi = [
    // ============ Write methods ============

    {
        name: 'initialize',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'mintPrice', type: ABIDataTypes.UINT256 },
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'setCollectionInfo',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'publicMint',
        type: BitcoinAbiTypes.Function,
        payable: true,
        inputs: [
            { name: 'quantity', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'startTokenId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'airdrop',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'recipient', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'startTokenId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'setMintOpen',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'open', type: ABIDataTypes.BOOL },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'setMintPrice',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    // Override base OP721 changeMetadata — SDK ABI has empty inputs[],
    // but btc-runtime reads 4 strings from calldata.
    {
        name: 'changeMetadata',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'icon', type: ABIDataTypes.STRING },
            { name: 'banner', type: ABIDataTypes.STRING },
            { name: 'description', type: ABIDataTypes.STRING },
            { name: 'website', type: ABIDataTypes.STRING },
        ],
        outputs: [],
    },
    {
        name: 'setSalePhase',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'phase', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },

    // ============ Read methods ============

    {
        name: 'collectionOwner',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
        ],
    },
    {
        name: 'currentPrice',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'isMintOpen',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'open', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'royaltyInfo',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
            { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
        ],
    },
    {
        name: 'salePhase',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'phase', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'isInitialized',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'initialized', type: ABIDataTypes.BOOL },
        ],
    },

    // ============ Events ============

    {
        name: 'Minted',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'minter', type: ABIDataTypes.ADDRESS },
            { name: 'quantity', type: ABIDataTypes.UINT256 },
            { name: 'startTokenId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'PhaseChanged',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'phase', type: ABIDataTypes.UINT256 },
        ],
    },
];

/**
 * Full ABI: base OP721 + custom FORGE methods.
 *
 * We filter changeMetadata from OP_721_ABI because the SDK definition has
 * empty inputs[], but the btc-runtime reads 4 strings. Our custom array
 * provides the corrected definition.
 */
export const COLLECTION_TEMPLATE_ABI: BitcoinInterfaceAbi = [
    ...OP_721_ABI.filter((m) => m.name !== 'changeMetadata'),
    ...COLLECTION_TEMPLATE_CUSTOM,
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

/**
 * ICollectionTemplateContract extends IOP721Contract with FORGE-specific methods.
 *
 * v14: initialize() takes 6 params (name, symbol + 4 numbers).
 * setCollectionInfo() kept for renaming but NOT needed in deploy flow.
 * Branding via changeMetadata(), base URI via setBaseURI() (both from OP721 base).
 */
export interface ICollectionTemplateContract extends Omit<IOP721Contract, 'changeMetadata'> {
    // Write methods — initialization (6 params: 2 strings + 4 numbers)
    initialize(
        name: string,
        symbol: string,
        maxSupply: bigint,
        mintPrice: bigint,
        royaltyBps: bigint,
        royaltyRecipient: Address,
    ): Promise<CallResult<{ success: boolean }>>;

    // Write methods — set name + symbol (separate TX from initialize)
    setCollectionInfo(
        name: string,
        symbol: string,
    ): Promise<CallResult<{ success: boolean }>>;

    // Write methods — minting
    publicMint(quantity: bigint): Promise<CallResult<{ startTokenId: bigint }>>;
    airdrop(recipient: Address | string, quantity: bigint): Promise<CallResult<{ startTokenId: bigint }>>;

    // Write methods — owner config
    setSalePhase(phase: bigint): Promise<CallResult<{ success: boolean }>>;
    setMintOpen(open: boolean): Promise<CallResult<{ success: boolean }>>;
    setMintPrice(price: bigint): Promise<CallResult<{ success: boolean }>>;

    // Corrected changeMetadata — SDK base has no params, btc-runtime reads 4 strings
    changeMetadata(icon: string, banner: string, description: string, website: string): Promise<CallResult<Record<string, never>>>;

    // Read methods
    collectionOwner(): Promise<CallResult<{ owner: string }>>;
    currentPrice(): Promise<CallResult<{ price: bigint }>>;
    isMintOpen(): Promise<CallResult<{ open: boolean }>>;
    salePhase(): Promise<CallResult<{ phase: bigint }>>;
    royaltyInfo(): Promise<CallResult<{ royaltyBps: bigint; royaltyRecipient: string }>>;
    isInitialized(): Promise<CallResult<{ initialized: boolean }>>;
}
