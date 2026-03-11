/**
 * useTransaction — Generic simulate-then-send wrapper for OPNet contract calls.
 *
 * Pattern:
 *   1. contract.setSender(walletAddress)
 *   2. Simulate the call (read the result / check for revert)
 *   3. callResult.sendTransaction({ signer, mldsaSigner: null, ... })
 *   4. Wallet extension handles actual signing
 *
 * For payable calls:
 *   - contract.setTransactionDetails({ inputs: [], outputs: [{ index: 1, to: recipient, value }] })
 *   - THEN simulate
 *   - THEN sendTransaction
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useWalletConnect } from '@btc-vision/walletconnect';
import type { CallResult, InteractionTransactionReceipt } from 'opnet';
import type { ContractDecodedObjectResult } from 'opnet';
import type { PsbtOutputExtended } from '@btc-vision/bitcoin';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TransactionStatus = 'idle' | 'simulating' | 'signing' | 'broadcasting' | 'confirmed' | 'error';

export interface TransactionState {
    /** Current status of the transaction */
    status: TransactionStatus;
    /** Transaction hash after broadcast */
    txHash: string | null;
    /** Error message if status is 'error' */
    error: string | null;
    /** Whether a transaction is in progress */
    isPending: boolean;
}

export interface UseTransactionOptions {
    /** React Query cache keys to invalidate after success */
    invalidateKeys?: QueryKey[];
    /** Callback on successful confirmation */
    onSuccess?: (txHash: string) => void;
    /** Callback on error */
    onError?: (error: Error) => void;
}

export interface UseTransactionReturn extends TransactionState {
    /**
     * Execute a contract write operation.
     *
     * @param simulateCall - Async fn that sets up & simulates the contract call.
     *   Must return the CallResult from simulation (used to call sendTransaction).
     * @param options.maxSats - Maximum satoshis willing to spend (default: 100_000n)
     * @param options.extraOutputs - Extra PSBT outputs for payable calls (sends sats to contract)
     */
    execute: <T extends ContractDecodedObjectResult>(
        simulateCall: () => Promise<CallResult<T>>,
        maxSats?: bigint,
        extraOutputs?: PsbtOutputExtended[],
    ) => Promise<InteractionTransactionReceipt | undefined>;
    /** Reset state back to idle */
    reset: () => void;
    /** Whether a wallet is connected */
    isWalletConnected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTransaction(options: UseTransactionOptions = {}): UseTransactionReturn {
    const { invalidateKeys = [], onSuccess, onError } = options;
    const queryClient = useQueryClient();
    const { signer, network, walletAddress } = useWalletConnect();

    const [status, setStatus] = useState<TransactionStatus>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isWalletConnected = !!walletAddress;

    // Use refs so the execute callback always reads the LATEST values,
    // not stale closure captures from a previous render.
    const signerRef = useRef(signer);
    signerRef.current = signer;
    const networkRef = useRef(network);
    networkRef.current = network;
    const walletAddressRef = useRef(walletAddress);
    walletAddressRef.current = walletAddress;

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    const execute = useCallback(async <T extends ContractDecodedObjectResult>(
        simulateCall: () => Promise<CallResult<T>>,
        maxSats: bigint = 100_000n,
        extraOutputs?: PsbtOutputExtended[],
    ): Promise<InteractionTransactionReceipt | undefined> => {
        // Read fresh values from refs (not stale closure)
        const currentSigner = signerRef.current;
        const currentNetwork = networkRef.current;
        const currentWalletAddress = walletAddressRef.current;

        // Only network + walletAddress are required.
        // Signer can be null — the wallet extension handles signing internally.
        if (!currentNetwork || !currentWalletAddress) {
            setError('Wallet not connected. Please connect your wallet.');
            setStatus('error');
            return undefined;
        }

        try {
            // Reset previous state
            setError(null);
            setTxHash(null);

            // Step 1: Simulate the contract call
            setStatus('simulating');
            const callResult = await simulateCall();

            // Check for revert
            if ('error' in callResult && callResult.error) {
                throw new Error(`Simulation failed: ${String(callResult.error)}`);
            }

            // Step 2: Sign & broadcast — wallet extension handles signing
            // signer can be null; the wallet extension manages it internally
            setStatus('signing');
            const receipt = await callResult.sendTransaction({
                signer: currentSigner ?? null,
                mldsaSigner: null,
                refundTo: currentWalletAddress,
                maximumAllowedSatToSpend: maxSats,
                network: currentNetwork,
                ...(extraOutputs && extraOutputs.length > 0 ? { extraOutputs } : {}),
            });

            // Step 3: Confirmed
            setStatus('confirmed');
            const hash = receipt.transactionId;
            setTxHash(hash);

            // Invalidate React Query caches
            for (const key of invalidateKeys) {
                await queryClient.invalidateQueries({ queryKey: key });
            }

            onSuccess?.(hash);
            return receipt;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            setStatus('error');
            onError?.(err instanceof Error ? err : new Error(message));
            return undefined;
        }
    }, [invalidateKeys, onSuccess, onError, queryClient]);

    return {
        status,
        txHash,
        error,
        isPending: status !== 'idle' && status !== 'confirmed' && status !== 'error',
        execute,
        reset,
        isWalletConnected,
    };
}
