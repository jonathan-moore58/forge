/**
 * useMint — Write hook for minting NFTs from a CollectionTemplate contract.
 *
 * v7 lean contract: publicMint only (no whitelist phase).
 *
 * Payment outputs:
 *   Simulation: flags=hasTo (1) + hex address (contract matches via toHex())
 *   PSBT:       P2TR scriptPubKey { script } (creates P2TR output on Bitcoin)
 *
 * On-chain, the VM reads the P2TR output and provides bech32m address in
 * output.to — the contract's verifyPaymentToSelf() decodes bech32m to extract
 * the 32-byte P2TR program and compares it against its own address.
 */

import { useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { ContractService } from '@/services/ContractService';
import { useTransaction, type UseTransactionOptions } from './useTransaction';
import { collectionKeys } from './useCollectionData';
import { resolveContractPaymentInfo, buildSimulationOutput, buildPaymentOutputs } from '@/utils/p2tr';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseMintOptions extends UseTransactionOptions {
    /** Collection contract address */
    collectionAddress: string;
    /** Network to use */
    network: ForgeNetwork;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMint(options: UseMintOptions) {
    const { collectionAddress, network, ...txOptions } = options;
    const { address: walletAddr } = useWalletConnect();

    // Use ref so callback always reads the latest wallet address,
    // not a stale closure capture from a previous render.
    const walletAddrRef = useRef(walletAddr);
    walletAddrRef.current = walletAddr;

    // Auto-invalidate supply caches on success
    const invalidateKeys = [
        ...(txOptions.invalidateKeys || []),
        collectionKeys.supply(network, collectionAddress),
    ];

    const tx = useTransaction({ label: 'Mint NFT', ...txOptions, invalidateKeys });

    /**
     * Public mint — requires minting to be open (isMintOpen = true).
     * @param quantity Number of NFTs to mint
     * @param pricePerToken Price per token in sats
     *
     * Pre-checks contract state via view calls BEFORE simulating the
     * write call. This avoids the opaque "Revert error too long" VM
     * error and gives the user a clear, actionable message.
     */
    const publicMint = useCallback(async (quantity: bigint, pricePerToken: bigint) => {
        const addr = walletAddrRef.current;
        if (!addr) throw new Error('Wallet not connected');

        const totalPrice = pricePerToken * quantity;

        console.log('[FORGE][mint] publicMint:', { collection: collectionAddress, quantity: quantity.toString(), totalPrice: totalPrice.toString() });

        // Clear SDK's cached contract address (might be stale for newly deployed contracts)
        ContractService.clearCacheFor(collectionAddress, network);

        // ── Resolve contract payment info (hex address + P2TR script) ──
        let p2trScript: Uint8Array | undefined;
        let hexAddress: string | undefined;
        let extraOutputs: ReturnType<typeof buildPaymentOutputs> | undefined;

        if (totalPrice > 0n) {
            const contractForP2TR = ContractService.getCollection(collectionAddress, network);
            const paymentInfo = await resolveContractPaymentInfo(contractForP2TR, 'mint');
            p2trScript = paymentInfo?.p2trScript;
            hexAddress = paymentInfo?.hexAddress;
            extraOutputs = buildPaymentOutputs(p2trScript, collectionAddress, totalPrice);
        }

        return tx.execute(async () => {
            const contract = ContractService.getCollection(collectionAddress, network);
            contract.setSender(addr);

            // ── Pre-checks ──
            try {
                const r = await contract.isInitialized();
                const isInit = r?.properties?.initialized ?? false;
                if (!isInit) {
                    throw new Error('This collection is not initialized yet. The creator needs to complete setup first.');
                }
            } catch (e) {
                if (e instanceof Error && e.message.includes('not initialized')) throw e;
                console.warn('[FORGE][mint] isInitialized() call failed (non-fatal):', e instanceof Error ? e.message : e);
            }

            try {
                const r = await contract.isMintOpen();
                const isOpen = r?.properties?.open ?? false;
                if (!isOpen) {
                    throw new Error('Minting is not active for this collection. The creator needs to open minting first.');
                }
            } catch (e) {
                if (e instanceof Error && e.message.includes('not active')) throw e;
                console.warn('[FORGE][mint] isMintOpen() call failed (non-fatal):', e instanceof Error ? e.message : e);
            }

            // ── Set payment details for simulation ──
            if (totalPrice > 0n) {
                const simOutput = buildSimulationOutput(p2trScript, collectionAddress, totalPrice, hexAddress);
                contract.setTransactionDetails({
                    inputs: [],
                    outputs: [simOutput],
                });
            }

            return await contract.publicMint(quantity);
        }, undefined, extraOutputs);
    }, [collectionAddress, network, tx]);

    return {
        ...tx,
        publicMint,
    };
}
