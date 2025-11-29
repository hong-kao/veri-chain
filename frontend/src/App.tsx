import React, { Suspense } from 'react';
import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy load pages for performance optimization
const Home = React.lazy(() => import("./pages/Home"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Onboarding = React.lazy(() => import("./pages/Onboarding"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Claims = React.lazy(() => import("./pages/Claims"));
const ClaimsSubmit = React.lazy(() => import("./pages/ClaimsSubmit"));
const Leaderboard = React.lazy(() => import("./pages/Leaderboard"));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const Explore = React.lazy(() => import("./pages/Explore"));

// Minimal fallback to avoid clashing with page-specific loaders
const MinimalLoader = () => (
  <div style={{
    height: '100vh',
    width: '100vw',
    background: '#000'
  }} />
);

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<MinimalLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/claims/submit" element={<ClaimsSubmit />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/explore" element={<Explore />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}