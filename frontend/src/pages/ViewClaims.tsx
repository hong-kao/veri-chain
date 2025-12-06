import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppNav from "../components/AppNav";
import ClaimDetailsModal from "../components/ClaimDetailsModal";
import api from "../services/api";
import "../styles/AppPages.css";

type FilterType = 'all' | 'active' | 'completed';

interface Claim {
    id: number;
    statement: string;
    category: string;
    verdict: string | null;
    confidence: number | null;
    status: string;
    submittedAt: string;
    resolvedAt: string | null;
    upvotes: number;
    downvotes: number;
    points: number | undefined;
    submitter_id?: number;
}

export default function ViewClaims() {
    const { walletAddress, canVote, user } = useAuth();
    const [filter, setFilter] = useState<FilterType>('all');
    const [votes, setVotes] = useState<{ [key: number]: 'up' | 'down' | null }>({});
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

    const hasWallet = !!walletAddress;

    // Fetch claims from backend
    useEffect(() => {
        const fetchClaims = async () => {
            try {
                const response = await api.getAllClaims();
                if (response.success) {
                    // Add mock upvotes/downvotes/points for now until API provides them
                    const claimsWithVotes = response.claims.map((claim: any) => ({
                        ...claim,
                        upvotes: Math.floor(Math.random() * 100),
                        downvotes: Math.floor(Math.random() * 50),
                        points: claim.verdict ? (claim.verdict.toLowerCase().includes('true') ? 150 : -50) : undefined,
                    }));
                    setClaims(claimsWithVotes);
                }
            } catch (error) {
                console.error('Failed to fetch claims:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchClaims();
    }, []);

    // Map verdict to display status
    const getDisplayStatus = (claim: Claim) => {
        // If claim has AI verdict, treat as completed
        if (claim.verdict) {
            const verdict = claim.verdict.toLowerCase();
            if (verdict === 'false' || verdict === 'false_') return 'rejected';
            if (verdict === 'true' || verdict === 'true_') return 'verified';
            return 'pending'; // If verdict exists but isn't true/false, consider it pending resolution
        }
        return 'active';
    };

    const filteredClaims = claims.filter(claim => {
        if (filter === 'all') return true;
        const displayStatus = getDisplayStatus(claim);
        if (filter === 'active') return displayStatus === 'active' || displayStatus === 'pending';
        if (filter === 'completed') return displayStatus === 'verified' || displayStatus === 'rejected';
        return true;
    });

    const handleVote = (claimId: number, voteType: 'up' | 'down') => {
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
                        All ({claims.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
                        onClick={() => setFilter('active')}
                    >
                        Active ({claims.filter((c: Claim) => getDisplayStatus(c) === 'active' || getDisplayStatus(c) === 'pending').length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
                        onClick={() => setFilter('completed')}
                    >
                        Completed ({claims.filter((c: Claim) => getDisplayStatus(c) === 'verified' || getDisplayStatus(c) === 'rejected').length})
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
                    filteredClaims.map(claim => {
                        const displayStatus = getDisplayStatus(claim);
                        return (
                            <div
                                key={claim.id}
                                className={`claim-card ${displayStatus === 'active' || displayStatus === 'pending' ? 'active' : 'completed'}`}
                                onClick={() => setSelectedClaim(claim)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="claim-header">
                                    <span className={`claim-status ${displayStatus}`}>
                                        {displayStatus === 'active' && '🟢 '}
                                        {displayStatus === 'verified' && '✓ '}
                                        {displayStatus === 'rejected' && '✗ '}
                                        {displayStatus === 'pending' && '⏳ '}
                                        {getStatusLabel(displayStatus)}
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
                                            {displayStatus === 'active' || displayStatus === 'pending'
                                                ? `Submitted: ${new Date(claim.submittedAt).toLocaleDateString()}`
                                                : `Resolved: ${claim.resolvedAt ? new Date(claim.resolvedAt).toLocaleDateString() : 'N/A'}`}
                                        </span>
                                        {claim.confidence !== null && displayStatus !== 'active' && (
                                            <span style={{
                                                marginLeft: '1.5rem',
                                                color: claim.confidence >= 70 ? '#22c55e' : '#f59e0b',
                                                fontWeight: 600
                                            }}>
                                                AI Confidence: {claim.confidence}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Show vote counts inline, but voting happens in modal */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        color: 'rgba(255,255,255,0.5)'
                                    }}>
                                        <span>▲ {claim.upvotes}</span>
                                        <span>▼ {claim.downvotes}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Claim Details Modal */}
            {selectedClaim && (
                <ClaimDetailsModal
                    claim={selectedClaim}
                    showVoting={true}
                    currentUserId={user?.id}
                    onClose={() => setSelectedClaim(null)}
                    onVote={handleVote}
                />
            )}
        </div >
    );
}
