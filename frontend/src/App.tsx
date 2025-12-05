import { Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";

// Pages
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import ViewClaims from "./pages/ViewClaims";
import SubmitClaim from "./pages/SubmitClaim";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />

        {/* Onboarding */}
        <Route path="/onboarding" element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        } />

        {/* Main App Routes */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/claims" element={
          <ProtectedRoute>
            <ViewClaims />
          </ProtectedRoute>
        } />
        <Route path="/submit" element={
          <ProtectedRoute>
            <SubmitClaim />
          </ProtectedRoute>
        } />

        {/* Redirects for old routes */}
        <Route path="/dashboard" element={<Navigate to="/profile" replace />} />
        <Route path="/claims/submit" element={<Navigate to="/submit" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}