import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppNav from "../components/AppNav";
import "../styles/AppPages.css";

// Mock claims data - will be replaced with API calls
const MOCK_CLAIMS = [
    {
        id: "1234",
        statement: "AI will revolutionize healthcare diagnostics within the next 5 years",
        category: "Technology",
        status: "active",
        confidence: 87,
        upvotes: 45,
        downvotes: 12,
        submittedAt: "2025-12-01",
    },
    {
        id: "1235",
        statement: "Bitcoin will reach $150k by end of 2025",
        category: "Finance",
        status: "active",
        confidence: 72,
        upvotes: 89,
        downvotes: 34,
        submittedAt: "2025-11-28",
    },
    {
        id: "1236",
        statement: "Electric vehicles will outsell gas cars by 2027",
        category: "Technology",
        status: "verified",
        confidence: 91,
        upvotes: 156,
        downvotes: 23,
        submittedAt: "2025-11-15",
        resolvedAt: "2025-12-02",
        points: 150,
    },
    {
        id: "1237",
        statement: "Team X will win the championship this season",
        category: "Sports",
        status: "rejected",
        confidence: 45,
        upvotes: 12,
        downvotes: 67,
        submittedAt: "2025-11-10",
        resolvedAt: "2025-12-01",
        points: -50,
    },
];

type FilterType = 'all' | 'active' | 'completed';

export default function ViewClaims() {
    const { walletAddress, canVote } = useAuth();
    const [filter, setFilter] = useState<FilterType>('all');
    const [votes, setVotes] = useState<{ [key: string]: 'up' | 'down' | null }>({});

    const hasWallet = !!walletAddress;

    const filteredClaims = MOCK_CLAIMS.filter(claim => {
        if (filter === 'all') return true;
        if (filter === 'active') return claim.status === 'active';
        if (filter === 'completed') return claim.status === 'verified' || claim.status === 'rejected';
        return true;
    });

    const handleVote = (claimId: string, voteType: 'up' | 'down') => {
        if (!hasWallet) {
            alert('Please connect your wallet to vote on claims');
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

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'ACTIVE';
            case 'verified': return 'VERIFIED';
            case 'rejected': return 'REJECTED';
            case 'pending': return 'PENDING';
            default: return status.toUpperCase();
        }
    };

    return (
        <div className="app-page">
            <AppNav />

            <div className="app-container">
                <div className="app-header">
                    <h1 className="app-title">All Claims</h1>
                    <p className="app-subtitle">Browse and vote on community claims</p>
                </div>

                {/* Wallet Required Info */}
                {!hasWallet && (
                    <div className="info-box">
                        <span className="info-box-icon">⚠️</span>
                        <span className="info-box-text">
                            You need to connect your wallet to vote on claims
                        </span>
                        <Link to="/profile">
                            <button className="info-box-action">
                                Connect Wallet
                            </button>
                        </Link>
                    </div>
                )}

                {/* Filter Buttons */}
                <div className="claims-filter">
                    <button
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({MOCK_CLAIMS.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
                        onClick={() => setFilter('active')}
                    >
                        Active ({MOCK_CLAIMS.filter(c => c.status === 'active').length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
                        onClick={() => setFilter('completed')}
                    >
                        Completed ({MOCK_CLAIMS.filter(c => c.status !== 'active').length})
                    </button>
                </div>

                {/* Claims List */}
                {filteredClaims.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-title">No claims found</div>
                        <p className="empty-state-text">
                            {filter === 'active'
                                ? "There are no active claims at the moment"
                                : filter === 'completed'
                                    ? "There are no completed claims yet"
                                    : "No claims have been submitted yet"}
                        </p>
                        <Link to="/submit">
                            <button className="submit-btn">Submit the First Claim</button>
                        </Link>
                    </div>
                ) : (
                    filteredClaims.map(claim => (
                        <div
                            key={claim.id}
                            className={`claim-card ${claim.status === 'active' ? 'active' : 'completed'}`}
                        >
                            <div className="claim-header">
                                <span className={`claim-status ${claim.status}`}>
                                    {claim.status === 'active' && '🟢 '}
                                    {claim.status === 'verified' && '✓ '}
                                    {claim.status === 'rejected' && '✗ '}
                                    {getStatusLabel(claim.status)}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                                    #{claim.id}
                                </span>
                            </div>

                            <p className="claim-text">{claim.statement}</p>

                            <div className="claim-meta">
                                <div>
                                    <span style={{ marginRight: '1.5rem' }}>
                                        Category: {claim.category}
                                    </span>
                                    <span>
                                        {claim.status === 'active'
                                            ? `Submitted: ${claim.submittedAt}`
                                            : `Resolved: ${claim.resolvedAt}`}
                                    </span>
                                    {claim.points !== undefined && (
                                        <span style={{
                                            marginLeft: '1.5rem',
                                            color: claim.points > 0 ? '#22c55e' : '#ef4444',
                                            fontWeight: 600
                                        }}>
                                            Points: {claim.points > 0 ? '+' : ''}{claim.points}
                                        </span>
                                    )}
                                </div>

                                {claim.status === 'active' && (
                                    <div className="claim-votes">
                                        <button
                                            className={`vote-btn upvote ${votes[claim.id] === 'up' ? 'voted' : ''}`}
                                            onClick={() => handleVote(claim.id, 'up')}
                                            disabled={!hasWallet}
                                        >
                                            ▲ {claim.upvotes + (votes[claim.id] === 'up' ? 1 : 0)}
                                        </button>
                                        <button
                                            className={`vote-btn downvote ${votes[claim.id] === 'down' ? 'voted' : ''}`}
                                            onClick={() => handleVote(claim.id, 'down')}
                                            disabled={!hasWallet}
                                        >
                                            ▼ {claim.downvotes + (votes[claim.id] === 'down' ? 1 : 0)}
                                        </button>
                                    </div>
                                )}

                                {claim.status !== 'active' && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        color: 'rgba(255,255,255,0.5)'
                                    }}>
                                        <span>▲ {claim.upvotes}</span>
                                        <span>▼ {claim.downvotes}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
