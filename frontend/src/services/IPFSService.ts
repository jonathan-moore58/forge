/**
 * IPFSService — Resolve ipfs://, ar://, and http(s):// URIs to HTTP gateway URLs.
 *
 * Primary gateway: Pinata (paid, fast, reliable).
 * Fallbacks: Cloudflare, dweb.link, ipfs.io.
 */

import { IPFS_GATEWAYS } from '@/config/contracts';

class _IPFSService {
    private primaryGateway: string = IPFS_GATEWAYS[0];

    /**
     * Resolve any URI to a fetchable HTTP URL.
     *
     * Supported schemes:
     * - ipfs://QmCID        → https://gateway.pinata.cloud/ipfs/QmCID
     * - ipfs://QmCID/1.json → https://gateway.pinata.cloud/ipfs/QmCID/1.json
     * - ar://txId            → https://arweave.net/txId
     * - http(s)://...        → pass through unchanged
     * - data:...             → pass through unchanged
     */
    resolveURI(uri: string): string {
        if (!uri) return '';

        // IPFS protocol
        if (uri.startsWith('ipfs://')) {
            const path = uri.slice(7); // remove 'ipfs://'
            return `${this.primaryGateway}${path}`;
        }

        // Arweave protocol
        if (uri.startsWith('ar://')) {
            const txId = uri.slice(5); // remove 'ar://'
            return `https://arweave.net/${txId}`;
        }

        // Data URI — pass through
        if (uri.startsWith('data:')) {
            return uri;
        }

        // HTTP/HTTPS — pass through
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            return uri;
        }

        // Bare CID (no protocol) — assume IPFS
        if (uri.startsWith('Qm') || uri.startsWith('bafy')) {
            return `${this.primaryGateway}${uri}`;
        }

        // Unknown scheme — return as-is
        return uri;
    }

    /**
     * Try to fetch a URI with fallback gateways if the primary fails.
     * Returns the first successful HTTP URL.
     */
    async resolveWithFallback(uri: string): Promise<string> {
        if (!uri.startsWith('ipfs://')) {
            return this.resolveURI(uri);
        }

        const path = uri.slice(7);

        for (const gateway of IPFS_GATEWAYS) {
            const url = `${gateway}${path}`;
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) return url;
            } catch {
                // Try next gateway
            }
        }

        // If all fail, return primary gateway URL anyway
        return `${this.primaryGateway}${path}`;
    }

    /**
     * Set the primary IPFS gateway.
     */
    setPrimaryGateway(gateway: string): void {
        this.primaryGateway = gateway.endsWith('/') ? gateway : `${gateway}/`;
    }

    /**
     * Extract CID from an IPFS URI.
     */
    extractCID(uri: string): string | null {
        if (uri.startsWith('ipfs://')) {
            const path = uri.slice(7);
            // CID is the first path segment
            return path.split('/')[0] || null;
        }

        // Check if it's a gateway URL
        for (const gateway of IPFS_GATEWAYS) {
            if (uri.startsWith(gateway)) {
                const path = uri.slice(gateway.length);
                return path.split('/')[0] || null;
            }
        }

        return null;
    }
}

/** Singleton instance */
export const IPFSService = new _IPFSService();
