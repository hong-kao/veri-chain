import { ethers } from 'ethers';

declare global {
    interface Window {
        ethereum?: any;
    }
}

export interface WalletConnectionResult {
    address: string;
    provider: ethers.BrowserProvider;
    signer: ethers.Signer;
}

export class WalletService {
    private provider: ethers.BrowserProvider | null = null;
    private signer: ethers.Signer | null = null;

    async connectWallet(): Promise<WalletConnectionResult> {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet detected. Please install MetaMask.');
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            // Create provider and signer
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            const address = await this.signer.getAddress();

            return {
                address,
                provider: this.provider,
                signer: this.signer,
            };
        } catch (error: any) {
            if (error.code === 4001) {
                throw new Error('User rejected the connection request');
            }
            throw error;
        }
    }

    async getAccounts(): Promise<string[]> {
        if (!window.ethereum) {
            return [];
        }

        try {
            const accounts = await window.ethereum.request({
                method: 'eth_accounts',
            });
            return accounts;
        } catch (error) {
            console.error('Failed to get accounts:', error);
            return [];
        }
    }

    async getBalance(address: string): Promise<string> {
        if (!this.provider) {
            throw new Error('Provider not initialized');
        }

        const balance = await this.provider.getBalance(address);
        return ethers.formatEther(balance);
    }

    async switchNetwork(chainId: number): Promise<void> {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet detected');
        }

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }],
            });
        } catch (error: any) {
            // If chain doesn't exist, add it
            if (error.code === 4902) {
                throw new Error('Chain not added to wallet');
            }
            throw error;
        }
    }

    onAccountsChanged(callback: (accounts: string[]) => void): void {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', callback);
        }
    }

    onChainChanged(callback: (chainId: string) => void): void {
        if (window.ethereum) {
            window.ethereum.on('chainChanged', callback);
        }
    }

    removeListeners(): void {
        if (window.ethereum) {
            window.ethereum.removeAllListeners('accountsChanged');
            window.ethereum.removeAllListeners('chainChanged');
        }
    }

    disconnect(): void {
        this.provider = null;
        this.signer = null;
        this.removeListeners();
    }

    getProvider(): ethers.BrowserProvider | null {
        return this.provider;
    }

    getSigner(): ethers.Signer | null {
        return this.signer;
    }
}

// Singleton instance
export const walletService = new WalletService();
