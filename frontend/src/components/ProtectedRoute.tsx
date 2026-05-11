import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isConnected, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return <Loader fullScreen text="connecting..." />;
    if (!isConnected) return <Navigate to="/auth" state={{ from: location }} replace />;
    return <>{children}</>;
}
