import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NFTLendingEvents = [
    {
        name: 'LoanRequestCreated',
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
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LoanCancelled',
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LoanFunded',
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LoanRepaid',
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'borrower', type: ABIDataTypes.ADDRESS },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'repayAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'LoanDefaulted',
        values: [
            { name: 'loanId', type: ABIDataTypes.UINT256 },
            { name: 'lender', type: ABIDataTypes.ADDRESS },
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const NFTLendingAbi = [
    {
        name: 'createLoanRequest',
        inputs: [
            { name: 'collection', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'interestBps', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelLoanRequest',
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'fundLoan',
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'repayLoan',
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimDefaultedLoan',
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getLoanDetails',
        constant: true,
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
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
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'lendingStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalLoansCreated', type: ABIDataTypes.UINT256 },
            { name: 'totalLoansActive', type: ABIDataTypes.UINT256 },
            { name: 'totalLoanVolume', type: ABIDataTypes.UINT256 },
            { name: 'totalFeesCollected', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getRepayAmount',
        constant: true,
        inputs: [{ name: 'loanId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'repayAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getNextLoanId',
        constant: true,
        inputs: [],
        outputs: [{ name: 'nextLoanId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setFeeRecipient',
        inputs: [{ name: 'newRecipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unpause',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...NFTLendingEvents,
    ...OP_NET_ABI,
];

export default NFTLendingAbi;
