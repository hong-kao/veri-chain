import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/TerminalStyles.css";

interface LeaderboardUser {
    rank: number;
    name: string;
    points: number;
    accuracy: number;
    change: number;
    isCurrentUser?: boolean;
}

export default function Leaderboard() {
    const { user } = useAuth();
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/user/leaderboard')
            .then(res => res.json())
            .then(data => {
                setLeaderboard(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch leaderboard:", err);
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
                    <div className="terminal-title">user@{user.displayName || 'guest'}:~/node_rankings</div>
                </div>

                {/* Navigation */}
                <nav className="terminal-nav">
                    <Link to="/dashboard" className="term-link">System_Status</Link>
                    <Link to="/claims" className="term-link">Verification_Logs</Link>
                    <Link to="/leaderboard" className="term-link active">Node_Rankings</Link>
                    <Link to="/explore" className="term-link">Network_Activity</Link>
                    <Link to="/notifications" className="term-link">Sys_Alerts</Link>
                </nav>

                {/* Content */}
                <div className="terminal-content">
                    <h1 className="term-h1">TOP_PERFORMING_NODES</h1>

                    {loading ? (
                        <div className="term-text">CALCULATING_METRICS...</div>
                    ) : (
                        <div className="term-card" style={{ padding: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--term-border)' }}>
                                        <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>RANK</th>
                                        <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>NODE_ID</th>
                                        <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>REPUTATION</th>
                                        <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>ACCURACY</th>
                                        <th style={{ padding: '1rem', color: 'var(--term-gray)' }}>TREND</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((user) => (
                                        <tr key={user.rank} style={{
                                            borderBottom: '1px dashed var(--term-border)',
                                            background: user.isCurrentUser ? 'rgba(138, 226, 52, 0.1)' : 'transparent'
                                        }}>
                                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 'bold' }}>#{user.rank}</td>
                                            <td style={{ padding: '1rem', color: user.isCurrentUser ? 'var(--term-green)' : 'inherit' }}>
                                                {user.name} {user.isCurrentUser && '(YOU)'}
                                            </td>
                                            <td style={{ padding: '1rem' }}>{user.points.toLocaleString()}</td>
                                            <td style={{ padding: '1rem' }}>{user.accuracy}%</td>
                                            <td style={{ padding: '1rem', color: user.change > 0 ? 'var(--term-green)' : user.change < 0 ? 'var(--term-red)' : 'var(--term-gray)' }}>
                                                {user.change > 0 ? `+${user.change}` : user.change}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
