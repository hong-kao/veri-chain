import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';

import { api } from '../services/api';

declare global {
    interface Window {
        ethereum: any;
    }
}

export interface AuthState {
    authType: 'wallet' | 'oauth' | null;
    walletAddress?: string;
    oauthUser?: {
        email: string;
        name: string;
        picture?: string;
    };
    isConnected: boolean;
    canVote: boolean;
    token?: string; // Added token
}

interface AuthContextType extends AuthState {
    user: {
        displayName: string;
        email?: string;
        walletAddress?: string;
        profileImage?: string;
    };
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
    loginWithOAuth: (strategy: 'oauth_google' | 'oauth_reddit') => void;
    logout: () => void;
    connectWalletForOAuth: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { user: clerkUser, isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
    const { signOut, openSignIn } = useClerk();

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

    // Sync Clerk state with local state and call backend
    useEffect(() => {
        const syncAuth = async () => {
            if (isClerkLoaded && isClerkSignedIn && clerkUser) {
                try {
                    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
                    const name = clerkUser.fullName || clerkUser.username || '';

                    // Call backend to get token
                    const response = await api.socialLogin(email, name);

                    setAuthState(prev => ({
                        ...prev,
                        authType: 'oauth',
                        isConnected: true,
                        oauthUser: {
                            email,
                            name,
                            picture: clerkUser.imageUrl,
                        },
                        token: response.access_token,
                        // Keep existing wallet info if present
                        walletAddress: prev.walletAddress,
                        canVote: !!prev.walletAddress,
                    }));
                } catch (error) {
                    console.error('Backend login failed:', error);
                }
            } else if (isClerkLoaded && !isClerkSignedIn && authState.authType === 'oauth') {
                setAuthState(prev => ({
                    ...prev,
                    authType: prev.walletAddress ? 'wallet' : null,
                    isConnected: !!prev.walletAddress,
                    oauthUser: undefined,
                    canVote: !!prev.walletAddress,
                    token: undefined
                }));
            }
        };

        syncAuth();
    }, [isClerkLoaded, isClerkSignedIn, clerkUser]);

    // ... (localStorage effect remains same)

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

            // Call backend
            const response = await api.walletLogin(address);

            setAuthState({
                authType: 'wallet',
                walletAddress: address,
                isConnected: true,
                canVote: true,
                token: response.access_token
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

    const loginWithOAuth = (strategy: 'oauth_google' | 'oauth_reddit') => {
        openSignIn({
            appearance: {
                elements: {
                    modalContent: {
                        background: '#1a1a1a',
                        color: '#fff'
                    }
                }
            }
        });
    };

    const logout = () => {
        disconnectWallet();
        signOut();
    };

    const user = {
        displayName: authState.oauthUser?.name || (authState.walletAddress ? `${authState.walletAddress.slice(0, 6)}...${authState.walletAddress.slice(-4)}` : 'Guest'),
        email: authState.oauthUser?.email,
        walletAddress: authState.walletAddress,
        profileImage: authState.oauthUser?.picture
    };

    return (
        <AuthContext.Provider
            value={{
                ...authState,
                user,
                connectWallet,
                disconnectWallet,
                loginWithOAuth,
                logout,
                connectWalletForOAuth,
                isLoading: !isClerkLoaded,
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
