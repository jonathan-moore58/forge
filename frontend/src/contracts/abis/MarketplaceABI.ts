import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import { Address } from '@btc-vision/transaction';

export const MARKETPLACE_ABI: BitcoinInterfaceAbi = [
    // --- Write methods ---
    {
        name: 'listNFT',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'buyNFT',
        type: BitcoinAbiTypes.Function,
        payable: true,
        inputs: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'cancelListing',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'makeOffer',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'acceptOffer',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'cancelOffer',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'registerCollection',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'isCollectionRegistered',
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
        name: 'setFeeRecipient',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'recipient', type: ABIDataTypes.ADDRESS },
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
        name: 'getListing',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'blockListed', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getOffer',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'offerer', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
            { name: 'isCollectionWide', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'marketplaceStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalListings', type: ABIDataTypes.UINT256 },
            { name: 'totalSales', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
            { name: 'totalFees', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'collectionStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'volume', type: ABIDataTypes.UINT256 },
            { name: 'salesCount', type: ABIDataTypes.UINT256 },
            { name: 'floorPrice', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getListingForNFT',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
    },

    // --- Events ---
    {
        name: 'NFTListed',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'NFTSold',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'ListingCancelled',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'OfferMade',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'offerer', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'OfferAccepted',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'OfferCancelled',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

export interface ListingData {
    [key: string]: DecodedCallResult;
    seller: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
    status: bigint;
    blockListed: bigint;
}

export interface OfferData {
    [key: string]: DecodedCallResult;
    offerer: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
    status: bigint;
    expiryBlock: bigint;
    isCollectionWide: boolean;
}

export interface MarketStats {
    [key: string]: DecodedCallResult;
    totalListings: bigint;
    totalSales: bigint;
    totalVolume: bigint;
    totalFees: bigint;
}

export interface CollectionStatsData {
    [key: string]: DecodedCallResult;
    volume: bigint;
    salesCount: bigint;
    floorPrice: bigint;
}

export interface IMarketplaceContract extends BaseContractProperties {
    listNFT(collection: Address, tokenId: bigint, price: bigint): Promise<CallResult<{ listingId: bigint }>>;
    buyNFT(listingId: bigint): Promise<CallResult<{ success: boolean }>>;
    cancelListing(listingId: bigint): Promise<CallResult<{ success: boolean }>>;
    makeOffer(collection: Address, tokenId: bigint, price: bigint, expiryBlock: bigint): Promise<CallResult<{ offerId: bigint }>>;
    acceptOffer(offerId: bigint, tokenId: bigint): Promise<CallResult<{ success: boolean }>>;
    cancelOffer(offerId: bigint): Promise<CallResult<{ success: boolean }>>;
    getListing(listingId: bigint): Promise<CallResult<ListingData>>;
    getOffer(offerId: bigint): Promise<CallResult<OfferData>>;
    marketplaceStats(): Promise<CallResult<MarketStats>>;
    collectionStats(collection: Address): Promise<CallResult<CollectionStatsData>>;
    getListingForNFT(collection: Address, tokenId: bigint): Promise<CallResult<{ listingId: bigint }>>;
    registerCollection(collectionAddress: Address): Promise<CallResult<{ success: boolean }>>;
    isCollectionRegistered(collectionAddress: Address): Promise<CallResult<{ registered: boolean }>>;
}
