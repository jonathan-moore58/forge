import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP721,
    OP721InitParameters,
    Blockchain,
    Address,
    ADDRESS_BYTE_LENGTH,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    StoredBoolean,
    StoredAddress,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

import { MintedEvent, PhaseChangedEvent, CollectionConfiguredEvent } from '../lib/events';
import { MAX_ROYALTY_BPS } from '../lib/constants';

/**
 * CollectionTemplate v12 — Lightweight OP721 for FORGE.
 *
 * v12 changes (vs v11):
 *   - initialize() slimmed from 11 params to 6 (2 strings only)
 *   - Branding (icon, banner, description, website) set via changeMetadata()
 *     from OP721 base class as a separate TX to stay under VM memory limits
 *   - Base URI set via setBaseURI() from OP721 base class
 *   - Fixes "Revert error too long" caused by 7-string calldata in initialize()
 *
 * Kept:
 *   - publicMint, airdrop — core minting
 *   - setSalePhase, setMintOpen — phase control
 *   - setMintPrice — price updates
 *   - initialize — essential config (6 params: name, symbol, maxSupply, mintPrice, royaltyBps, royaltyRecipient)
 *   - Essential views: collectionOwner, currentPrice, isMintOpen, salePhase, isInitialized, royaltyInfo
 *
 * Inherited from OP721 base (no code needed):
 *   - changeMetadata(icon, banner, description, website)
 *   - setBaseURI(baseURI)
 *
 * Sale phases: INACTIVE(0) → PUBLIC(2) → ENDED(3)
 */

/* ------------------------------------------------------------------ */
/*  Sale Phase Constants                                               */
/* ------------------------------------------------------------------ */

const PHASE_INACTIVE: u256 = u256.Zero;
const PHASE_PUBLIC: u256 = u256.fromU32(2);
const PHASE_ENDED: u256 = u256.fromU32(3);

/* ------------------------------------------------------------------ */
/*  Storage Pointers                                                   */
/* ------------------------------------------------------------------ */

const collectionOwnerPointer: u16 = Blockchain.nextPointer;
const mintPricePointer: u16 = Blockchain.nextPointer;
const salePhasePointer: u16 = Blockchain.nextPointer;
const royaltyBpsPointer: u16 = Blockchain.nextPointer;
const royaltyRecipientPointer: u16 = Blockchain.nextPointer;
const configuredPointer: u16 = Blockchain.nextPointer;

@final
export class CollectionTemplate extends OP721 {
    private readonly _collectionOwner: StoredAddress;
    private readonly _mintPrice: StoredU256;
    private readonly _salePhase: StoredU256;
    private readonly _royaltyBps: StoredU256;
    private readonly _royaltyRecipient: StoredAddress;
    private readonly _configured: StoredBoolean;

    public constructor() {
        super();

        this._collectionOwner = new StoredAddress(collectionOwnerPointer);
        this._mintPrice = new StoredU256(mintPricePointer, EMPTY_POINTER);
        this._salePhase = new StoredU256(salePhasePointer, EMPTY_POINTER);
        this._royaltyBps = new StoredU256(royaltyBpsPointer, EMPTY_POINTER);
        this._royaltyRecipient = new StoredAddress(royaltyRecipientPointer);
        this._configured = new StoredBoolean(configuredPointer, false);
    }

    /**
     * onDeployment — handles BOTH factory cloning and direct deployment.
     *
     * If calldata has data (factory cloning via deployContractFromExisting):
     *   Reads 6 config params and fully initializes the collection.
     *   This avoids a separate cross-contract call to initialize().
     *
     * If calldata is empty (direct WASM deployment):
     *   Just stores the owner. User calls initialize() manually after.
     */
    public override onDeployment(calldata: Calldata): void {
        this._collectionOwner.value = Blockchain.tx.sender;

        // If calldata has data, initialize inline (factory cloning path)
        if (calldata.byteLength > 0) {
            this.initializeFromCalldata(calldata);
        }
    }

