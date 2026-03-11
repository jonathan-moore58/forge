import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    NetEvent,
    Address,
    BytesWriter,
} from '@btc-vision/btc-runtime/runtime';

/** Emitted when a new NFT collection is created via the factory */
export class CollectionCreatedEvent extends NetEvent {
    constructor(
        creator: Address,
        collectionId: u256,
        collectionAddress: Address,
    ) {
        const data: BytesWriter = new BytesWriter(96);
        data.writeAddress(creator);
        data.writeU256(collectionId);
        data.writeAddress(collectionAddress);
        super('CollectionCreated', data);
    }
}

/** Emitted when a collection is verified by admin */
export class CollectionVerifiedEvent extends NetEvent {
    constructor(collectionId: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(collectionId);
        super('CollectionVerified', data);
    }
}

/** Emitted when an NFT is listed on the marketplace */
export class NFTListedEvent extends NetEvent {
    constructor(
        listingId: u256,
        seller: Address,
        collection: Address,
        tokenId: u256,
        price: u256,
    ) {
        const data: BytesWriter = new BytesWriter(160);
        data.writeU256(listingId);
        data.writeAddress(seller);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(price);
        super('NFTListed', data);
    }
}

/** Emitted when an NFT is sold */
export class NFTSoldEvent extends NetEvent {
    constructor(
        listingId: u256,
        buyer: Address,
        seller: Address,
        collection: Address,
        tokenId: u256,
        price: u256,
    ) {
        const data: BytesWriter = new BytesWriter(192);
        data.writeU256(listingId);
        data.writeAddress(buyer);
        data.writeAddress(seller);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(price);
        super('NFTSold', data);
    }
}

/** Emitted when a listing is cancelled */
export class ListingCancelledEvent extends NetEvent {
    constructor(listingId: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(listingId);
        super('ListingCancelled', data);
    }
}

/** Emitted when an offer is made */
export class OfferMadeEvent extends NetEvent {
    constructor(
        offerId: u256,
        offerer: Address,
        collection: Address,
        tokenId: u256,
        price: u256,
        expiryBlock: u256,
    ) {
        const data: BytesWriter = new BytesWriter(192);
        data.writeU256(offerId);
        data.writeAddress(offerer);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(price);
        data.writeU256(expiryBlock);
        super('OfferMade', data);
    }
}

/** Emitted when an offer is accepted */
export class OfferAcceptedEvent extends NetEvent {
    constructor(offerId: u256, seller: Address, buyer: Address, price: u256) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeU256(offerId);
        data.writeAddress(seller);
        data.writeAddress(buyer);
        data.writeU256(price);
        super('OfferAccepted', data);
    }
}

/** Emitted when an offer is cancelled */
export class OfferCancelledEvent extends NetEvent {
    constructor(offerId: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(offerId);
        super('OfferCancelled', data);
    }
}

/** Emitted when an auction is created */
export class AuctionCreatedEvent extends NetEvent {
    constructor(
        auctionId: u256,
        seller: Address,
        collection: Address,
        tokenId: u256,
        startPrice: u256,
        endBlock: u256,
    ) {
        const data: BytesWriter = new BytesWriter(192);
        data.writeU256(auctionId);
        data.writeAddress(seller);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(startPrice);
        data.writeU256(endBlock);
        super('AuctionCreated', data);
    }
}

/** Emitted when a bid is placed */
export class BidPlacedEvent extends NetEvent {
    constructor(
        auctionId: u256,
        bidder: Address,
        amount: u256,
        newEndBlock: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeU256(auctionId);
        data.writeAddress(bidder);
        data.writeU256(amount);
        data.writeU256(newEndBlock);
        super('BidPlaced', data);
    }
}

/** Emitted when an auction is settled */
export class AuctionSettledEvent extends NetEvent {
    constructor(
        auctionId: u256,
        winner: Address,
        finalPrice: u256,
    ) {
        const data: BytesWriter = new BytesWriter(96);
        data.writeU256(auctionId);
        data.writeAddress(winner);
        data.writeU256(finalPrice);
        super('AuctionSettled', data);
    }
}

/** Emitted when an NFT is staked */
export class NFTStakedEvent extends NetEvent {
    constructor(
        staker: Address,
        collection: Address,
        tokenId: u256,
        poolId: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeAddress(staker);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(poolId);
        super('NFTStaked', data);
    }
}

/** Emitted when an NFT is unstaked */
export class NFTUnstakedEvent extends NetEvent {
    constructor(
        staker: Address,
        collection: Address,
        tokenId: u256,
        rewardsClaimed: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeAddress(staker);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeU256(rewardsClaimed);
        super('NFTUnstaked', data);
    }
}

