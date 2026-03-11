import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import { Address } from '@btc-vision/transaction';

export const AUCTION_HOUSE_ABI: BitcoinInterfaceAbi = [
    // --- Write methods ---
    {
        name: 'createEnglishAuction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'reservePrice', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'createDutchAuction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'endPrice', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'placeBid',
        type: BitcoinAbiTypes.Function,
        payable: true,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'bidAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'buyDutchAuction',
        type: BitcoinAbiTypes.Function,
        payable: true,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'settleAuction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'cancelAuction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'pause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'unpause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },

    // --- Read methods ---
    {
        name: 'getAuction',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'auctionType', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'reservePrice', type: ABIDataTypes.UINT256 },
            { name: 'highestBid', type: ABIDataTypes.UINT256 },
            { name: 'highestBidder', type: ABIDataTypes.ADDRESS },
            { name: 'bidCount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getCurrentDutchPrice',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'auctionStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalAuctions', type: ABIDataTypes.UINT256 },
            { name: 'totalSettled', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        ],
    },

    // --- Events ---
    {
        name: 'AuctionCreated',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'BidPlaced',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'bidder', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'newEndBlock', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'AuctionSettled',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'winner', type: ABIDataTypes.ADDRESS },
            { name: 'finalPrice', type: ABIDataTypes.UINT256 },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

export interface AuctionData {
    [key: string]: DecodedCallResult;
    seller: string;
    collection: string;
    tokenId: bigint;
    auctionType: bigint;
    status: bigint;
    startBlock: bigint;
    endBlock: bigint;
    startPrice: bigint;
    reservePrice: bigint;
    highestBid: bigint;
    highestBidder: string;
    bidCount: bigint;
}

export interface AuctionStatsData {
    [key: string]: DecodedCallResult;
    totalAuctions: bigint;
    totalSettled: bigint;
    totalVolume: bigint;
}

export interface IAuctionHouseContract extends BaseContractProperties {
    createEnglishAuction(collection: Address, tokenId: bigint, startPrice: bigint, reservePrice: bigint, durationBlocks: bigint): Promise<CallResult<{ auctionId: bigint }>>;
    createDutchAuction(collection: Address, tokenId: bigint, startPrice: bigint, endPrice: bigint, durationBlocks: bigint): Promise<CallResult<{ auctionId: bigint }>>;
    placeBid(auctionId: bigint, bidAmount: bigint): Promise<CallResult<{ success: boolean }>>;
    buyDutchAuction(auctionId: bigint): Promise<CallResult<{ success: boolean }>>;
    settleAuction(auctionId: bigint): Promise<CallResult<{ success: boolean }>>;
    cancelAuction(auctionId: bigint): Promise<CallResult<{ success: boolean }>>;
    getAuction(auctionId: bigint): Promise<CallResult<AuctionData>>;
    getCurrentDutchPrice(auctionId: bigint): Promise<CallResult<{ price: bigint }>>;
    auctionStats(): Promise<CallResult<AuctionStatsData>>;
}
