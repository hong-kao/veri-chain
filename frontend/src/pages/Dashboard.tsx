import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Dashboard.css";

export default function Dashboard() {
    const { authType, walletAddress, oauthUser, canVote, connectWalletForOAuth } = useAuth();
    const [connectingWallet, setConnectingWallet] = useState(false);

    const [user, setUser] = useState({
        displayName: "User",
        rank: 43,
        points: 1247,
        accuracy: 89,
        totalClaims: 156,
        successRate: 89,
        activeClaims: 12,
    });

    useEffect(() => {
        const profile = localStorage.getItem("claims-user-profile");
        if (profile) {
            const data = JSON.parse(profile);
            if (data.displayName) {
                setUser((prev) => ({ ...prev, displayName: data.displayName }));
            }
        }

        // Use OAuth name if available
        if (oauthUser?.name && !profile) {
            setUser((prev) => ({ ...prev, displayName: oauthUser.name }));
        }
    }, [oauthUser]);

    const handleConnectWallet = async () => {
        setConnectingWallet(true);
        try {
            await connectWalletForOAuth();
        } catch (error) {
            console.error("Failed to connect wallet:", error);
        } finally {
            setConnectingWallet(false);
        }
    };

    return (
        <div className="dashboard-page">
            <nav className="dashboard-nav">
                <Link to="/" className="nav-logo">
                    VeriChain
                </Link>
                <div className="nav-links">
                    <Link to="/dashboard" className="nav-link active">
                        Dashboard
                    </Link>
                    <Link to="/claims" className="nav-link">
                        Claims
                    </Link>
                    <Link to="/leaderboard" className="nav-link">
                        Leaderboard
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container">
                <div className="hero-stats-card">
                    <div className="user-header">
                        <div className="user-avatar">
                            {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                            <h2>Welcome back, {user.displayName}</h2>
                            <p>
                                Rank #{user.rank} • {user.points.toLocaleString()} points
                            </p>

                            {/* Show wallet address for wallet users */}
                            {authType === 'wallet' && walletAddress && (
                                <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>
                                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                                </p>
                            )}

                            {/* Show OAuth email if available */}
                            {authType === 'oauth' && oauthUser && (
                                <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>
                                    {oauthUser.email}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Connect Wallet Notice for OAuth Users */}
                    {authType === 'oauth' && !canVote && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '1.5rem',
                            background: 'rgba(255, 193, 7, 0.1)',
                            border: '2px solid rgba(255, 193, 7, 0.3)',
                            borderRadius: '0.5rem',
                        }}>
                            <button
                                onClick={handleConnectWallet}
                                disabled={connectingWallet}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    background: '#fff',
                                    border: '2px solid #000',
                                    color: '#000',
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    cursor: connectingWallet ? 'not-allowed' : 'pointer',
                                    marginBottom: '1rem',
                                    fontFamily: 'var(--font-source-code), monospace',
                                }}
                            >
                                {connectingWallet ? 'CONNECTING...' : 'CONNECT WALLET'}
                            </button>
                            <p style={{
                                fontSize: '0.9rem',
                                textAlign: 'center',
                                opacity: 0.8,
                                margin: 0,
                            }}>
                                Connect wallet to participate in voting claims and earn rewards
                            </p>
                        </div>
                    )}

                    {/* Show voting status for wallet-connected OAuth users */}
                    {authType === 'oauth' && canVote && walletAddress && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '1rem',
                            background: 'rgba(76, 175, 80, 0.1)',
                            border: '2px solid rgba(76, 175, 80, 0.3)',
                            borderRadius: '0.5rem',
                            textAlign: 'center',
                        }}>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                Wallet Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                            </p>
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
                                You can now vote on claims and earn rewards!
                            </p>
                        </div>
                    )}

                    <div className="stats-row">
                        <div className="stat-box">
                            <div className="stat-value">{user.points.toLocaleString()}</div>
                            <div className="stat-label">Points</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-value">#{user.rank}</div>
                            <div className="stat-label">Rank</div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-value">{user.accuracy}%</div>
                            <div className="stat-label">Accuracy</div>
                        </div>
                    </div>

                    <div className="progress-section">
                        <div className="progress-header">
                            <span>Reputation Progress</span>
                            <span>{user.points}/1500</span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${(user.points / 1500) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="quick-stats">
                    <div className="quick-stat-card">
                        <div className="quick-stat-value">{user.totalClaims}</div>
                        <div className="quick-stat-label">Claims</div>
                    </div>
                    <div className="quick-stat-card">
                        <div className="quick-stat-value">{user.successRate}%</div>
                        <div className="quick-stat-label">Success</div>
                    </div>
                    <div className="quick-stat-card">
                        <div className="quick-stat-value">{user.activeClaims}</div>
                        <div className="quick-stat-label">Active</div>
                    </div>
                </div>

                <div className="activity-section">
                    <h3>Recent Activity</h3>
                    <div className="activity-list">
                        <div className="activity-item">
                            <div className="activity-icon success">✓</div>
                            <div className="activity-content">
                                <div className="activity-title">Claim #1234 verified</div>
                                <div className="activity-meta">+150 points • 2h ago</div>
                            </div>
                        </div>
                        <div className="activity-item">
                            <div className="activity-icon rank">↑</div>
                            <div className="activity-content">
                                <div className="activity-title">Moved up 5 ranks</div>
                                <div className="activity-meta">1d ago</div>
                            </div>
                        </div>
                        <div className="activity-item">
                            <div className="activity-icon pending">⏳</div>
                            <div className="activity-content">
                                <div className="activity-title">Claim #1235 processing</div>
                                <div className="activity-meta">1d ago</div>
                            </div>
                        </div>
                    </div>
                </div>

                <Link to="/claims/submit" className="fab">
                    + Submit
                </Link>
            </div>
        </div>
    );
}
