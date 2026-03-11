/**
 * useApprovalCheck — Check if an operator is approved to transfer a specific NFT,
 * and provide a function to approve if needed.
 *
 * Used before listing on Marketplace, creating an Auction, or staking.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { useNetwork } from './useNetwork';
import { useTransaction } from './useTransaction';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ApprovalCheck {
    /** Whether the operator is already approved for this token */
    isApproved: boolean;
    /** Loading state for the approval query */
    isChecking: boolean;
    /** Send an approve transaction for this token */
    approve: () => Promise<void>;
    /** Whether the approve tx is pending */
    isPending: boolean;
    /** Error from the approval query or transaction */
    error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Check & grant approval for a specific NFT token to an operator.
 *
 * @param collectionAddress - Hex address of the OP721 collection contract
 * @param tokenId           - The token ID to check/approve
 * @param operatorAddress   - Hex address of the operator (Marketplace, AuctionHouse, etc.)
 */
export function useApprovalCheck(
    collectionAddress: string | undefined,
    tokenId: bigint | undefined,
    operatorAddress: string | undefined,
): ApprovalCheck {
    const { network } = useNetwork();
    const { address: walletAddr } = useWalletConnect();
    const queryClient = useQueryClient();

    const approvalQueryKey = [
        'approvalCheck',
        network,
        collectionAddress,
        tokenId?.toString(),
        operatorAddress,
    ];

    const tx = useTransaction({
        invalidateKeys: [approvalQueryKey],
        onSuccess: () => {
            // Also refetch approval status after tx confirms
            queryClient.invalidateQueries({ queryKey: approvalQueryKey });
        },
    });

    // Query: is the operator already approved for this collection?
    // Uses isApprovedForAll (blanket approval) which has a typed boolean return,
    // vs getApproved(tokenId) which returns CallResult<{}> with no typed properties.
    const {
        data: isApproved,
        isLoading: isChecking,
        error: queryError,
    } = useQuery({
        queryKey: approvalQueryKey,
        queryFn: async (): Promise<boolean> => {
            const contract = ContractService.getCollection(collectionAddress!, network);
            const ownerAddr = Address.fromString(walletAddr!.toString());
            const operatorAddr = Address.fromString(operatorAddress!);
            const result = await contract.isApprovedForAll(ownerAddr, operatorAddr);
            return result.properties.approved;
        },
        enabled:
            !!collectionAddress &&
            tokenId !== undefined &&
            !!operatorAddress &&
            !!walletAddr,
        staleTime: 15_000,
    });

    // Mutation: approve the operator for this token via useTransaction.execute()
    const approve = useCallback(async () => {
        if (!collectionAddress || tokenId === undefined || !operatorAddress || !walletAddr) {
            throw new Error('Missing required parameters for approval');
        }

        await tx.execute(async () => {
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(walletAddr);
            const operatorAddr = Address.fromString(operatorAddress);
            // Use setApprovalForAll for blanket approval (standard marketplace pattern)
            return await contract.setApprovalForAll(operatorAddr, true);
        });
    }, [collectionAddress, tokenId, operatorAddress, walletAddr, network, tx]);

    return useMemo(
        () => ({
            isApproved: isApproved ?? false,
            isChecking,
            approve,
            isPending: tx.isPending,
            error: tx.error ?? (queryError ? String(queryError) : null),
        }),
        [isApproved, isChecking, approve, tx.isPending, tx.error, queryError],
    );
}
