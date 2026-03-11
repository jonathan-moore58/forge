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
} from '@btc-vision/btc-runtime/runtime';

import {
    LoanRequestCreatedEvent,
    LoanFundedEvent,
    LoanRepaidEvent,
    LoanDefaultedEvent,
    LoanCancelledEvent,
} from '../lib/events';
import {
    LENDING_FEE_BPS,
    BPS_DENOMINATOR,
    MAX_INTEREST_BPS,
    MAX_LOAN_DURATION,
    MIN_LOAN_DURATION,
    LOAN_PENDING,
    LOAN_ACTIVE,
    LOAN_REPAID,
    LOAN_DEFAULTED,
    LOAN_CANCELLED,
} from '../lib/constants';

/**
 * NFTLending — Peer-to-peer NFT-collateralized lending on FORGE.
 *
 * First NFT-backed lending protocol on Bitcoin L1.
 *
 * Flow:
 * 1. Borrower creates a loan request → NFT is escrowed in this contract
 * 2. Any lender can fund the request → OP20 tokens sent from lender to borrower
 * 3. Borrower repays (principal + interest) → NFT returned, lender paid
 * 4. If borrower defaults (loan expired) → lender claims the NFT collateral
 *
 * Features:
 * - Peer-to-peer matching (no oracle needed)
 * - NFT escrow via safeTransferFrom
 * - OP20 token payments via transferFrom (approval-based)
 * - Block-based loan duration
 * - Platform fee: 1% of interest earned
 * - Full reentrancy protection
 */
@final
export class NFTLending extends ReentrancyGuard {
    protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    /** Core state */
    private nextLoanIdPointer: u16 = Blockchain.nextPointer;
    private totalLoansCreatedPointer: u16 = Blockchain.nextPointer;
    private totalLoansActivePointer: u16 = Blockchain.nextPointer;
    private totalLoanVolumePointer: u16 = Blockchain.nextPointer;
    private totalFeesCollectedPointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;
    private feeRecipientPointer: u16 = Blockchain.nextPointer;

    /** Loan storage: loanId → field */
    private loanBorrowerPointer: u16 = Blockchain.nextPointer;
    private loanLenderPointer: u16 = Blockchain.nextPointer;
    private loanCollectionPointer: u16 = Blockchain.nextPointer;
    private loanTokenIdPointer: u16 = Blockchain.nextPointer;
    private loanPaymentTokenPointer: u16 = Blockchain.nextPointer;
    private loanAmountPointer: u16 = Blockchain.nextPointer;
    private loanInterestBpsPointer: u16 = Blockchain.nextPointer;
    private loanDurationBlocksPointer: u16 = Blockchain.nextPointer;
    private loanStartBlockPointer: u16 = Blockchain.nextPointer;
    private loanStatusPointer: u16 = Blockchain.nextPointer;

    /** Stored values */
    private _nextLoanId!: StoredU256;
    private _totalLoansCreated!: StoredU256;
    private _totalLoansActive!: StoredU256;
    private _totalLoanVolume!: StoredU256;
    private _totalFeesCollected!: StoredU256;
    private _paused!: StoredBoolean;
    private _feeRecipient!: StoredU256;

    private _loanBorrower!: StoredMapU256;
    private _loanLender!: StoredMapU256;
    private _loanCollection!: StoredMapU256;
    private _loanTokenId!: StoredMapU256;
    private _loanPaymentToken!: StoredMapU256;
    private _loanAmount!: StoredMapU256;
    private _loanInterestBps!: StoredMapU256;
    private _loanDurationBlocks!: StoredMapU256;
    private _loanStartBlock!: StoredMapU256;
    private _loanStatus!: StoredMapU256;

    public constructor() {
        super();

        this._nextLoanId = new StoredU256(this.nextLoanIdPointer, EMPTY_POINTER);
        this._totalLoansCreated = new StoredU256(this.totalLoansCreatedPointer, EMPTY_POINTER);
        this._totalLoansActive = new StoredU256(this.totalLoansActivePointer, EMPTY_POINTER);
        this._totalLoanVolume = new StoredU256(this.totalLoanVolumePointer, EMPTY_POINTER);
        this._totalFeesCollected = new StoredU256(this.totalFeesCollectedPointer, EMPTY_POINTER);
        this._paused = new StoredBoolean(this.pausedPointer, false);
        this._feeRecipient = new StoredU256(this.feeRecipientPointer, EMPTY_POINTER);

        this._loanBorrower = new StoredMapU256(this.loanBorrowerPointer);
        this._loanLender = new StoredMapU256(this.loanLenderPointer);
        this._loanCollection = new StoredMapU256(this.loanCollectionPointer);
        this._loanTokenId = new StoredMapU256(this.loanTokenIdPointer);
        this._loanPaymentToken = new StoredMapU256(this.loanPaymentTokenPointer);
        this._loanAmount = new StoredMapU256(this.loanAmountPointer);
        this._loanInterestBps = new StoredMapU256(this.loanInterestBpsPointer);
        this._loanDurationBlocks = new StoredMapU256(this.loanDurationBlocksPointer);
        this._loanStartBlock = new StoredMapU256(this.loanStartBlockPointer);
        this._loanStatus = new StoredMapU256(this.loanStatusPointer);
    }

