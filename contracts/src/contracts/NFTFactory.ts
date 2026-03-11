import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    StoredAddress,
    OP_NET,
    EMPTY_POINTER,
    AddressMemoryMap,
    encodeSelector,
    SELECTOR_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

// Note: encodeSelector + SELECTOR_BYTE_LENGTH kept for registerCollection() cross-contract call

import { CollectionCreatedEvent } from '../lib/events';

/**
 * NFTFactory v7 — Real Factory with deployContractFromExisting().
 *
 * Two ways to create a collection:
 *
 *   1. createCollection() — Factory cloning (preferred, 1 TX for user):
 *      - Factory calls Blockchain.deployContractFromExisting(template, salt, empty)
 *      - Template's onDeployment() is minimal — just stores owner
 *      - Factory then calls initialize() on the new contract with all 11 config params
 *      - Factory auto-registers the collection and emits CollectionCreated
 *
 *   2. registerCollection() — Manual registration (backward compatible):
 *      - User deploys WASM directly, then calls registerCollection(address)
 *      - Factory verifies ownership via cross-contract collectionOwner() call
 *
 * The template contract must be deployed first. Admin sets its address
 * via setTemplate().
 */

const collectionCountPointer: u16 = Blockchain.nextPointer;
const registeredMapPointer: u16 = Blockchain.nextPointer;
const templateAddressPointer: u16 = Blockchain.nextPointer;

@final
export class NFTFactory extends OP_NET {
    private readonly _collectionCount: StoredU256;

    /** Map: collectionAddress -> u256 (0 = not registered, 1 = registered) */
    private readonly _registered: AddressMemoryMap;

    /** Address of the deployed CollectionTemplate used for cloning */
    private readonly _templateAddress: StoredAddress;

    public constructor() {
        super();
        this._collectionCount = new StoredU256(collectionCountPointer, EMPTY_POINTER);
        this._registered = new AddressMemoryMap(registeredMapPointer);
        this._templateAddress = new StoredAddress(templateAddressPointer);
    }

    public override onDeployment(_calldata: Calldata): void {
        this._collectionCount.value = u256.Zero;
    }

    /* ================================================================== */
    /*  ADMIN METHODS                                                      */
    /* ================================================================== */

    /**
     * Set the template contract address used for cloning.
     * Admin (deployer) only. Must be called after deploying the template.
     */
    @method({ name: 'templateAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setTemplate(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const templateAddress: Address = calldata.readAddress();
        if (templateAddress.isZero()) {
            throw new Revert('Invalid template address');
        }

        this._templateAddress.value = templateAddress;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================== */
    /*  CREATE COLLECTION (Deploy-only — 2 TX flow)                        */
    /* ================================================================== */

    /**
     * Deploy a new collection from the template.
     *
     * This ONLY deploys + registers the collection. The user must call
     * collection.initialize(11 params) in a SECOND transaction.
     *
     * Why 2 TXs? The OPNet VM memory limit cannot handle factory WASM +
     * template WASM + 11 string params in a single transaction. Splitting
     * into deploy + initialize keeps each TX within memory budget.
     *
     * Flow:
     *   TX1: factory.createCollection(salt) → deploys + registers → returns address
     *   TX2: collection.initialize(name, symbol, ...) → configures the collection
     *
     * @param salt unique per collection (e.g. hash of name+creator+timestamp)
     * @returns collectionAddress the newly deployed (unconfigured) collection
     */
    @method(
        { name: 'salt', type: ABIDataTypes.UINT256 },
    )
    @emit('CollectionCreated')
    @returns({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    public createCollection(calldata: Calldata): BytesWriter {
        const templateAddr: Address = this._templateAddress.value;
        if (templateAddr.isZero()) {
            throw new Revert('Template not set');
        }

        const salt: u256 = calldata.readU256();

        // Deploy with empty calldata — onDeployment() just stores owner
        const emptyCalldata: BytesWriter = new BytesWriter(0);
        const newAddr: Address = Blockchain.deployContractFromExisting(
            templateAddr,
            salt,
            emptyCalldata,
        );

        // Register the collection
        this._registered.set(newAddr, u256.One);
        const newCount: u256 = SafeMath.add(this._collectionCount.value, u256.One);
        this._collectionCount.value = newCount;

        // Emit event for indexer
        const sender: Address = Blockchain.tx.sender;
        this.emitEvent(new CollectionCreatedEvent(sender, newCount, newAddr));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeAddress(newAddr);
        return writer;
    }

    /* ================================================================== */
    /*  REGISTER COLLECTION (Manual — backward compatible, 2 TXs)          */
    /* ================================================================== */

    /**
     * Register an externally-deployed collection on the FORGE platform.
     *
     * For collections deployed via direct WASM deployment (not factory cloning).
     * Verifies sender owns the collection via collectionOwner() cross-contract call.
     *
     * @param collectionAddress the deployed collection's address
     * @returns collectionId the sequential ID assigned
     */
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @emit('CollectionCreated')
    @returns({ name: 'collectionId', type: ABIDataTypes.UINT256 })
    public registerCollection(calldata: Calldata): BytesWriter {
        const collectionAddress: Address = calldata.readAddress();

        if (collectionAddress.isZero()) {
            throw new Revert('Invalid collection address');
        }

        // Check not already registered
        const existing: u256 = this._registered.get(collectionAddress);
        if (!existing.isZero()) {
            throw new Revert('Already registered');
        }

        // Verify sender owns the collection via collectionOwner() cross-contract call
        const ownerCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH);
        ownerCalldata.writeSelector(encodeSelector('collectionOwner()'));

        const ownerResult = Blockchain.call(collectionAddress, ownerCalldata, false);
        if (!ownerResult.success) {
            throw new Revert('collectionOwner() call failed — not a valid FORGE collection');
        }

        const collectionOwner: Address = ownerResult.data.readAddress();
        const sender: Address = Blockchain.tx.sender;
        if (!collectionOwner.equals(sender)) {
            throw new Revert('Only collection owner can register');
        }

        // Mark as registered
        this._registered.set(collectionAddress, u256.One);

        // Increment counter
        const newCount: u256 = SafeMath.add(this._collectionCount.value, u256.One);
        this._collectionCount.value = newCount;

        // Emit event for indexer
        this.emitEvent(new CollectionCreatedEvent(sender, newCount, collectionAddress));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(newCount);
        return writer;
    }

    /* ================================================================== */
    /*  VIEW METHODS                                                       */
    /* ================================================================== */

    /** Check if a collection is registered. */
    @view
    @method({ name: 'collectionAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'registered', type: ABIDataTypes.BOOL })
    public isRegistered(calldata: Calldata): BytesWriter {
        const addr: Address = calldata.readAddress();
        const val: u256 = this._registered.get(addr);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(!val.isZero());
        return writer;
    }

    /** Get total registered collection count. */
    @view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public collectionCount(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._collectionCount.value);
        return writer;
    }

    /** Get the template contract address. */
    @view
    @method()
    @returns({ name: 'templateAddress', type: ABIDataTypes.ADDRESS })
    public getTemplate(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeAddress(this._templateAddress.value);
        return writer;
    }
}
