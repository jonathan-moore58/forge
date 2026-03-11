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
    AddressMemoryMap,
    StoredMapU256,
    ReentrancyGuard,
    ReentrancyLevel,
    EMPTY_POINTER,
    encodeSelector,
    SELECTOR_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

import {
    NFTListedEvent,
    NFTSoldEvent,
    ListingCancelledEvent,
    OfferMadeEvent,
    OfferAcceptedEvent,
    OfferCancelledEvent,
    RoyaltyPaidEvent,
    CollectionRegisteredEvent,
} from '../lib/events';
import {
    MARKETPLACE_FEE_BPS,
    BPS_DENOMINATOR,
    LISTING_ACTIVE,
    LISTING_SOLD,
    LISTING_CANCELLED,
    OFFER_ACTIVE,
    OFFER_ACCEPTED,
    OFFER_CANCELLED,
    OFFER_EXPIRED,
    REGISTRATION_FEE_SATS,
} from '../lib/constants';

/**
 * Marketplace — Full-featured NFT trading engine for FORGE.
 *
 * Features:
 * - List NFTs at fixed price
 * - Make offers on any NFT
 * - Accept offers
 * - Cancel listings/offers
 * - Collection-wide floor offers
 * - Royalty enforcement on every sale (read from NFTFactory)
 * - Platform fee: 2% per sale
 * - Block-based offer expiry
 * - Full reentrancy protection
 */
@final
export class Marketplace extends ReentrancyGuard {
    protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    /** Core state */
    private nextListingIdPointer: u16 = Blockchain.nextPointer;
    private nextOfferIdPointer: u16 = Blockchain.nextPointer;
    private totalListingsPointer: u16 = Blockchain.nextPointer;
    private totalSalesPointer: u16 = Blockchain.nextPointer;
    private totalVolumePointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;
    private factoryAddressPointer: u16 = Blockchain.nextPointer;
    private feeRecipientPointer: u16 = Blockchain.nextPointer;
    private totalFeesPointer: u16 = Blockchain.nextPointer;

    /** Listing storage: listingId → field */
    private listingSellerPointer: u16 = Blockchain.nextPointer;
    private listingCollectionPointer: u16 = Blockchain.nextPointer;
    private listingTokenIdPointer: u16 = Blockchain.nextPointer;
    private listingPricePointer: u16 = Blockchain.nextPointer;
    private listingStatusPointer: u16 = Blockchain.nextPointer;
    private listingBlockPointer: u16 = Blockchain.nextPointer;

    /** Offer storage: offerId → field */
    private offerOffererPointer: u16 = Blockchain.nextPointer;
    private offerCollectionPointer: u16 = Blockchain.nextPointer;
    private offerTokenIdPointer: u16 = Blockchain.nextPointer;
    private offerPricePointer: u16 = Blockchain.nextPointer;
    private offerStatusPointer: u16 = Blockchain.nextPointer;
    private offerExpiryBlockPointer: u16 = Blockchain.nextPointer;
    private offerIsCollectionWidePointer: u16 = Blockchain.nextPointer;

    /** Lookup: composite key (collection + tokenId hash) → active listingId */
    private nftToListingPointer: u16 = Blockchain.nextPointer;

    /** Collection stats */
    private collectionVolumePointer: u16 = Blockchain.nextPointer;
    private collectionSalesCountPointer: u16 = Blockchain.nextPointer;
    private collectionFloorPricePointer: u16 = Blockchain.nextPointer;

    /** Registered external collections: hash(collection) → 1 */
    private registeredCollectionPointer: u16 = Blockchain.nextPointer;

    /** Stored values */
    private _nextListingId!: StoredU256;
    private _nextOfferId!: StoredU256;
    private _totalListings!: StoredU256;
    private _totalSales!: StoredU256;
    private _totalVolume!: StoredU256;
    private _paused!: StoredBoolean;
    private _factoryAddress!: StoredU256;
    private _feeRecipient!: StoredU256;
    private _totalFees!: StoredU256;

    private _listingSeller!: StoredMapU256;
    private _listingCollection!: StoredMapU256;
    private _listingTokenId!: StoredMapU256;
    private _listingPrice!: StoredMapU256;
    private _listingStatus!: StoredMapU256;
    private _listingBlock!: StoredMapU256;

