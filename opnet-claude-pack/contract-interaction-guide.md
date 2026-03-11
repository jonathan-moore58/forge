# How to Interact with OPNet Contracts from a Website

Getting contract interaction wrong is the #1 source of bugs in OPNet dApps. Read this carefully.

---

## THE GOLDEN RULE

```
getContract() → simulate → sendTransaction()
```

NEVER raw PSBTs. NEVER `@btc-vision/transaction` for contract calls. NEVER skip simulation.

---

## Step 1: Provider (Singleton — ONE instance per network)

```typescript
// services/ProviderService.ts
import { JSONRpcProvider } from 'opnet';
import { networks, Network } from '@btc-vision/bitcoin';

class ProviderService {
    private static instance: ProviderService;
    private providers: Map<string, JSONRpcProvider> = new Map();

    private constructor() {}

    public static getInstance(): ProviderService {
        if (!ProviderService.instance) {
            ProviderService.instance = new ProviderService();
        }
        return ProviderService.instance;
    }

    public getProvider(network: Network): JSONRpcProvider {
        const key = this.networkKey(network);
        if (!this.providers.has(key)) {
            // CORRECT constructor: config object, NOT positional args
            const provider = new JSONRpcProvider({ url: this.rpcUrl(network), network });
            this.providers.set(key, provider);
        }
        return this.providers.get(key)!;
    }

    public clearAll(): void {
        this.providers.clear();
    }

    private rpcUrl(network: Network): string {
        if (network === networks.bitcoin) return 'https://mainnet.opnet.org';
        if (network === networks.opnetTestnet) return 'https://testnet.opnet.org';
        if (network === networks.regtest) return 'http://localhost:9001';
        throw new Error('Unsupported network');
    }

    private networkKey(network: Network): string {
        if (network === networks.bitcoin) return 'mainnet';
        if (network === networks.opnetTestnet) return 'testnet';
        if (network === networks.regtest) return 'regtest';
        return 'unknown';
    }
}

export const providerService = ProviderService.getInstance();
```

---

## Step 2: Contract Cache (ONE instance per address)

```typescript
// services/ContractService.ts
import { IOP20Contract, getContract, OP_20_ABI } from 'opnet';
import { Network } from '@btc-vision/bitcoin';
import { providerService } from './ProviderService';

class ContractService {
    private static instance: ContractService;
    private cache: Map<string, IOP20Contract> = new Map();

    private constructor() {}

    public static getInstance(): ContractService {
        if (!ContractService.instance) {
            ContractService.instance = new ContractService();
        }
        return ContractService.instance;
    }

    public getToken(address: string, network: Network, sender?: string): IOP20Contract {
        const key = `${address}:${sender ?? 'anon'}`;
        if (!this.cache.has(key)) {
            const provider = providerService.getProvider(network);
            // getContract: 4 required params + 1 optional (sender)
            this.cache.set(key, getContract<IOP20Contract>(
                address, OP_20_ABI, provider, network, sender
            ));
        }
        return this.cache.get(key)!;
    }

    public clearCache(): void {
        this.cache.clear();
    }
}

export const contractService = ContractService.getInstance();
```

---

## Step 3: Read Data (No Wallet Needed)

```typescript
// Use metadata() — ONE call instead of 4
async function getTokenInfo(contractAddress: string, network: Network) {
    const contract = contractService.getToken(contractAddress, network);
    const result = await contract.metadata();
    const { name, symbol, decimals, totalSupply, icon } = result.properties;
    return { name, symbol, decimals, totalSupply };
}

// Balance query
async function getBalance(contractAddress: string, userAddress: string, network: Network) {
    const contract = contractService.getToken(contractAddress, network);
    const result = await contract.balanceOf(userAddress);
    return result.properties.balance; // bigint
}
```

---

## Step 4: Write (Requires Wallet — Full Flow)

```typescript
import { useWalletConnect } from '@btc-vision/walletconnect';
import { contractService } from '../services/ContractService';

function TransferToken() {
    const { walletAddress, network, provider } = useWalletConnect();

    const handleTransfer = async (recipientPubKey: string, amount: bigint) => {
        if (!walletAddress || !network || !provider) {
            throw new Error('Wallet not connected');
        }

        // 1. Get cached contract instance with sender set
        const contract = contractService.getToken(TOKEN_ADDRESS, network, walletAddress);

        // 2. SIMULATE (does NOT send anything)
        const sim = await contract.transfer(recipientPubKey, amount);

        // 3. CHECK for errors
        if ('error' in sim) {
            throw new Error(`Simulation failed: ${sim.error}`);
        }

        // 4. SEND — signer is ALWAYS null on frontend
        const receipt = await sim.sendTransaction({
            signer: null,           // FRONTEND: always null
            mldsaSigner: null,      // FRONTEND: always null
            refundTo: walletAddress,
            maximumAllowedSatToSpend: 100000n,
            feeRate: 10,
            network,
        });

        return receipt;
    };
}
```

---

## Step 5: Public Key Resolution for Transfers

Transfers require PUBLIC KEYS (hex `0x...`), not Bitcoin addresses:

