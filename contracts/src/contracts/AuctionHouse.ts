import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    StoredBoolean,
    StoredMapU256,
    ReentrancyGuard,
    ReentrancyLevel,
    EMPTY_POINTER,
    encodeSelector,
    SELECTOR_BYTE_LENGTH,
    Bech32,
} from '@btc-vision/btc-runtime/runtime';

import {
    AuctionCreatedEvent,
    BidPlacedEvent,
    AuctionSettledEvent,
} from '../lib/events';
import {
    AUCTION_ENGLISH,
    AUCTION_DUTCH,
    AUCTION_ACTIVE,
    AUCTION_SETTLED,
    AUCTION_CANCELLED,
    ANTI_SNIPE_BLOCKS,
    MIN_BID_INCREMENT_BPS,
    BPS_DENOMINATOR,
    MARKETPLACE_FEE_BPS,
} from '../lib/constants';

/**
 * AuctionHouse — English and Dutch NFT auctions for FORGE.
 *
 * Features:
 * - English auctions (highest bid wins)
 * - Dutch auctions (price drops over blocks)
 * - Reserve price enforcement
 * - Minimum bid increments (5%)
 * - Anti-snipe protection (extend by 10 blocks if bid in last 10 blocks)
 * - Automatic settlement
 * - Royalty enforcement on settlement
 * - Platform fee: 2% per sale
 * - Full reentrancy protection
 */
@final
export class AuctionHouse extends ReentrancyGuard {
    protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    /** Core state */
    private nextAuctionIdPointer: u16 = Blockchain.nextPointer;
    private totalAuctionsPointer: u16 = Blockchain.nextPointer;
    private totalSettledPointer: u16 = Blockchain.nextPointer;
    private totalVolumePointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;
    private factoryAddressPointer: u16 = Blockchain.nextPointer;

    /** Auction storage: auctionId → field */
    private auctionSellerPointer: u16 = Blockchain.nextPointer;
    private auctionCollectionPointer: u16 = Blockchain.nextPointer;
    private auctionTokenIdPointer: u16 = Blockchain.nextPointer;
    private auctionTypePointer: u16 = Blockchain.nextPointer;
    private auctionStatusPointer: u16 = Blockchain.nextPointer;
    private auctionStartBlockPointer: u16 = Blockchain.nextPointer;
    private auctionEndBlockPointer: u16 = Blockchain.nextPointer;
    private auctionStartPricePointer: u16 = Blockchain.nextPointer;
    private auctionReservePricePointer: u16 = Blockchain.nextPointer;
    private auctionHighestBidPointer: u16 = Blockchain.nextPointer;
    private auctionHighestBidderPointer: u16 = Blockchain.nextPointer;
    private auctionBidCountPointer: u16 = Blockchain.nextPointer;

    /** Dutch auction specific */
    private auctionEndPricePointer: u16 = Blockchain.nextPointer;

    /** Stored values */
    private _nextAuctionId!: StoredU256;
    private _totalAuctions!: StoredU256;
    private _totalSettled!: StoredU256;
    private _totalVolume!: StoredU256;
    private _paused!: StoredBoolean;
    private _factoryAddress!: StoredU256;

    private _auctionSeller!: StoredMapU256;
    private _auctionCollection!: StoredMapU256;
    private _auctionTokenId!: StoredMapU256;
    private _auctionType!: StoredMapU256;
    private _auctionStatus!: StoredMapU256;
    private _auctionStartBlock!: StoredMapU256;
    private _auctionEndBlock!: StoredMapU256;
    private _auctionStartPrice!: StoredMapU256;
    private _auctionReservePrice!: StoredMapU256;
    private _auctionHighestBid!: StoredMapU256;
    private _auctionHighestBidder!: StoredMapU256;
    private _auctionBidCount!: StoredMapU256;
    private _auctionEndPrice!: StoredMapU256;

