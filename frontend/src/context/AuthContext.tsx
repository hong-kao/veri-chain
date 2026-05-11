import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

declare global {
    interface Window {
        ethereum: any;
    }
}

export interface AuthState {
    walletAddress?: string;
    isConnected: boolean;
    canVote: boolean;
    token?: string;
    userId?: number;
}

interface AuthContextType extends AuthState {
    user: {
        id?: number;
        displayName: string;
        walletAddress?: string;
    };
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>({
        isConnected: false,
        canVote: false,
    });
    const [isLoading, setIsLoading] = useState(false);

    // restore session on mount
    useEffect(() => {
        const saved = sessionStorage.getItem('verichain-auth');
        if (saved) {
            try { setAuthState(JSON.parse(saved)); }
            catch { sessionStorage.removeItem('verichain-auth'); }
        }
    }, []);

    // persist on change
    useEffect(() => {
        if (authState.isConnected) {
            sessionStorage.setItem('verichain-auth', JSON.stringify(authState));
        } else {
            sessionStorage.removeItem('verichain-auth');
        }
    }, [authState]);

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert('please install MetaMask or another web3 wallet');
            throw new Error('no wallet detected');
        }

        setIsLoading(true);
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const address: string = accounts[0];

            try {
                const response = await api.verifyWallet(address);
                setAuthState({
                    walletAddress: address,
                    isConnected: true,
                    canVote: true,
                    token: response.token,
                    userId: response.user?.id,
                });
                if (response.token) sessionStorage.setItem('verichain-token', response.token);
            } catch {
                // backend unreachable -- still connect wallet
                setAuthState({ walletAddress: address, isConnected: true, canVote: true });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const disconnectWallet = () => {
        setAuthState({ isConnected: false, canVote: false });
        sessionStorage.removeItem('verichain-auth');
        sessionStorage.removeItem('verichain-token');
    };

    const logout = disconnectWallet;

    const user = {
        id: authState.userId,
        displayName: authState.walletAddress
            ? `${authState.walletAddress.slice(0, 6)}...${authState.walletAddress.slice(-4)}`
            : 'guest',
        walletAddress: authState.walletAddress,
    };

    return (
        <AuthContext.Provider value={{ ...authState, user, connectWallet, disconnectWallet, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