    public override onDeployment(calldata: Calldata): void {
        const feeRecipient: u256 = calldata.readU256();

        this._nextLoanId.value = u256.One;
        this._totalLoansCreated.value = u256.Zero;
        this._totalLoansActive.value = u256.Zero;
        this._totalLoanVolume.value = u256.Zero;
        this._totalFeesCollected.value = u256.Zero;
        this._feeRecipient.value = feeRecipient;
    }

    /* ================================================================ */
    /*  WRITE METHODS                                                    */
    /* ================================================================ */

    /**
     * Create a loan request.
     * The borrower's NFT is escrowed in this contract.
     * The borrower must approve this contract for the NFT first.
     *
     * @param collection  OP721 collection address
     * @param tokenId     Token ID to collateralize
     * @param paymentToken OP20 token address to borrow
     * @param amount      Amount to borrow (in payment token units)
     * @param interestBps Interest rate in basis points (max 5000 = 50%)
     * @param durationBlocks Loan duration in blocks (144 min = ~24h, 52560 max = ~1y)
     */
    @method(
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'interestBps', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @emit('LoanRequestCreated')
    public createLoanRequest(calldata: Calldata): BytesWriter {
        // ── CHECKS ──
        if (this._paused.value) {
            throw new Revert('Lending is paused');
        }

        const collection: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();
        const paymentToken: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        const interestBps: u256 = calldata.readU256();
        const durationBlocks: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Zero-address validation
        if (this.addressToU256(collection).isZero()) {
            throw new Revert('Collection address cannot be zero');
        }
        if (this.addressToU256(paymentToken).isZero()) {
            throw new Revert('Payment token address cannot be zero');
        }

        // Validate inputs
        if (amount.isZero()) {
            throw new Revert('Loan amount must be > 0');
        }
        if (interestBps > MAX_INTEREST_BPS) {
            throw new Revert('Interest rate exceeds 50% maximum');
        }
        if (durationBlocks < u256.fromU64(MIN_LOAN_DURATION)) {
            throw new Revert('Loan duration too short (min ~24h)');
        }
        if (durationBlocks > u256.fromU64(MAX_LOAN_DURATION)) {
            throw new Revert('Loan duration too long (max ~1 year)');
        }

        // Verify sender owns the NFT (read-only cross-contract call — safe before effects)
        const ownerCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32);
        ownerCalldata.writeSelector(encodeSelector('ownerOf(uint256)'));
        ownerCalldata.writeU256(tokenId);

        const ownerResult = Blockchain.call(collection, ownerCalldata, false);
        if (!ownerResult.success) {
            throw new Revert('ownerOf check failed — not a valid OP721');
        }

        const nftOwner: Address = ownerResult.data.readAddress();
        if (nftOwner !== sender) {
            throw new Revert('Not the NFT owner');
        }

        // ── EFFECTS (state changes BEFORE external interaction) ──
        const loanId: u256 = this._nextLoanId.value;

        this._loanBorrower.set(loanId, this.addressToU256(sender));
        this._loanLender.set(loanId, u256.Zero); // No lender yet
        this._loanCollection.set(loanId, this.addressToU256(collection));
        this._loanTokenId.set(loanId, tokenId);
        this._loanPaymentToken.set(loanId, this.addressToU256(paymentToken));
        this._loanAmount.set(loanId, amount);
        this._loanInterestBps.set(loanId, interestBps);
        this._loanDurationBlocks.set(loanId, durationBlocks);
        this._loanStartBlock.set(loanId, u256.Zero); // Not started yet
        this._loanStatus.set(loanId, u256.fromU64(<u64>LOAN_PENDING));

        // Update counters
        this._nextLoanId.value = SafeMath.add(loanId, u256.One);
        this._totalLoansCreated.value = SafeMath.add(this._totalLoansCreated.value, u256.One);

        // ── INTERACTION (external call AFTER state is finalized) ──
        // Escrow: Transfer NFT from borrower to this contract
        const escrowCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        escrowCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        escrowCalldata.writeAddress(sender);
        escrowCalldata.writeAddress(Blockchain.contractAddress);
        escrowCalldata.writeU256(tokenId);

        const escrowResult = Blockchain.call(collection, escrowCalldata, false);
        if (!escrowResult.success) {
            throw new Revert('NFT escrow failed — approve lending contract first');
        }

        Blockchain.emit(new LoanRequestCreatedEvent(
            loanId, sender, collection, tokenId,
            paymentToken, amount, interestBps, durationBlocks,
        ));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(loanId);
        return writer;
    }

