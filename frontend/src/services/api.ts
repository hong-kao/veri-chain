const API_URL = 'http://localhost:8001';

export interface User {
    id: number;
    email?: string;
    full_name?: string;
    wallet_address?: string;
    interests?: string[];
    notif_type?: string;
    reputation_score?: number;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export const api = {
    async socialLogin(email: string, fullName: string): Promise<AuthResponse> {
        const response = await fetch(`${API_URL}/auth/social-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                full_name: fullName,
                auth_type: 'google'
            }),
        });

        if (!response.ok) {
            throw new Error('Social login failed');
        }

        return response.json();
    },

    async walletLogin(walletAddress: string, email?: string, name?: string): Promise<AuthResponse> {
        const response = await fetch(`${API_URL}/auth/wallet-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                walletAddress,
                email,
                name
            }),
        });

        if (!response.ok) {
            throw new Error('Wallet login failed');
        }

        return response.json();
    },

    async submitOnboarding(token: string, data: any): Promise<User> {
        const response = await fetch(`${API_URL}/auth/onboarding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                interests: data.interests,
                notif_type: data.notifications.claimStatus ? 'important_only' : 'none', // Mapping simplified for now
                full_name: data.displayName,
                email: data.email
            }),
        });

        if (!response.ok) {
            throw new Error('Onboarding failed');
        }

        return response.json();
    }
};
