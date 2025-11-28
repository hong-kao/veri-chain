import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Dashboard.css";
import "./Claims.css";
import "./VotingStyles.css";

const MOCK_CLAIMS = [
    {
        id: "1234",
        statement: "AI will revolutionize healthcare in the next decade",
        category: "Technology",
        status: "verified",
        confidence: 87,
        points: 150,
        views: 234,
        date: "Nov 15, 2025",
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
        date: "Nov 20, 2025",
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
        date: "Nov 10, 2025",
        upvotes: 12,
        downvotes: 34,
    },
];

export default function Claims() {
    const { canVote } = useAuth();
    const [votes, setVotes] = useState<{ [key: string]: 'up' | 'down' | null }>({});

    const handleVote = (claimId: string, voteType: 'up' | 'down') => {
        if (!canVote) {
            alert("Connect your wallet to vote on claims");
            return;
        }

        setVotes(prev => {
            const currentVote = prev[claimId];
            if (currentVote === voteType) {
                // Remove vote if clicking same button
                return { ...prev, [claimId]: null };
            }
            return { ...prev, [claimId]: voteType };
        });
    };

    return (
        <div className="dashboard-page">
            <nav className="dashboard-nav">
                <Link to="/" className="nav-logo">
                    VeriChain
                </Link>
                <div className="nav-links">
                    <Link to="/dashboard" className="nav-link">
                        Dashboard
                    </Link>
                    <Link to="/claims" className="nav-link active">
                        Claims
                    </Link>
                    <Link to="/leaderboard" className="nav-link">
                        Leaderboard
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container">
                <div className="claims-header">
                    <h1>My Claims</h1>
                    <Link to="/claims/submit" className="btn-submit">
                        + Submit Claim
                    </Link>
                </div>

                {!canVote && (
                    <div style={{
                        padding: '1rem',
                        background: 'rgba(255, 193, 7, 0.1)',
                        border: '2px solid rgba(255, 193, 7, 0.3)',
                        borderRadius: '0.5rem',
                        marginBottom: '1.5rem',
                        textAlign: 'center',
                    }}>
                        <p style={{ margin: 0 }}>
                            Connect your wallet to vote on claims and earn rewards
                        </p>
                    </div>
                )}

                <div className="claims-filters">
                    <button className="filter-btn active">All</button>
                    <button className="filter-btn">Pending</button>
                    <button className="filter-btn">Verified</button>
                    <button className="filter-btn">Rejected</button>
                </div>

                <div className="claims-list">
                    {MOCK_CLAIMS.map((claim) => (
                        <div key={claim.id} className={`claim-card status-${claim.status}`}>
                            <div className="claim-header">
                                <span className={`claim-status ${claim.status}`}>
                                    {claim.status === "verified" && "VERIFIED"}
                                    {claim.status === "pending" && "PENDING"}
                                    {claim.status === "rejected" && "REJECTED"}
                                </span>
                                <span className="claim-id">#{claim.id}</span>
                                <span className="claim-category">{claim.category}</span>
                            </div>

                            <p className="claim-statement">{claim.statement}</p>

                            <div className="claim-meta">
                                {claim.status === "verified" && (
                                    <span>Confidence: {claim.confidence}%</span>
                                )}
                                {claim.status === "pending" && (
                                    <span>Processing... {claim.confidence}% complete</span>
                                )}
                                {claim.status === "rejected" && (
                                    <span>Insufficient evidence</span>
                                )}
                                <span>•</span>
                                <span>
                                    {claim.points > 0 ? "+" : ""}
                                    {claim.points} pts
                                </span>
                                <span>•</span>
                                <span>{claim.views} views</span>
                                <span>•</span>
                                <span>{claim.date}</span>
                            </div>

                            {/* Voting Section */}
                            <div className="claim-voting">
                                <button
                                    className={`vote-btn upvote ${votes[claim.id] === 'up' ? 'active' : ''} ${!canVote ? 'disabled' : ''}`}
                                    onClick={() => handleVote(claim.id, 'up')}
                                    disabled={!canVote}
                                    title={!canVote ? "Connect wallet to vote" : "Upvote this claim"}
                                >
                                    ▲ {claim.upvotes + (votes[claim.id] === 'up' ? 1 : 0)}
                                </button>
                                <button
                                    className={`vote-btn downvote ${votes[claim.id] === 'down' ? 'active' : ''} ${!canVote ? 'disabled' : ''}`}
                                    onClick={() => handleVote(claim.id, 'down')}
                                    disabled={!canVote}
                                    title={!canVote ? "Connect wallet to vote" : "Downvote this claim"}
                                >
                                    ▼ {claim.downvotes + (votes[claim.id] === 'down' ? 1 : 0)}
                                </button>
                            </div>

                            <div className="claim-actions">
                                <button className="btn-action">View Details</button>
                                {claim.status === "verified" && (
                                    <button className="btn-action">Share</button>
                                )}
                                {claim.status === "pending" && (
                                    <button className="btn-action">View Progress</button>
                                )}
                                {claim.status === "rejected" && (
                                    <button className="btn-action">Resubmit</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