    /**
     * Cancel an unfunded loan request (borrower only).
     * Returns the escrowed NFT to the borrower.
     */
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LoanCancelled')
    public cancelLoanRequest(calldata: Calldata): BytesWriter {
        const loanId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate
        const status: u256 = this._loanStatus.get(loanId);
        if (status != u256.fromU64(<u64>LOAN_PENDING)) {
            throw new Revert('Loan not pending — cannot cancel');
        }

        // Only borrower can cancel
        const borrowerU256: u256 = this._loanBorrower.get(loanId);
        if (borrowerU256 != this.addressToU256(sender)) {
            throw new Revert('Only borrower can cancel');
        }

        // Effects: mark cancelled
        this._loanStatus.set(loanId, u256.fromU64(<u64>LOAN_CANCELLED));

        // Interaction: Return NFT to borrower
        const collectionAddr: Address = this.u256ToAddress(this._loanCollection.get(loanId));
        const tokenId: u256 = this._loanTokenId.get(loanId);

        const returnCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        returnCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        returnCalldata.writeAddress(Blockchain.contractAddress);
        returnCalldata.writeAddress(sender);
        returnCalldata.writeU256(tokenId);

        const returnResult = Blockchain.call(collectionAddr, returnCalldata, false);
        if (!returnResult.success) {
            throw new Revert('NFT return failed');
        }

        Blockchain.emit(new LoanCancelledEvent(loanId, sender));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Fund a loan request (any lender).
     * The lender must approve this contract for the payment token first.
     * Tokens are transferred directly from lender to borrower.
     *
     * @param loanId The loan request to fund
     */
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LoanFunded')
    public fundLoan(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Lending is paused');
        }

        const loanId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate
        const status: u256 = this._loanStatus.get(loanId);
        if (status != u256.fromU64(<u64>LOAN_PENDING)) {
            throw new Revert('Loan not pending');
        }

        // Lender cannot be borrower
        const borrowerU256: u256 = this._loanBorrower.get(loanId);
        if (borrowerU256 == this.addressToU256(sender)) {
            throw new Revert('Cannot fund own loan');
        }

        const amount: u256 = this._loanAmount.get(loanId);
        const paymentTokenAddr: Address = this.u256ToAddress(this._loanPaymentToken.get(loanId));
        const borrowerAddr: Address = this.u256ToAddress(borrowerU256);

        // Effects: activate loan
        this._loanStatus.set(loanId, u256.fromU64(<u64>LOAN_ACTIVE));
        this._loanLender.set(loanId, this.addressToU256(sender));
        this._loanStartBlock.set(loanId, Blockchain.block.numberU256);

        this._totalLoansActive.value = SafeMath.add(this._totalLoansActive.value, u256.One);
        this._totalLoanVolume.value = SafeMath.add(this._totalLoanVolume.value, amount);

        // Interaction: Transfer payment tokens from lender to borrower
        const payCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        payCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        payCalldata.writeAddress(sender);
        payCalldata.writeAddress(borrowerAddr);
        payCalldata.writeU256(amount);

        const payResult = Blockchain.call(paymentTokenAddr, payCalldata, false);
        if (!payResult.success) {
            throw new Revert('Token transfer failed — approve lending contract for payment token');
        }

        Blockchain.emit(new LoanFundedEvent(loanId, sender, borrowerAddr, amount));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Repay a loan (borrower only).
     * Borrower pays principal + interest to lender.
     * NFT is returned to borrower.
     * Platform takes 1% of the interest earned.
     *
     * The borrower must approve this contract for the repayment amount.
     */
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LoanRepaid')
    public repayLoan(calldata: Calldata): BytesWriter {
        if (this._paused.value) {
            throw new Revert('Lending is paused');
        }

        const loanId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate
        const status: u256 = this._loanStatus.get(loanId);
        if (status != u256.fromU64(<u64>LOAN_ACTIVE)) {
            throw new Revert('Loan not active');
        }

        // Only borrower can repay
        const borrowerU256: u256 = this._loanBorrower.get(loanId);
        if (borrowerU256 != this.addressToU256(sender)) {
            throw new Revert('Only borrower can repay');
        }

        // Check loan not expired
        const startBlock: u256 = this._loanStartBlock.get(loanId);
        const duration: u256 = this._loanDurationBlocks.get(loanId);
        const expiryBlock: u256 = SafeMath.add(startBlock, duration);

        if (Blockchain.block.numberU256 > expiryBlock) {
            throw new Revert('Loan has expired — lender can claim collateral');
        }

        const amount: u256 = this._loanAmount.get(loanId);
        const interestBps: u256 = this._loanInterestBps.get(loanId);
        const lenderU256: u256 = this._loanLender.get(loanId);
        const paymentTokenAddr: Address = this.u256ToAddress(this._loanPaymentToken.get(loanId));
        const lenderAddr: Address = this.u256ToAddress(lenderU256);

        // Calculate interest: amount * interestBps / 10000
        const interest: u256 = SafeMath.div(
            SafeMath.mul(amount, interestBps),
            BPS_DENOMINATOR,
        );

        // Platform fee: 1% of interest
        const platformFee: u256 = SafeMath.div(
            SafeMath.mul(interest, LENDING_FEE_BPS),
            BPS_DENOMINATOR,
        );

        // Net interest to lender = interest - platformFee
        const netInterest: u256 = SafeMath.sub(interest, platformFee);

        // Total repayment to lender = principal + net interest
        const repayToLender: u256 = SafeMath.add(amount, netInterest);

        // Effects: mark repaid
        this._loanStatus.set(loanId, u256.fromU64(<u64>LOAN_REPAID));
        this._totalLoansActive.value = SafeMath.sub(this._totalLoansActive.value, u256.One);
        this._totalFeesCollected.value = SafeMath.add(this._totalFeesCollected.value, platformFee);

        // Interaction 1: Transfer repayment (principal + net interest) from borrower to lender
        const repayCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        repayCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        repayCalldata.writeAddress(sender);
        repayCalldata.writeAddress(lenderAddr);
        repayCalldata.writeU256(repayToLender);

        const repayResult = Blockchain.call(paymentTokenAddr, repayCalldata, false);
        if (!repayResult.success) {
            throw new Revert('Repayment transfer failed — approve lending contract');
        }

        // Interaction 2: Transfer platform fee from borrower to fee recipient
        if (!platformFee.isZero()) {
            const feeAddr: Address = this.u256ToAddress(this._feeRecipient.value);
            const feeCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
            feeCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
            feeCalldata.writeAddress(sender);
            feeCalldata.writeAddress(feeAddr);
            feeCalldata.writeU256(platformFee);

            const feeResult = Blockchain.call(paymentTokenAddr, feeCalldata, false);
            if (!feeResult.success) {
                throw new Revert('Platform fee transfer failed');
            }
        }

        // Interaction 3: Return NFT to borrower
        const collectionAddr: Address = this.u256ToAddress(this._loanCollection.get(loanId));
        const tokenId: u256 = this._loanTokenId.get(loanId);

        const nftCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        nftCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        nftCalldata.writeAddress(Blockchain.contractAddress);
        nftCalldata.writeAddress(sender);
        nftCalldata.writeU256(tokenId);

        const nftResult = Blockchain.call(collectionAddr, nftCalldata, false);
        if (!nftResult.success) {
            throw new Revert('NFT return failed');
        }

        // Total repay = principal + full interest (for event)
        const totalRepay: u256 = SafeMath.add(amount, interest);
        Blockchain.emit(new LoanRepaidEvent(loanId, sender, lenderAddr, totalRepay));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Claim NFT collateral from a defaulted loan (lender only).
     * Can only be called after the loan has expired without repayment.
     */
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('LoanDefaulted')
    public claimDefaultedLoan(calldata: Calldata): BytesWriter {
        const loanId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate
        const status: u256 = this._loanStatus.get(loanId);
        if (status != u256.fromU64(<u64>LOAN_ACTIVE)) {
            throw new Revert('Loan not active');
        }

        // Only lender can claim
        const lenderU256: u256 = this._loanLender.get(loanId);
        if (lenderU256 != this.addressToU256(sender)) {
            throw new Revert('Only lender can claim default');
        }

        // Must be expired
        const startBlock: u256 = this._loanStartBlock.get(loanId);
        const duration: u256 = this._loanDurationBlocks.get(loanId);
        const expiryBlock: u256 = SafeMath.add(startBlock, duration);

        if (Blockchain.block.numberU256 <= expiryBlock) {
            throw new Revert('Loan not expired yet');
        }

        // Effects: mark defaulted
        this._loanStatus.set(loanId, u256.fromU64(<u64>LOAN_DEFAULTED));
        this._totalLoansActive.value = SafeMath.sub(this._totalLoansActive.value, u256.One);

        // Interaction: Transfer NFT collateral to lender
        const collectionAddr: Address = this.u256ToAddress(this._loanCollection.get(loanId));
        const tokenId: u256 = this._loanTokenId.get(loanId);

        const claimCalldata: BytesWriter = new BytesWriter(SELECTOR_BYTE_LENGTH + 32 + 32 + 32);
        claimCalldata.writeSelector(encodeSelector('safeTransferFrom(address,address,uint256)'));
        claimCalldata.writeAddress(Blockchain.contractAddress);
        claimCalldata.writeAddress(sender);
        claimCalldata.writeU256(tokenId);

        const claimResult = Blockchain.call(collectionAddr, claimCalldata, false);
        if (!claimResult.success) {
            throw new Revert('NFT claim failed');
        }

        Blockchain.emit(new LoanDefaultedEvent(loanId, sender, collectionAddr, tokenId));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================ */
    /*  VIEW METHODS                                                     */
    /* ================================================================ */

    /**
     * Get full loan details.
     */
    @view
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'borrower', type: ABIDataTypes.ADDRESS },
        { name: 'lender', type: ABIDataTypes.ADDRESS },
        { name: 'collection', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'interestBps', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT256 },
    )
    public getLoanDetails(calldata: Calldata): BytesWriter {
        const loanId: u256 = calldata.readU256();

        // 10 fields × 32 bytes = 320 bytes
        const writer: BytesWriter = new BytesWriter(320);
        writer.writeAddress(this.u256ToAddress(this._loanBorrower.get(loanId)));
        writer.writeAddress(this.u256ToAddress(this._loanLender.get(loanId)));
        writer.writeAddress(this.u256ToAddress(this._loanCollection.get(loanId)));
        writer.writeU256(this._loanTokenId.get(loanId));
        writer.writeAddress(this.u256ToAddress(this._loanPaymentToken.get(loanId)));
        writer.writeU256(this._loanAmount.get(loanId));
        writer.writeU256(this._loanInterestBps.get(loanId));
        writer.writeU256(this._loanDurationBlocks.get(loanId));
        writer.writeU256(this._loanStartBlock.get(loanId));
        writer.writeU256(this._loanStatus.get(loanId));
        return writer;
    }

    /**
     * Get lending platform stats.
     */
    @view
    @method()
    @returns(
        { name: 'totalLoansCreated', type: ABIDataTypes.UINT256 },
        { name: 'totalLoansActive', type: ABIDataTypes.UINT256 },
        { name: 'totalLoanVolume', type: ABIDataTypes.UINT256 },
        { name: 'totalFeesCollected', type: ABIDataTypes.UINT256 },
    )
    public lendingStats(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(128);
        writer.writeU256(this._totalLoansCreated.value);
        writer.writeU256(this._totalLoansActive.value);
        writer.writeU256(this._totalLoanVolume.value);
        writer.writeU256(this._totalFeesCollected.value);
        return writer;
    }

    /**
     * Calculate the total repayment amount for a loan.
     * Returns principal + interest.
     */
    @view
    @method({ name: 'loanId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'repayAmount', type: ABIDataTypes.UINT256 })
    public getRepayAmount(calldata: Calldata): BytesWriter {
        const loanId: u256 = calldata.readU256();

        const amount: u256 = this._loanAmount.get(loanId);
        const interestBps: u256 = this._loanInterestBps.get(loanId);

        const interest: u256 = SafeMath.div(
            SafeMath.mul(amount, interestBps),
            BPS_DENOMINATOR,
        );

        const totalRepay: u256 = SafeMath.add(amount, interest);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(totalRepay);
        return writer;
    }

    /**
     * Get the next loan ID (useful for enumeration / UI pagination).
     */
    @view
    @method()
    @returns({ name: 'nextLoanId', type: ABIDataTypes.UINT256 })
    public getNextLoanId(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._nextLoanId.value);
        return writer;
    }

    /* ================================================================ */
    /*  ADMIN METHODS                                                    */
    /* ================================================================ */

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

    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public pause(_calldata: Calldata): BytesWriter {
        this._paused.value = true;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @onlyOwner
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public unpause(_calldata: Calldata): BytesWriter {
        this._paused.value = false;
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /* ================================================================ */
    /*  HELPERS                                                          */
    /* ================================================================ */

    private addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private u256ToAddress(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    protected onlyOwner(_calldata: Calldata): void {
        this.onlyDeployer(Blockchain.tx.sender);
    }
}