    /**
     * Initialize — essential config only (6 params, 2 strings).
     *
     * Branding (icon, banner, description, website) is set via a separate
     * changeMetadata() call (inherited from OP721 base) to keep calldata
     * small and avoid OPNet VM memory limits.
     *
     * Base URI is set via setBaseURI() (inherited from OP721 base) when ready.
     */
    @method(
        { name: 'name', type: ABIDataTypes.STRING },
        { name: 'symbol', type: ABIDataTypes.STRING },
        { name: 'maxSupply', type: ABIDataTypes.UINT256 },
        { name: 'mintPrice', type: ABIDataTypes.UINT256 },
        { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
        { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public initialize(calldata: Calldata): BytesWriter {
        if (this._configured.value) {
            throw new Revert('Already initialized');
        }
        this.onlyCollectionOwner();
        this.initializeFromCalldata(calldata);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================== */
    /*  WRITE METHODS                                                      */
    /* ================================================================== */

    /** Public mint — requires PUBLIC phase. */
    @payable
    @method({ name: 'quantity', type: ABIDataTypes.UINT256 })
    @emit('Minted')
    @returns({ name: 'startTokenId', type: ABIDataTypes.UINT256 })
    public publicMint(calldata: Calldata): BytesWriter {
        this.requireInitialized();
        const quantity: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        if (this._salePhase.value != PHASE_PUBLIC) {
            throw new Revert('Public sale not active');
        }

        const mintPrice: u256 = this._mintPrice.value;
        if (!mintPrice.isZero()) {
            const totalCost: u256 = SafeMath.mul(mintPrice, quantity);
            this.verifyPaymentToSelf(totalCost.toU64());
        }

        const startTokenId: u256 = this.mintInternal(sender, quantity);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(startTokenId);
        return writer;
    }

    /** Airdrop — owner mints to anyone. */
    @method(
        { name: 'recipient', type: ABIDataTypes.ADDRESS },
        { name: 'quantity', type: ABIDataTypes.UINT256 },
    )
    @emit('Minted')
    @returns({ name: 'startTokenId', type: ABIDataTypes.UINT256 })
    public airdrop(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();

        const recipient: Address = calldata.readAddress();
        const quantity: u256 = calldata.readU256();
        const startTokenId: u256 = this.mintInternal(recipient, quantity);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(startTokenId);
        return writer;
    }

    /**
     * Set sale phase. Owner only.
     * 0=INACTIVE, 2=PUBLIC, 3=ENDED
     */
    @method({ name: 'phase', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setSalePhase(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();
        const phase: u256 = calldata.readU256();
        if (phase > PHASE_ENDED) {
            throw new Revert('Invalid phase');
        }
        this._salePhase.value = phase;
        this.emitEvent(new PhaseChangedEvent(phase));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Backward-compatible toggle.
     * setMintOpen(true) → PUBLIC, setMintOpen(false) → INACTIVE.
     */
    @method({ name: 'open', type: ABIDataTypes.BOOL })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PhaseChanged')
    public setMintOpen(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();
        const open: bool = calldata.readBoolean();
        const newPhase: u256 = open ? PHASE_PUBLIC : PHASE_INACTIVE;
        this._salePhase.value = newPhase;
        this.emitEvent(new PhaseChangedEvent(newPhase));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /** Update mint price. Owner only. */
    @method({ name: 'price', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setMintPrice(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();
        this._mintPrice.value = calldata.readU256();

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================== */
    /*  VIEW METHODS                                                       */
    /* ================================================================== */

    @view
    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public collectionOwner(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH);
        writer.writeAddress(this._collectionOwner.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'price', type: ABIDataTypes.UINT256 })
    public currentPrice(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._mintPrice.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'open', type: ABIDataTypes.BOOL })
    public isMintOpen(_calldata: Calldata): BytesWriter {
        const phase: u256 = this._salePhase.value;
        const open: bool = phase == PHASE_PUBLIC;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(open);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'phase', type: ABIDataTypes.UINT256 })
    public salePhase(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._salePhase.value);
        return writer;
    }

    @view
    @method()
    @returns(
        { name: 'royaltyBps', type: ABIDataTypes.UINT256 },
        { name: 'royaltyRecipient', type: ABIDataTypes.ADDRESS },
    )
    public royaltyInfo(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32 + ADDRESS_BYTE_LENGTH);
        writer.writeU256(this._royaltyBps.value);
        writer.writeAddress(this._royaltyRecipient.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'initialized', type: ABIDataTypes.BOOL })
    public isInitialized(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(this._configured.value);
        return writer;
    }

    /* ================================================================== */
    /*  PRIVATE HELPERS                                                    */
    /* ================================================================== */

    /**
     * Shared initialization logic — reads 6 essential params from calldata.
     * Used by both onDeployment (factory path) and initialize (manual path).
     *
     * Branding + base URI are set separately via changeMetadata() and
     * setBaseURI() (both inherited from OP721 base) to keep this TX light.
     */
    private initializeFromCalldata(calldata: Calldata): void {
        const name: string = calldata.readStringWithLength();
        const symbol: string = calldata.readStringWithLength();
        const maxSupply: u256 = calldata.readU256();
        const mintPrice: u256 = calldata.readU256();
        const royaltyBps: u256 = calldata.readU256();
        const royaltyRecipient: Address = calldata.readAddress();

        if (maxSupply.isZero()) {
            throw new Revert('Supply must be > 0');
        }
        if (royaltyBps > MAX_ROYALTY_BPS) {
            throw new Revert('Royalty exceeds 10%');
        }

        // skipDeployerVerification = true because:
        //   - onDeployment path: deployer IS tx.sender (just set _collectionOwner)
        //   - initialize path: onlyCollectionOwner() already verified
        // Also avoids OP_NET.onlyDeployer() using !== (reference comparison)
        // which fails even when addresses match (different object refs).
        // Pass empty strings for branding — set via changeMetadata() later.
        this.instantiate(new OP721InitParameters(
            name, symbol, '', maxSupply,
            '', '', '', '',
        ), true);

        this._mintPrice.value = mintPrice;
        this._royaltyBps.value = royaltyBps;
        this._royaltyRecipient.value = royaltyRecipient;
        this._configured.value = true;

        // On-chain proof: indexer auto-discovers collections from this event.
        // If DB is wiped, re-scanning blocks rediscovers all collections.
        this.emitEvent(new CollectionConfiguredEvent(
            Blockchain.contract.address,
            this._collectionOwner.value,
            maxSupply,
            mintPrice,
        ));
    }

    private mintInternal(to: Address, quantity: u256): u256 {
        if (quantity.isZero()) {
            throw new Revert('Quantity must be > 0');
        }
        if (quantity > u256.fromU64(50)) {
            throw new Revert('Max 50 per tx');
        }

        const currentSupply: u256 = this._totalSupply.value;
        const max: u256 = this.maxSupply;
        const newSupply: u256 = SafeMath.add(currentSupply, quantity);

        if (newSupply > max) {
            throw new Revert('Exceeds max supply');
        }

        const startTokenId: u256 = this._nextTokenId.value;
        let tokenId: u256 = startTokenId;
        for (let i: u256 = u256.Zero; i < quantity; i = SafeMath.add(i, u256.One)) {
            this._mint(to, tokenId);
            tokenId = SafeMath.add(tokenId, u256.One);
        }
        this._nextTokenId.value = tokenId;

        this.emitEvent(new MintedEvent(to, quantity, startTokenId));

        return startTokenId;
    }

    private onlyCollectionOwner(): void {
        if (!this._collectionOwner.value.equals(Blockchain.tx.sender)) {
            throw new Revert('Not owner');
        }
    }

    private requireInitialized(): void {
        if (!this._configured.value) {
            throw new Revert('Not initialized');
        }
    }

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
}
