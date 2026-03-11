import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type NFTListedEvent = {
    readonly listingId: bigint;
    readonly seller: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly price: bigint;
};
export type NFTSoldEvent = {
    readonly listingId: bigint;
    readonly buyer: Address;
    readonly seller: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly price: bigint;
};
export type ListingCancelledEvent = {
    readonly listingId: bigint;
};
export type OfferMadeEvent = {
    readonly offerId: bigint;
    readonly offerer: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly price: bigint;
    readonly expiryBlock: bigint;
};
export type OfferAcceptedEvent = {
    readonly offerId: bigint;
    readonly seller: Address;
    readonly buyer: Address;
    readonly price: bigint;
};
export type OfferCancelledEvent = {
    readonly offerId: bigint;
};
export type CollectionRegisteredEvent = {
    readonly collection: Address;
    readonly creator: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the listNFT function call.
 */
export type ListNFT = CallResult<
    {
        listingId: bigint;
    },
    OPNetEvent<NFTListedEvent>[]
>;

/**
 * @description Represents the result of the buyNFT function call.
 */
export type BuyNFT = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<NFTSoldEvent>[]
>;

/**
 * @description Represents the result of the cancelListing function call.
 */
export type CancelListing = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<ListingCancelledEvent>[]
>;

/**
 * @description Represents the result of the makeOffer function call.
 */
export type MakeOffer = CallResult<
    {
        offerId: bigint;
    },
    OPNetEvent<OfferMadeEvent>[]
>;

/**
 * @description Represents the result of the acceptOffer function call.
 */
export type AcceptOffer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OfferAcceptedEvent>[]
>;

/**
 * @description Represents the result of the cancelOffer function call.
 */
export type CancelOffer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OfferCancelledEvent>[]
>;

/**
 * @description Represents the result of the getListing function call.
 */
export type GetListing = CallResult<
    {
        seller: Address;
        collection: Address;
        tokenId: bigint;
        price: bigint;
        status: bigint;
        block: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOffer function call.
 */
export type GetOffer = CallResult<
    {
        offerer: Address;
        collection: Address;
        tokenId: bigint;
        price: bigint;
        status: bigint;
        expiryBlock: bigint;
        isCollectionWide: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the marketplaceStats function call.
 */
export type MarketplaceStats = CallResult<
    {
        totalListings: bigint;
        totalSales: bigint;
        totalVolume: bigint;
        totalFees: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the collectionStats function call.
 */
export type CollectionStats = CallResult<
    {
        volume: bigint;
        salesCount: bigint;
        floorPrice: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getListingForNFT function call.
 */
export type GetListingForNFT = CallResult<
    {
        listingId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the registerCollection function call.
 */
export type RegisterCollection = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<CollectionRegisteredEvent>[]
>;

/**
 * @description Represents the result of the isCollectionRegistered function call.
 */
export type IsCollectionRegistered = CallResult<
    {
        registered: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setFeeRecipient function call.
 */
export type SetFeeRecipient = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the pause function call.
 */
export type Pause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the unpause function call.
 */
export type Unpause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IMarketplace
// ------------------------------------------------------------------
export interface IMarketplace extends IOP_NETContract {
    listNFT(collection: Address, tokenId: bigint, price: bigint): Promise<ListNFT>;
    buyNFT(listingId: bigint): Promise<BuyNFT>;
    cancelListing(listingId: bigint): Promise<CancelListing>;
    makeOffer(collection: Address, tokenId: bigint, price: bigint, expiryBlock: bigint): Promise<MakeOffer>;
    acceptOffer(offerId: bigint, tokenId: bigint): Promise<AcceptOffer>;
    cancelOffer(offerId: bigint): Promise<CancelOffer>;
    getListing(listingId: bigint): Promise<GetListing>;
    getOffer(offerId: bigint): Promise<GetOffer>;
    marketplaceStats(): Promise<MarketplaceStats>;
    collectionStats(collection: Address): Promise<CollectionStats>;
    getListingForNFT(collection: Address, tokenId: bigint): Promise<GetListingForNFT>;
    registerCollection(collectionAddress: Address): Promise<RegisterCollection>;
    isCollectionRegistered(collectionAddress: Address): Promise<IsCollectionRegistered>;
    setFeeRecipient(newRecipient: Address): Promise<SetFeeRecipient>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
}
