import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import type { Address } from '@btc-vision/transaction';

/**
 * ABI for FORGE CollectionRegistry — lightweight on-chain discovery.
 *
 * Methods:
 * - register: register a deployed collection (verifies ownership via cross-contract call)
 * - setVerified / removeCollection: admin only
 * - totalCollections / getCollection / getCollectionByAddress: view getters
 */
export const COLLECTION_REGISTRY_ABI: BitcoinInterfaceAbi = [
    // ============ Write methods ============

    {
        name: 'register',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'setVerified',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'verified', type: ABIDataTypes.BOOL },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'removeCollection',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },

    // ============ Read methods ============

    {
        name: 'totalCollections',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'total', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getCollection',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'registeredAt', type: ABIDataTypes.UINT256 },
            { name: 'verified', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'getCollectionByAddress',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

/** Data returned by getCollection() */
export interface RegistryCollectionData {
    [key: string]: DecodedCallResult;
    collectionAddress: string;
    creator: string;
    registeredAt: bigint;
    verified: boolean;
}

/**
 * ICollectionRegistryContract — typed contract interface.
 */
export interface ICollectionRegistryContract extends BaseContractProperties {
    // Write methods
    register(collectionAddress: Address | string): Promise<CallResult<{ collectionId: bigint }>>;
    setVerified(collectionId: bigint, verified: boolean): Promise<CallResult<{ success: boolean }>>;
    removeCollection(collectionId: bigint): Promise<CallResult<{ success: boolean }>>;

    // Read methods
    totalCollections(): Promise<CallResult<{ total: bigint }>>;
    getCollection(collectionId: bigint): Promise<CallResult<RegistryCollectionData>>;
    getCollectionByAddress(collectionAddress: Address | string): Promise<CallResult<{ collectionId: bigint }>>;
}
