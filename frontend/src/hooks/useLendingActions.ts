/**
 * useLendingActions — Write hooks for the NFTLending contract.
 *
 * Provides: createLoanRequest, cancelLoanRequest, fundLoan, repayLoan, claimDefaultedLoan.
 *
 * All OP20 token operations (fundLoan, repayLoan) require the lender/borrower
 * to approve the lending contract for the payment token first.
 */

import { useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { type ForgeNetwork } from '@/config/contracts';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { lendingKeys } from './useLending';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseLendingActionsOptions extends UseTransactionOptions {
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useLendingActions(options: UseLendingActionsOptions) {
    const { network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // Keep a ref to avoid stale closures after wallet reconnect
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    // Auto-invalidate lending caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        lendingKeys.loans(network),
        lendingKeys.stats(network),
    ];

    const tx = useTransaction({ ...txOptions, invalidateKeys });

    /**
     * Create a loan request — NFT is escrowed, waiting for a lender.
     * Caller must approve the lending contract for the NFT first.
     *
     * @param collection Collection address (hex)
     * @param tokenId Token ID to collateralize
     * @param paymentToken OP20 token address to borrow
     * @param amount Amount to borrow
     * @param interestBps Interest rate in basis points (max 5000)
     * @param durationBlocks Loan duration in blocks (144–52560)
     */
    const createLoanRequest = useCallback(async (
        collection: string,
        tokenId: bigint,
        paymentToken: string,
        amount: bigint,
        interestBps: bigint,
        durationBlocks: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            const collectionAddr = Address.fromString(collection);
            const paymentAddr = Address.fromString(paymentToken);
            return await lending.createLoanRequest(
                collectionAddr, tokenId, paymentAddr, amount, interestBps, durationBlocks,
            );
        });
    }, [walletAddr, network, tx]);

    /**
     * Cancel an unfunded loan request — NFT returned to borrower.
     */
    const cancelLoanRequest = useCallback(async (loanId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            return await lending.cancelLoanRequest(loanId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Fund a loan request — OP20 tokens sent from lender to borrower.
     * Lender must approve the lending contract for the payment token first.
     */
    const fundLoan = useCallback(async (loanId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            return await lending.fundLoan(loanId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Repay a loan — principal + interest paid to lender, NFT returned.
     * Borrower must approve the lending contract for repayment amount.
     */
    const repayLoan = useCallback(async (loanId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            return await lending.repayLoan(loanId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Claim NFT collateral from a defaulted (expired) loan — lender only.
     */
    const claimDefaultedLoan = useCallback(async (loanId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');

        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            return await lending.claimDefaultedLoan(loanId);
        });
    }, [walletAddr, network, tx]);

    return {
        ...tx,
        createLoanRequest,
        cancelLoanRequest,
        fundLoan,
        repayLoan,
        claimDefaultedLoan,
    };
}
