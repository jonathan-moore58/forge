import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP_NET,
    Blockchain,
    Address,
    ADDRESS_BYTE_LENGTH,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    StoredMapU256,
    EMPTY_POINTER,
    encodeSelector,
    SELECTOR_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

import { CollectionCreatedEvent, CollectionVerifiedEvent } from '../lib/events';

/**
 * CollectionRegistry — Lightweight on-chain discovery contract.
 *
 * Collections register themselves after deployment so the launchpad
 * can enumerate them. The register() method uses a cross-contract
 * call to verify that the caller owns the collection.
 *
 * Admin (deployer) can verify or remove collections.
 */

@final
export class CollectionRegistry extends OP_NET {
    /* ------------------------------------------------------------------ */
    /*  Storage Pointers                                                    */
    /* ------------------------------------------------------------------ */

    private totalCollectionsPointer: u16 = Blockchain.nextPointer;
    private collectionAddressMapPointer: u16 = Blockchain.nextPointer;
    private collectionCreatorMapPointer: u16 = Blockchain.nextPointer;
    private collectionBlockMapPointer: u16 = Blockchain.nextPointer;
    private collectionVerifiedMapPointer: u16 = Blockchain.nextPointer;
    private addressToIdMapPointer: u16 = Blockchain.nextPointer;

    /* ------------------------------------------------------------------ */
    /*  Stored values                                                       */
    /* ------------------------------------------------------------------ */

    private _totalCollections!: StoredU256;
    private _collectionAddressMap!: StoredMapU256;
    private _collectionCreatorMap!: StoredMapU256;
    private _collectionBlockMap!: StoredMapU256;
    private _collectionVerifiedMap!: StoredMapU256;
    private _addressToIdMap!: StoredMapU256;

    public constructor() {
        super();

        this._totalCollections = new StoredU256(this.totalCollectionsPointer, EMPTY_POINTER);
        this._collectionAddressMap = new StoredMapU256(this.collectionAddressMapPointer);
        this._collectionCreatorMap = new StoredMapU256(this.collectionCreatorMapPointer);
        this._collectionBlockMap = new StoredMapU256(this.collectionBlockMapPointer);
        this._collectionVerifiedMap = new StoredMapU256(this.collectionVerifiedMapPointer);
        this._addressToIdMap = new StoredMapU256(this.addressToIdMapPointer);
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
    }

    /* ================================================================== */
    /*  WRITE METHODS                                                      */
    /* ================================================================== */

    /**
     * Register a collection. Verifies caller owns the collection via
     * cross-contract call to collectionOwner().
     *
     * @param collectionAddress — the deployed collection contract
     * @returns collectionId — the sequential ID assigned
     */
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    public register(calldata: Calldata): BytesWriter {
        const collectionAddress: Address = calldata.readAddress();
        const sender: Address = Blockchain.tx.sender;

        // Address → u256 (Address extends Array<u8>, pass directly)
        const addrKey: u256 = u256.fromUint8ArrayBE(collectionAddress);
        const existingId: u256 = this._addressToIdMap.get(addrKey);
        if (!existingId.isZero()) {
            throw new Revert('Already registered');
        }

        // Cross-contract call: verify caller is collection owner
        const ownerCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH);
        ownerCalldata.writeSelector(encodeSelector('collectionOwner()'));

        const result = Blockchain.call(collectionAddress, ownerCalldata, false);
        if (!result.success) {
            throw new Revert('Owner check failed');
        }

        const owner: Address = result.data.readAddress();
        if (owner !== sender) {
            throw new Revert('Not collection owner');
        }

        // Assign sequential ID (1-based)
        const newId: u256 = SafeMath.add(this._totalCollections.value, u256.One);
        this._totalCollections.value = newId;

        // Store mappings
        this._collectionAddressMap.set(newId, addrKey);
        this._collectionCreatorMap.set(newId, u256.fromUint8ArrayBE(sender));
        this._collectionBlockMap.set(newId, Blockchain.block.numberU256);
        this._collectionVerifiedMap.set(newId, u256.Zero); // Not verified by default

        // Reverse map: address → id
        this._addressToIdMap.set(addrKey, newId);

