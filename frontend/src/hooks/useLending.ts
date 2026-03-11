/**
 * useLending — React Query hooks for the NFTLending module.
 *
 * Read-side companion to useLendingActions.
 * Fetches loans and stats from the backend indexer API.
 */

import { useQuery } from '@tanstack/react-query';
import { IndexerAPI, type IndexerLoan } from '@/services/IndexerAPI';
import { type ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Query key factory                                                  */
/* ------------------------------------------------------------------ */

export const lendingKeys = {
    all: (network: ForgeNetwork) => ['lending', network] as const,
    stats: (network: ForgeNetwork) => [...lendingKeys.all(network), 'stats'] as const,
    loans: (network: ForgeNetwork) => [...lendingKeys.all(network), 'loans'] as const,
    pendingLoans: (network: ForgeNetwork) => [...lendingKeys.all(network), 'loans', 'pending'] as const,
    myBorrowed: (network: ForgeNetwork, addr: string) => [...lendingKeys.all(network), 'loans', 'borrowed', addr] as const,
    myFunded: (network: ForgeNetwork, addr: string) => [...lendingKeys.all(network), 'loans', 'funded', addr] as const,
    loan: (network: ForgeNetwork, id: number) => [...lendingKeys.all(network), 'loan', id] as const,
};

/* ------------------------------------------------------------------ */
/*  Mapped types for UI                                                */
/* ------------------------------------------------------------------ */

export interface LoanItem {
    id: number;
    borrower: string;
    lender: string | null;
    collection: string;
    tokenId: number;
    paymentToken: string;
    amount: string;
    interestBps: number;
    durationBlocks: number;
    startBlock: number | null;
    status: number; // 0=PENDING, 1=ACTIVE, 2=REPAID, 3=DEFAULTED, 4=CANCELLED
    createdAtBlock: number;
}

export interface LendingStats {
    totalCreated: number;
    totalActive: number;
    totalRepaid: number;
    totalDefaulted: number;
    totalVolume: string;
}

/** Map backend row → UI-friendly shape */
function mapLoan(row: IndexerLoan): LoanItem {
    return {
        id: row.loan_id,
        borrower: row.borrower,
        lender: row.lender,
        collection: row.collection_address,
        tokenId: row.token_id,
        paymentToken: row.payment_token,
        amount: row.amount,
        interestBps: row.interest_bps,
        durationBlocks: row.duration_blocks,
        startBlock: row.start_block,
        status: row.status,
        createdAtBlock: row.created_at_block,
    };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get lending platform stats (totalCreated, totalActive, totalVolume, etc.)
 */
export function useLendingStats(_network: ForgeNetwork) {
    return useQuery({
        queryKey: lendingKeys.stats(_network),
        queryFn: async (): Promise<LendingStats> => {
            const res = await IndexerAPI.lendingStats();
            return res.data;
        },
        staleTime: 30_000,
    });
}

/**
 * Get all pending (unfunded) loan requests — for the "Lend" tab.
 */
export function usePendingLoans(network: ForgeNetwork) {
    return useQuery({
        queryKey: lendingKeys.pendingLoans(network),
        queryFn: async (): Promise<LoanItem[]> => {
            const res = await IndexerAPI.loans({ status: 0, limit: 100 });
            return res.data.map(mapLoan);
        },
        staleTime: 30_000,
    });
}

/**
 * Get loans where the user is the borrower (active loans).
 */
export function useMyBorrowedLoans(network: ForgeNetwork, walletAddr: string | undefined) {
    return useQuery({
        queryKey: lendingKeys.myBorrowed(network, walletAddr ?? ''),
        queryFn: async (): Promise<LoanItem[]> => {
            const res = await IndexerAPI.loans({ borrower: walletAddr!, status: 1 });
            return res.data.map(mapLoan);
        },
        enabled: !!walletAddr,
        staleTime: 30_000,
    });
}

/**
 * Get loans where the user is the lender (funded loans).
 */
export function useMyFundedLoans(network: ForgeNetwork, walletAddr: string | undefined) {
    return useQuery({
        queryKey: lendingKeys.myFunded(network, walletAddr ?? ''),
        queryFn: async (): Promise<LoanItem[]> => {
            const res = await IndexerAPI.loans({ lender: walletAddr!, status: 1 });
            return res.data.map(mapLoan);
        },
        enabled: !!walletAddr,
        staleTime: 30_000,
    });
}

/**
 * Get a single loan by ID.
 */
export function useLoan(network: ForgeNetwork, loanId: number | undefined) {
    return useQuery({
        queryKey: lendingKeys.loan(network, loanId ?? 0),
        queryFn: async (): Promise<LoanItem> => {
            const res = await IndexerAPI.loan(loanId!);
            return mapLoan(res.data);
        },
        enabled: loanId !== undefined,
        staleTime: 15_000,
    });
}
