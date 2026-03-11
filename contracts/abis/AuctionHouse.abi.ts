import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const AuctionHouseEvents = [
    {
        name: 'AuctionCreated',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'endBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'BidPlaced',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'bidder', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'newEndBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'AuctionSettled',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'winner', type: ABIDataTypes.ADDRESS },
            { name: 'finalPrice', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const AuctionHouseAbi = [
    {
        name: 'createEnglishAuction',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'reservePrice', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'createDutchAuction',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'startPrice', type: ABIDataTypes.UINT256 },
            { name: 'endPrice', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'placeBid',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'bidAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'buyDutchAuction',
        payable: true,
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'settleAuction',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelAuction',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAuction',
        constant: true,
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
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
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCurrentDutchPrice',
        constant: true,
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'currentPrice', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'auctionStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalAuctions', type: ABIDataTypes.UINT256 },
            { name: 'totalSettled', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        ],
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
    ...AuctionHouseEvents,
    ...OP_NET_ABI,
];

export default AuctionHouseAbi;
