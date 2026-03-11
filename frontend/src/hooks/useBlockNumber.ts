/**
 * useBlockNumber — Poll the current block number every N seconds.
 *
 * Used for:
 * - Auction countdowns (blocks remaining)
 * - Phase transitions (whitelist → public)
 * - Offer expiry checks
 * - General "time" reference on-chain
 *
 * IMPORTANT: Use Block.number for timing, NEVER medianTimestamp.
 */

import { useState, useEffect, useRef } from 'react';
import { ProviderService } from '@/services/ProviderService';
import type { ForgeNetwork } from '@/config/contracts';

/** Default poll interval: 10 seconds */
const DEFAULT_POLL_INTERVAL = 10_000;

export interface UseBlockNumberOptions {
    /** Network to poll */
    network: ForgeNetwork;
    /** Poll interval in ms (default: 10000) */
    pollInterval?: number;
    /** Whether to enable polling (default: true) */
    enabled?: boolean;
}

export interface UseBlockNumberReturn {
    /** Current block number (null until first fetch) */
    blockNumber: bigint | null;
    /** Whether the first fetch is loading */
    isLoading: boolean;
    /** Any error from the last fetch */
    error: Error | null;
}

export function useBlockNumber(options: UseBlockNumberOptions): UseBlockNumberReturn {
    const { network, pollInterval = DEFAULT_POLL_INTERVAL, enabled = true } = options;

    const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        const fetchBlock = async () => {
            try {
                const provider = ProviderService.getProvider(network);
                const bn = await provider.getBlockNumber();

                if (!cancelled) {
                    setBlockNumber(bn);
                    setError(null);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                }
            }
        };

        // Fetch immediately
        fetchBlock();

        // Start polling
        intervalRef.current = setInterval(fetchBlock, pollInterval);

        return () => {
            cancelled = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [network, pollInterval, enabled]);

    return { blockNumber, isLoading, error };
}

/**
 * Utility: Calculate blocks remaining until a target block.
 */
export function blocksRemaining(current: bigint | null, target: bigint): bigint | null {
    if (current === null) return null;
    const remaining = target - current;
    return remaining > 0n ? remaining : 0n;
}

/**
 * Utility: Estimate time remaining in human-readable format.
 * Assumes ~10 min per Bitcoin block.
 */
export function estimateTimeRemaining(blocks: bigint | null): string {
    if (blocks === null || blocks <= 0n) return '—';

    const totalMinutes = Number(blocks) * 10;

    if (totalMinutes < 60) return `~${totalMinutes}m`;
    if (totalMinutes < 1440) return `~${Math.round(totalMinutes / 60)}h`;
    return `~${Math.round(totalMinutes / 1440)}d`;
}
