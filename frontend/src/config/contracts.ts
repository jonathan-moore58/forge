/**
 * FORGE contract addresses per network.
 *
 * After deploying contracts, update the addresses here.
 * The frontend reads these to instantiate contract instances.
 */

export type ForgeNetwork = 'regtest' | 'testnet' | 'mainnet';

export interface ContractAddresses {
    /** NFTFactory — central registry for collections (legacy) */
    factory: string;
    /** CollectionRegistry — lightweight on-chain discovery */
    registry: string;
    /** Marketplace — fixed-price listings + offers */
    marketplace: string;
    /** AuctionHouse — English + Dutch auctions */
    auctionHouse: string;
    /** StakingRewards — NFT staking pools */
    staking: string;
    /** NFTLending — peer-to-peer NFT-collateralized lending */
    lending: string;
}

/**
 * Contract addresses indexed by network.
 * Replace empty strings with deployed addresses.
 */
export const CONTRACT_ADDRESSES: Record<ForgeNetwork, ContractAddresses> = {
    regtest: {
        factory: '',
        registry: '',
        marketplace: '',
        auctionHouse: '',
        staking: '',
        lending: '',
    },
    testnet: {
        factory: 'opt1sqqewmpmd2vwg67fflwdmu202nwhajrqw2yd9esez',
        registry: '',
        marketplace: 'opt1sqpj37ym9rx7ud0spwgpf68mwpmxs8dpgxu204jek',
        auctionHouse: 'opt1sqqvah7sfn8snf7cj0rypzgxnwxklt6dv3sdghxff',
        staking: 'opt1sqzqqmlxlq5tmmrs933905dxuu93l604s2skqgq6d',
        lending: 'opt1sqpvakn6n4s3y3ejx3sjpudxu39jgngw6pslu7f3x',
    },
    mainnet: {
        factory: '',
        registry: '',
        marketplace: '',
        auctionHouse: '',
        staking: '',
        lending: '',
    },
};

/**
 * RPC endpoints per network.
 */
export const RPC_URLS: Record<ForgeNetwork, string> = {
    regtest: 'http://localhost:9001',
    testnet: 'https://testnet.opnet.org',
    mainnet: 'https://mainnet.opnet.org',
};

/**
 * Default network for development.
 */
export const DEFAULT_NETWORK: ForgeNetwork = 'testnet';

/**
 * Backend indexer API base URL.
 * The indexer watches OPNet blocks and serves REST endpoints for
 * collections, tokens, listings, activity, etc.
 */
export const API_BASE_URL: string =
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3420';

/**
 * IPFS gateway configuration.
 */
export const IPFS_GATEWAYS = [
    'https://ipfs.opnet.org/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
    'https://ipfs.io/ipfs/',
] as const;

/**
 * Pinata API configuration (for uploads).
 * Set VITE_PINATA_JWT in .env for actual uploads.
 */
export const PINATA_CONFIG = {
    apiUrl: 'https://api.pinata.cloud',
    gateway: IPFS_GATEWAYS[0],
} as const;