```typescript
// WRONG — cannot use Bitcoin address directly for transfers
await contract.transfer('bc1q...recipient', amount);

// CORRECT — resolve public key first
const pubKeyInfo = await provider.getPublicKeyInfo('bc1q...recipient', false);
if (!pubKeyInfo?.publicKey) {
    throw new Error('Public key not found. Ask recipient for their hex public key.');
}
await contract.transfer(pubKeyInfo.publicKey, amount);
```

---

## Extra Inputs/Outputs (Payable Functions)

When a contract function needs BTC sent alongside the call:

```typescript
import { TransactionOutputFlags } from 'opnet';

// 1. Set transaction details BEFORE simulate
//    (setTransactionDetails clears after each call — set before every simulate)
contract.setTransactionDetails({
    inputs: [],
    outputs: [{
        to: 'bc1p...recipient',
        value: 5000n,           // satoshis
        index: 1,               // index 0 is RESERVED — start at 1
        flags: TransactionOutputFlags.hasTo,
    }],
});

// 2. Simulate
const sim = await contract.myPayableMethod(args);
if ('error' in sim) throw new Error(sim.error);

// 3. Send with matching extraOutputs
await sim.sendTransaction({
    signer: null, mldsaSigner: null,
    refundTo: walletAddress,
    maximumAllowedSatToSpend: 200000n,
    feeRate: 10, network,
    extraOutputs: [{ to: 'bc1p...recipient', value: 5000n, index: 1 }],
});
```

---

## Plain BTC Transfer (TransactionFactory — NOT getContract)

```typescript
import { TransactionFactory } from '@btc-vision/transaction';

const factory = new TransactionFactory();
const result = await factory.createBTCTransfer({
    signer: null,           // OPWallet signs — null on frontend
    mldsaSigner: null,
    network,
    utxos,                  // utxos: [] is fine if OPWallet manages UTXOs
    from: userAddress,
    to: 'bc1p...recipient',
    feeRate: 10,
    amount: 50000n,
    // No gasSatFee or priorityFee for BTC transfers
});
await provider.sendRawTransaction(result.tx, false);
```

---

## RPC Call Optimization

```typescript
// WRONG — 4 separate round-trips
const [n, s, d, ts] = await Promise.all([
    contract.name(), contract.symbol(), contract.decimals(), contract.totalSupply()
]);

// CORRECT — 1 round-trip returns everything
const metadata = await contract.metadata();
const { name, symbol, decimals, totalSupply } = metadata.properties;
```

---

## Address Validation

```typescript
import { AddressVerificator } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// General validation
const isValid = AddressVerificator.isValidAddress('bc1q...', networks.bitcoin);

// Specific types (ALWAYS use these — never startsWith() checks)
const isP2TR = AddressVerificator.isValidP2TRAddress('bc1p...', networks.bitcoin);
const isP2WPKH = AddressVerificator.isP2WPKHAddress('bc1q...', networks.bitcoin);
const isP2MR = AddressVerificator.isValidP2MRAddress(address, networks.bitcoin);
const isP2OP = AddressVerificator.isValidP2OPAddress('op1...', networks.bitcoin);

// Auto-detect type
const type = AddressVerificator.detectAddressType('bc1q...', networks.bitcoin);

// Public key validation
const isPubKeyValid = AddressVerificator.isValidPublicKey('0x02...', networks.bitcoin);
```

---

## React Hook Pattern

```typescript
// hooks/useTokenContract.ts
import { useMemo } from 'react';
import { IOP20Contract } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { contractService } from '../services/ContractService';

export function useTokenContract(contractAddress: string): IOP20Contract | null {
    const { network, walletAddress } = useWalletConnect();

    return useMemo(() => {
        if (!network || !contractAddress) return null;
        return contractService.getToken(
            contractAddress,
            network,
            walletAddress ?? undefined
        );
    }, [contractAddress, network, walletAddress]);
}
```

---

## Summary: Complete Transaction Flow

```
1. User clicks "Transfer"
2. Get cached contract: contractService.getToken(addr, network, sender)
3. Resolve recipient public key: provider.getPublicKeyInfo(address, false)
4. Simulate: const sim = await contract.transfer(pubKey, amount)
5. Check errors: if ('error' in sim) throw ...
6. Send: await sim.sendTransaction({ signer: null, mldsaSigner: null, ... })
7. Wallet popup — user approves
8. Transaction broadcasts
9. Show receipt
```

NEVER skip steps. NEVER pass signers on frontend. NEVER construct PSBTs manually.

---

## Custom Contract ABI

For contracts beyond OP20/OP721:

```typescript
import { BitcoinInterfaceAbi } from 'opnet';
import { getContract } from 'opnet';

// Define ABI
const MY_ABI: BitcoinInterfaceAbi = [
    {
        name: 'myMethod',
        inputs: [
            { name: 'param1', type: 'address' },
            { name: 'param2', type: 'uint256' },
        ],
        outputs: [{ name: 'result', type: 'bool' }],
        type: 'function',
    },
];

// Define TypeScript interface
interface IMyContract {
    myMethod(param1: string, param2: bigint): Promise<unknown>;
}

// Use
const contract = getContract<IMyContract>(
    address, MY_ABI, provider, network, senderAddress
);
const sim = await contract.myMethod(param1, param2);
```
