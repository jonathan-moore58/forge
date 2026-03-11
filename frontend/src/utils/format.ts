/** FORGE Formatting Utilities */

const SAT_PER_BTC = 100_000_000n;

/** Convert satoshis to BTC string */
export function satsToBTC(sats: bigint, decimals = 4): string {
    const whole = sats / SAT_PER_BTC;
    const remainder = sats % SAT_PER_BTC;
    const fraction = remainder.toString().padStart(8, '0').slice(0, decimals);
    return `${whole}.${fraction}`;
}

/** Format BTC with appropriate precision */
export function formatBTC(sats: bigint): string {
    const btc = Number(sats) / 1e8;
    if (btc === 0) return '0';
    if (btc < 0.0001) return btc.toFixed(8);
    if (btc < 0.01) return btc.toFixed(6);
    if (btc < 1) return btc.toFixed(4);
    return btc.toFixed(3);
}

/** Truncate address for display */
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
    if (address.length <= startChars + endChars + 3) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/** Format large numbers with K/M/B suffixes */
export function formatCompact(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
}

/** Format blocks as approximate time */
export function blocksToTime(blocks: number): string {
    const minutes = blocks * 10;
    if (minutes < 60) return `~${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `~${hours}h`;
    const days = Math.floor(hours / 24);
    return `~${days}d`;
}

/** Format block countdown */
export function formatBlockCountdown(blocksRemaining: number): string {
    if (blocksRemaining <= 0) return 'Ended';
    if (blocksRemaining === 1) return '1 block';
    return `${blocksRemaining.toLocaleString()} blocks`;
}

/** Format percentage from basis points */
export function bpsToPercent(bps: bigint): string {
    return `${(Number(bps) / 100).toFixed(2)}%`;
}

/** Calculate rarity score color */
export function rarityColor(rank: number, total: number): string {
    const percentile = rank / total;
    if (percentile <= 0.01) return '#f59e0b'; // Top 1% - Gold
    if (percentile <= 0.05) return '#9945ff'; // Top 5% - Purple
    if (percentile <= 0.10) return '#3b82f6'; // Top 10% - Blue
    if (percentile <= 0.25) return '#14f195'; // Top 25% - Green
    return '#a0a0b8'; // Common - Gray
}

/** Time ago from timestamp */
export function timeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
