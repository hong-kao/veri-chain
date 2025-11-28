import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Claims from "./pages/Claims";
import ClaimsSubmit from "./pages/ClaimsSubmit";
import Leaderboard from "./pages/Leaderboard";
import Notifications from "./pages/Notifications";
import Explore from "./pages/Explore";

export default function App() {
  return (
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
  );
}