import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type MintedEvent = {
    readonly minter: Address;
    readonly quantity: bigint;
    readonly startTokenId: bigint;
    readonly to: Address;
    readonly amount: bigint;
};
export type PhaseChangedEvent = {
    readonly newPhase: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the initialize function call.
 */
export type Initialize = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setCollectionInfo function call.
 */
export type SetCollectionInfo = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the publicMint function call.
 */
export type PublicMint = CallResult<
    {
        startTokenId: bigint;
    },
    OPNetEvent<MintedEvent>[]
>;

/**
 * @description Represents the result of the airdrop function call.
 */
export type Airdrop = CallResult<
    {
        startTokenId: bigint;
    },
    OPNetEvent<MintedEvent>[]
>;

/**
 * @description Represents the result of the setSalePhase function call.
 */
export type SetSalePhase = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setMintOpen function call.
 */
export type SetMintOpen = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PhaseChangedEvent>[]
>;

/**
 * @description Represents the result of the changeMetadata function call.
 */
export type ChangeMetadata = CallResult<{}, OPNetEvent<never>[]>;

/**
 * @description Represents the result of the setMintPrice function call.
 */
export type SetMintPrice = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the collectionOwner function call.
 */
export type CollectionOwner = CallResult<
    {
        owner: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the currentPrice function call.
 */
export type CurrentPrice = CallResult<
    {
        price: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isMintOpen function call.
 */
export type IsMintOpen = CallResult<
    {
        open: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the salePhase function call.
 */
export type SalePhase = CallResult<
    {
        phase: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the royaltyInfo function call.
 */
export type RoyaltyInfo = CallResult<
    {
        royaltyBps: bigint;
        royaltyRecipient: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isInitialized function call.
 */
export type IsInitialized = CallResult<
    {
        initialized: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ICollectionTemplate
// ------------------------------------------------------------------
export interface ICollectionTemplate extends IOP_NETContract {
    initialize(
        name: string,
        symbol: string,
        maxSupply: bigint,
        mintPrice: bigint,
        royaltyBps: bigint,
        royaltyRecipient: Address,
    ): Promise<Initialize>;
    setCollectionInfo(name: string, symbol: string): Promise<SetCollectionInfo>;
    publicMint(quantity: bigint): Promise<PublicMint>;
    airdrop(recipient: Address, quantity: bigint): Promise<Airdrop>;
    setSalePhase(phase: bigint): Promise<SetSalePhase>;
    setMintOpen(open: boolean): Promise<SetMintOpen>;
    changeMetadata(icon: string, banner: string, description: string, website: string): Promise<ChangeMetadata>;
    setMintPrice(price: bigint): Promise<SetMintPrice>;
    collectionOwner(): Promise<CollectionOwner>;
    currentPrice(): Promise<CurrentPrice>;
    isMintOpen(): Promise<IsMintOpen>;
    salePhase(): Promise<SalePhase>;
    royaltyInfo(): Promise<RoyaltyInfo>;
    isInitialized(): Promise<IsInitialized>;
}
