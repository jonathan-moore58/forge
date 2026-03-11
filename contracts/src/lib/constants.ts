import { u256 } from '@btc-vision/as-bignum/assembly';

/** Platform fee for marketplace registration: 0.01 BTC = 1,000,000 sats */
export const REGISTRATION_FEE_SATS: u256 = u256.fromU64(1_000_000);

/** Platform fee for marketplace sales: 2% = 200 basis points */
export const MARKETPLACE_FEE_BPS: u256 = u256.fromU64(200);

/** Maximum royalty: 10% = 1000 basis points */
export const MAX_ROYALTY_BPS: u256 = u256.fromU64(1000);

/** Basis points denominator: 10,000 = 100% */
export const BPS_DENOMINATOR: u256 = u256.fromU64(10_000);

/** Anti-snipe window: 10 blocks */
export const ANTI_SNIPE_BLOCKS: u64 = 10;

/** Minimum bid increment: 5% = 500 basis points */
export const MIN_BID_INCREMENT_BPS: u256 = u256.fromU64(500);

/** Blocks in approximately 24 hours (Bitcoin ~10 min/block) */
export const BLOCKS_24H: u64 = 144;

/** Maximum per-wallet mint limit */
export const MAX_PER_WALLET: u256 = u256.fromU64(50);

/** Sale phases */
export const PHASE_INACTIVE: u8 = 0;
export const PHASE_WHITELIST: u8 = 1;
export const PHASE_PUBLIC: u8 = 2;
export const PHASE_ENDED: u8 = 3;

/** Auction types */
export const AUCTION_ENGLISH: u8 = 0;
export const AUCTION_DUTCH: u8 = 1;

/** Auction states */
export const AUCTION_ACTIVE: u8 = 0;
export const AUCTION_SETTLED: u8 = 1;
export const AUCTION_CANCELLED: u8 = 2;

/** Listing states */
export const LISTING_ACTIVE: u8 = 0;
export const LISTING_SOLD: u8 = 1;
export const LISTING_CANCELLED: u8 = 2;

/** Offer states */
export const OFFER_ACTIVE: u8 = 0;
export const OFFER_ACCEPTED: u8 = 1;
export const OFFER_CANCELLED: u8 = 2;
export const OFFER_EXPIRED: u8 = 3;

/** Staking lock periods in blocks */
export const LOCK_NONE: u64 = 0;
export const LOCK_1_WEEK: u64 = 1008;   // ~7 days
export const LOCK_1_MONTH: u64 = 4320;  // ~30 days
export const LOCK_3_MONTHS: u64 = 12960; // ~90 days

/** ── NFT Lending constants ─────────────────────────────────────── */

/** Platform fee on lending interest: 1% = 100 basis points */
export const LENDING_FEE_BPS: u256 = u256.fromU64(100);

/** Maximum interest rate: 50% = 5000 basis points */
export const MAX_INTEREST_BPS: u256 = u256.fromU64(5000);

/** Maximum loan duration: ~1 year in blocks (10 min/block) */
export const MAX_LOAN_DURATION: u64 = 52560;

/** Minimum loan duration: ~24 hours in blocks */
export const MIN_LOAN_DURATION: u64 = 144;

/** Loan states */
export const LOAN_PENDING: u8 = 0;
export const LOAN_ACTIVE: u8 = 1;
export const LOAN_REPAID: u8 = 2;
export const LOAN_DEFAULTED: u8 = 3;
export const LOAN_CANCELLED: u8 = 4;
