import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type LoanRequestCreatedEvent = {
    readonly loanId: bigint;
    readonly borrower: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
    readonly paymentToken: Address;
    readonly amount: bigint;
    readonly interestBps: bigint;
    readonly durationBlocks: bigint;
};
export type LoanCancelledEvent = {
    readonly loanId: bigint;
    readonly borrower: Address;
};
export type LoanFundedEvent = {
    readonly loanId: bigint;
    readonly lender: Address;
    readonly borrower: Address;
    readonly amount: bigint;
};
export type LoanRepaidEvent = {
    readonly loanId: bigint;
    readonly borrower: Address;
    readonly lender: Address;
    readonly repayAmount: bigint;
};
export type LoanDefaultedEvent = {
    readonly loanId: bigint;
    readonly lender: Address;
    readonly collection: Address;
    readonly tokenId: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createLoanRequest function call.
 */
export type CreateLoanRequest = CallResult<
    {
        loanId: bigint;
    },
    OPNetEvent<LoanRequestCreatedEvent>[]
>;

/**
 * @description Represents the result of the cancelLoanRequest function call.
 */
export type CancelLoanRequest = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LoanCancelledEvent>[]
>;

/**
 * @description Represents the result of the fundLoan function call.
 */
export type FundLoan = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LoanFundedEvent>[]
>;

/**
 * @description Represents the result of the repayLoan function call.
 */
export type RepayLoan = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LoanRepaidEvent>[]
>;

/**
 * @description Represents the result of the claimDefaultedLoan function call.
 */
export type ClaimDefaultedLoan = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<LoanDefaultedEvent>[]
>;

/**
 * @description Represents the result of the getLoanDetails function call.
 */
export type GetLoanDetails = CallResult<
    {
        borrower: Address;
        lender: Address;
        collection: Address;
        tokenId: bigint;
        paymentToken: Address;
        amount: bigint;
        interestBps: bigint;
        durationBlocks: bigint;
        startBlock: bigint;
        status: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the lendingStats function call.
 */
export type LendingStats = CallResult<
    {
        totalLoansCreated: bigint;
        totalLoansActive: bigint;
        totalLoanVolume: bigint;
        totalFeesCollected: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getRepayAmount function call.
 */
export type GetRepayAmount = CallResult<
    {
        repayAmount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getNextLoanId function call.
 */
export type GetNextLoanId = CallResult<
    {
        nextLoanId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setFeeRecipient function call.
 */
export type SetFeeRecipient = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the pause function call.
 */
export type Pause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the unpause function call.
 */
export type Unpause = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INFTLending
// ------------------------------------------------------------------
export interface INFTLending extends IOP_NETContract {
    createLoanRequest(
        collection: Address,
        tokenId: bigint,
        paymentToken: Address,
        amount: bigint,
        interestBps: bigint,
        durationBlocks: bigint,
    ): Promise<CreateLoanRequest>;
    cancelLoanRequest(loanId: bigint): Promise<CancelLoanRequest>;
    fundLoan(loanId: bigint): Promise<FundLoan>;
    repayLoan(loanId: bigint): Promise<RepayLoan>;
    claimDefaultedLoan(loanId: bigint): Promise<ClaimDefaultedLoan>;
    getLoanDetails(loanId: bigint): Promise<GetLoanDetails>;
    lendingStats(): Promise<LendingStats>;
    getRepayAmount(loanId: bigint): Promise<GetRepayAmount>;
    getNextLoanId(): Promise<GetNextLoanId>;
    setFeeRecipient(newRecipient: Address): Promise<SetFeeRecipient>;
    pause(): Promise<Pause>;
    unpause(): Promise<Unpause>;
}
