/**
 * ContractService — Cached getContract() calls.
 *
 * CRITICAL OPNet patterns:
 * - Cache keyed by string (NEVER Map<Address, T>)
 * - Always call contract.setSender(walletAddress) before simulation
 * - Frontend: signer=null, mldsaSigner=null in sendTransaction
 */

import { getContract, type BaseContractProperties, type BitcoinInterfaceAbi } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { ProviderService } from './ProviderService';
import { CONTRACT_ADDRESSES, type ForgeNetwork } from '@/config/contracts';
import {
    NFT_FACTORY_ABI,
    COLLECTION_TEMPLATE_ABI,
    COLLECTION_REGISTRY_ABI,
    MARKETPLACE_ABI,
    AUCTION_HOUSE_ABI,
    STAKING_REWARDS_ABI,
    NFT_LENDING_ABI,
    type INFTFactoryContract,
    type ICollectionTemplateContract,
    type ICollectionRegistryContract,
    type IMarketplaceContract,
    type IAuctionHouseContract,
    type IStakingRewardsContract,
    type INFTLendingContract,
} from '@/contracts/abis';

class _ContractService {
    /** Cache keyed by "network:address" string */
    private cache: Record<string, unknown> = {};

    /** Map ForgeNetwork → bitcoin-js Network object */
    private static getNetworkObj(network: ForgeNetwork) {
        switch (network) {
            case 'regtest': return networks.regtest;
            case 'testnet': return networks.opnetTestnet;
            case 'mainnet': return networks.bitcoin;
        }
    }

    /**
     * Generic cached getContract wrapper.
     * getContract signature: (address, abi, provider, network, sender?)
     */
    private getCached<T extends BaseContractProperties>(
        address: string,
        network: ForgeNetwork,
        abi: BitcoinInterfaceAbi,
    ) {
        const key = `${network}:${address}`;

        if (!this.cache[key]) {
            const provider = ProviderService.getProvider(network);
            const net = _ContractService.getNetworkObj(network);
            this.cache[key] = getContract<T>(address, abi, provider, net);
        }

        return this.cache[key] as ReturnType<typeof getContract<T>>;
    }

    /**
     * Get the NFTFactory contract instance.
     */
    getFactory(network: ForgeNetwork): INFTFactoryContract {
        const address = CONTRACT_ADDRESSES[network].factory;
        if (!address) throw new Error(`NFTFactory not deployed on ${network}`);
        return this.getCached<INFTFactoryContract>(address, network, NFT_FACTORY_ABI);
    }

    /**
     * Get a CollectionTemplate contract instance by address.
     */
    getCollection(address: string, network: ForgeNetwork): ICollectionTemplateContract {
        return this.getCached<ICollectionTemplateContract>(address, network, COLLECTION_TEMPLATE_ABI);
    }

    /**
     * Get the CollectionRegistry contract instance.
     */
    getRegistry(network: ForgeNetwork): ICollectionRegistryContract {
        const address = CONTRACT_ADDRESSES[network].registry;
        if (!address) throw new Error(`CollectionRegistry not deployed on ${network}`);
        return this.getCached<ICollectionRegistryContract>(address, network, COLLECTION_REGISTRY_ABI);
    }

    /**
     * Get the Marketplace contract instance.
     */
    getMarketplace(network: ForgeNetwork): IMarketplaceContract {
        const address = CONTRACT_ADDRESSES[network].marketplace;
        if (!address) throw new Error(`Marketplace not deployed on ${network}`);
        return this.getCached<IMarketplaceContract>(address, network, MARKETPLACE_ABI);
    }

    /**
     * Get the AuctionHouse contract instance.
     */
    getAuctionHouse(network: ForgeNetwork): IAuctionHouseContract {
        const address = CONTRACT_ADDRESSES[network].auctionHouse;
        if (!address) throw new Error(`AuctionHouse not deployed on ${network}`);
        return this.getCached<IAuctionHouseContract>(address, network, AUCTION_HOUSE_ABI);
    }

    /**
     * Get the StakingRewards contract instance.
     */
    getStaking(network: ForgeNetwork): IStakingRewardsContract {
        const address = CONTRACT_ADDRESSES[network].staking;
        if (!address) throw new Error(`StakingRewards not deployed on ${network}`);
        return this.getCached<IStakingRewardsContract>(address, network, STAKING_REWARDS_ABI);
    }

    /**
     * Get the NFTLending contract instance.
     */
    getLending(network: ForgeNetwork): INFTLendingContract {
        const address = CONTRACT_ADDRESSES[network].lending;
        if (!address) throw new Error(`NFTLending not deployed on ${network}`);
        return this.getCached<INFTLendingContract>(address, network, NFT_LENDING_ABI);
    }

    /**
     * Clear all cached contract instances.
     * Call this on network switch.
     */
    clearCache(): void {
        this.cache = {};
    }

    /**
     * Clear cache for a specific address on a network.
     */
    clearCacheFor(address: string, network: ForgeNetwork): void {
        delete this.cache[`${network}:${address}`];
    }
}

/** Singleton instance */
export const ContractService = new _ContractService();
