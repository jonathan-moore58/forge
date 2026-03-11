import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the register function call.
 */
export type Register = CallResult<
    {
        collectionId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setVerified function call.
 */
export type SetVerified = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the removeCollection function call.
 */
export type RemoveCollection = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the totalCollections function call.
 */
export type TotalCollections = CallResult<
    {
        total: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollection function call.
 */
export type GetCollection = CallResult<
    {
        collectionAddress: Address;
        creator: Address;
        registeredAt: bigint;
        verified: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCollectionByAddress function call.
 */
export type GetCollectionByAddress = CallResult<
    {
        collectionId: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ICollectionRegistry
// ------------------------------------------------------------------
export interface ICollectionRegistry extends IOP_NETContract {
    register(collectionAddress: Address): Promise<Register>;
    setVerified(collectionId: bigint, verified: boolean): Promise<SetVerified>;
    removeCollection(collectionId: bigint): Promise<RemoveCollection>;
    totalCollections(): Promise<TotalCollections>;
    getCollection(collectionId: bigint): Promise<GetCollection>;
    getCollectionByAddress(collectionAddress: Address): Promise<GetCollectionByAddress>;
}