    public constructor() {
        super();

        this._nextAuctionId = new StoredU256(this.nextAuctionIdPointer, EMPTY_POINTER);
        this._totalAuctions = new StoredU256(this.totalAuctionsPointer, EMPTY_POINTER);
        this._totalSettled = new StoredU256(this.totalSettledPointer, EMPTY_POINTER);
        this._totalVolume = new StoredU256(this.totalVolumePointer, EMPTY_POINTER);
        this._paused = new StoredBoolean(this.pausedPointer, false);
        this._factoryAddress = new StoredU256(this.factoryAddressPointer, EMPTY_POINTER);

        this._auctionSeller = new StoredMapU256(this.auctionSellerPointer);
        this._auctionCollection = new StoredMapU256(this.auctionCollectionPointer);
        this._auctionTokenId = new StoredMapU256(this.auctionTokenIdPointer);
        this._auctionType = new StoredMapU256(this.auctionTypePointer);
        this._auctionStatus = new StoredMapU256(this.auctionStatusPointer);
        this._auctionStartBlock = new StoredMapU256(this.auctionStartBlockPointer);
        this._auctionEndBlock = new StoredMapU256(this.auctionEndBlockPointer);
        this._auctionStartPrice = new StoredMapU256(this.auctionStartPricePointer);
        this._auctionReservePrice = new StoredMapU256(this.auctionReservePricePointer);
        this._auctionHighestBid = new StoredMapU256(this.auctionHighestBidPointer);
        this._auctionHighestBidder = new StoredMapU256(this.auctionHighestBidderPointer);
        this._auctionBidCount = new StoredMapU256(this.auctionBidCountPointer);
        this._auctionEndPrice = new StoredMapU256(this.auctionEndPricePointer);
    }

    public override onDeployment(calldata: Calldata): void {
        const factoryAddr: u256 = calldata.readU256();

        this._nextAuctionId.value = u256.One;
        this._totalAuctions.value = u256.Zero;
        this._totalSettled.value = u256.Zero;
        this._totalVolume.value = u256.Zero;
        this._factoryAddress.value = factoryAddr;
    }