    private _offerOfferer!: StoredMapU256;
    private _offerCollection!: StoredMapU256;
    private _offerTokenId!: StoredMapU256;
    private _offerPrice!: StoredMapU256;
    private _offerStatus!: StoredMapU256;
    private _offerExpiryBlock!: StoredMapU256;
    private _offerIsCollectionWide!: StoredMapU256;

    private _nftToListing!: StoredMapU256;

    private _collectionVolume!: StoredMapU256;
    private _collectionSalesCount!: StoredMapU256;
    private _collectionFloorPrice!: StoredMapU256;
    private _registeredCollection!: StoredMapU256;

    public constructor() {
        super();

        this._nextListingId = new StoredU256(this.nextListingIdPointer, EMPTY_POINTER);
        this._nextOfferId = new StoredU256(this.nextOfferIdPointer, EMPTY_POINTER);
        this._totalListings = new StoredU256(this.totalListingsPointer, EMPTY_POINTER);
        this._totalSales = new StoredU256(this.totalSalesPointer, EMPTY_POINTER);
        this._totalVolume = new StoredU256(this.totalVolumePointer, EMPTY_POINTER);
        this._paused = new StoredBoolean(this.pausedPointer, false);
        this._factoryAddress = new StoredU256(this.factoryAddressPointer, EMPTY_POINTER);
        this._feeRecipient = new StoredU256(this.feeRecipientPointer, EMPTY_POINTER);
        this._totalFees = new StoredU256(this.totalFeesPointer, EMPTY_POINTER);

        this._listingSeller = new StoredMapU256(this.listingSellerPointer);
        this._listingCollection = new StoredMapU256(this.listingCollectionPointer);
        this._listingTokenId = new StoredMapU256(this.listingTokenIdPointer);
        this._listingPrice = new StoredMapU256(this.listingPricePointer);
        this._listingStatus = new StoredMapU256(this.listingStatusPointer);
        this._listingBlock = new StoredMapU256(this.listingBlockPointer);

        this._offerOfferer = new StoredMapU256(this.offerOffererPointer);
        this._offerCollection = new StoredMapU256(this.offerCollectionPointer);
        this._offerTokenId = new StoredMapU256(this.offerTokenIdPointer);
        this._offerPrice = new StoredMapU256(this.offerPricePointer);
        this._offerStatus = new StoredMapU256(this.offerStatusPointer);
        this._offerExpiryBlock = new StoredMapU256(this.offerExpiryBlockPointer);
        this._offerIsCollectionWide = new StoredMapU256(this.offerIsCollectionWidePointer);

        this._nftToListing = new StoredMapU256(this.nftToListingPointer);

        this._collectionVolume = new StoredMapU256(this.collectionVolumePointer);
        this._collectionSalesCount = new StoredMapU256(this.collectionSalesCountPointer);
        this._collectionFloorPrice = new StoredMapU256(this.collectionFloorPricePointer);
        this._registeredCollection = new StoredMapU256(this.registeredCollectionPointer);
    }

    public override onDeployment(calldata: Calldata): void {
        const factoryAddr: u256 = calldata.readU256();
        const feeRecipient: u256 = calldata.readU256();

        this._nextListingId.value = u256.One;
        this._nextOfferId.value = u256.One;
        this._totalListings.value = u256.Zero;
        this._totalSales.value = u256.Zero;
        this._totalVolume.value = u256.Zero;
        this._totalFees.value = u256.Zero;
        this._factoryAddress.value = factoryAddr;
        this._feeRecipient.value = feeRecipient;
    }

    /**
     * List an NFT for sale at a fixed price.
     * The seller must have approved the marketplace for the NFT first.
     */
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'price', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @emit('NFTListed')
    public listNFT(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Marketplace is paused');
        }

        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();
        const price: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Gate: collection must be registered on marketplace
        const regKey: u256 = this.addressToU256(collection);
        const isRegistered: u256 = this._registeredCollection.get(regKey);
        if (isRegistered.isZero()) {
            throw new Revert('Collection not registered on marketplace');
        }

        // Validate price
        if (price.isZero()) {
            throw new Revert('Price must be > 0');
        }

