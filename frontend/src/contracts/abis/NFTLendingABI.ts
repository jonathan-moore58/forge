import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, CallResult, BaseContractProperties, DecodedCallResult } from 'opnet';
import { Address } from '@btc-vision/transaction';

export const NFT_LENDING_ABI: BitcoinInterfaceAbi = [
    // --- Write methods ---
    {
        name: 'createLoanRequest',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'interestBps', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'cancelLoanRequest',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'fundLoan',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'repayLoan',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'claimDefaultedLoan',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'setFeeRecipient',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'newRecipient', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'pause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'unpause',
        type: BitcoinAbiTypes.Function,
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },

    // --- Read methods ---
    {
        name: 'getLoanDetails',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
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
        ],
    },
    {
        name: 'lendingStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalLoansCreated', type: ABIDataTypes.UINT256 },
            { name: 'totalLoansActive', type: ABIDataTypes.UINT256 },
            { name: 'totalLoanVolume', type: ABIDataTypes.UINT256 },
            { name: 'totalFeesCollected', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getRepayAmount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'repayAmount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getNextLoanId',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'nextLoanId', type: ABIDataTypes.UINT256 },
        ],
    },

    // --- Events ---
    {
        name: 'LoanRequestCreated',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'interestBps', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'LoanFunded',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'LoanRepaid',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'repayAmount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'LoanDefaulted',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'LoanCancelled',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
        ],
    },
];

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */

export interface LoanData {
    [key: string]: DecodedCallResult;
    borrower: string;
    lender: string;
    collection: string;
    tokenId: bigint;
    paymentToken: string;
    amount: bigint;
    interestBps: bigint;
    durationBlocks: bigint;
    startBlock: bigint;
    status: bigint;
}

export interface LendingStatsData {
    [key: string]: DecodedCallResult;
    totalLoansCreated: bigint;
    totalLoansActive: bigint;
    totalLoanVolume: bigint;
    totalFeesCollected: bigint;
}

export interface INFTLendingContract extends BaseContractProperties {
    createLoanRequest(
        collection: Address,
        tokenId: bigint,
        paymentToken: Address,
        amount: bigint,
        interestBps: bigint,
        durationBlocks: bigint,
    ): Promise<CallResult<{ loanId: bigint }>>;
    cancelLoanRequest(loanId: bigint): Promise<CallResult<{ success: boolean }>>;
    fundLoan(loanId: bigint): Promise<CallResult<{ success: boolean }>>;
    repayLoan(loanId: bigint): Promise<CallResult<{ success: boolean }>>;
    claimDefaultedLoan(loanId: bigint): Promise<CallResult<{ success: boolean }>>;
    getLoanDetails(loanId: bigint): Promise<CallResult<LoanData>>;
    lendingStats(): Promise<CallResult<LendingStatsData>>;
    getRepayAmount(loanId: bigint): Promise<CallResult<{ repayAmount: bigint }>>;
    getNextLoanId(): Promise<CallResult<{ nextLoanId: bigint }>>;
}
