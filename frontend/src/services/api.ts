import axios from 'axios';

// Backend base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: false,
});

// Request interceptor to add token to all requests
apiClient.interceptors.request.use(
    (config) => {
        const token = sessionStorage.getItem('verichain-token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            sessionStorage.removeItem('verichain-token');
            sessionStorage.removeItem('verichain-auth');
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

// Type definitions
export interface User {
    id: number;
    wallet_address: string;
    full_name?: string;
    email?: string;
    reddit_profile?: string;
    x_profile?: string;
    interests?: string[];
    notif_type?: string;
    reputation_score?: number;
    created_at?: string;
}

export interface AuthResponse {
    success: boolean;
    token: string;
    user: User;
    message?: string;
}

export interface WalletVerifyResponse {
    success: boolean;
    exists: boolean;
    needsOnboarding: boolean;
    user?: User;
    token?: string;
}

export interface ClaimSubmitResponse {
    success: boolean;
    claimId: number;
    status: string;
    message: string;
    pollingUrl: string;
}

export interface ClaimStatusResponse {
    success: boolean;
    claimId: number;
    status: 'processing' | 'ai_complete' | 'voting' | 'completed';
    claim: {
        text: string;
        type: string;
        platform?: string;
        submittedAt: string;
    };
    results: {
        aiVerdict?: string;
        aiConfidence?: number;
        finalVerdict?: string;
        agentResults: Array<{
            agent: string;
            verdict: string;
            confidence: number;
            completedAt: string;
        }>;
    };
    voting?: {
        sessionId: number;
        status: string;
        closesAt: string;
    };
}

// API functions
export const api = {
    /**
     * Register a new user with email/password
     */
    async register(data: {
        fullName: string;
        email: string;
        password: string;
        confirmPassword: string;
    }): Promise<AuthResponse & { needsOnboarding: boolean }> {
        const response = await apiClient.post('/auth/register', data);

        // Store token in sessionStorage
        if (response.data.token) {
            sessionStorage.setItem('verichain-token', response.data.token);
        }

        return response.data;
    },

    /**
     * Login with email/password
     */
    async login(data: {
        email: string;
        password: string;
    }): Promise<AuthResponse & { needsOnboarding: boolean }> {
        const response = await apiClient.post('/auth/login', data);

        // Store token in sessionStorage
        if (response.data.token) {
            sessionStorage.setItem('verichain-token', response.data.token);
        }

        return response.data;
    },

    /**
     * Verify wallet address and check if user exists
     */
    async verifyWallet(walletAddress: string): Promise<WalletVerifyResponse> {
        const response = await apiClient.post('/auth/verify-wallet', {
            walletAddress
        });
        return response.data;
    },

    /**
     * Sign up / onboard a new user
     */
    async signup(data: {
        authType: 'wallet' | 'oauth' | 'email';
        walletAddress?: string;
        email?: string;
        name?: string;
        displayName?: string;
        redditHandle?: string;
        xHandle?: string;
        farcasterHandle?: string;
        interests?: string[];
        notifType?: 'none' | 'important_only' | 'standard' | 'frequent';
    }): Promise<AuthResponse> {
        const response = await apiClient.post('/auth/signup', data);

        // Store token in sessionStorage
        if (response.data.token) {
            sessionStorage.setItem('verichain-token', response.data.token);
        }

        return response.data;
    },

    /**
     * Get current user profile (requires authentication)
     */
    async getCurrentUser(): Promise<{ success: boolean; user: User }> {
        const response = await apiClient.get('/auth/me');
        return response.data;
    },

    /**
     * Submit a claim for verification
     */
    async submitClaim(data: {
        claim: string;
        claimType?: string;
        platform?: string;
        platformUrl?: string;
        platformAuthor?: string;
        images?: File[];
        videos?: File[];
        submitterId?: number;
    }): Promise<ClaimSubmitResponse> {
        const formData = new FormData();

        formData.append('claim', data.claim);
        formData.append('claimType', data.claimType || 'OTHER');

        if (data.platform) formData.append('platform', data.platform);
        if (data.platformUrl) formData.append('platformUrl', data.platformUrl);
        if (data.platformAuthor) formData.append('platformAuthor', data.platformAuthor);
        if (data.submitterId) formData.append('submitterId', data.submitterId.toString());

        // Append image files
        if (data.images && data.images.length > 0) {
            data.images.forEach(image => {
                formData.append('images', image);
            });
        }

        // Append video files
        if (data.videos && data.videos.length > 0) {
            data.videos.forEach(video => {
                formData.append('videos', video);
            });
        }

        const response = await apiClient.post('/claims/submit', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data;
    },

    /**
     * Get claim status and results
     */
    async getClaimStatus(claimId: number): Promise<ClaimStatusResponse> {
        const response = await apiClient.get(`/claims/${claimId}/status`);
        return response.data;
    },

    /**
     * Get full claim details
     */
    async getClaimDetails(claimId: number): Promise<any> {
        const response = await apiClient.get(`/claims/${claimId}`);
        return response.data;
    },

    /**
     * Legacy: Simple claim analysis
     */
    async analyzeClaim(claim: string): Promise<any> {
        const response = await apiClient.post('/analyze', { claim });
        return response.data;
    }
};

export default api;
