/* ------------------------------------------------------------------ */
/*  Typed event interfaces for all 20 FORGE contract events            */
/* ------------------------------------------------------------------ */

// ── Factory / Registry ──

export interface CollectionCreatedEvent {
    type: 'CollectionCreated';
    creator: string;
    collectionId: bigint;
    collectionAddress: string;
}

export interface CollectionVerifiedEvent {
    type: 'CollectionVerified';
    collectionId: bigint;
}

// ── Collection Template ──

export interface MintedEvent {
    type: 'Minted';
    minter: string;
    quantity: bigint;
    startTokenId: bigint;
}

export interface TransferEvent {
    type: 'Transfer';
    from: string;
    to: string;
    tokenId: bigint;
}

export interface PhaseChangedEvent {
    type: 'PhaseChanged';
    newPhase: bigint;
}

export interface RevealedEvent {
    type: 'Revealed';
    baseURI: string;
}

export interface TreasuryWithdrawnEvent {
    type: 'TreasuryWithdrawn';
    recipient: string;
    amount: bigint;
}

// ── Marketplace ──

export interface NFTListedEvent {
    type: 'NFTListed';
    listingId: bigint;
    seller: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
}

export interface NFTSoldEvent {
    type: 'NFTSold';
    listingId: bigint;
    buyer: string;
    seller: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
}

export interface ListingCancelledEvent {
    type: 'ListingCancelled';
    listingId: bigint;
}

export interface OfferMadeEvent {
    type: 'OfferMade';
    offerId: bigint;
    offerer: string;
    collection: string;
    tokenId: bigint;
    price: bigint;
    expiryBlock: bigint;
}

export interface OfferAcceptedEvent {
    type: 'OfferAccepted';
    offerId: bigint;
    seller: string;
    buyer: string;
    price: bigint;
}

export interface OfferCancelledEvent {
    type: 'OfferCancelled';
    offerId: bigint;
}

// ── Auction House ──

export interface AuctionCreatedEvent {
    type: 'AuctionCreated';
    auctionId: bigint;
    seller: string;
    collection: string;
    tokenId: bigint;
    startPrice: bigint;
    endBlock: bigint;
}

export interface BidPlacedEvent {
    type: 'BidPlaced';
    auctionId: bigint;
    bidder: string;
    amount: bigint;
    newEndBlock: bigint;
}

export interface AuctionSettledEvent {
    type: 'AuctionSettled';
    auctionId: bigint;
    winner: string;
    finalPrice: bigint;
}

// ── Staking Rewards ──

export interface NFTStakedEvent {
    type: 'NFTStaked';
    staker: string;
    collection: string;
    tokenId: bigint;
    poolId: bigint;
}

export interface NFTUnstakedEvent {
    type: 'NFTUnstaked';
    staker: string;
    collection: string;
    tokenId: bigint;
    rewardsClaimed: bigint;
}

export interface RewardsClaimedEvent {
    type: 'RewardsClaimed';
    staker: string;
    amount: bigint;
}

// ── Union ──

export type ForgeEvent =
    | CollectionCreatedEvent
    | CollectionVerifiedEvent
    | MintedEvent
    | TransferEvent
    | PhaseChangedEvent
    | RevealedEvent
    | TreasuryWithdrawnEvent
    | NFTListedEvent
    | NFTSoldEvent
    | ListingCancelledEvent
    | OfferMadeEvent
    | OfferAcceptedEvent
    | OfferCancelledEvent
    | AuctionCreatedEvent
    | BidPlacedEvent
    | AuctionSettledEvent
    | NFTStakedEvent
    | NFTUnstakedEvent
    | RewardsClaimedEvent;
