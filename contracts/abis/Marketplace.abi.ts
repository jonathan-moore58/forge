import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const MarketplaceEvents = [
    {
        name: 'NFTListed',
        values: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'NFTSold',
        values: [
            { name: 'listingId', type: ABIDataTypes.UINT256 },
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'ListingCancelled',
        values: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OfferMade',
        values: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'offerer', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OfferAccepted',
        values: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OfferCancelled',
        values: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'CollectionRegistered',
        values: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const MarketplaceAbi = [
    {
        name: 'listNFT',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'buyNFT',
        payable: true,
        inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelListing',
        inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'makeOffer',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'acceptOffer',
        inputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelOffer',
        inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getListing',
        constant: true,
        inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'block', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOffer',
        constant: true,
        inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'offerer', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'price', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
            { name: 'isCollectionWide', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'marketplaceStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalListings', type: ABIDataTypes.UINT256 },
            { name: 'totalSales', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
            { name: 'totalFees', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'collectionStats',
        constant: true,
        inputs: [{ name: 'collection', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'volume', type: ABIDataTypes.UINT256 },
            { name: 'salesCount', type: ABIDataTypes.UINT256 },
            { name: 'floorPrice', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getListingForNFT',
        constant: true,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'registerCollection',
        payable: true,
        inputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isCollectionRegistered',
        constant: true,
        inputs: [{ name: 'collectionAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'registered', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setFeeRecipient',
        inputs: [{ name: 'newRecipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unpause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...MarketplaceEvents,
    ...OP_NET_ABI,
];

export default MarketplaceAbi;
