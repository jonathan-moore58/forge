/** FORGE Type Definitions */

export interface Collection {
    id: bigint;
    address: string;
    creator: string;
    name: string;
    symbol: string;
    maxSupply: bigint;
    totalSupply: bigint;
    mintPrice: bigint;
    royaltyBps: bigint;
    royaltyRecipient: string;
    verified: boolean;
    creationBlock: bigint;
    floorPrice: bigint;
    volume: bigint;
    bannerUrl: string;
    iconUrl: string;
    description: string;
    mintOpen: boolean;
}

export interface NFTItem {
    tokenId: bigint;
    collectionAddress: string;
    collectionName: string;
    owner: string;
    tokenURI: string;
    imageUrl: string;
    name: string;
    traits: NFTTrait[];
    rarityRank: number;
    rarityScore: number;
    listed: boolean;
    listingPrice: bigint;
    lastSalePrice: bigint;
}

export interface NFTTrait {
    traitType: string;
    value: string;
    rarity: number;
}

export interface Listing {
    id: bigint;
    seller: string;
    collectionAddress: string;
    tokenId: bigint;
    price: bigint;
    status: ListingStatus;
    blockListed: bigint;
}

export enum ListingStatus {
    ACTIVE = 0,
    SOLD = 1,
    CANCELLED = 2,
}

export interface Offer {
    id: bigint;
    offerer: string;
    collectionAddress: string;
    tokenId: bigint;
    price: bigint;
    status: OfferStatus;
    expiryBlock: bigint;
    isCollectionWide: boolean;
}

export enum OfferStatus {
    ACTIVE = 0,
    ACCEPTED = 1,
    CANCELLED = 2,
    EXPIRED = 3,
}

export interface Auction {
    id: bigint;
    seller: string;
    collectionAddress: string;
    tokenId: bigint;
    auctionType: AuctionType;
    status: AuctionStatus;
    startBlock: bigint;
    endBlock: bigint;
    startPrice: bigint;
    reservePrice: bigint;
    highestBid: bigint;
    highestBidder: string;
    bidCount: bigint;
}

export enum AuctionType {
    ENGLISH = 0,
    DUTCH = 1,
}

export enum AuctionStatus {
    ACTIVE = 0,
    SETTLED = 1,
    CANCELLED = 2,
}

export interface StakingPool {
    id: bigint;
    collectionAddress: string;
    rewardToken: string;
    rewardPerBlock: bigint;
    startBlock: bigint;
    endBlock: bigint;
    totalStaked: bigint;
    active: boolean;
}

export interface UserStakeInfo {
    stakedCount: bigint;
    pendingRewards: bigint;
    lockEndBlock: bigint;
    multiplier: bigint;
}

export interface ActivityItem {
    type: ActivityType;
    collection: string;
    collectionName: string;
    tokenId: bigint;
    price: bigint;
    from: string;
    to: string;
    blockNumber: bigint;
    timestamp: number;
}

export type ActivityType = 'sale' | 'listing' | 'offer' | 'mint' | 'transfer' | 'bid' | 'auction_settled';

export interface MarketplaceStats {
    totalListings: bigint;
    totalSales: bigint;
    totalVolume: bigint;
    totalFees: bigint;
}

export interface CollectionStats {
    volume: bigint;
    salesCount: bigint;
    floorPrice: bigint;
}

export interface WalletState {
    isConnected: boolean;
    address: string;
    p2trAddress: string;
    balance: bigint;
}

export interface CreateCollectionForm {
    name: string;
    symbol: string;
    description: string;
    bannerUrl: string;
    iconUrl: string;
    website: string;
    twitter: string;
    discord: string;
    maxSupply: number;
    mintPrice: string;
    maxPerWallet: number;
    revealInstant: boolean;
    hiddenURI: string;
    wlStartBlock: number;
    wlEndBlock: number;
    wlPrice: string;
    publicStartBlock: number;
    publicEndBlock: number;
    dutchAuctionEnabled: boolean;
    dutchStartPrice: string;
    dutchEndPrice: string;
    royaltyBps: number;
    royaltySplits: RoyaltySplit[];
    teamReservePercent: number;
    teamAirdrops: TeamAirdrop[];
}

export interface RoyaltySplit {
    address: string;
    percent: number;
}

export interface TeamAirdrop {
    address: string;
    amount: number;
}
