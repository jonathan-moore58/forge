/**
 * useNetwork — Track the current OPNet network.
 *
 * F-C1: Now backed by NetworkContext so all components share the same
 * network state. This file re-exports for backward compatibility.
 */

import { useNetworkContext, type NetworkContextValue } from '@/contexts/NetworkContext';

export type UseNetworkReturn = NetworkContextValue;

export function useNetwork(): UseNetworkReturn {
    return useNetworkContext();
}
