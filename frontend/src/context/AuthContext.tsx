import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';

export interface AuthState {
    authType: 'wallet' | 'oauth' | null;
    walletAddress?: string;
    oauthUser?: {
        email: string;
        name: string;
        picture?: string;
    };
    isConnected: boolean;
    canVote: boolean; // true if wallet connected (either directly or after OAuth)
}

interface AuthContextType extends AuthState {
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

    // Sync Clerk state with local state
    useEffect(() => {
        if (isClerkLoaded && isClerkSignedIn && clerkUser) {
            setAuthState(prev => ({
                ...prev,
                authType: 'oauth',
                isConnected: true,
                oauthUser: {
                    email: clerkUser.primaryEmailAddress?.emailAddress || '',
                    name: clerkUser.fullName || clerkUser.username || '',
                    picture: clerkUser.imageUrl,
                },
                // Keep existing wallet info if present
                walletAddress: prev.walletAddress,
                canVote: !!prev.walletAddress,
            }));
        } else if (isClerkLoaded && !isClerkSignedIn && authState.authType === 'oauth') {
            // If Clerk signs out, clear oauth state but keep wallet if it was separate? 
            // For now, let's just clear if it was oauth.
            setAuthState(prev => ({
                ...prev,
                authType: prev.walletAddress ? 'wallet' : null,
                isConnected: !!prev.walletAddress,
                oauthUser: undefined,
                canVote: !!prev.walletAddress
            }));
        }
    }, [isClerkLoaded, isClerkSignedIn, clerkUser]);

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

    return (
        <AuthContext.Provider
            value={{
                ...authState,
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
