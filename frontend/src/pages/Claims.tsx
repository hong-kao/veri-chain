import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/TerminalStyles.css";

const MOCK_CLAIMS = [
    {
        id: "1234",
        statement: "AI will revolutionize healthcare in the next decade",
        category: "Technology",
        status: "verified",
        confidence: 87,
        points: 150,
        views: 234,
        date: "2025-11-15",
        upvotes: 45,
        downvotes: 12,
    },
    {
        id: "1235",
        statement: "Bitcoin will reach $100k by Q1 2026",
        category: "Finance",
        status: "pending",
        confidence: 78,
        points: 0,
        views: 89,
        date: "2025-11-20",
        upvotes: 23,
        downvotes: 8,
    },
    {
        id: "1232",
        statement: "Team X will win the championship",
        category: "Sports",
        status: "rejected",
        confidence: 45,
        points: -50,
        views: 156,
        date: "2025-11-10",
        upvotes: 12,
        downvotes: 34,
    },
];

export default function Claims() {
    const { canVote, user } = useAuth();
    const [votes, setVotes] = useState<{ [key: string]: 'up' | 'down' | null }>({});

    const handleVote = (claimId: string, voteType: 'up' | 'down') => {
        if (!canVote) {
            alert("ACCESS_DENIED: Connect wallet to interact with protocol");
            return;
        }

        setVotes(prev => {
            const currentVote = prev[claimId];
            if (currentVote === voteType) {
                return { ...prev, [claimId]: null };
            }
            return { ...prev, [claimId]: voteType };
        });
    };

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
                    <div className="terminal-title">user@{user.displayName || 'guest'}:~/claims_db</div>
                </div>

                {/* Navigation */}
                <nav className="terminal-nav">
                    <Link to="/dashboard" className="term-link">System_Status</Link>
                    <Link to="/claims" className="term-link active">Verification_Logs</Link>
                    <Link to="/leaderboard" className="term-link">Node_Rankings</Link>
                    <Link to="/explore" className="term-link">Network_Activity</Link>
                    <Link to="/notifications" className="term-link">Sys_Alerts</Link>
                </nav>

                {/* Content */}
                <div className="terminal-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h1 className="term-h1" style={{ marginBottom: 0 }}>DATABASE_QUERY: SELECT * FROM CLAIMS</h1>
                        <Link to="/claims/submit">
                            <button className="term-btn">INSERT_NEW_RECORD</button>
                        </Link>
                    </div>

                    <div className="term-grid" style={{ gap: '1rem' }}>
                        {MOCK_CLAIMS.map((claim) => (
                            <div key={claim.id} className="term-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <span className="term-muted">ID:</span> <span className="term-accent">#{claim.id}</span>
                                        <span className="term-muted" style={{ marginLeft: '1rem' }}>TIMESTAMP:</span> {claim.date}
                                    </div>
                                    <div style={{
                                        color: claim.status === 'verified' ? 'var(--term-green)' :
                                            claim.status === 'rejected' ? 'var(--term-red)' : 'var(--term-yellow)',
                                        fontWeight: 'bold'
                                    }}>
                                        [{claim.status.toUpperCase()}]
                                    </div>
                                </div>

                                <div style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>
                                    {claim.statement}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                    <div className="term-muted" style={{ fontSize: '0.9rem' }}>
                                        CATEGORY: {claim.category} | CONFIDENCE: {claim.confidence}%
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                            className="term-btn"
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', opacity: votes[claim.id] === 'up' ? 1 : 0.5 }}
                                            onClick={() => handleVote(claim.id, 'up')}
                                        >
                                            ▲ {claim.upvotes + (votes[claim.id] === 'up' ? 1 : 0)}
                                        </button>
                                        <button
                                            className="term-btn"
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', opacity: votes[claim.id] === 'down' ? 1 : 0.5, borderColor: 'var(--term-red)', color: 'var(--term-red)' }}
                                            onClick={() => handleVote(claim.id, 'down')}
                                        >
                                            ▼ {claim.downvotes + (votes[claim.id] === 'down' ? 1 : 0)}
                                        </button>
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
