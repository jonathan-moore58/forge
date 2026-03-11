/**
 * CollectionImage — Shows a collection's icon or banner.
 *
 * Priority:
 *   1. `uri` (direct IPFS/HTTP icon or banner from contract metadata)
 *      — tries multiple IPFS gateways on failure
 *   2. Falls back to NFTImage (token #1 from baseUri) if no direct URI
 *   3. Gradient placeholder as final fallback
 */

import { useState, useCallback } from 'react';
import { IPFSService } from '@/services/IPFSService';
import { IPFS_GATEWAYS } from '@/config/contracts';
import { NFTImage } from './NFTImage';
import { theme } from '@/styles/theme';

interface CollectionImageProps {
    /** Direct image URI (icon or banner from contract metadata) */
    readonly uri?: string | null;
    /** Base URI for token metadata fallback (e.g. "ipfs://QmXyz/") */
    readonly baseUri?: string | null;
    /** Fallback index for gradient generation */
    readonly index?: number;
    /** CSS aspect ratio (default: '1') */
    readonly aspectRatio?: string;
    /** Additional inline styles */
    readonly style?: React.CSSProperties;
}

/**
 * Try the next IPFS gateway for a given URI.
 * Returns the resolved URL using the next gateway, or '' if exhausted.
 */
function resolveWithGateway(uri: string, gatewayIndex: number): string {
    if (!uri.startsWith('ipfs://') && !(uri.startsWith('Qm') || uri.startsWith('bafy'))) {
        return ''; // Not an IPFS URI — no fallback possible
    }
    if (gatewayIndex >= IPFS_GATEWAYS.length) return '';

    const path = uri.startsWith('ipfs://') ? uri.slice(7) : uri;
    return `${IPFS_GATEWAYS[gatewayIndex]}${path}`;
}

export function CollectionImage({
    uri,
    baseUri,
    index = 0,
    aspectRatio = '1',
    style,
}: CollectionImageProps): JSX.Element {
    const [gatewayIdx, setGatewayIdx] = useState(0);
    const [allFailed, setAllFailed] = useState(false);

    // Resolve URI — start with primary gateway, advance on error
    const resolvedUri = uri ? (
        gatewayIdx === 0
            ? IPFSService.resolveURI(uri)
            : resolveWithGateway(uri, gatewayIdx)
    ) : '';

    const handleError = useCallback(() => {
        if (!uri) return;
        // For IPFS URIs, try the next gateway
        const isIpfs = uri.startsWith('ipfs://') || uri.startsWith('Qm') || uri.startsWith('bafy');
        if (isIpfs) {
            const nextIdx = gatewayIdx + 1;
            if (nextIdx < IPFS_GATEWAYS.length) {
                setGatewayIdx(nextIdx);
                return;
            }
        }
        // All gateways exhausted or non-IPFS URI failed
        setAllFailed(true);
    }, [uri, gatewayIdx]);

    if (resolvedUri && !allFailed) {
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
                <img
                    src={resolvedUri}
                    alt="Collection"
                    loading="lazy"
                    onError={handleError}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'absolute',
                        inset: 0,
                    }}
                />
            </div>
        );
    }

    // Fallback: use NFTImage with token #1
    if (baseUri) {
        return (
            <NFTImage
                baseUri={baseUri}
                tokenId={1}
                index={index}
                aspectRatio={aspectRatio}
                style={style}
            />
        );
    }

    // Final fallback: gradient placeholder
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
        }} />
    );
}
