import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TerminalLoader from './TerminalLoader';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isConnected, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return <TerminalLoader />;
    }

    if (!isConnected) {
        // Redirect to auth page but save the attempted location
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    // Check if user has completed onboarding
    // We check for the profile in localStorage as a simple flag
    const hasProfile = localStorage.getItem("claims-user-profile");

    // If user is connected but hasn't completed onboarding, and isn't already on the onboarding page
    if (!hasProfile && location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />;
    }

    // If user has profile and tries to access onboarding, redirect to dashboard
    if (hasProfile && location.pathname === '/onboarding') {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
}
