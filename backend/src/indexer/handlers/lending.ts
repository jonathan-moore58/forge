/* ------------------------------------------------------------------ */
/*  Lending handler: loan lifecycle events                            */
/* ------------------------------------------------------------------ */

import type { DatabaseSync } from 'node:sqlite';
import { createLogger } from '../../utils/logger.js';
import { normalizeAddress } from '../../utils/address.js';

const log = createLogger('handler:lending');

export function createLendingHandler(db: DatabaseSync) {
    // ── Loans ──
    const insertLoan = db.prepare(`
        INSERT OR REPLACE INTO loans
            (loan_id, borrower, collection_address, token_id, payment_token, amount,
             interest_bps, duration_blocks, status, created_at_block)
        VALUES (@loanId, @borrower, @collectionAddress, @tokenId, @paymentToken, @amount,
                @interestBps, @durationBlocks, 0, @blockNumber)
    `);

    const updateLoanFunded = db.prepare(`
        UPDATE loans
        SET status = 1, lender = @lender, start_block = @blockNumber, updated_at_block = @blockNumber
        WHERE loan_id = @loanId
    `);

    const updateLoanRepaid = db.prepare(`
        UPDATE loans
        SET status = 2, updated_at_block = @blockNumber
        WHERE loan_id = @loanId
    `);

    const updateLoanDefaulted = db.prepare(`
        UPDATE loans
        SET status = 3, updated_at_block = @blockNumber
        WHERE loan_id = @loanId
    `);

    const updateLoanCancelled = db.prepare(`
        UPDATE loans
        SET status = 4, updated_at_block = @blockNumber
        WHERE loan_id = @loanId
    `);

    // ── Lookup helper for activity fields ──
    const getLoanById = db.prepare(`
        SELECT collection_address, token_id, borrower, lender, amount FROM loans WHERE loan_id = @loanId
    `);

    // ── Activity (INSERT OR IGNORE for dedup) ──
    const insertActivity = db.prepare(`
        INSERT OR IGNORE INTO activity
            (event_type, collection_address, token_id, from_address, to_address, price, block_number, tx_hash, log_index)
        VALUES (@eventType, @collectionAddress, @tokenId, @fromAddress, @toAddress, @price, @blockNumber, @txHash, @logIndex)
    `);

    return {
        /* ── LoanRequestCreated ────────────────────────────────── */

        handleLoanRequestCreated(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const loanId = Number(params['loanId']);
            const borrower = normalizeAddress(params['borrower'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId']);
            const paymentToken = normalizeAddress(params['paymentToken'] as string);
            const amount = String(params['amount']);
            const interestBps = Number(params['interestBps']);
            const durationBlocks = Number(params['durationBlocks']);

            log.info(`LoanRequestCreated #${loanId}: ${collectionAddress}:${tokenId} amount=${amount} by ${borrower}`);
            insertLoan.run({ loanId, borrower, collectionAddress, tokenId, paymentToken, amount, interestBps, durationBlocks, blockNumber });

            insertActivity.run({
                eventType: 'loan_request',
                collectionAddress,
                tokenId,
                fromAddress: borrower,
                toAddress: null,
                price: amount,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── LoanFunded ────────────────────────────────────────── */

        handleLoanFunded(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const loanId = Number(params['loanId']);
            const lender = normalizeAddress(params['lender'] as string);
            const borrower = normalizeAddress(params['borrower'] as string);
            const amount = String(params['amount']);

            log.info(`LoanFunded #${loanId}: lender=${lender} borrower=${borrower} amount=${amount}`);
            updateLoanFunded.run({ loanId, lender, blockNumber });

            // Look up loan for collection/token activity fields
            const loan = getLoanById.get({ loanId }) as {
                collection_address: string; token_id: number;
            } | undefined;

            insertActivity.run({
                eventType: 'loan_funded',
                collectionAddress: loan?.collection_address ?? null,
                tokenId: loan?.token_id ?? null,
                fromAddress: lender,
                toAddress: borrower,
                price: amount,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── LoanRepaid ────────────────────────────────────────── */

        handleLoanRepaid(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const loanId = Number(params['loanId']);
            const borrower = normalizeAddress(params['borrower'] as string);
            const lender = normalizeAddress(params['lender'] as string);
            const repayAmount = String(params['repayAmount']);

            log.info(`LoanRepaid #${loanId}: borrower=${borrower} lender=${lender} repayAmount=${repayAmount}`);
            updateLoanRepaid.run({ loanId, blockNumber });

            // Look up loan for collection/token activity fields
            const loan = getLoanById.get({ loanId }) as {
                collection_address: string; token_id: number;
            } | undefined;

            insertActivity.run({
                eventType: 'loan_repaid',
                collectionAddress: loan?.collection_address ?? null,
                tokenId: loan?.token_id ?? null,
                fromAddress: borrower,
                toAddress: lender,
                price: repayAmount,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── LoanDefaulted ─────────────────────────────────────── */

        handleLoanDefaulted(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const loanId = Number(params['loanId']);
            const lender = normalizeAddress(params['lender'] as string);
            const collectionAddress = normalizeAddress(params['collection'] as string);
            const tokenId = Number(params['tokenId']);

            log.info(`LoanDefaulted #${loanId}: lender=${lender} collateral=${collectionAddress}:${tokenId}`);
            updateLoanDefaulted.run({ loanId, blockNumber });

            // Look up loan for borrower info
            const loan = getLoanById.get({ loanId }) as {
                borrower: string; amount: string;
            } | undefined;

            insertActivity.run({
                eventType: 'loan_defaulted',
                collectionAddress,
                tokenId,
                fromAddress: loan?.borrower ?? null,
                toAddress: lender,
                price: loan?.amount ?? null,
                blockNumber,
                txHash,
                logIndex,
            });
        },

        /* ── LoanCancelled ─────────────────────────────────────── */

        handleLoanCancelled(
            params: Record<string, string | bigint>,
            blockNumber: number,
            txHash: string,
            logIndex: number,
        ): void {
            const loanId = Number(params['loanId']);
            const borrower = normalizeAddress(params['borrower'] as string);

            log.info(`LoanCancelled #${loanId}: borrower=${borrower}`);
            updateLoanCancelled.run({ loanId, blockNumber });

            // Look up loan for collection/token activity fields
            const loan = getLoanById.get({ loanId }) as {
                collection_address: string; token_id: number;
            } | undefined;

            insertActivity.run({
                eventType: 'loan_cancelled',
                collectionAddress: loan?.collection_address ?? null,
                tokenId: loan?.token_id ?? null,
                fromAddress: borrower,
                toAddress: null,
                price: null,
                blockNumber,
                txHash,
                logIndex,
            });
        },
    };
}
