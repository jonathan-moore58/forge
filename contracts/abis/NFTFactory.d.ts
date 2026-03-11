import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type CollectionCreatedEvent = {
    readonly creator: Address;
    readonly collectionId: bigint;
    readonly collectionAddress: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the setTemplate function call.
 */
export type SetTemplate = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the createCollection function call.
 */
export type CreateCollection = CallResult<
    {
        collectionAddress: Address;
    },
    OPNetEvent<CollectionCreatedEvent>[]
>;

/**
 * @description Represents the result of the registerCollection function call.
 */
export type RegisterCollection = CallResult<
    {
        collectionId: bigint;
    },
    OPNetEvent<CollectionCreatedEvent>[]
>;

/**
 * @description Represents the result of the isRegistered function call.
 */
export type IsRegistered = CallResult<
    {
        registered: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the collectionCount function call.
 */
export type CollectionCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTemplate function call.
 */
export type GetTemplate = CallResult<
    {
        templateAddress: Address;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INFTFactory
// ------------------------------------------------------------------
export interface INFTFactory extends IOP_NETContract {
    setTemplate(templateAddress: Address): Promise<SetTemplate>;
    createCollection(salt: bigint): Promise<CreateCollection>;
    registerCollection(collectionAddress: Address): Promise<RegisterCollection>;
    isRegistered(collectionAddress: Address): Promise<IsRegistered>;
    collectionCount(): Promise<CollectionCount>;
    getTemplate(): Promise<GetTemplate>;
}