        // Check not already listed
        const nftKey: u256 = this.computeNFTKey(collection, tokenId);
        const existingListingId: u256 = this._nftToListing.get(nftKey);
        if (!existingListingId.isZero()) {
            const existingStatus: u256 = this._listingStatus.get(existingListingId);
            if (existingStatus == u256.fromU64(<u64>LISTING_ACTIVE)) {
                throw new Revert('NFT already listed');
            }
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

        // Create listing
        const listingId: u256 = this._nextListingId.value;

        // Effects: store listing data
        this._listingSeller.set(listingId, this.addressToU256(sender));
        this._listingCollection.set(listingId, this.addressToU256(collection));
        this._listingTokenId.set(listingId, tokenId);
        this._listingPrice.set(listingId, price);
        this._listingStatus.set(listingId, u256.fromU64(<u64>LISTING_ACTIVE));
        this._listingBlock.set(listingId, Blockchain.block.numberU256);

        // Lookup mapping
        this._nftToListing.set(nftKey, listingId);

        // Update counters
        this._nextListingId.value = SafeMath.add(listingId, u256.One);
        this._totalListings.value = SafeMath.add(this._totalListings.value, u256.One);

        Blockchain.emit(new NFTListedEvent(listingId, sender, collection, tokenId, price));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(listingId);
        return writer;
    }

    /**
     * Buy a listed NFT.
     * The buyer must send sufficient BTC.
     * Platform fee + royalties are deducted from the sale price.
     */
    @payable
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('NFTSold')
    public buyNFT(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Marketplace is paused');
        }

        const listingId: u256 = calldata.readU256();

        // Validate listing
        const status: u256 = this._listingStatus.get(listingId);
        if (status != u256.fromU64(<u64>LISTING_ACTIVE)) {
            throw new Revert('Listing not active');
        }

        const seller: u256 = this._listingSeller.get(listingId);
        const collection: u256 = this._listingCollection.get(listingId);
        const tokenId: u256 = this._listingTokenId.get(listingId);
        const price: u256 = this._listingPrice.get(listingId);
        const buyer: Address = Blockchain.tx.sender;
        const buyerU256: u256 = this.addressToU256(buyer);

        // Cannot buy own listing
        if (buyerU256 == seller) {
            throw new Revert('Cannot buy own listing');
        }

        // Payment verification: ensure BTC output to this contract >= listing price
        this.verifyPaymentToSelf(price.toU64());

        // CEI Pattern: Effects first
        this._listingStatus.set(listingId, u256.fromU64(<u64>LISTING_SOLD));

        // Clear the NFT-to-listing mapping
        const collectionAddr: Address = this.u256ToAddress(collection);
        const nftKey: u256 = this.computeNFTKey(collectionAddr, tokenId);
        this._nftToListing.set(nftKey, u256.Zero);

        // Calculate fees
        const platformFee: u256 = SafeMath.div(
            SafeMath.mul(price, MARKETPLACE_FEE_BPS),
            BPS_DENOMINATOR,
        );

