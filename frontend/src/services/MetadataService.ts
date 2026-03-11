/**
 * MetadataService — Fetch and cache NFT token metadata from IPFS/HTTP.
 *
 * Metadata follows ERC721 standard:
 * {
 *   "name": "Token Name #1",
 *   "description": "Description",
 *   "image": "ipfs://QmImageCID/1.png",
 *   "attributes": [
 *     { "trait_type": "Background", "value": "Gold" },
 *     { "trait_type": "Rarity Rank", "display_type": "number", "value": 42 }
 *   ]
 * }
 */

import { IPFSService } from './IPFSService';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TokenAttribute {
    trait_type: string;
    value: string | number;
    display_type?: string;
}

export interface TokenMetadata {
    name: string;
    description: string;
    image: string;            // Resolved HTTP URL (not raw ipfs://)
    imageRaw: string;         // Original URI from JSON
    attributes: TokenAttribute[];
    animationUrl?: string;    // Optional animation/video
    externalUrl?: string;     // Optional external link
}

/** Placeholder for hidden/unrevealed tokens */
export const HIDDEN_METADATA: TokenMetadata = {
    name: 'Unrevealed',
    description: 'This NFT has not been revealed yet.',
    image: '',
    imageRaw: '',
    attributes: [],
};

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

class _MetadataService {
    /** In-memory cache: URI → parsed metadata */
    private cache: Map<string, TokenMetadata> = new Map();

    /** Concurrent fetch dedup: URI → pending promise */
    private pending: Map<string, Promise<TokenMetadata>> = new Map();

    /**
     * Fetch token metadata from a URI.
     * Resolves the image field through IPFSService.
     * Caches results in-memory.
     */
    async fetchMetadata(uri: string): Promise<TokenMetadata> {
        if (!uri) return HIDDEN_METADATA;

        // Return cached
        const cached = this.cache.get(uri);
        if (cached) return cached;

        // Dedup concurrent fetches for the same URI
        const inflight = this.pending.get(uri);
        if (inflight) return inflight;

        const promise = this._fetch(uri);
        this.pending.set(uri, promise);

        try {
            const metadata = await promise;
            this.cache.set(uri, metadata);
            return metadata;
        } finally {
            this.pending.delete(uri);
        }
    }

    /**
     * Batch fetch metadata for multiple token URIs.
     */
    async fetchBatch(uris: string[]): Promise<TokenMetadata[]> {
        return Promise.all(uris.map((uri) => this.fetchMetadata(uri)));
    }

    /**
     * Clear the metadata cache.
     */
    clearCache(): void {
        this.cache.clear();
        this.pending.clear();
    }

    /**
     * Remove a specific URI from the cache.
     */
    invalidate(uri: string): void {
        this.cache.delete(uri);
    }

    /**
     * Get cache size (for debugging).
     */
    get cacheSize(): number {
        return this.cache.size;
    }

    /* -------------------------------------------------------------- */
    /*  Internal                                                       */
    /* -------------------------------------------------------------- */

    private async _fetch(uri: string): Promise<TokenMetadata> {
        try {
            const url = IPFSService.resolveURI(uri);
            const response = await fetch(url, {
                signal: AbortSignal.timeout(15_000), // 15s timeout
            });

            if (!response.ok) {
                console.warn(`Metadata fetch failed (${response.status}): ${url}`);
                return HIDDEN_METADATA;
            }

            const json = await response.json();
            return this.parseMetadata(json);
        } catch (err) {
            console.warn(`Metadata fetch error for ${uri}:`, err);
            return HIDDEN_METADATA;
        }
    }

    private parseMetadata(raw: Record<string, unknown>): TokenMetadata {
        const imageRaw = (raw.image as string) || (raw.image_url as string) || '';
        const image = IPFSService.resolveURI(imageRaw);
        const animationRaw = (raw.animation_url as string) || '';

        return {
            name: (raw.name as string) || 'Unnamed',
            description: (raw.description as string) || '',
            image,
            imageRaw,
            attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
            animationUrl: animationRaw ? IPFSService.resolveURI(animationRaw) : undefined,
            externalUrl: (raw.external_url as string) || undefined,
        };
    }
}

/** Singleton instance */
export const MetadataService = new _MetadataService();
