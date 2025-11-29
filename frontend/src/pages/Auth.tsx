import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FcGoogle } from "react-icons/fc";

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
                            {loading ? "CONNECTING..." : "CONNECT WALLET"}
                        </button>
                    </div>

                    <div className="auth-divider">
                        <span>OR</span>
                    </div>

                    <div className="google-section">
                        <button
                            className="google-option"
                            onClick={() => loginWithOAuth('oauth_google')}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        >
                            <FcGoogle size={24} />
                            CONTINUE WITH GOOGLE
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
