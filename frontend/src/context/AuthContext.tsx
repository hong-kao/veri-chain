import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';

import { api } from '../services/api';

declare global {
    interface Window {
        ethereum: any;
    }
}

export interface AuthState {
    authType: 'wallet' | 'oauth' | 'email' | null;
    walletAddress?: string;
    email?: string;
    oauthUser?: {
        email: string;
        name: string;
        picture?: string;
    };
    isConnected: boolean;
    canVote: boolean;
    token?: string;
    userId?: number;
    needsOnboarding?: boolean;
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
    loginWithEmail: (email: string, password: string) => Promise<{ needsOnboarding: boolean }>;
    registerWithEmail: (fullName: string, email: string, password: string, confirmPassword: string) => Promise<void>;
    logout: () => void;
    connectWalletForOAuth: () => Promise<void>;
    updateProfile: () => void;
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

    const [savedProfile, setSavedProfile] = useState<any>(null);

    // Load auth state from sessionStorage on mount (clears on browser close)
    useEffect(() => {
        const saved = sessionStorage.getItem('verichain-auth');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setAuthState(parsed);
            } catch (e) {
                console.error('Failed to parse saved auth state');
            }
        }

        // Load saved profile from sessionStorage
        const profile = sessionStorage.getItem('claims-user-profile');
        if (profile) {
            try {
                setSavedProfile(JSON.parse(profile));
            } catch (e) {
                console.error('Failed to parse saved profile');
            }
        }
    }, []);

    // Sync Clerk state with local state
    useEffect(() => {
        if (isClerkLoaded && isClerkSignedIn && clerkUser) {
            const email = clerkUser.primaryEmailAddress?.emailAddress || '';
            const name = clerkUser.fullName || clerkUser.username || '';

            console.log('🔐 Clerk user signed in:', email);

            setAuthState(prev => ({
                ...prev,
                authType: 'oauth',
                isConnected: true,  // THIS IS CRITICAL - OAuth users are connected
                oauthUser: {
                    email,
                    name,
                    picture: clerkUser.imageUrl,
                },
                // Keep existing wallet info if present
                walletAddress: prev.walletAddress,
                canVote: !!prev.walletAddress,
            }));
        } else if (isClerkLoaded && !isClerkSignedIn && authState.authType === 'oauth') {
            console.log('🔓 Clerk user signed out');
            setAuthState(prev => ({
                ...prev,
                authType: prev.walletAddress ? 'wallet' : null,
                isConnected: !!prev.walletAddress,
                oauthUser: undefined,
                canVote: !!prev.walletAddress,
                token: undefined
            }));
        }
    }, [isClerkLoaded, isClerkSignedIn, clerkUser]);

    // Persist auth state to sessionStorage (clears on browser close)
    useEffect(() => {
        if (authState.isConnected) {
            sessionStorage.setItem('verichain-auth', JSON.stringify(authState));
        } else {
            sessionStorage.removeItem('verichain-auth');
        }
    }, [authState]);

    const connectWallet = async () => {
        try {
            if (!window.ethereum) {
                alert('Please install MetaMask or another Web3 wallet');
                throw new Error('No wallet detected');
            }

            console.log('💼 Requesting wallet access...');

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });

            const address = accounts[0];
            console.log('💼 Wallet connected:', address);

            try {
                // Call backend to verify wallet
                console.log('🔍 Verifying wallet with backend...');
                const response = await api.verifyWallet(address);
                console.log('📡 Backend response:', response);

                if (response.exists && response.token) {
                    // Existing user - set auth state with token
                    console.log('✅ Existing user found, logging in');
                    setAuthState({
                        authType: 'wallet',
                        walletAddress: address,
                        isConnected: true,
                        canVote: true,
                        token: response.token
                    });

                    sessionStorage.setItem('verichain-token', response.token);
                } else {
                    // New user - needs onboarding
                    console.log('🆕 New user, needs onboarding');
                    setAuthState({
                        authType: 'wallet',
                        walletAddress: address,
                        isConnected: true,  // CRITICAL - must be true for ProtectedRoute
                        canVote: true,
                    });
                }
            } catch (apiError: any) {
                // Backend call failed, but wallet is still connected
                console.error('⚠️ Backend verification failed, continuing with wallet-only mode:', apiError);
                setAuthState({
                    authType: 'wallet',
                    walletAddress: address,
                    isConnected: true,  // Still connected to wallet
                    canVote: true,
                });
            }
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
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

    const loginWithEmail = async (email: string, password: string): Promise<{ needsOnboarding: boolean }> => {
        try {
            console.log('📧 Logging in with email...');
            const response = await api.login({ email, password });

            console.log('✅ Email login successful');

            setAuthState({
                authType: 'email',
                email: response.user.email,
                isConnected: true,
                canVote: !!response.user.wallet_address,
                token: response.token,
                userId: response.user.id,
                walletAddress: response.user.wallet_address || undefined,
                needsOnboarding: response.needsOnboarding
            });

            return { needsOnboarding: response.needsOnboarding };
        } catch (error) {
            console.error('❌ Email login failed:', error);
            throw error;
        }
    };

    const registerWithEmail = async (fullName: string, email: string, password: string, confirmPassword: string): Promise<void> => {
        try {
            console.log('📝 Registering with email...');
            const response = await api.register({ fullName, email, password, confirmPassword });

            console.log('✅ Registration successful');

            setAuthState({
                authType: 'email',
                email: response.user.email,
                isConnected: true,
                canVote: false,
                token: response.token,
                userId: response.user.id,
                needsOnboarding: true
            });
        } catch (error) {
            console.error('❌ Registration failed:', error);
            throw error;
        }
    };

    const logout = () => {
        disconnectWallet();
        signOut();
        sessionStorage.removeItem('verichain-token');
        sessionStorage.removeItem('verichain-auth');
        sessionStorage.removeItem('claims-user-profile');
    };

    const updateProfile = () => {
        const profile = sessionStorage.getItem('claims-user-profile');
        if (profile) {
            try {
                setSavedProfile(JSON.parse(profile));
                console.log('📝 Profile updated from sessionStorage');
            } catch (e) {
                console.error('Failed to parse profile during update');
            }
        }
    };

    const user = {
        displayName: savedProfile?.displayName || authState.oauthUser?.name || (authState.walletAddress ? `${authState.walletAddress.slice(0, 6)}...${authState.walletAddress.slice(-4)}` : (authState.email || 'Guest')),
        email: savedProfile?.email || authState.oauthUser?.email || authState.email,
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
                loginWithEmail,
                registerWithEmail,
                logout,
                connectWalletForOAuth,
                updateProfile,
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
