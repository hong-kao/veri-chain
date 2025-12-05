
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Dashboard.css";

export default function Dashboard() {
    const { user, authType, oauthUser } = useAuth();

    return (
        <div className="terminal-page-container">
            <div className="terminal-window crt">
                {/* Window Header */}
                <div className="terminal-header">
                    <div className="terminal-controls">
                        <span className="control close"></span>
                        <span className="control minimize"></span>
                        <span className="control maximize"></span>
                    </div>
                    <div className="terminal-title">user@{user.displayName || 'guest'}:~/dashboard</div>
                </div>

                {/* Navigation */}
                <nav className="terminal-nav">
                    <Link to="/dashboard" className="term-link active">System_Status</Link>
                    <Link to="/claims" className="term-link">Verification_Logs</Link>
                    <Link to="/leaderboard" className="term-link">Node_Rankings</Link>
                    <Link to="/explore" className="term-link">Network_Activity</Link>
                    <Link to="/notifications" className="term-link">Sys_Alerts</Link>
                </nav>

                {/* Content */}
                <div className="terminal-content">
                    <h1 className="term-h1">
                        <span className="status-dot online"></span>
                        SYSTEM_STATUS: ONLINE
                    </h1>

                    {/* User Node Info */}
                    <div className="term-grid" style={{ gridTemplateColumns: '1fr 2fr', marginBottom: '2rem' }}>
                        <div className="term-card">
                            <h3 className="term-accent">NODE_IDENTITY</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div><span className="term-muted">USER:</span> {user.displayName}</div>
                                <div><span className="term-muted">ROLE:</span> TRUTH_SEEKER</div>
                                <div><span className="term-muted">AUTH:</span> {authType === 'oauth' ? 'OAUTH_TOKEN' : 'WALLET_SIG'}</div>
                                <div><span className="term-muted">ID:</span> {oauthUser?.email || '0x...'}</div>
                            </div>
                        </div>
                        <div className="term-card">
                            <h3 className="term-accent">PERFORMANCE_METRICS</h3>
                            <div className="term-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                <div>
                                    <span className="term-stat-label">REPUTATION</span>
                                    <span className="term-stat-value">850</span>
                                </div>
                                <div>
                                    <span className="term-stat-label">ACCURACY</span>
                                    <span className="term-stat-value">98.2%</span>
                                </div>
                                <div>
                                    <span className="term-stat-label">TOKENS (VRT)</span>
                                    <span className="term-stat-value">2,450</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Logs */}
                    <h2 className="term-accent" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>RECENT_ACTIVITY_LOGS</h2>
                    <div className="term-card" style={{ padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--term-border)' }}>
                                    <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>TIMESTAMP</th>
                                    <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>ACTION</th>
                                    <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>TARGET</th>
                                    <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: '1px dashed var(--term-border)' }}>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>2025-11-29 10:42:01</td>
                                    <td style={{ padding: '1rem', color: 'var(--term-green)' }}>VERIFY_CLAIM</td>
                                    <td style={{ padding: '1rem' }}>Claim #1234 (AI Healthcare)</td>
                                    <td style={{ padding: '1rem', color: 'var(--term-green)' }}>[SUCCESS]</td>
                                </tr>
                                <tr style={{ borderBottom: '1px dashed var(--term-border)' }}>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>2025-11-28 14:20:15</td>
                                    <td style={{ padding: '1rem', color: 'var(--term-blue)' }}>SUBMIT_CLAIM</td>
                                    <td style={{ padding: '1rem' }}>Claim #1235 (BTC Price)</td>
                                    <td style={{ padding: '1rem', color: 'var(--term-yellow)' }}>[PENDING]</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>2025-11-28 09:15:00</td>
                                    <td style={{ padding: '1rem', color: 'var(--term-purple)' }}>RANK_UPDATE</td>
                                    <td style={{ padding: '1rem' }}>System Rank</td>
                                    <td style={{ padding: '1rem' }}>[UPGRADED]</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                        <Link to="/claims/submit">
                            <button className="term-btn">+ INITIATE_NEW_CLAIM</button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
