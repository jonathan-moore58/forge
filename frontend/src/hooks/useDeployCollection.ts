/**
 * useDeployCollection — 3-4 TX collection deployment flow.
 *
 * TX1: Deploy WASM (no calldata) -> onDeployment() stores owner.
 * TX2: initialize(maxSupply, mintPrice, royaltyBps, royaltyRecipient) -> 4 numeric params only.
 *      Calls instantiate() with placeholder name/symbol to avoid VM OOM.
 * TX3: setCollectionInfo(name, symbol) -> writes real name/symbol.
 *      Separate TX to avoid string parsing + instantiate() in one TX.
 * TX4: (optional) changeMetadata(icon, banner, desc, website) -> branding.
 */

import { useState, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { Address } from '@btc-vision/transaction';
import { getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { bech32m } from 'bech32';
import { ProviderService } from '@/services/ProviderService';
import { IndexerAPI } from '@/services/IndexerAPI';
import { COLLECTION_TEMPLATE_ABI } from '@/contracts/abis/CollectionTemplateABI';
import type { ICollectionTemplateContract } from '@/contracts/abis/CollectionTemplateABI';
import type { ForgeNetwork } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DeployCollectionParams {
    readonly name: string;
    readonly symbol: string;
    readonly supply: number;
    readonly mintPrice: bigint;
    readonly hiddenURI: string;
    readonly royaltyBps: bigint;
    readonly royaltyRecipient: string;
    readonly icon: string;
    readonly banner: string;
    readonly description: string;
    readonly website: string;
}

export type DeployStatus =
    | 'idle'
    | 'deploying'      // TX1: wallet popup for deploy
    | 'waiting'         // Waiting for deploy TX to be mined
    | 'initializing'    // TX2: wallet popup for initialize (4 numeric params)
    | 'verifying'       // Polling isInitialized() to verify TX2 took effect
    | 'naming'          // TX3: wallet popup for setCollectionInfo (name, symbol)
    | 'branding'        // TX4: wallet popup for changeMetadata (optional)
    | 'confirmed'       // All TXs done
    | 'error';

export interface UseDeployCollectionReturn {
    deploy: (params: DeployCollectionParams) => Promise<string | undefined>;
    status: DeployStatus;
    contractAddress: string | null;
    txHash: string | null;
    error: string | null;
    reset: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FEE_RATE = 10;
const DEPLOY_GAS_SAT_FEE = 50_000n;
const TEMPLATE_WASM_URL = '/wasm/CollectionTemplate.wasm';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 180; // 30 min max wait (BTC blocks can take 10-30+ min)

/* ------------------------------------------------------------------ */
/*  bech32m -> hex helper                                               */
/* ------------------------------------------------------------------ */

function bech32mToHex(addr: string): string {
    const decoded = bech32m.decode(addr, addr.length);
    const rawBytes = bech32m.fromWords(decoded.words.slice(1));
    const padded = new Uint8Array(32);
    padded.set(rawBytes, 32 - rawBytes.length);
    let hex = '';
    for (const b of padded) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

/* ------------------------------------------------------------------ */
/*  Network helper                                                     */
/* ------------------------------------------------------------------ */

function getNetworkObj(network: ForgeNetwork) {
    switch (network) {
        case 'regtest': return networks.regtest;
        case 'testnet': return networks.opnetTestnet;
        case 'mainnet': return networks.bitcoin;
    }
}

/* ------------------------------------------------------------------ */
/*  WASM loader (cached)                                               */
/* ------------------------------------------------------------------ */

let _wasmCache: Uint8Array | null = null;

export function clearWasmCache(): void {
    _wasmCache = null;
}

async function loadTemplateWasm(): Promise<Uint8Array> {
    if (_wasmCache) return _wasmCache;
    const response = await fetch(TEMPLATE_WASM_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    _wasmCache = new Uint8Array(buffer);
    console.log(`[FORGE] WASM loaded: ${_wasmCache.length.toLocaleString()} bytes`);
    return _wasmCache;
}

/* ------------------------------------------------------------------ */
/*  Poll until contract is deployed on-chain                           */
/* ------------------------------------------------------------------ */

async function waitForContract(
    contractAddress: string,
    forgeNetwork: ForgeNetwork,
    abortRef: React.RefObject<boolean>,
): Promise<boolean> {
    const provider = ProviderService.getProvider(forgeNetwork);

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (abortRef.current) return false;

        try {
            const code = await provider.getCode(contractAddress);
            // getCode returns Uint8Array | ContractData — check if we got anything
            if (code && (code instanceof Uint8Array ? code.length > 0 : 'bytecode' in code && code.bytecode.length > 0)) {
                console.log(`[FORGE] Contract confirmed on-chain after ${i + 1} polls`);
                return true;
            }
        } catch {
            // Contract not yet available — keep polling
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    return false;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useDeployCollection(): UseDeployCollectionReturn {
    const {
        network: walletNetwork,
        walletAddress,
        walletInstance,
        address: walletAddr,
        signer,
    } = useWalletConnect();

    const [status, setStatus] = useState<DeployStatus>('idle');
    const [contractAddress, setContractAddress] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef(false);

    const reset = useCallback(() => {
        abortRef.current = true;
        setStatus('idle');
        setContractAddress(null);
        setTxHash(null);
        setError(null);
    }, []);

    const deploy = useCallback(async (
        params: DeployCollectionParams,
    ): Promise<string | undefined> => {
        abortRef.current = false;

        console.log('[FORGE] Starting 3-4 TX deployment flow:', params);

        if (!walletAddress || !walletAddr) {
            setError('Please connect your wallet first');
            setStatus('error');
            return undefined;
        }
        if (!walletNetwork) {
            setError('Wallet connected but network not detected.');
            setStatus('error');
            return undefined;
        }

        const web3 = walletInstance?.web3;
        if (!web3) {
            setError('Wallet does not support contract deployment.');
            setStatus('error');
            return undefined;
        }

        const forgeNetwork: ForgeNetwork = (() => {
            const wn = walletNetwork?.toString().toLowerCase() ?? '';
            if (wn.includes('regtest')) return 'regtest' as const;
            if (wn.includes('mainnet') || wn.includes('bitcoin')) return 'mainnet' as const;
            return 'testnet' as const;
        })();

        const provider = ProviderService.getProvider(forgeNetwork);

        try {
            setError(null);
            setContractAddress(null);
            setTxHash(null);

            /* ========================================================== */
            /*  TX1: Deploy WASM — NO calldata                            */
            /*  onDeployment() just stores owner (calldata is empty)      */
            /* ========================================================== */

            setStatus('deploying');

            const bytecode = await loadTemplateWasm();
            console.log(`[FORGE] Bytecode: ${bytecode.length} bytes (no calldata)`);

            // Fetch UTXOs for deploy
            const utxos = await provider.utxoManager.getUTXOs({
                address: String(walletAddress),
            });
            if (utxos.length === 0) {
                throw new Error('No UTXOs available. Fund your wallet first.');
            }

            if (abortRef.current) return undefined;

            // Deploy — wallet produces funding TX + deploy TX (1 wallet popup)
            const deployResult = await web3.deployContract({
                from: String(walletAddress),
                utxos,
                bytecode,
                // NO calldata — OPNet node bug strips it anyway
                feeRate: FEE_RATE,
                priorityFee: 0n,
                gasSatFee: DEPLOY_GAS_SAT_FEE,
            });

            if (abortRef.current) return undefined;

            const collectionAddrStr = deployResult.contractAddress;
            const [fundingTxHex, deployTxHex] = deployResult.transaction;

            console.log(`[FORGE] Contract address: ${collectionAddrStr}`);
            setContractAddress(collectionAddrStr);

            // Broadcast funding TX
            const fundingResult = await provider.sendRawTransaction(fundingTxHex, false);
            if (!fundingResult?.success) {
                throw new Error(`Funding TX failed: ${fundingResult?.error ?? 'Unknown'}`);
            }
            console.log(`[FORGE] Funding TX: ${fundingResult.result}`);

            // Broadcast deploy TX
            const deployBroadcast = await provider.sendRawTransaction(deployTxHex, false);
            if (!deployBroadcast?.success) {
                throw new Error(`Deploy TX failed: ${deployBroadcast?.error ?? 'Unknown'}`);
            }
            const deployTxId = deployBroadcast.result ?? 'unknown';
            console.log(`[FORGE] Deploy TX: ${deployTxId}`);
            setTxHash(deployTxId);

            /* ========================================================== */
            /*  Wait for deploy TX to be mined                            */
            /* ========================================================== */

            setStatus('waiting');
            console.log('[FORGE] Waiting for deploy TX to be mined...');

            const deployed = await waitForContract(collectionAddrStr, forgeNetwork, abortRef);
            if (!deployed) {
                if (abortRef.current) return undefined;
                throw new Error('Deploy TX not confirmed after 30 minutes. Check the explorer.');
            }

            if (abortRef.current) return undefined;

            /* ========================================================== */
            /*  TX2: initialize() — 4 numeric params only, NO strings     */
            /*  Calls instantiate() with placeholder name/symbol ('_')    */
            /* ========================================================== */

            setStatus('initializing');
            console.log('[FORGE] Initializing collection (TX2 — 4 numeric params)...');

            // Resolve royalty recipient to Address
            const royaltyHex = params.royaltyRecipient.startsWith('opt1')
                ? bech32mToHex(params.royaltyRecipient)
                : params.royaltyRecipient;
            const royaltyRecipient = Address.fromString(royaltyHex);

            // Get contract instance
            const net = getNetworkObj(forgeNetwork);
            const collection = getContract<ICollectionTemplateContract>(
                collectionAddrStr,
                COLLECTION_TEMPLATE_ABI,
                provider,
                net,
            );
            collection.setSender(walletAddr);

            // Simulate initialize() with 4 numeric params only — NO strings
            const callResult = await collection.initialize(
                BigInt(params.supply),
                params.mintPrice,
                params.royaltyBps,
                royaltyRecipient,
            );

            if ('error' in callResult && callResult.error) {
                throw new Error(`Initialize simulation failed: ${String(callResult.error)}`);
            }

            // Send initialize TX (2nd wallet popup)
            const initReceipt = await callResult.sendTransaction({
                signer: signer ?? null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                network: walletNetwork,
            });

            const initTxId = initReceipt.transactionId;
            console.log(`[FORGE] Initialize TX broadcast: ${initTxId}`);
            setTxHash(initTxId);

            if ('revert' in initReceipt && initReceipt.revert) {
                throw new Error(`Initialize TX reverted: ${String(initReceipt.revert)}`);
            }

            if (abortRef.current) return undefined;

            // Verify TX2 — poll isInitialized() up to 30 min
            setStatus('verifying');
            console.log('[FORGE] Verifying initialize() on-chain...');
            let initVerified = false;
            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
                if (abortRef.current) return undefined;
                try {
                    const checkContract = getContract<ICollectionTemplateContract>(
                        collectionAddrStr, COLLECTION_TEMPLATE_ABI, provider, net,
                    );
                    checkContract.setSender(walletAddr);
                    const checkResult = await checkContract.isInitialized();
                    const isInit = checkResult?.properties?.initialized ?? false;
                    if (isInit) {
                        console.log(`[FORGE] Initialize confirmed after ${attempt + 1} polls`);
                        initVerified = true;
                        break;
                    }
                } catch { /* keep polling */ }
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            }

            if (!initVerified) {
                throw new Error(
                    'Initialize TX not confirmed on-chain after 30 minutes. ' +
                    'Check the explorer for TX: ' + initTxId,
                );
            }

            if (abortRef.current) return undefined;

            /* ========================================================== */
            /*  TX3: setCollectionInfo(name, symbol) — strings only        */
            /*  Separate from initialize() to avoid VM OOM                 */
            /* ========================================================== */

            setStatus('naming');
            console.log('[FORGE] Setting collection name + symbol (TX3)...');

            const collection2 = getContract<ICollectionTemplateContract>(
                collectionAddrStr, COLLECTION_TEMPLATE_ABI, provider, net,
            );
            collection2.setSender(walletAddr);

            const nameResult = await collection2.setCollectionInfo(
                params.name,
                params.symbol,
            );

            if ('error' in nameResult && nameResult.error) {
                throw new Error(`setCollectionInfo simulation failed: ${String(nameResult.error)}`);
            }

            const nameReceipt = await nameResult.sendTransaction({
                signer: signer ?? null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                network: walletNetwork,
            });

            const nameTxId = nameReceipt.transactionId;
            console.log(`[FORGE] setCollectionInfo TX broadcast: ${nameTxId}`);
            setTxHash(nameTxId);

            if (abortRef.current) return undefined;

            /* ========================================================== */
            /*  TX4: (Optional) changeMetadata() — branding                */
            /*  Only if user provided icon/banner/description/website      */
            /* ========================================================== */

            const hasBranding = !!(params.icon || params.banner || params.description || params.website);

            if (hasBranding) {
                setStatus('branding');
                console.log('[FORGE] Setting branding (TX4 — changeMetadata)...');

                const collection3 = getContract<ICollectionTemplateContract>(
                    collectionAddrStr, COLLECTION_TEMPLATE_ABI, provider, net,
                );
                collection3.setSender(walletAddr);

                const brandResult = await collection3.changeMetadata(
                    params.icon || '',
                    params.banner || '',
                    params.description || '',
                    params.website || '',
                );

                if ('error' in brandResult && brandResult.error) {
                    console.warn(`[FORGE] Branding simulation failed (non-fatal): ${String(brandResult.error)}`);
                } else {
                    const brandReceipt = await brandResult.sendTransaction({
                        signer: signer ?? null,
                        mldsaSigner: null,
                        refundTo: walletAddress,
                        maximumAllowedSatToSpend: 500_000n,
                        network: walletNetwork,
                    });

                    const brandTxId = brandReceipt.transactionId;
                    console.log(`[FORGE] Branding TX: ${brandTxId}`);
                    setTxHash(brandTxId);
                }
            }

            /* ========================================================== */
            /*  Done — collection is deployed + initialized (+ branded)   */
            /*  Kick off force-enrich so it shows on launchpad ASAP       */
            /* ========================================================== */

            console.log(`[FORGE] Collection deployed + initialized + named at: ${collectionAddrStr}`);

            // Fire-and-forget: tell backend to enrich metadata from chain now
            IndexerAPI.enrichCollection(collectionAddrStr, String(walletAddress)).catch((err) => {
                console.warn('[FORGE] Force-enrich failed (non-fatal):', err);
            });

            setStatus('confirmed');
            return collectionAddrStr;

        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[FORGE] Deployment error:', message);
            setError(message);
            setStatus('error');
            return undefined;
        }
    }, [walletAddress, walletAddr, walletInstance, walletNetwork, signer]);

    return {
        deploy,
        status,
        contractAddress,
        txHash,
        error,
        reset,
    };
}
