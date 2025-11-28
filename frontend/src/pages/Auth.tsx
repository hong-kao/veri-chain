import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Auth.css";

export default function Auth() {
    const navigate = useNavigate();
    const { connectWallet, loginWithOAuth } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleWalletConnect = async () => {
        setLoading(true);
        setError("");

        try {
            await connectWallet();

            // Check if first time user
            const isFirstTime = !localStorage.getItem("claims-user-profile");

            if (isFirstTime) {
                navigate("/onboarding");
            } else {
                navigate("/dashboard");
            }
        } catch (err: any) {
            setError(err.message || "Failed to connect wallet. Please try again.");
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoading(true);
        setError("");

        try {
            // Simulate OAuth flow - in production, this would redirect to Google OAuth
            // For now, we'll mock it with a prompt
            const email = prompt("Enter your email (OAuth simulation):");
            const name = prompt("Enter your name (OAuth simulation):");

            if (!email || !name) {
                throw new Error("OAuth cancelled");
            }

            // Simulate delay
            await new Promise((resolve) => setTimeout(resolve, 1000));

            loginWithOAuth(email, name);

            const isFirstTime = !localStorage.getItem("claims-user-profile");

            if (isFirstTime) {
                navigate("/onboarding");
            } else {
                navigate("/dashboard");
            }
        } catch (err: any) {
            if (err.message !== "OAuth cancelled") {
                setError("Failed to authenticate. Please try again.");
            }
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="grain-bg"></div>

            <nav className="auth-nav">
                <a href="/" className="auth-nav-logo">
                    VeriChain
                </a>
                <div className="auth-nav-links">
                    <a href="/">Home</a>
                    <a href="/dashboard">Dashboard</a>
                </div>
            </nav>

            <div className="auth-content">
                <div className="auth-header">
                    <h1 className="auth-main-title">Welcome to VeriChain</h1>
                    <p className="auth-subtitle">Connect your wallet or sign in to get started</p>
                </div>

                <div className="auth-modal">
                    <h2 className="auth-title">Connect Wallet</h2>

                    {error && <div className="auth-error">{error}</div>}

                    <div className="wallet-options">
                        <button
                            className="wallet-option"
                            onClick={handleWalletConnect}
                            disabled={loading}
                        >
                            {loading ? "CONNECTING..." : "METAMASK"}
                        </button>

                        <button
                            className="wallet-option"
                            onClick={handleWalletConnect}
                            disabled={loading}
                        >
                            {loading ? "CONNECTING..." : "WALLETCONNECT"}
                        </button>

                        <button
                            className="wallet-option"
                            onClick={handleWalletConnect}
                            disabled={loading}
                        >
                            {loading ? "CONNECTING..." : "COINBASE WALLET"}
                        </button>

                        <button
                            className="wallet-option"
                            onClick={handleWalletConnect}
                            disabled={loading}
                        >
                            {loading ? "CONNECTING..." : "FORTMATIC"}
                        </button>
                    </div>

                    <div className="auth-divider">
                        <span>OR</span>
                    </div>

                    <div className="google-section">
                        <button
                            className="google-option"
                            onClick={handleGoogleAuth}
                            disabled={loading}
                        >
                            {loading ? "SIGNING IN..." : "CONTINUE WITH GOOGLE"}
                        </button>
                    </div>
                </div>

                <div className="auth-footer">
                    <p>By connecting, you agree to our Terms of Service and Privacy Policy</p>
                </div>
            </div>
        </div>
    );
}
