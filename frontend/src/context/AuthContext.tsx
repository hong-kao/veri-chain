import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthState {
    authType: 'wallet' | 'oauth' | null;
    walletAddress?: string;
    oauthUser?: {
        email: string;
        name: string;
    };
    isConnected: boolean;
    canVote: boolean; // true if wallet connected (either directly or after OAuth)
}

interface AuthContextType extends AuthState {
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
    loginWithOAuth: (email: string, name: string) => void;
    logout: () => void;
    connectWalletForOAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>({
        authType: null,
        isConnected: false,
        canVote: false,
    });

    // Load auth state from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('verichain-auth');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setAuthState(parsed);
            } catch (e) {
                console.error('Failed to parse saved auth state');
            }
        }
    }, []);

    // Save auth state to localStorage whenever it changes
    useEffect(() => {
        if (authState.isConnected) {
            localStorage.setItem('verichain-auth', JSON.stringify(authState));
        } else {
            localStorage.removeItem('verichain-auth');
        }
    }, [authState]);

    const connectWallet = async () => {
        try {
            if (!window.ethereum) {
                alert('Please install MetaMask or another Web3 wallet');
                throw new Error('No wallet detected');
            }

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });

            const address = accounts[0];

            setAuthState({
                authType: 'wallet',
                walletAddress: address,
                isConnected: true,
                canVote: true,
            });
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    };

    const connectWalletForOAuth = async () => {
        try {
            if (!window.ethereum) {
                alert('Please install MetaMask or another Web3 wallet');
                throw new Error('No wallet detected');
            }

            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });

            const address = accounts[0];

            // Keep OAuth user data, but add wallet
            setAuthState(prev => ({
                ...prev,
                walletAddress: address,
                canVote: true,
            }));
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    };

    const disconnectWallet = () => {
        setAuthState({
            authType: null,
            isConnected: false,
            canVote: false,
        });
    };

    const loginWithOAuth = (email: string, name: string) => {
        setAuthState({
            authType: 'oauth',
            oauthUser: { email, name },
            isConnected: true,
            canVote: false, // Can't vote until wallet connected
        });
    };

    const logout = () => {
        disconnectWallet();
    };

    return (
        <AuthContext.Provider
            value={{
                ...authState,
                connectWallet,
                disconnectWallet,
                loginWithOAuth,
                logout,
                connectWalletForOAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
