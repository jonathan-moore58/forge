/**
 * Frontend constants — mirrors key values from contracts/src/lib/constants.ts.
 *
 * Keep in sync with the smart contract constants when redeploying.
 */

/** Anti-snipe window: 10 blocks (same as contract ANTI_SNIPE_BLOCKS) */
export const ANTI_SNIPE_BLOCKS = 10;

/** Marketplace fee: 2% = 200 basis points */
export const MARKETPLACE_FEE_BPS = 200;

/** Maximum royalty: 10% = 1000 basis points */
export const MAX_ROYALTY_BPS = 1000;

/** Registration fee in sats: 0.01 BTC = 1,000,000 sats */
export const REGISTRATION_FEE_SATS = 1_000_000;

/** Launch fee in sats: 0.005 BTC = 500,000 sats */
export const LAUNCH_FEE_SATS = 500_000;

/** Sats per BTC */
export const SATS_PER_BTC = 100_000_000;