        Blockchain.emit(new CollectionCreatedEvent(sender, newId, collectionAddress));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(newId);
        return writer;
    }

    /**
     * Set verified status for a collection. Admin (deployer) only.
     */
    @method(
        { name: 'collectionId', type: ABIDataTypes.UINT256 },
        { name: 'verified', type: ABIDataTypes.BOOL },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setVerified(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const collectionId: u256 = calldata.readU256();
        const verified: bool = calldata.readBoolean();

        // Verify collection exists
        const addrAsU256: u256 = this._collectionAddressMap.get(collectionId);
        if (addrAsU256.isZero()) {
            throw new Revert('Collection not found');
        }

        this._collectionVerifiedMap.set(collectionId, verified ? u256.One : u256.Zero);
        Blockchain.emit(new CollectionVerifiedEvent(collectionId));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Remove a collection from the registry. Admin (deployer) only.
     * Does NOT decrement totalCollections (gaps are OK).
     */
    @method({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public removeCollection(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const collectionId: u256 = calldata.readU256();

        // Verify collection exists
        const addrAsU256: u256 = this._collectionAddressMap.get(collectionId);
        if (addrAsU256.isZero()) {
            throw new Revert('Collection not found');
        }

        // Clear reverse map
        this._addressToIdMap.set(addrAsU256, u256.Zero);

        // Clear forward maps
        this._collectionAddressMap.set(collectionId, u256.Zero);
        this._collectionCreatorMap.set(collectionId, u256.Zero);
        this._collectionBlockMap.set(collectionId, u256.Zero);
        this._collectionVerifiedMap.set(collectionId, u256.Zero);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================== */
    /*  VIEW METHODS                                                       */
    /* ================================================================== */

    /** Get total number of registered collections. */
    @view
    @method()
    @returns({ name: 'total', type: ABIDataTypes.UINT256 })
    public totalCollections(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._totalCollections.value);
        return writer;
    }

    /**
     * Get collection data by ID.
     * Returns address, creator, registeredAt block, verified status.
     */
    @view
    @method({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'collectionAddress', type: ABIDataTypes.ADDRESS },
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'registeredAt', type: ABIDataTypes.UINT256 },
        { name: 'verified', type: ABIDataTypes.BOOL },
    )
    public getCollection(calldata: Calldata): BytesWriter {
        const collectionId: u256 = calldata.readU256();

        const addrAsU256: u256 = this._collectionAddressMap.get(collectionId);
        const creatorAsU256: u256 = this._collectionCreatorMap.get(collectionId);
        const registeredAt: u256 = this._collectionBlockMap.get(collectionId);
        const verifiedU256: u256 = this._collectionVerifiedMap.get(collectionId);

        // Convert u256 back to addresses (same pattern as OP721._addressFromU256)
        const collectionAddress: Address = this.addressFromU256(addrAsU256);
        const creator: Address = this.addressFromU256(creatorAsU256);

        const writer: BytesWriter = new BytesWriter(
            ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + 32 + 1,
        );
        writer.writeAddress(collectionAddress);
        writer.writeAddress(creator);
        writer.writeU256(registeredAt);
        writer.writeBoolean(!verifiedU256.isZero());
        return writer;
    }

    /**
     * Get collection ID by address. Returns 0 if not registered.
     */
    @view
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    public getCollectionByAddress(calldata: Calldata): BytesWriter {
        const collectionAddress: Address = calldata.readAddress();
        const addrKey: u256 = u256.fromUint8ArrayBE(collectionAddress);
        const id: u256 = this._addressToIdMap.get(addrKey);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(id);
        return writer;
    }

    /* ================================================================== */
    /*  PRIVATE HELPERS                                                    */
    /* ================================================================== */

    /** Convert u256 back to Address (32 bytes). Same as OP721._addressFromU256. */
    private addressFromU256(value: u256): Address {
        const bytes = value.toUint8Array(true); // 32 bytes in BE
        const addr = new Address([]);
        for (let i: i32 = 0; i < 32; i++) {
            addr[i] = bytes[i];
        }
        return addr;
    }
}
