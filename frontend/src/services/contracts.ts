import { ethers, BrowserProvider, Contract } from 'ethers';
import ClaimRegistryABI from '../abis/ClaimRegistry.json';

// Deployed Addresses (Sepolia)
export const CLAIM_REGISTRY_ADDRESS = "0xB9363715c69992Fada1448C05165b97d23D83559";

/**
 * Gets an ethers provider connected to the user's wallet
 */
export async function getProvider(): Promise<BrowserProvider | null> {
    if (!window.ethereum) {
        console.error('No wallet detected');
        return null;
    }
    return new ethers.BrowserProvider(window.ethereum);
}

/**
 * Gets a signer for the connected wallet
 */
export async function getSigner(): Promise<ethers.Signer | null> {
    const provider = await getProvider();
    if (!provider) return null;
    return provider.getSigner();
}

/**
 * Gets the ClaimRegistry contract instance connected to the user's wallet
 */
export async function getClaimRegistryContract(): Promise<Contract | null> {
    const signer = await getSigner();
    if (!signer) return null;

    return new ethers.Contract(
        CLAIM_REGISTRY_ADDRESS,
        ClaimRegistryABI.abi,
        signer
    );
}

/**
 * Computes the keccak256 hash of claim text
 */
export function computeClaimHash(claimText: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(claimText));
}

/**
 * Registers a claim on-chain
 * @param claimText - The normalized text of the claim
 * @param claimUuid - The UUID assigned to this claim
 * @returns Transaction hash if successful, null if failed
 */
export async function registerClaimOnChain(
    claimText: string,
    claimUuid: string
): Promise<{ txHash: string; claimHash: string } | null> {
    try {
        const contract = await getClaimRegistryContract();
        if (!contract) {
            throw new Error('Failed to get contract instance. Please connect your wallet.');
        }

        // Compute the claim hash
        const claimHash = computeClaimHash(claimText);

        // Generate the claim URI (could be IPFS in production)
        const claimUri = `verichain://claim/${claimUuid}`;

        console.log('📝 Registering claim on-chain...');
        console.log('   URI:', claimUri);
        console.log('   Hash:', claimHash);

        // Call the smart contract
        const tx = await contract.registerClaim(claimUri, claimHash);
        console.log('⏳ Transaction submitted:', tx.hash);

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log('✅ Transaction confirmed:', receipt.hash);

        return {
            txHash: receipt.hash,
            claimHash: claimHash
        };
    } catch (error: any) {
        console.error('❌ On-chain registration failed:', error);

        // Provide user-friendly error messages
        if (error.code === 'ACTION_REJECTED') {
            throw new Error('Transaction was rejected by user');
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            throw new Error('Insufficient funds for gas fees');
        } else if (error.message?.includes('user rejected')) {
            throw new Error('Transaction was rejected by user');
        }

        throw error;
    }
}

/**
 * Checks if the user has a connected wallet
 */
export async function isWalletConnected(): Promise<boolean> {
    if (!window.ethereum) return false;

    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        return accounts && accounts.length > 0;
    } catch {
        return false;
    }
}

/**
 * Gets the current connected wallet address
 */
export async function getConnectedAddress(): Promise<string | null> {
    if (!window.ethereum) return null;

    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        return accounts?.[0] || null;
    } catch {
        return null;
    }
}
