import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import { Address } from '@btc-vision/transaction';

/**
 * NFTFactory v8 ABI — Deploy-only factory (2-TX flow).
 *
 * Flow:
 *   TX1: factory.createCollection(salt) → deploys + registers → returns address
 *   TX2: collection.initialize(11 params) → configures the collection
 *
 * Also supports registerCollection() for manually deployed collections.
 */
export const NFT_FACTORY_ABI: BitcoinInterfaceAbi = [
    // --- Write methods ---
    {
        name: 'createCollection',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'salt', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
    },
    {
        name: 'registerCollection',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'setTemplate',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'templateAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },

    // --- Read methods ---
    {
        name: 'isRegistered',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'registered', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'collectionCount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getTemplate',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'templateAddress', type: ABIDataTypes.ADDRESS },
        ],
    },

    // --- Events ---
    {
        name: 'CollectionCreated',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

export interface CreateCollectionResultData {
    [key: string]: DecodedCallResult;
    collectionAddress: Address;
}
export type CreateCollectionResult = CallResult<CreateCollectionResultData>;

export interface RegisterCollectionResultData {
    [key: string]: DecodedCallResult;
    collectionId: bigint;
}
export type RegisterCollectionResult = CallResult<RegisterCollectionResultData>;

export interface INFTFactoryContract extends BaseContractProperties {
    /** Deploy a new collection from template (TX1 of 2-TX flow) */
    createCollection(salt: bigint): Promise<CreateCollectionResult>;

    /** Register an externally-deployed collection (backward compat) */
    registerCollection(collectionAddress: Address): Promise<RegisterCollectionResult>;

    /** Set the template contract address (admin only) */
    setTemplate(templateAddress: Address): Promise<CallResult<{ success: boolean }>>;

    /** Check if a collection is registered */
    isRegistered(collectionAddress: Address): Promise<CallResult<{ registered: boolean }>>;

    /** Get total registered collection count */
    collectionCount(): Promise<CallResult<{ count: bigint }>>;

    /** Get the template contract address */
    getTemplate(): Promise<CallResult<{ templateAddress: Address }>>;
}
