/**
 * FORGE ABI barrel exports
 * Re-exports all contract ABIs and TypeScript interfaces.
 */

// --- NFT Factory (v4 — single-TX clone factory) ---
export {
    NFT_FACTORY_ABI,
    type RegisterCollectionResultData,
    type RegisterCollectionResult,
    type INFTFactoryContract,
} from './NFTFactoryABI';

// --- Collection Template ---
export {
    COLLECTION_TEMPLATE_ABI,
    type ICollectionTemplateContract,
} from './CollectionTemplateABI';

// --- Collection Registry ---
export {
    COLLECTION_REGISTRY_ABI,
    type RegistryCollectionData,
    type ICollectionRegistryContract,
} from './CollectionRegistryABI';

// --- Marketplace ---
export {
    MARKETPLACE_ABI,
    type ListingData,
    type OfferData,
    type MarketStats,
    type CollectionStatsData,
    type IMarketplaceContract,
} from './MarketplaceABI';

// --- Auction House ---
export {
    AUCTION_HOUSE_ABI,
    type AuctionData,
    type AuctionStatsData,
    type IAuctionHouseContract,
} from './AuctionHouseABI';

// --- Staking Rewards ---
export {
    STAKING_REWARDS_ABI,
    type PoolData,
    type UserStakeData,
    type StakingStatsData,
    type IStakingRewardsContract,
} from './StakingRewardsABI';

// --- NFT Lending ---
export {
    NFT_LENDING_ABI,
    type LoanData,
    type LendingStatsData,
    type INFTLendingContract,
} from './NFTLendingABI';

// --- OP-20 Token (minimal ABI for lending approval flow) ---
export {
    OP20_ABI,
    type IOP20Contract,
} from './OP20ABI';
