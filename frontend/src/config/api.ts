// API Configuration
// Change this to your deployed backend URL in production
// @ts-ignore - Vite env variable
export const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8080';

export const API_ENDPOINTS = {
    SUBMIT_CLAIM: `${API_BASE_URL}/api/claims/submit`,
    CLAIM_STATUS: (claimId: number) => `${API_BASE_URL}/api/claims/${claimId}/status`,
    CLAIM_DETAILS: (claimId: number) => `${API_BASE_URL}/api/claims/${claimId}`,
    HEALTH: `${API_BASE_URL}/api/health`,
};

export default API_ENDPOINTS;