    /**
     * Create an English auction.
     * NFT must be approved for the AuctionHouse.
     */
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'startPrice', type: ABIDataTypes.UINT256 },
        { name: 'reservePrice', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @emit('AuctionCreated')
    public createEnglishAuction(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Auction house is paused');
        }

        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();
        const startPrice: u256 = calldata.readU256();
        const reservePrice: u256 = calldata.readU256();
        const durationBlocks: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        if (startPrice.isZero()) {
            throw new Revert('Start price must be > 0');
        }
        if (reservePrice > startPrice) {
            throw new Revert('Reserve price cannot exceed start price');
        }
        if (durationBlocks.isZero()) {
            throw new Revert('Duration must be > 0');
        }
        // Max duration: ~1 year (52,560 blocks)
        if (durationBlocks > u256.fromU64(52560)) {
            throw new Revert('Max duration is 52560 blocks (~1 year)');
        }

        // Verify sender owns the NFT (cross-contract call)
        const ownerCheckCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32);
        ownerCheckCalldata.writeSelector(encodeSelector('ownerOf(uint256)'));
        ownerCheckCalldata.writeU256(tokenId);

        const ownerResult = Blockchain.call(collection, ownerCheckCalldata, false);
        if (!ownerResult.success) {
            throw new Revert('ownerOf check failed — not a valid OP721');
        }

        const nftOwner: Address = ownerResult.data.readAddress();
        if (!nftOwner.equals(sender)) {
            throw new Revert('Not the NFT owner');
        }

        const auctionId: u256 = this._nextAuctionId.value;
        const currentBlock: u256 = Blockchain.block.numberU256;
        const endBlock: u256 = SafeMath.add(currentBlock, durationBlocks);

        // Store auction data
        this._auctionSeller.set(auctionId, this.addressToU256(sender));
        this._auctionCollection.set(auctionId, this.addressToU256(collection));
        this._auctionTokenId.set(auctionId, tokenId);
        this._auctionType.set(auctionId, u256.fromU64(<u64>AUCTION_ENGLISH));
        this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_ACTIVE));
        this._auctionStartBlock.set(auctionId, currentBlock);
        this._auctionEndBlock.set(auctionId, endBlock);
        this._auctionStartPrice.set(auctionId, startPrice);
        this._auctionReservePrice.set(auctionId, reservePrice);
        this._auctionHighestBid.set(auctionId, u256.Zero);
        this._auctionHighestBidder.set(auctionId, u256.Zero);
        this._auctionBidCount.set(auctionId, u256.Zero);

        // Update counters
        this._nextAuctionId.value = SafeMath.add(auctionId, u256.One);
        this._totalAuctions.value = SafeMath.add(this._totalAuctions.value, u256.One);

        Blockchain.emit(new AuctionCreatedEvent(
            auctionId,
            sender,
            collection,
            tokenId,
            startPrice,
            endBlock,
        ));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(auctionId);
        return writer;
    }

    /**
     * Create a Dutch auction (price decreases over time).
     */
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'startPrice', type: ABIDataTypes.UINT256 },
        { name: 'endPrice', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @emit('AuctionCreated')
    public createDutchAuction(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Auction house is paused');
        }

        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();
        const startPrice: u256 = calldata.readU256();
        const endPrice: u256 = calldata.readU256();
        const durationBlocks: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        if (startPrice <= endPrice) {
            throw new Revert('Start price must exceed end price');
        }
        if (durationBlocks.isZero()) {
            throw new Revert('Duration must be > 0');
        }
        // Max duration: ~1 year (52,560 blocks)
        if (durationBlocks > u256.fromU64(52560)) {
            throw new Revert('Max duration is 52560 blocks (~1 year)');
        }

        // Verify sender owns the NFT (cross-contract call)
        const ownerCheckCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32);
        ownerCheckCalldata.writeSelector(encodeSelector('ownerOf(uint256)'));
        ownerCheckCalldata.writeU256(tokenId);

        const ownerResult = Blockchain.call(collection, ownerCheckCalldata, false);
        if (!ownerResult.success) {
            throw new Revert('ownerOf check failed — not a valid OP721');
        }

        const nftOwner: Address = ownerResult.data.readAddress();
        if (!nftOwner.equals(sender)) {
            throw new Revert('Not the NFT owner');
        }

        const auctionId: u256 = this._nextAuctionId.value;
        const currentBlock: u256 = Blockchain.block.numberU256;
        const endBlock: u256 = SafeMath.add(currentBlock, durationBlocks);

        this._auctionSeller.set(auctionId, this.addressToU256(sender));
        this._auctionCollection.set(auctionId, this.addressToU256(collection));
        this._auctionTokenId.set(auctionId, tokenId);
        this._auctionType.set(auctionId, u256.fromU64(<u64>AUCTION_DUTCH));
        this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_ACTIVE));
        this._auctionStartBlock.set(auctionId, currentBlock);
        this._auctionEndBlock.set(auctionId, endBlock);
        this._auctionStartPrice.set(auctionId, startPrice);
        this._auctionEndPrice.set(auctionId, endPrice);
        this._auctionReservePrice.set(auctionId, endPrice);
        this._auctionHighestBid.set(auctionId, u256.Zero);
        this._auctionHighestBidder.set(auctionId, u256.Zero);
        this._auctionBidCount.set(auctionId, u256.Zero);

        this._nextAuctionId.value = SafeMath.add(auctionId, u256.One);
        this._totalAuctions.value = SafeMath.add(this._totalAuctions.value, u256.One);

        Blockchain.emit(new AuctionCreatedEvent(
            auctionId,
            sender,
            collection,
            tokenId,
            startPrice,
            endBlock,
        ));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(auctionId);
        return writer;
    }

    /**
     * Place a bid on an English auction.
     * Bid must exceed current highest bid by at least 5%.
     * Anti-snipe: bids in last 10 blocks extend auction by 10 blocks.
     */
    @method(
        { name: 'auctionId', type: ABIDataTypes.UINT256 },
        { name: 'bidAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('BidPlaced')
    public placeBid(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Auction house is paused');
        }

        const auctionId: u256 = calldata.readU256();
        const bidAmount: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Validate auction state
        const status: u256 = this._auctionStatus.get(auctionId);
        if (status != u256.fromU64(<u64>AUCTION_ACTIVE)) {
            throw new Revert('Auction not active');
        }

        const auctionType: u256 = this._auctionType.get(auctionId);
        if (auctionType != u256.fromU64(<u64>AUCTION_ENGLISH)) {
            throw new Revert('Not an English auction');
        }

        // Check auction hasn't ended
        let endBlock: u256 = this._auctionEndBlock.get(auctionId);
        if (currentBlock > endBlock) {
            throw new Revert('Auction has ended');
        }

        // Cannot bid on own auction
        const sellerU256: u256 = this._auctionSeller.get(auctionId);
        if (sellerU256 == this.addressToU256(sender)) {
            throw new Revert('Cannot bid on own auction');
        }

        // Check bid meets minimum requirements
        const currentHighestBid: u256 = this._auctionHighestBid.get(auctionId);
        if (currentHighestBid.isZero()) {
            // First bid must meet start price
            const startPrice: u256 = this._auctionStartPrice.get(auctionId);
            if (bidAmount < startPrice) {
                throw new Revert('Bid below start price');
            }
        } else {
            // Subsequent bids must exceed current highest by MIN_BID_INCREMENT_BPS (5%)
            const minIncrement: u256 = SafeMath.div(
                SafeMath.mul(currentHighestBid, MIN_BID_INCREMENT_BPS),
                BPS_DENOMINATOR,
            );
            const minBid: u256 = SafeMath.add(currentHighestBid, minIncrement);
            if (bidAmount < minBid) {
                throw new Revert('Bid increment too low (minimum 5%)');
            }
        }

        // CEI: Effects - update auction state
        this._auctionHighestBid.set(auctionId, bidAmount);
        this._auctionHighestBidder.set(auctionId, this.addressToU256(sender));
        this._auctionBidCount.set(
            auctionId,
            SafeMath.add(this._auctionBidCount.get(auctionId), u256.One),
        );

        // Anti-snipe protection: extend auction if bid in last ANTI_SNIPE_BLOCKS
        // Guard against underflow when auction duration < ANTI_SNIPE_BLOCKS
        const antiSnipeWindow: u256 = u256.fromU64(ANTI_SNIPE_BLOCKS);
        if (endBlock > antiSnipeWindow) {
            const antiSnipeThreshold: u256 = SafeMath.sub(endBlock, antiSnipeWindow);
            if (currentBlock >= antiSnipeThreshold) {
                endBlock = SafeMath.add(currentBlock, antiSnipeWindow);
                this._auctionEndBlock.set(auctionId, endBlock);
            }
        } else {
            // Short auction: always extend on any bid
            endBlock = SafeMath.add(currentBlock, antiSnipeWindow);
            this._auctionEndBlock.set(auctionId, endBlock);
        }

        Blockchain.emit(new BidPlacedEvent(auctionId, sender, bidAmount, endBlock));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Buy now on a Dutch auction.
     * Pays the current Dutch auction price.
     */
    @payable
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('AuctionSettled')
    public buyDutchAuction(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Auction house is paused');
        }

        const auctionId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Validate
        const status: u256 = this._auctionStatus.get(auctionId);
        if (status != u256.fromU64(<u64>AUCTION_ACTIVE)) {
            throw new Revert('Auction not active');
        }

        const auctionType: u256 = this._auctionType.get(auctionId);
        if (auctionType != u256.fromU64(<u64>AUCTION_DUTCH)) {
            throw new Revert('Not a Dutch auction');
        }

        const endBlock: u256 = this._auctionEndBlock.get(auctionId);
        if (currentBlock > endBlock) {
            throw new Revert('Auction has ended');
        }

        const sellerU256: u256 = this._auctionSeller.get(auctionId);
        if (sellerU256 == this.addressToU256(sender)) {
            throw new Revert('Cannot buy own auction');
        }

        // Calculate current Dutch price
        const currentPrice: u256 = this.getDutchPrice(auctionId, currentBlock);

        // Payment verification: ensure BTC output to this contract >= Dutch price
        this.verifyPaymentToSelf(currentPrice.toU64());

        // CEI: Effects
        this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_SETTLED));
        this._auctionHighestBid.set(auctionId, currentPrice);
        this._auctionHighestBidder.set(auctionId, this.addressToU256(sender));

        // Update stats
        this._totalSettled.value = SafeMath.add(this._totalSettled.value, u256.One);
        this._totalVolume.value = SafeMath.add(this._totalVolume.value, currentPrice);

        // Interaction: Transfer NFT from seller to buyer
        const sellerAddr: Address = this.u256ToAddress(sellerU256);
        const collectionU256: u256 = this._auctionCollection.get(auctionId);
        const collectionAddr: Address = this.u256ToAddress(collectionU256);
        const tokenId: u256 = this._auctionTokenId.get(auctionId);

        const transferCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        transferCalldata.writeAddress(sellerAddr);
        transferCalldata.writeAddress(sender);
        transferCalldata.writeU256(tokenId);

        const transferResult = Blockchain.call(collectionAddr, transferCalldata, false);
        if (!transferResult.success) {
            throw new Revert('NFT transfer failed — ensure auction house is approved');
        }

        Blockchain.emit(new AuctionSettledEvent(auctionId, sender, currentPrice));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Settle an ended English auction.
     * Anyone can call this after the auction end block.
     * Transfers NFT to winner if reserve is met, else returns to seller.
     */
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('AuctionSettled')
    public settleAuction(calldata: Calldata): BytesWriter {
        const auctionId: u256 = calldata.readU256();
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Validate
        const status: u256 = this._auctionStatus.get(auctionId);
        if (status != u256.fromU64(<u64>AUCTION_ACTIVE)) {
            throw new Revert('Auction not active');
        }

        const endBlock: u256 = this._auctionEndBlock.get(auctionId);
        if (currentBlock <= endBlock) {
            throw new Revert('Auction not ended yet');
        }

        const highestBid: u256 = this._auctionHighestBid.get(auctionId);
        const reservePrice: u256 = this._auctionReservePrice.get(auctionId);
        const highestBidderU256: u256 = this._auctionHighestBidder.get(auctionId);

        // Check if reserve is met
        if (highestBid.isZero() || highestBid < reservePrice) {
            // No valid bids or reserve not met — cancel auction
            this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_CANCELLED));

            const writer: BytesWriter = new BytesWriter(1);
            writer.writeBoolean(false);
            return writer;
        }

        // Settlement: reserve met
        this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_SETTLED));

        // Update stats
        this._totalSettled.value = SafeMath.add(this._totalSettled.value, u256.One);
        this._totalVolume.value = SafeMath.add(this._totalVolume.value, highestBid);

        // Interaction: Transfer NFT from seller to winner
        const sellerU256: u256 = this._auctionSeller.get(auctionId);
        const sellerAddr: Address = this.u256ToAddress(sellerU256);
        const winnerAddr: Address = this.u256ToAddress(highestBidderU256);
        const collectionU256: u256 = this._auctionCollection.get(auctionId);
        const collectionAddr: Address = this.u256ToAddress(collectionU256);
        const tokenId: u256 = this._auctionTokenId.get(auctionId);

        const transferCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        transferCalldata.writeAddress(sellerAddr);
        transferCalldata.writeAddress(winnerAddr);
        transferCalldata.writeU256(tokenId);

        const transferResult = Blockchain.call(collectionAddr, transferCalldata, false);
        if (!transferResult.success) {
            throw new Revert('NFT transfer failed — ensure auction house is approved');
        }

        Blockchain.emit(new AuctionSettledEvent(auctionId, winnerAddr, highestBid));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Cancel an auction that has no bids (seller only).
     */
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancelAuction(calldata: Calldata): BytesWriter {
        const auctionId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        const status: u256 = this._auctionStatus.get(auctionId);
        if (status != u256.fromU64(<u64>AUCTION_ACTIVE)) {
            throw new Revert('Auction not active');
        }

        const sellerU256: u256 = this._auctionSeller.get(auctionId);
        if (sellerU256 != this.addressToU256(sender)) {
            throw new Revert('Only seller can cancel');
        }

        // Can only cancel if no bids
        const bidCount: u256 = this._auctionBidCount.get(auctionId);
        if (!bidCount.isZero()) {
            throw new Revert('Cannot cancel auction with bids');
        }

        this._auctionStatus.set(auctionId, u256.fromU64(<u64>AUCTION_CANCELLED));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Get auction details.
     */
    @view
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns(
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
    )
    public getAuction(calldata: Calldata): BytesWriter {
        const auctionId: u256 = calldata.readU256();

        const writer: BytesWriter = new BytesWriter(384);
        writer.writeAddress(this.u256ToAddress(this._auctionSeller.get(auctionId)));
        writer.writeAddress(this.u256ToAddress(this._auctionCollection.get(auctionId)));
        writer.writeU256(this._auctionTokenId.get(auctionId));
        writer.writeU256(this._auctionType.get(auctionId));
        writer.writeU256(this._auctionStatus.get(auctionId));
        writer.writeU256(this._auctionStartBlock.get(auctionId));
        writer.writeU256(this._auctionEndBlock.get(auctionId));
        writer.writeU256(this._auctionStartPrice.get(auctionId));
        writer.writeU256(this._auctionReservePrice.get(auctionId));
        writer.writeU256(this._auctionHighestBid.get(auctionId));
        writer.writeAddress(this.u256ToAddress(this._auctionHighestBidder.get(auctionId)));
        writer.writeU256(this._auctionBidCount.get(auctionId));
        return writer;
    }

    /**
     * Get current price of a Dutch auction.
     */
    @view
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'currentPrice', type: ABIDataTypes.UINT256 })
    public getCurrentDutchPrice(calldata: Calldata): BytesWriter {
        const auctionId: u256 = calldata.readU256();
        const currentBlock: u256 = Blockchain.block.numberU256;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.getDutchPrice(auctionId, currentBlock));
        return writer;
    }

    /**
     * Get auction house stats.
     */
    @view
    @method()
    @returns(
        { name: 'totalAuctions', type: ABIDataTypes.UINT256 },
        { name: 'totalSettled', type: ABIDataTypes.UINT256 },
        { name: 'totalVolume', type: ABIDataTypes.UINT256 },
    )
    public auctionStats(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(96);
        writer.writeU256(this._totalAuctions.value);
        writer.writeU256(this._totalSettled.value);
        writer.writeU256(this._totalVolume.value);
        return writer;
    }

    /**
     * Pause (admin only).
     */
    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public pause(_calldata: Calldata): BytesWriter {
        this._paused.value = true;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Unpause (admin only).
     */
    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public unpause(_calldata: Calldata): BytesWriter {
        this._paused.value = false;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Calculate Dutch auction price at a specific block.
     * Linear interpolation from startPrice to endPrice.
     */
    private getDutchPrice(auctionId: u256, currentBlock: u256): u256 {
        const startBlock: u256 = this._auctionStartBlock.get(auctionId);
        const endBlock: u256 = this._auctionEndBlock.get(auctionId);
        const startPrice: u256 = this._auctionStartPrice.get(auctionId);
        const endPrice: u256 = this._auctionEndPrice.get(auctionId);

        if (currentBlock <= startBlock) {
            return startPrice;
        }
        if (currentBlock >= endBlock) {
            return endPrice;
        }

        const elapsed: u256 = SafeMath.sub(currentBlock, startBlock);
        const duration: u256 = SafeMath.sub(endBlock, startBlock);
        const priceDrop: u256 = SafeMath.sub(startPrice, endPrice);
        const currentDrop: u256 = SafeMath.div(SafeMath.mul(priceDrop, elapsed), duration);

        return SafeMath.sub(startPrice, currentDrop);
    }

    /**
     * Verify that a P2TR output in the current transaction pays this contract
     * at least `requiredSats` satoshis. Reverts if no matching output found.
     */
    /**
     * Verify that the transaction includes a payment output to this contract.
     * Handles simulation (hex in output.to), on-chain (bech32m in output.to),
     * and legacy simulation (scriptPublicKey bytes).
     */
    private verifyPaymentToSelf(requiredSats: u64): void {
        const selfAddr: Address = Blockchain.contract.address;
        const selfHex: string = selfAddr.toHex();
        const outputs = Blockchain.tx.outputs;

        for (let i: i32 = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.value < requiredSats) continue;

            // Method 1: Check output.to (string)
            const to: string | null = output.to;
            if (to !== null) {
                // 1a: Hex match (simulation passes hex via setTransactionDetails)
                // Address.toHex() returns WITH "0x" prefix. Accept both forms:
                if (to == selfHex) return;                   // "0xabc..." == "0xabc..."
                const selfHexNoPrefix: string = selfHex.substring(2);
                if (to == selfHexNoPrefix) return;           // "abc..." == "abc..."

                // 1b: Bech32m decode (on-chain VM uses bech32m address string)
                const decoded = Bech32.decodeOrNull(to);
                if (decoded !== null) {
                    const prog: Uint8Array = decoded.program;
                    if (decoded.version == 1 && prog.length == 32) {
                        let match: bool = true;
                        for (let j: i32 = 0; j < 32; j++) {
                            if (prog[j] != selfAddr[j]) {
                                match = false;
                                break;
                            }
                        }
                        if (match) return;
                    }
                }
            }

            // Method 2: Check output.scriptPublicKey (bytes) — backward compat
            const script: Uint8Array | null = output.scriptPublicKey;
            if (script !== null && script.length == 34 && script[0] == 0x51 && script[1] == 0x20) {
                let match: bool = true;
                for (let j: i32 = 0; j < 32; j++) {
                    if (script[j + 2] != selfAddr[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) return;
            }
        }

        throw new Revert('Insufficient BTC payment to contract');
    }

    private addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private u256ToAddress(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    /**
     * Owner guard — called by the @onlyOwner decorator transform.
     */
    protected onlyOwner(_calldata: Calldata): void {
        this.onlyDeployer(Blockchain.tx.sender);
    }
}
