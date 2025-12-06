import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { user, isLoading, isConnected, authType, token, walletAddress } = useAuth();
    const location = useLocation();

    console.log('🛡️ ProtectedRoute Check:', {
        path: location.pathname,
        isConnected,
        isLoading,
        authType,
        hasWallet: !!walletAddress,
        hasToken: !!token
    });

    if (isLoading) {
        console.log('⏳ Loading auth state...');
        return <Loader fullScreen text="Verifying session..." />;
    }

    if (!isConnected) {
        console.log('🚫 Not connected, redirecting to /auth');
        // Redirect to auth page but save the attempted location
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    // Check if user has completed onboarding
    // We check for the profile in sessionStorage as a simple flag
    // OR if the user has a token (meaning they're an existing user from the backend)
    const hasProfile = sessionStorage.getItem("claims-user-profile");
    const hasBackendToken = token || sessionStorage.getItem("verichain-token");

    console.log('📋 Onboarding check:', {
        hasProfile: !!hasProfile,
        hasToken: !!hasBackendToken,
        currentPath: location.pathname
    });

    // If user has a backend token, they're an existing user - skip onboarding
    // If user has completed onboarding locally, also skip
    const isExistingUser = !!hasBackendToken || !!hasProfile;

    // If user is connected but hasn't completed onboarding, and isn't already on the onboarding page
    if (!isExistingUser && location.pathname !== '/onboarding') {
        console.log('🔀 New user, redirecting to /onboarding');
        return <Navigate to="/onboarding" replace />;
    }

    // If user is existing and tries to access onboarding, redirect to dashboard
    if (isExistingUser && location.pathname === '/onboarding') {
        console.log('🔀 Existing user, redirecting from /onboarding to /dashboard');
        return <Navigate to="/dashboard" replace />;
    }

    console.log('✅ Access granted to', location.pathname);
    return <>{children}</>;
}
