import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/TerminalStyles.css";

const MOCK_NOTIFICATIONS = [
    { id: 1, type: 'success', title: 'Claim Verified', message: 'Your claim #1234 has been verified by the network.', time: '2 mins ago' },
    { id: 2, type: 'rank', title: 'Rank Increased', message: 'You have reached the Top 10% of nodes.', time: '1 hour ago' },
    { id: 3, type: 'pending', title: 'Vote Required', message: 'Consensus needed for Claim #1235.', time: '3 hours ago' },
];

export default function Notifications() {
    const { user } = useAuth();

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
                    <div className="terminal-title">user@{user.displayName || 'guest'}:~/sys_alerts</div>
                </div>

                {/* Navigation */}
                <nav className="terminal-nav">
                    <Link to="/dashboard" className="term-link">System_Status</Link>
                    <Link to="/claims" className="term-link">Verification_Logs</Link>
                    <Link to="/leaderboard" className="term-link">Node_Rankings</Link>
                    <Link to="/explore" className="term-link">Network_Activity</Link>
                    <Link to="/notifications" className="term-link active">Sys_Alerts</Link>
                </nav>

                {/* Content */}
                <div className="terminal-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h1 className="term-h1" style={{ marginBottom: 0 }}>SYSTEM_LOG_STREAM</h1>
                        <button className="term-btn">CLEAR_LOGS</button>
                    </div>

                    <div className="term-grid" style={{ gap: '0.5rem' }}>
                        {MOCK_NOTIFICATIONS.map((notif) => (
                            <div key={notif.id} className="term-card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{
                                    color: notif.type === 'success' ? 'var(--term-green)' :
                                        notif.type === 'rank' ? 'var(--term-purple)' : 'var(--term-yellow)',
                                    fontWeight: 'bold'
                                }}>
                                    [{notif.type.toUpperCase()}]
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 'bold' }}>{notif.title}</span>
                                        <span className="term-muted" style={{ fontSize: '0.8rem' }}>{notif.time}</span>
                                    </div>
                                    <div className="term-text" style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}>
                                        {notif.message}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
