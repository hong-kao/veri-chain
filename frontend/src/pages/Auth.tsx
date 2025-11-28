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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21.35 11.1H12V15.3H17.5C17.2 16.3 16.5 17.2 15.7 17.8L15.7 17.8L18.5 20C20.1 18.5 21.1 16.4 21.35 14C21.4 13 21.4 12 21.35 11.1Z" fill="currentColor" />
                                <path d="M12 21C14.6 21 16.8 20.1 18.5 18.6L15.7 16.4C14.8 17 13.7 17.4 12.5 17.4C9.9 17.4 7.7 15.8 6.9 13.5H4L4 15.7C5.7 18.9 9.1 21 12 21Z" fill="currentColor" />
                                <path d="M6.9 13.5C6.7 12.8 6.6 12.1 6.6 11.4C6.6 10.7 6.7 10 6.9 9.3V7.1H4C3.2 8.5 2.8 10.1 2.8 11.8C2.8 13.5 3.2 15.1 4 16.5L6.9 13.5Z" fill="currentColor" />
                                <path d="M12 5.4C13.5 5.4 14.8 5.9 15.8 6.8L18.6 4C16.9 2.4 14.6 1.5 12 1.5C9.1 1.5 5.7 3.6 4 6.8L6.9 9C7.7 6.9 9.9 5.4 12 5.4Z" fill="currentColor" />
                            </svg>
                            CONTINUE WITH GOOGLE
                        </button>
                        <button
                            className="reddit-option"
                            onClick={() => loginWithOAuth('oauth_reddit')}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0C5.373 0 0 5.373 0 12C0 18.627 5.373 24 12 24C18.627 24 24 18.627 24 12C24 5.373 18.627 0 12 0ZM17.472 13.056C17.472 14.928 15.024 16.464 12 16.464C8.976 16.464 6.528 14.928 6.528 13.056C6.528 12.192 6.96 11.424 7.632 10.896C7.584 10.656 7.536 10.416 7.536 10.128C7.536 8.832 8.592 7.776 9.888 7.776C10.752 7.776 11.472 8.256 11.856 8.928C12.768 8.784 13.728 8.784 14.688 8.928C15.072 8.256 15.792 7.776 16.656 7.776C17.952 7.776 19.008 8.832 19.008 10.128C19.008 10.416 18.96 10.656 18.912 10.896C19.584 11.424 20.016 12.192 17.472 13.056Z" />
                            </svg>
                            CONTINUE WITH REDDIT
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
