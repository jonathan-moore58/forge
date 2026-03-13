/**
 * useLendingActions — Write hooks for the NFTLending contract.
 *
 * Provides: createLoanRequest, cancelLoanRequest, fundLoan, repayLoan, claimDefaultedLoan.
 *
 * All OP20 token operations (fundLoan, repayLoan) require the lender/borrower
 * to approve the lending contract for the payment token first.
 *
 * Preflight checks run before the opaque VM simulation to give specific
 * error messages (OPNet's custom abort handler strips all revert reasons).
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import { resolveAddress } from '@/utils/address';
import { IndexerAPI } from '@/services/IndexerAPI';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { lendingKeys } from './useLending';

/* ------------------------------------------------------------------ */
/*  Constants matching the on-chain contract                           */
/* ------------------------------------------------------------------ */

const MIN_LOAN_DURATION = 144n;    // ~24 hours
const MAX_LOAN_DURATION = 52560n;  // ~1 year
const MAX_INTEREST_BPS = 5000n;    // 50%

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

    const tx = useTransaction({ label: 'Lending', ...txOptions, invalidateKeys });

    /**
     * Create a loan request — NFT is escrowed, waiting for a lender.
     * Caller must approve the lending contract for the NFT first.
     *
     * Preflight checks:
     * 1. Input validation (amount, interest, duration ranges)
     * 2. NFT ownership (ownerOf call)
     * 3. NFT approval for lending contract (isApprovedForAll check)
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

        // ── Preflight: input validation ──
        if (amount <= 0n) {
            throw new Error('Loan amount must be greater than 0.');
        }
        if (interestBps > MAX_INTEREST_BPS) {
            throw new Error(`Interest rate cannot exceed 50% (${MAX_INTEREST_BPS} bps). You entered ${interestBps} bps.`);
        }
        if (durationBlocks < MIN_LOAN_DURATION) {
            throw new Error(`Loan duration too short. Minimum is ${MIN_LOAN_DURATION} blocks (~24 hours).`);
        }
        if (durationBlocks > MAX_LOAN_DURATION) {
            throw new Error(`Loan duration too long. Maximum is ${MAX_LOAN_DURATION} blocks (~1 year).`);
        }

        // Resolve addresses first (this is where "invalid address" errors show up)
        let collectionAddr, paymentAddr;
        try {
            collectionAddr = await resolveAddress(collection, network);
        } catch {
            throw new Error(`Invalid collection address: "${collection}". Use a bech32m (opt1...) or hex address.`);
        }
        try {
            paymentAddr = await resolveAddress(paymentToken, network);
        } catch {
            throw new Error(`Invalid payment token address: "${paymentToken}". Use a bech32m (opt1...) or hex address.`);
        }

        // ── Preflight: check NFT ownership + approval ──
        const lendingAddress = CONTRACT_ADDRESSES[network].lending;
        try {
            const nftContract = ContractService.getCollection(collection, network);
            nftContract.setSender(walletAddrRef.current!);

            // Resolve wallet address once for both ownership + approval checks
            const walletStr = String(walletAddrRef.current!);
            const walletResolved = await resolveAddress(walletStr, network);

            // Check ownership — ownerOf returns an Address object
            const ownerResult = await nftContract.ownerOf(tokenId);
            const ownerAddr = ownerResult.properties.owner;
            if (ownerAddr) {
                const ownerHex = String(ownerAddr).replace(/^0x/i, '').toLowerCase();
                const walletHex = String(walletResolved).replace(/^0x/i, '').toLowerCase();

                if (ownerHex !== walletHex) {
                    throw new Error(`You don't own token #${tokenId} in this collection.`);
                }
            }

            // Check approval: isApprovedForAll(owner, operator)
            if (lendingAddress) {
                try {
                    const lendingAddr = await resolveAddress(lendingAddress, network);
                    const approvalResult = await nftContract.isApprovedForAll(
                        walletResolved,  // owner = your wallet
                        lendingAddr,     // operator = lending contract
                    );
                    const approved = approvalResult.properties.approved as boolean;
                    if (!approved) {
                        throw new Error(
                            'NFT not approved for lending contract. You need to call setApprovalForAll() ' +
                            'on the collection to authorize the lending contract to transfer your NFT.'
                        );
                    }
                } catch (approvalErr) {
                    // If the approval check itself fails, it's non-critical —
                    // let the contract simulation handle it
                    if (approvalErr instanceof Error && approvalErr.message.includes('not approved')) {
                        throw approvalErr;
                    }
                    console.warn('[Lending preflight] Approval check failed (non-critical):', approvalErr);
                }
            }
        } catch (preflightErr) {
            // Re-throw specific errors from our checks
            if (preflightErr instanceof Error && (
                preflightErr.message.includes("don't own") ||
                preflightErr.message.includes('not approved')
            )) {
                throw preflightErr;
            }
            // Other errors (e.g., collection contract not found) → log but don't block
            console.warn('[Lending preflight] NFT check failed (non-critical):', preflightErr);
        }

        // ── Execute the contract call ──
        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
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
     *
     * Preflight checks:
     * 1. Fetch loan details from indexer (payment token, amount, status, borrower)
     * 2. Check lender != borrower
     * 3. Check OP-20 token balance
     * 4. Check OP-20 token allowance for lending contract
     */
    const fundLoan = useCallback(async (loanId: bigint) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        const lendingAddress = CONTRACT_ADDRESSES[network].lending;

        // ── Preflight: fetch loan details from indexer ──
        let loanPaymentToken: string;
        let loanAmount: bigint;
        try {
            const loanRes = await IndexerAPI.loan(Number(loanId));
            const loan = loanRes.data;

            if (loan.status !== 0) {
                throw new Error(`Loan #${loanId} is not pending (status: ${loan.status}). Only pending loans can be funded.`);
            }

            loanPaymentToken = loan.payment_token;
            loanAmount = BigInt(loan.amount);

            // Check lender != borrower
            const walletStr = String(walletAddrRef.current!);
            let walletHex: string;
            try {
                const resolved = await resolveAddress(walletStr, network);
                walletHex = String(resolved).replace(/^0x/i, '').toLowerCase();
            } catch {
                walletHex = walletStr.replace(/^0x/i, '').toLowerCase();
            }
            const borrowerHex = loan.borrower.replace(/^0x/i, '').toLowerCase();
            if (walletHex === borrowerHex) {
                throw new Error('You cannot fund your own loan request.');
            }
        } catch (err) {
            if (err instanceof Error && (
                err.message.includes('not pending') ||
                err.message.includes('cannot fund your own')
            )) {
                throw err;
            }
            // If indexer is down, fall through to contract simulation
            console.warn('[Lending preflight] Could not fetch loan details:', err);
            loanPaymentToken = '';
            loanAmount = 0n;
        }

        // ── Preflight: check OP-20 balance + allowance ──
        if (loanPaymentToken && loanAmount > 0n && lendingAddress) {
            try {
                const walletStr = String(walletAddrRef.current!);
                const walletResolved = await resolveAddress(walletStr, network);
                const lendingResolved = await resolveAddress(lendingAddress, network);

                const op20 = ContractService.getOP20(loanPaymentToken, network);
                op20.setSender(walletAddrRef.current!);

                // Check balance
                const balResult = await op20.balanceOf(walletResolved);
                const balance = balResult.properties.balance;
                if (balance < loanAmount) {
                    throw new Error(
                        `Insufficient token balance. You have ${balance.toString()} but the loan requires ${loanAmount.toString()} tokens.`
                    );
                }

                // Check allowance (SDK uses "remaining" as the output property name)
                const allowResult = await op20.allowance(walletResolved, lendingResolved);
                const remaining = allowResult.properties.remaining;
                if (remaining < loanAmount) {
                    throw new Error(
                        `Token not approved for lending contract. You need to approve at least ${loanAmount.toString()} tokens. ` +
                        `Current allowance: ${remaining.toString()}. Click "Approve Tokens" first.`
                    );
                }
            } catch (preflightErr) {
                if (preflightErr instanceof Error && (
                    preflightErr.message.includes('Insufficient token') ||
                    preflightErr.message.includes('Token not approved')
                )) {
                    throw preflightErr;
                }
                console.warn('[Lending preflight] OP-20 check failed (non-critical):', preflightErr);
            }
        }

        // ── Execute the contract call ──
        return tx.execute(async () => {
            const lending = ContractService.getLending(network);
            lending.setSender(walletAddrRef.current!);
            return await lending.fundLoan(loanId);
        });
    }, [walletAddr, network, tx]);

    /**
     * Increase allowance for the lending contract to spend OP-20 tokens.
     * Must be called before fundLoan if allowance is insufficient.
     *
     * NOTE: OP-20 standard uses increaseAllowance/decreaseAllowance,
     * NOT approve() (which doesn't exist on OP-20 contracts).
     */
    const approveOP20ForLending = useCallback(async (
        paymentTokenAddress: string,
        amount: bigint,
    ) => {
        if (!walletAddrRef.current) throw new Error('Wallet not connected');
        const lendingAddress = CONTRACT_ADDRESSES[network].lending;
        if (!lendingAddress) throw new Error('Lending contract not deployed on this network.');

        const lendingResolved = await resolveAddress(lendingAddress, network);

        return tx.execute(async () => {
            const op20 = ContractService.getOP20(paymentTokenAddress, network);
            op20.setSender(walletAddrRef.current!);
            return await op20.increaseAllowance(lendingResolved, amount);
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
        approveOP20ForLending,
    };
}
