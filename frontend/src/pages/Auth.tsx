import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Auth() {
    const { connectWallet, isConnected, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || '/claims';

    useEffect(() => {
        if (isConnected) navigate(from, { replace: true });
    }, [isConnected, navigate, from]);

    const handleConnect = async (e: React.MouseEvent) => {
        e.preventDefault();
        try {
            await connectWallet();
        } catch (err: any) {
            console.error('wallet connect failed:', err.message);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">
                    <span className="auth-logo-icon">⛓</span>
                    <h1>VeriChain</h1>
                    <p className="auth-tagline">decentralized fact verification</p>
                </div>

                <div className="auth-body">
                    <p className="auth-description">
                        connect your wallet to submit claims, vote on verdicts, and earn rewards.
                    </p>

                    <button
                        id="connect-wallet-btn"
                        className="btn-connect"
                        onClick={handleConnect}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="btn-spinner" />
                        ) : (
                            <>
                                <span className="btn-icon">🦊</span>
                                connect metamask
                            </>
                        )}
                    </button>

                    <p className="auth-hint">
                        no account needed — your wallet is your identity.
                    </p>
                </div>
            </div>

            <style>{`
                .auth-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: radial-gradient(ellipse at 60% 20%, #0f1b3d 0%, #050d1a 70%);
                    padding: 1rem;
                }
                .auth-card {
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 20px;
                    padding: 2.5rem 2rem;
                    width: 100%;
                    max-width: 380px;
                    backdrop-filter: blur(12px);
                    text-align: center;
                }
                .auth-logo { margin-bottom: 2rem; }
                .auth-logo-icon {
                    font-size: 2.5rem;
                    display: block;
                    margin-bottom: 0.5rem;
                }
                .auth-logo h1 {
                    font-size: 1.8rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #60a5fa, #a78bfa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin: 0 0 0.25rem;
                }
                .auth-tagline {
                    color: rgba(255,255,255,0.4);
                    font-size: 0.8rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    margin: 0;
                }
                .auth-description {
                    color: rgba(255,255,255,0.6);
                    font-size: 0.9rem;
                    line-height: 1.6;
                    margin-bottom: 1.5rem;
                }
                .btn-connect {
                    width: 100%;
                    padding: 0.875rem 1.5rem;
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    border: none;
                    border-radius: 12px;
                    color: #fff;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.6rem;
                    transition: opacity 0.2s, transform 0.1s;
                    letter-spacing: 0.02em;
                }
                .btn-connect:hover:not(:disabled) {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                .btn-connect:active:not(:disabled) { transform: translateY(0); }
                .btn-connect:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-icon { font-size: 1.2rem; }
                .btn-spinner {
                    width: 18px; height: 18px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .auth-hint {
                    margin-top: 1rem;
                    color: rgba(255,255,255,0.3);
                    font-size: 0.78rem;
                }
            `}</style>
        </div>
    );
}
