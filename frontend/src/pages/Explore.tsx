import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/TerminalStyles.css";

interface Claim {
    id: number;
    title: string;
    content: string;
    status: string;
    confidence: number;
    views: number;
}

export default function Explore() {
    const { user } = useAuth();
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/claims/explore')
            .then(res => res.json())
            .then(data => {
                setClaims(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch explore claims:", err);
                setLoading(false);
            });
    }, []);

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
                    <div className="terminal-title">user@{user.displayName || 'guest'}:~/network_sniffer</div>
                </div>

                {/* Navigation */}
                <nav className="terminal-nav">
                    <Link to="/dashboard" className="term-link">System_Status</Link>
                    <Link to="/claims" className="term-link">Verification_Logs</Link>
                    <Link to="/leaderboard" className="term-link">Node_Rankings</Link>
                    <Link to="/explore" className="term-link active">Network_Activity</Link>
                    <Link to="/notifications" className="term-link">Sys_Alerts</Link>
                </nav>

                {/* Content */}
                <div className="terminal-content">
                    <h1 className="term-h1">GLOBAL_NETWORK_ACTIVITY</h1>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                        <input
                            type="text"
                            placeholder="grep 'search_term'"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--term-border)',
                                color: 'var(--term-text)',
                                padding: '0.5rem 1rem',
                                fontFamily: 'var(--font-mono)',
                                flex: 1
                            }}
                        />
                        <button className="term-btn">EXECUTE_SEARCH</button>
                    </div>

                    <div className="term-grid">
                        {loading ? (
                            <div className="term-text">INITIALIZING_SCAN...</div>
                        ) : (
                            claims.map((claim) => (
                                <div key={claim.id} className="term-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span className="term-accent">PACKET #{claim.id}</span>
                                        <span style={{
                                            color: claim.status === 'Verified' ? 'var(--term-green)' : 'var(--term-yellow)'
                                        }}>[{claim.status.toUpperCase()}]</span>
                                    </div>
                                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{claim.title}</h3>
                                    <p className="term-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{claim.content}</p>
                                    <div className="term-text" style={{ fontSize: '0.8rem' }}>
                                        CONFIDENCE: {claim.confidence}% | VIEWS: {claim.views}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
