import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Auth from './pages/Auth';
import ViewClaims from './pages/ViewClaims';
import SubmitClaim from './pages/SubmitClaim';
import ClaimDetail from './pages/ClaimDetail';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/auth" element={<Auth />} />

        <Route path="/claims" element={
          <ProtectedRoute><ViewClaims /></ProtectedRoute>
        } />

        <Route path="/claims/:id" element={
          <ProtectedRoute><ClaimDetail /></ProtectedRoute>
        } />

        <Route path="/submit" element={
          <ProtectedRoute><SubmitClaim /></ProtectedRoute>
        } />

        {/* catch-all redirects */}
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}