/** Emitted when staking rewards are claimed */
export class RewardsClaimedEvent extends NetEvent {
    constructor(staker: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(64);
        data.writeAddress(staker);
        data.writeU256(amount);
        super('RewardsClaimed', data);
    }
}

/** Emitted by CollectionTemplate.initialize() — on-chain proof of collection existence.
 *  The indexer picks this up to auto-register collections (no HTTP needed).
 *  If DB is wiped, re-scanning blocks rediscovers all collections. */
export class CollectionConfiguredEvent extends NetEvent {
    constructor(
        collectionAddress: Address,
        creator: Address,
        maxSupply: u256,
        mintPrice: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeAddress(collectionAddress);
        data.writeAddress(creator);
        data.writeU256(maxSupply);
        data.writeU256(mintPrice);
        super('CollectionConfigured', data);
    }
}

/** Emitted when NFTs are minted */
export class MintedEvent extends NetEvent {
    constructor(minter: Address, quantity: u256, startTokenId: u256) {
        const data: BytesWriter = new BytesWriter(96);
        data.writeAddress(minter);
        data.writeU256(quantity);
        data.writeU256(startTokenId);
        super('Minted', data);
    }
}

/** Emitted when mint phase changes */
export class PhaseChangedEvent extends NetEvent {
    constructor(newPhase: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(newPhase);
        super('PhaseChanged', data);
    }
}

/** Emitted when collection is revealed */
export class RevealedEvent extends NetEvent {
    constructor(baseURI: string) {
        const writer: BytesWriter = new BytesWriter(baseURI.length + 4);
        writer.writeStringWithLength(baseURI);
        super('Revealed', writer);
    }
}

/** Emitted when royalties are paid */
export class RoyaltyPaidEvent extends NetEvent {
    constructor(collection: Address, recipient: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(96);
        data.writeAddress(collection);
        data.writeAddress(recipient);
        data.writeU256(amount);
        super('RoyaltyPaid', data);
    }
}

/** Emitted when whitelist is updated */
export class WhitelistUpdatedEvent extends NetEvent {
    constructor(count: u256) {
        const data: BytesWriter = new BytesWriter(32);
        data.writeU256(count);
        super('WhitelistUpdated', data);
    }
}

/** Emitted when an external collection is registered on the marketplace */
export class CollectionRegisteredEvent extends NetEvent {
    constructor(collection: Address, creator: Address) {
        const data: BytesWriter = new BytesWriter(64);
        data.writeAddress(collection);
        data.writeAddress(creator);
        super('CollectionRegistered', data);
    }
}

/* ── NFT Lending Events ─────────────────────────────────────────── */

/** Emitted when a borrower creates a loan request */
export class LoanRequestCreatedEvent extends NetEvent {
    constructor(
        loanId: u256,
        borrower: Address,
        collection: Address,
        tokenId: u256,
        paymentToken: Address,
        amount: u256,
        interestBps: u256,
        durationBlocks: u256,
    ) {
        const data: BytesWriter = new BytesWriter(256);
        data.writeU256(loanId);
        data.writeAddress(borrower);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        data.writeAddress(paymentToken);
        data.writeU256(amount);
        data.writeU256(interestBps);
        data.writeU256(durationBlocks);
        super('LoanRequestCreated', data);
    }
}

/** Emitted when a lender funds a loan request */
export class LoanFundedEvent extends NetEvent {
    constructor(
        loanId: u256,
        lender: Address,
        borrower: Address,
        amount: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeU256(loanId);
        data.writeAddress(lender);
        data.writeAddress(borrower);
        data.writeU256(amount);
        super('LoanFunded', data);
    }
}

/** Emitted when a borrower repays a loan */
export class LoanRepaidEvent extends NetEvent {
    constructor(
        loanId: u256,
        borrower: Address,
        lender: Address,
        repayAmount: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeU256(loanId);
        data.writeAddress(borrower);
        data.writeAddress(lender);
        data.writeU256(repayAmount);
        super('LoanRepaid', data);
    }
}

/** Emitted when a lender claims a defaulted loan's NFT collateral */
export class LoanDefaultedEvent extends NetEvent {
    constructor(
        loanId: u256,
        lender: Address,
        collection: Address,
        tokenId: u256,
    ) {
        const data: BytesWriter = new BytesWriter(128);
        data.writeU256(loanId);
        data.writeAddress(lender);
        data.writeAddress(collection);
        data.writeU256(tokenId);
        super('LoanDefaulted', data);
    }
}

/** Emitted when a borrower cancels an unfunded loan request */
export class LoanCancelledEvent extends NetEvent {
    constructor(loanId: u256, borrower: Address) {
        const data: BytesWriter = new BytesWriter(64);
        data.writeU256(loanId);
        data.writeAddress(borrower);
        super('LoanCancelled', data);
    }
}
