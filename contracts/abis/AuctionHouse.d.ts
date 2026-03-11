import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type AuctionCreatedEvent = {
    readonly auctionId: bigint;
    readonly seller: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly startPrice: bigint;
    readonly endBlock: bigint;
};
export type BidPlacedEvent = {
    readonly auctionId: bigint;
    readonly bidder: Address;
    readonly amount: bigint;
    readonly newEndBlock: bigint;
};
export type AuctionSettledEvent = {
    readonly auctionId: bigint;
    readonly winner: Address;
    readonly finalPrice: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createEnglishAuction function call.
 */
export type CreateEnglishAuction = CallResult<
    {
        auctionId: bigint;
    },
    OPNetEvent<AuctionCreatedEvent>[]
>;

/**
 * @description Represents the result of the createDutchAuction function call.
 */
export type CreateDutchAuction = CallResult<
    {
        auctionId: bigint;
    },
    OPNetEvent<AuctionCreatedEvent>[]
>;

/**
 * @description Represents the result of the placeBid function call.
 */
export type PlaceBid = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<BidPlacedEvent>[]
>;

/**
 * @description Represents the result of the buyDutchAuction function call.
 */
export type BuyDutchAuction = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<AuctionSettledEvent>[]
>;

/**
 * @description Represents the result of the settleAuction function call.
 */
export type SettleAuction = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<AuctionSettledEvent>[]
>;

/**
 * @description Represents the result of the cancelAuction function call.
 */
export type CancelAuction = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAuction function call.
 */
export type GetAuction = CallResult<
    {
        seller: Address;
        collection: Address;
        tokenId: bigint;
        auctionType: bigint;
        status: bigint;
        startBlock: bigint;
        endBlock: bigint;
        startPrice: bigint;
        reservePrice: bigint;
        highestBid: bigint;
        highestBidder: Address;
        bidCount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getCurrentDutchPrice function call.
 */
export type GetCurrentDutchPrice = CallResult<
    {
        currentPrice: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the auctionStats function call.
 */
export type AuctionStats = CallResult<
    {
        totalAuctions: bigint;
        totalSettled: bigint;
        totalVolume: bigint;
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
// IAuctionHouse
// ------------------------------------------------------------------
export interface IAuctionHouse extends IOP_NETContract {
    createEnglishAuction(
        collection: Address,
        tokenId: bigint,
        startPrice: bigint,
        reservePrice: bigint,
        durationBlocks: bigint,
    ): Promise<CreateEnglishAuction>;
    createDutchAuction(
        collection: Address,
        tokenId: bigint,
        startPrice: bigint,
        endPrice: bigint,
        durationBlocks: bigint,
    ): Promise<CreateDutchAuction>;
    placeBid(auctionId: bigint, bidAmount: bigint): Promise<PlaceBid>;
    buyDutchAuction(auctionId: bigint): Promise<BuyDutchAuction>;
    settleAuction(auctionId: bigint): Promise<SettleAuction>;
    cancelAuction(auctionId: bigint): Promise<CancelAuction>;
    getAuction(auctionId: bigint): Promise<GetAuction>;
    getCurrentDutchPrice(auctionId: bigint): Promise<GetCurrentDutchPrice>;
    auctionStats(): Promise<AuctionStats>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
}
