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
    Bech32,
} from '@btc-vision/btc-runtime/runtime';

import { MintedEvent, PhaseChangedEvent, CollectionConfiguredEvent } from '../lib/events';
import { MAX_ROYALTY_BPS } from '../lib/constants';

/**
 * CollectionTemplate v14 — Lightweight OP721 for FORGE.
 *
 * v14 changes (vs v13):
 *   - initialize() takes 6 params: name, symbol, maxSupply, mintPrice, royaltyBps, royaltyRecipient
 *   - Passes real name/symbol to OP721 instantiate() (no more placeholders)
 *   - Custom abort handler (in index-collection.ts) strips file paths from errors,
 *     fixing "Revert error too long" VM issue that blocked ALL reverts
 *   - setCollectionInfo() kept for renaming flexibility but NOT required in deploy flow
 *
 * TX flow: deploy → initialize(6 params) → optional changeMetadata(4 strings)
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
     * onDeployment — direct WASM deployment only.
     * Stores the deployer as collection owner.
     * All config set via initialize() in TX2.
     */
    public override onDeployment(_calldata: Calldata): void {
        this._collectionOwner.value = Blockchain.tx.sender;
    }

    /**
     * Initialize — full config in one TX (6 params).
     *
     * Reads name + symbol as strings, then 4 numeric params.
     * Custom abort handler keeps error messages short so the VM
     * never rejects them with "Revert error too long".
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
            throw new Revert('Already init');
        }
        this.onlyCollectionOwner();
        this.initializeFromCalldata(calldata);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Set collection name and symbol. Owner only.
     * Writes directly to OP721 base class _name and _symbol storage.
     * Not needed in normal 2-TX flow (initialize() sets name/symbol).
     * Kept for renaming flexibility.
     */
    @method(
        { name: 'name', type: ABIDataTypes.STRING },
        { name: 'symbol', type: ABIDataTypes.STRING },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setCollectionInfo(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();

        const name: string = calldata.readStringWithLength();
        const symbol: string = calldata.readStringWithLength();

        if (name.length == 0) {
            throw new Revert('Empty name');
        }
        if (symbol.length == 0) {
            throw new Revert('Empty symbol');
        }

        // Write directly to OP721 protected storage fields
        this._name.value = name;
        this._symbol.value = symbol;

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

    /**
     * Override OP721 changeMetadata — allows empty strings (base throws on empty).
     * Uses our onlyCollectionOwner() instead of base onlyDeployer().
     * Only writes non-empty fields (partial update).
     */
    @method(
        { name: 'icon', type: ABIDataTypes.STRING },
        { name: 'banner', type: ABIDataTypes.STRING },
        { name: 'description', type: ABIDataTypes.STRING },
        { name: 'website', type: ABIDataTypes.STRING },
    )
    public override changeMetadata(calldata: Calldata): BytesWriter {
        this.onlyCollectionOwner();

        const icon: string = calldata.readStringWithLength();
        const banner: string = calldata.readStringWithLength();
        const description: string = calldata.readStringWithLength();
        const website: string = calldata.readStringWithLength();

        if (icon.length > 0) this._collectionIcon.value = icon;
        if (banner.length > 0) this._collectionBanner.value = banner;
        if (description.length > 0) this._collectionDescription.value = description;
        if (website.length > 0) this._collectionWebsite.value = website;

        return new BytesWriter(0);
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
     * Reads 6 params from calldata (2 strings + 4 numbers) and calls instantiate().
     * Custom abort handler ensures any revert stays under VM error buffer limit.
     */
    private initializeFromCalldata(calldata: Calldata): void {
        const name: string = calldata.readStringWithLength();
        const symbol: string = calldata.readStringWithLength();
        const maxSupply: u256 = calldata.readU256();
        const mintPrice: u256 = calldata.readU256();
        const royaltyBps: u256 = calldata.readU256();
        const royaltyRecipient: Address = calldata.readAddress();

        if (name.length == 0) {
            throw new Revert('Empty name');
        }
        if (symbol.length == 0) {
            throw new Revert('Empty symbol');
        }
        if (maxSupply.isZero()) {
            throw new Revert('Supply=0');
        }
        if (royaltyBps > MAX_ROYALTY_BPS) {
            throw new Revert('Royalty>10%');
        }

        // skipDeployerVerification = true: onlyCollectionOwner() already verified.
        this.instantiate(new OP721InitParameters(
            name, symbol, '', maxSupply,
            '', '', '', '',
        ), true);

        this._mintPrice.value = mintPrice;
        this._royaltyBps.value = royaltyBps;
        this._royaltyRecipient.value = royaltyRecipient;
        this._configured.value = true;

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

    /**
     * Verify that the transaction includes a payment output to this contract.
     *
     * Handles three scenarios:
     *   1a. Simulation (flags=hasTo): output.to = hex address string
     *   1b. On-chain (flags=hasTo):   output.to = bech32m address (VM encodes P2TR outputs as bech32m)
     *   2.  Simulation (flags=hasScriptPubKey): output.scriptPublicKey = P2TR bytes [0x51, 0x20, ...32]
     *
     * On-chain, the VM sets hasTo=1 with a bech32m address and scriptPublicKey=null.
     * We decode the bech32m to extract the 32-byte witness program (= contract address).
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
                    // P2TR: version=1, program=32 bytes = contract address bytes
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

        throw new Revert('No payment');
    }
}
