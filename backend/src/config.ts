import 'dotenv/config';

export const config = {
    network: (process.env.NETWORK ?? 'testnet') as 'regtest' | 'testnet' | 'mainnet',
    rpcUrl: process.env.RPC_URL ?? 'https://testnet.opnet.org/api/v1/json-rpc',
    port: Number(process.env.PORT ?? 3420),
    dbPath: process.env.DB_PATH ?? './forge-indexer.db',
    startBlock: Number(process.env.START_BLOCK ?? 0),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 30_000),

    contracts: {
        factory: process.env.FACTORY_ADDRESS ?? '',
        registry: process.env.REGISTRY_ADDRESS ?? '',
        marketplace: process.env.MARKETPLACE_ADDRESS ?? '',
        auctionHouse: process.env.AUCTION_HOUSE_ADDRESS ?? '',
        staking: process.env.STAKING_ADDRESS ?? '',
        lending: process.env.LENDING_ADDRESS ?? '',
    },
} as const;

/** Set of all known contract addresses (non-empty) for quick lookup */
export function getWatchedContracts(): Set<string> {
    const set = new Set<string>();
    for (const addr of Object.values(config.contracts)) {
        if (addr) set.add(addr);
    }
    return set;
}