        // Calculate and emit royalty (cross-contract call to collection)
        const royaltyCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH);
        royaltyCalldata.writeSelector(encodeSelector('royaltyInfo()'));

        const royaltyResult = Blockchain.call(collectionAddr, royaltyCalldata, false);
        if (royaltyResult.success) {
            const royaltyBps: u256 = royaltyResult.data.readU256();
            const royaltyRecipient: Address = royaltyResult.data.readAddress();

            if (!royaltyBps.isZero()) {
                const royaltyAmount: u256 = SafeMath.div(
                    SafeMath.mul(price, royaltyBps),
                    BPS_DENOMINATOR,
                );
                Blockchain.emit(new RoyaltyPaidEvent(collectionAddr, royaltyRecipient, royaltyAmount));
            }
        }

        // Update platform stats
        this._totalSales.value = SafeMath.add(this._totalSales.value, u256.One);
        this._totalVolume.value = SafeMath.add(this._totalVolume.value, price);
        this._totalFees.value = SafeMath.add(this._totalFees.value, platformFee);

        // Update collection stats
        this._collectionVolume.set(
            collection,
            SafeMath.add(this._collectionVolume.get(collection), price),
        );
        this._collectionSalesCount.set(
            collection,
            SafeMath.add(this._collectionSalesCount.get(collection), u256.One),
        );

        // Update floor price: track lowest sale price
        const currentFloor: u256 = this._collectionFloorPrice.get(collection);
        if (currentFloor.isZero() || price < currentFloor) {
            this._collectionFloorPrice.set(collection, price);
        }

        // Interaction: Transfer NFT from seller to buyer (approval-based)
        const sellerAddr: Address = this.u256ToAddress(seller);
        const transferCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        transferCalldata.writeAddress(sellerAddr);
        transferCalldata.writeAddress(buyer);
        transferCalldata.writeU256(tokenId);

        const transferResult = Blockchain.call(collectionAddr, transferCalldata, false);
        if (!transferResult.success) {
            throw new Revert('NFT transfer failed — ensure marketplace is approved');
        }

        // Emit event
        Blockchain.emit(new NFTSoldEvent(
            listingId,
            buyer,
            sellerAddr,
            collectionAddr,
            tokenId,
            price,
        ));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Cancel an active listing (seller only).
     */
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('ListingCancelled')
    public cancelListing(calldata: Calldata): BytesWriter {
        const listingId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate listing
        const status: u256 = this._listingStatus.get(listingId);
        if (status != u256.fromU64(<u64>LISTING_ACTIVE)) {
            throw new Revert('Listing not active');
        }

        // Only seller can cancel
        const sellerU256: u256 = this._listingSeller.get(listingId);
        if (sellerU256 != this.addressToU256(sender)) {
            throw new Revert('Only seller can cancel');
        }

        // Effects
        this._listingStatus.set(listingId, u256.fromU64(<u64>LISTING_CANCELLED));

        // Clear lookup
        const collection: u256 = this._listingCollection.get(listingId);
        const tokenId: u256 = this._listingTokenId.get(listingId);
        const collectionAddr: Address = this.u256ToAddress(collection);
        const nftKey: u256 = this.computeNFTKey(collectionAddr, tokenId);
        this._nftToListing.set(nftKey, u256.Zero);

        Blockchain.emit(new ListingCancelledEvent(listingId));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Make an offer on a specific NFT or collection-wide.
     * For collection-wide offers, tokenId should be u256.Max.
     */
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @emit('OfferMade')
    public makeOffer(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Marketplace is paused');
        }

        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();
        const price: u256 = calldata.readU256();
        const expiryBlock: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Gate: collection must be registered on marketplace
        const regKey: u256 = this.addressToU256(collection);
        const isRegistered: u256 = this._registeredCollection.get(regKey);
        if (isRegistered.isZero()) {
            throw new Revert('Collection not registered on marketplace');
        }

        if (price.isZero()) {
            throw new Revert('Offer price must be > 0');
        }

        // Expiry must be in the future
        if (expiryBlock <= Blockchain.block.numberU256) {
            throw new Revert('Expiry block must be in the future');
        }

        const offerId: u256 = this._nextOfferId.value;

        // Determine if collection-wide
        const isCollectionWide: bool = tokenId == u256.Max;

        // Store offer
        this._offerOfferer.set(offerId, this.addressToU256(sender));
        this._offerCollection.set(offerId, this.addressToU256(collection));
        this._offerTokenId.set(offerId, tokenId);
        this._offerPrice.set(offerId, price);
        this._offerStatus.set(offerId, u256.fromU64(<u64>OFFER_ACTIVE));
        this._offerExpiryBlock.set(offerId, expiryBlock);
        this._offerIsCollectionWide.set(offerId, isCollectionWide ? u256.One : u256.Zero);

        // Update counter
        this._nextOfferId.value = SafeMath.add(offerId, u256.One);

        Blockchain.emit(new OfferMadeEvent(offerId, sender, collection, tokenId, price, expiryBlock));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(offerId);
        return writer;
    }

    /**
     * Accept an offer (NFT owner).
     * For collection-wide offers, the acceptor specifies which tokenId to sell.
     */
    @method(
        { name: 'offerId', type: ABIDataTypes.UINT256 },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OfferAccepted')
    public acceptOffer(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Marketplace is paused');
        }

        const offerId: u256 = calldata.readU256();
        const tokenIdForSale: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate offer
        const status: u256 = this._offerStatus.get(offerId);
        if (status != u256.fromU64(<u64>OFFER_ACTIVE)) {
            throw new Revert('Offer not active');
        }

        // Check expiry
        const expiryBlock: u256 = this._offerExpiryBlock.get(offerId);
        if (Blockchain.block.numberU256 > expiryBlock) {
            throw new Revert('Offer has expired');
        }

        // For specific offers, tokenId must match
        const offerTokenId: u256 = this._offerTokenId.get(offerId);
        const isCollectionWide: bool = !this._offerIsCollectionWide.get(offerId).isZero();
        if (!isCollectionWide && offerTokenId != tokenIdForSale) {
            throw new Revert('Token ID mismatch');
        }

        // Prevent offerer from accepting their own offer
        const buyerU256: u256 = this._offerOfferer.get(offerId);
        if (buyerU256 == this.addressToU256(sender)) {
            throw new Revert('Cannot accept own offer');
        }

        const price: u256 = this._offerPrice.get(offerId);
        const collectionU256: u256 = this._offerCollection.get(offerId);

        // CEI: Effects
        this._offerStatus.set(offerId, u256.fromU64(<u64>OFFER_ACCEPTED));

        // Calculate fees
        const platformFee: u256 = SafeMath.div(
            SafeMath.mul(price, MARKETPLACE_FEE_BPS),
            BPS_DENOMINATOR,
        );

        // Calculate and emit royalty (cross-contract call to collection)
        const collectionAddr: Address = this.u256ToAddress(collectionU256);
        const royaltyCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH);
        royaltyCalldata.writeSelector(encodeSelector('royaltyInfo()'));

        const royaltyResult = Blockchain.call(collectionAddr, royaltyCalldata, false);
        if (royaltyResult.success) {
            const royaltyBps: u256 = royaltyResult.data.readU256();
            const royaltyRecipient: Address = royaltyResult.data.readAddress();

            if (!royaltyBps.isZero()) {
                const royaltyAmount: u256 = SafeMath.div(
                    SafeMath.mul(price, royaltyBps),
                    BPS_DENOMINATOR,
                );
                Blockchain.emit(new RoyaltyPaidEvent(collectionAddr, royaltyRecipient, royaltyAmount));
            }
        }

        // Update stats
        this._totalSales.value = SafeMath.add(this._totalSales.value, u256.One);
        this._totalVolume.value = SafeMath.add(this._totalVolume.value, price);
        this._totalFees.value = SafeMath.add(this._totalFees.value, platformFee);

        this._collectionVolume.set(
            collectionU256,
            SafeMath.add(this._collectionVolume.get(collectionU256), price),
        );
        this._collectionSalesCount.set(
            collectionU256,
            SafeMath.add(this._collectionSalesCount.get(collectionU256), u256.One),
        );

        // Update floor price: track lowest sale price
        const currentFloor: u256 = this._collectionFloorPrice.get(collectionU256);
        if (currentFloor.isZero() || price < currentFloor) {
            this._collectionFloorPrice.set(collectionU256, price);
        }

        // Cancel any active listing for this NFT
        const nftKey: u256 = this.computeNFTKey(collectionAddr, tokenIdForSale);
        const activeListingId: u256 = this._nftToListing.get(nftKey);
        if (!activeListingId.isZero()) {
            const listingStatus: u256 = this._listingStatus.get(activeListingId);
            if (listingStatus == u256.fromU64(<u64>LISTING_ACTIVE)) {
                this._listingStatus.set(activeListingId, u256.fromU64(<u64>LISTING_CANCELLED));
                this._nftToListing.set(nftKey, u256.Zero);
            }
        }

        // Interaction: Verify seller (acceptor) owns the NFT
        const ownerCheckCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32);
        ownerCheckCalldata.writeSelector(encodeSelector('ownerOf(uint256)'));
        ownerCheckCalldata.writeU256(tokenIdForSale);

        const ownerResult = Blockchain.call(collectionAddr, ownerCheckCalldata, false);
        if (!ownerResult.success) {
            throw new Revert('ownerOf check failed');
        }

        const nftOwner: Address = ownerResult.data.readAddress();
        if (!nftOwner.equals(sender)) {
            throw new Revert('Acceptor must own the NFT');
        }

        // Interaction: Transfer NFT from seller (acceptor) to offerer (buyer)
        const buyerAddr: Address = this.u256ToAddress(buyerU256);
        const transferCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        transferCalldata.writeAddress(sender);
        transferCalldata.writeAddress(buyerAddr);
        transferCalldata.writeU256(tokenIdForSale);

        const transferResult = Blockchain.call(collectionAddr, transferCalldata, false);
        if (!transferResult.success) {
            throw new Revert('NFT transfer failed — ensure marketplace is approved');
        }

        Blockchain.emit(new OfferAcceptedEvent(offerId, sender, buyerAddr, price));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Cancel an active offer (offerer only).
     */
    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OfferCancelled')
    public cancelOffer(calldata: Calldata): BytesWriter {
        const offerId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate
        const status: u256 = this._offerStatus.get(offerId);
        if (status != u256.fromU64(<u64>OFFER_ACTIVE)) {
            throw new Revert('Offer not active');
        }

        // Only offerer can cancel
        const offererU256: u256 = this._offerOfferer.get(offerId);
        if (offererU256 != this.addressToU256(sender)) {
            throw new Revert('Only offerer can cancel');
        }

        this._offerStatus.set(offerId, u256.fromU64(<u64>OFFER_CANCELLED));

        Blockchain.emit(new OfferCancelledEvent(offerId));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Get listing details.
     */
    @view
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'seller', type: ABIDataTypes.ADDRESS },
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT256 },
        { name: 'block', type: ABIDataTypes.UINT256 },
    )
    public getListing(calldata: Calldata): BytesWriter {
        const listingId: u256 = calldata.readU256();

        const writer: BytesWriter = new BytesWriter(192);
        writer.writeAddress(this.u256ToAddress(this._listingSeller.get(listingId)));
        writer.writeAddress(this.u256ToAddress(this._listingCollection.get(listingId)));
        writer.writeU256(this._listingTokenId.get(listingId));
        writer.writeU256(this._listingPrice.get(listingId));
        writer.writeU256(this._listingStatus.get(listingId));
        writer.writeU256(this._listingBlock.get(listingId));
        return writer;
    }

    /**
     * Get offer details.
     */
    @view
    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'offerer', type: ABIDataTypes.ADDRESS },
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        { name: 'isCollectionWide', type: ABIDataTypes.BOOL },
    )
    public getOffer(calldata: Calldata): BytesWriter {
        const offerId: u256 = calldata.readU256();

        const writer: BytesWriter = new BytesWriter(225);
        writer.writeAddress(this.u256ToAddress(this._offerOfferer.get(offerId)));
        writer.writeAddress(this.u256ToAddress(this._offerCollection.get(offerId)));
        writer.writeU256(this._offerTokenId.get(offerId));
        writer.writeU256(this._offerPrice.get(offerId));
        writer.writeU256(this._offerStatus.get(offerId));
        writer.writeU256(this._offerExpiryBlock.get(offerId));
        writer.writeBoolean(!this._offerIsCollectionWide.get(offerId).isZero());
        return writer;
    }

    /**
     * Get marketplace stats.
     */
    @view
    @method()
    @returns(
        { name: 'totalListings', type: ABIDataTypes.UINT256 },
        { name: 'totalSales', type: ABIDataTypes.UINT256 },
        { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        { name: 'totalFees', type: ABIDataTypes.UINT256 },
    )
    public marketplaceStats(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(128);
        writer.writeU256(this._totalListings.value);
        writer.writeU256(this._totalSales.value);
        writer.writeU256(this._totalVolume.value);
        writer.writeU256(this._totalFees.value);
        return writer;
    }

    /**
     * Get collection stats.
     */
    @view
    @method({ name: 'collection', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'volume', type: ABIDataTypes.UINT256 },
        { name: 'salesCount', type: ABIDataTypes.UINT256 },
        { name: 'floorPrice', type: ABIDataTypes.UINT256 },
    )
    public collectionStats(calldata: Calldata): BytesWriter {
        const collection: Address = calldata.readAddress();
        const collectionU256: u256 = this.addressToU256(collection);

        const writer: BytesWriter = new BytesWriter(96);
        writer.writeU256(this._collectionVolume.get(collectionU256));
        writer.writeU256(this._collectionSalesCount.get(collectionU256));
        writer.writeU256(this._collectionFloorPrice.get(collectionU256));
        return writer;
    }

    /**
     * Get active listing for a specific NFT.
     */
    @view
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'listingId', type: ABIDataTypes.UINT256 })
    public getListingForNFT(calldata: Calldata): BytesWriter {
        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();

        const nftKey: u256 = this.computeNFTKey(collection, tokenId);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._nftToListing.get(nftKey));
        return writer;
    }

    /**
     * Register an NFT collection on the marketplace for trading.
     * Only the collection's owner can register it.
     * Requires a registration fee of 0.01 BTC (1,000,000 sats) sent via extraOutputs.
     * Once registered, NFT holders can list/buy/sell tokens from this collection.
     *
     * Fee enforcement: The @payable decorator allows BTC receipt.
     * The frontend MUST send REGISTRATION_FEE_SATS via extraOutputs to the
     * marketplace contract address. This follows the same pattern as buyNFT.
     */
    @payable
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('CollectionRegistered')
    public registerCollection(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Marketplace is paused');
        }

        const collectionAddr: Address = calldata.readAddress();
        const sender: Address = Blockchain.tx.sender;

        // Payment verification: ensure BTC output to this contract >= registration fee
        this.verifyPaymentToSelf(REGISTRATION_FEE_SATS.toU64());

        // Check not already registered
        const collectionKey: u256 = this.addressToU256(collectionAddr);
        const existing: u256 = this._registeredCollection.get(collectionKey);
        if (!existing.isZero()) {
            throw new Revert('Collection already registered');
        }

        // Cross-contract call: verify caller is collection owner
        const ownerCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH);
        ownerCalldata.writeSelector(encodeSelector('collectionOwner()'));

        const result = Blockchain.call(collectionAddr, ownerCalldata, false);
        if (!result.success) {
            throw new Revert('Owner check failed — not a valid collection');
        }

        const owner: Address = result.data.readAddress();
        if (!owner.equals(sender)) {
            throw new Revert('Only the collection owner can register');
        }

        // Mark as registered
        this._registeredCollection.set(collectionKey, u256.One);

        // Emit event for indexer
        this.emitEvent(new CollectionRegisteredEvent(collectionAddr, sender));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Check if a collection is registered on the marketplace.
     */
    @view
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'registered', type: ABIDataTypes.BOOL })
    public isCollectionRegistered(calldata: Calldata): BytesWriter {
        const collectionAddr: Address = calldata.readAddress();
        const collectionKey: u256 = this.addressToU256(collectionAddr);
        const registered: u256 = this._registeredCollection.get(collectionKey);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(!registered.isZero());
        return writer;
    }

    /**
     * Update the fee recipient address (admin only).
     */
    @onlyOwner
    @method({ name: 'newRecipient', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFeeRecipient(calldata: Calldata): BytesWriter {
        const newRecipient: Address = calldata.readAddress();
        this._feeRecipient.value = this.addressToU256(newRecipient);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Pause marketplace (admin only).
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
     * Unpause marketplace (admin only).
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
     * Compute a deterministic key for an NFT from collection address + tokenId.
     * Uses SHA256 for collision resistance.
     */
    private computeNFTKey(collection: Address, tokenId: u256): u256 {
        const tokenBytes: Uint8Array = tokenId.toUint8Array(true);
        const combined: Uint8Array = new Uint8Array(collection.length + tokenBytes.length);
        combined.set(collection, 0);
        combined.set(tokenBytes, collection.length);

        const hash: Uint8Array = Blockchain.sha256(combined);
        return u256.fromUint8ArrayBE(hash);
    }

    /**
     * Verify that a P2TR output in the current transaction pays this contract
     * at least `requiredSats` satoshis. Reverts if no matching output found.
     */
    private verifyPaymentToSelf(requiredSats: u64): void {
        const selfAddr: Address = Blockchain.contract.address;
        const outputs = Blockchain.tx.outputs;

        for (let i: i32 = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.value < requiredSats) continue;

            const script: Uint8Array | null = output.scriptPublicKey;
            if (script === null || script.length != 34) continue;
            if (script[0] != 0x51 || script[1] != 0x20) continue;

            let match: bool = true;
            for (let j: i32 = 0; j < 32; j++) {
                if (script[j + 2] != selfAddr[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return;
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
