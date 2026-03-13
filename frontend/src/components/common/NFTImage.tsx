/**
 * NFTImage — Displays an NFT image from a base_uri + tokenId.
 *
 * Constructs the metadata JSON URL, fetches it, resolves the image field
 * through IPFSService, and displays the image with a gradient fallback.
 * Tries multiple IPFS gateways on failure.
 */

import { useState, useEffect, useCallback } from 'react';
import { IPFSService } from '@/services/IPFSService';
import { IPFS_GATEWAYS } from '@/config/contracts';
import { theme } from '@/styles/theme';

interface NFTImageProps {
    /** Collection base_uri from the indexer (e.g. "ipfs://QmXyz/") */
    readonly baseUri: string;
    /** Token ID */
    readonly tokenId: number;
    /** Fallback index for gradient generation */
    readonly index?: number;
    /** CSS aspect ratio (default: '1') */
    readonly aspectRatio?: string;
    /** Additional inline styles */
    readonly style?: React.CSSProperties;
}

/** Resolve an IPFS URI using a specific gateway index */
function resolveWithGateway(uri: string, gatewayIdx: number): string {
    if (!uri.startsWith('ipfs://') && !(uri.startsWith('Qm') || uri.startsWith('bafy'))) {
        return IPFSService.resolveURI(uri);
    }
    if (gatewayIdx >= IPFS_GATEWAYS.length) return '';
    const path = uri.startsWith('ipfs://') ? uri.slice(7) : uri;
    return `${IPFS_GATEWAYS[gatewayIdx]}${path}`;
}

/** Try fetching metadata JSON from multiple IPFS gateways */
async function fetchMetadataWithFallback(metaUri: string): Promise<{ image: string } | null> {
    const isIpfs = metaUri.startsWith('ipfs://') || metaUri.startsWith('Qm') || metaUri.startsWith('bafy');

    if (!isIpfs) {
        // Non-IPFS: single attempt
        const url = IPFSService.resolveURI(metaUri);
        const res = await fetch(url);
        if (!res.ok) return null;
        return res.json();
    }

    // Try each IPFS gateway
    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        try {
            const url = resolveWithGateway(metaUri, i);
            if (!url) continue;
            const res = await fetch(url);
            if (res.ok) return res.json();
        } catch {
            // Try next gateway
        }
    }
    return null;
}

export function NFTImage({
    baseUri,
    tokenId,
    index = 0,
    aspectRatio = '1',
    style,
}: NFTImageProps): JSX.Element {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [rawImageUri, setRawImageUri] = useState<string>('');
    const [imgGatewayIdx, setImgGatewayIdx] = useState(0);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!baseUri) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function fetchImage() {
            try {
                // OP721 contract's tokenURI() returns baseURI + tokenId (no ".json").
                // Try without extension first, then with ".json" as fallback.
                const metaUriNoExt = `${baseUri}${tokenId}`;
                const metaUriJson = `${baseUri}${tokenId}.json`;

                let json = await fetchMetadataWithFallback(metaUriNoExt);
                if (!json && !cancelled) {
                    json = await fetchMetadataWithFallback(metaUriJson);
                }
                if (!json || cancelled) {
                    if (!cancelled) setError(true);
                    return;
                }

                const rawImage = json.image || (json as Record<string, string>).image_url || '';
                if (!rawImage || cancelled) return;

                if (!cancelled) {
                    setRawImageUri(rawImage);
                    setImageUrl(IPFSService.resolveURI(rawImage));
                }
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchImage();
        return () => { cancelled = true; };
    }, [baseUri, tokenId]);

    // Handle image load errors — try next IPFS gateway
    const handleImgError = useCallback(() => {
        if (!rawImageUri) { setError(true); return; }
        const isIpfs = rawImageUri.startsWith('ipfs://') || rawImageUri.startsWith('Qm') || rawImageUri.startsWith('bafy');
        if (isIpfs) {
            const nextIdx = imgGatewayIdx + 1;
            if (nextIdx < IPFS_GATEWAYS.length) {
                setImgGatewayIdx(nextIdx);
                setImageUrl(resolveWithGateway(rawImageUri, nextIdx));
                return;
            }
        }
        setError(true);
    }, [rawImageUri, imgGatewayIdx]);

    // Gradient fallback
    const gradientBg = `linear-gradient(${120 + index * 10}deg,
        rgba(${(index * 41) % 200}, ${(index * 67) % 130}, ${(index * 23) % 180}, 0.12) 0%,
        ${theme.colors.bg.overlay} 100%)`;

    return (
        <div style={{
            aspectRatio,
            background: gradientBg,
            position: 'relative',
            overflow: 'hidden',
            ...style,
        }}>
            {imageUrl && !error ? (
                <img
                    src={imageUrl}
                    alt={`#${tokenId}`}
                    loading="lazy"
                    onError={handleImgError}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'absolute',
                        inset: 0,
                        opacity: loading ? 0 : 1,
                        transition: 'opacity 0.3s ease',
                    }}
                    onLoad={() => setLoading(false)}
                />
            ) : null}

            {/* Show token ID placeholder when no image */}
            {(!imageUrl || error) && !loading && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <span style={{
                        fontFamily: theme.fonts.mono,
                        fontSize: theme.fontSize.lg,
                        fontWeight: 700,
                        color: theme.colors.text.tertiary,
                        opacity: 0.35,
                    }}>
                        #{tokenId}
                    </span>
                </div>
            )}

            {/* Loading shimmer */}
            {loading && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'gradient-shift 2s ease infinite',
                }} />
            )}
        </div>
    );
}
