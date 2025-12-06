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

// Format time ago
const timeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
};

export default function ViewClaims() {
    const { walletAddress, user } = useAuth();
    const [filter, setFilter] = useState<FilterType>('all');
    const [votes, setVotes] = useState<{ [key: number]: 'up' | 'down' | null }>({});
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

    const hasWallet = !!walletAddress;

    useEffect(() => {
        const fetchClaims = async () => {
            try {
                const [response] = await Promise.all([
                    api.getAllClaims(),
                    new Promise(resolve => setTimeout(resolve, 2000))
                ]);
                if (response.success) {
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

    const getDisplayStatus = (claim: Claim) => {
        if (claim.verdict) {
            const verdict = claim.verdict.toLowerCase();
            if (verdict === 'false' || verdict === 'false_') return 'rejected';
            if (verdict === 'true' || verdict === 'true_') return 'verified';
            return 'pending';
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

    const getVerdictBadge = (claim: Claim) => {
        const status = getDisplayStatus(claim);
        switch (status) {
            case 'verified':
                return <span className="community-verdict verified">TRUE</span>;
            case 'rejected':
                return <span className="community-verdict rejected">FALSE</span>;
            case 'pending':
                return <span className="community-verdict pending">PENDING</span>;
            default:
                return <span className="community-verdict active">ACTIVE</span>;
        }
    };

    return (
        <div className="app-page">
            <AppNav />

            <div className="community-container">
                {/* Community Header */}
                <div className="community-header">
                    <div className="community-header-content">
                        <h1 className="community-title">Claims</h1>
                        <p className="community-subtitle">
                            Join the conversation. Vote on claims. Earn rewards.
                        </p>
                        <div className="community-stats">
                            <div className="stat-item">
                                <span className="stat-value">{claims.length}</span>
                                <span className="stat-label">Claims</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{claims.filter(c => getDisplayStatus(c) === 'active').length}</span>
                                <span className="stat-label">Active</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{claims.reduce((sum, c) => sum + c.upvotes + c.downvotes, 0)}</span>
                                <span className="stat-label">Votes Cast</span>
                            </div>
                        </div>
                    </div>
                    <Link to="/submit">
                        <button className="community-submit-btn">+ Submit Claim</button>
                    </Link>
                </div>

                {/* Filter Tabs */}
                <div className="community-filters">
                    <button
                        className={`community-filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button
                        className={`community-filter-btn ${filter === 'active' ? 'active' : ''}`}
                        onClick={() => setFilter('active')}
                    >
                        Active
                    </button>
                    <button
                        className={`community-filter-btn ${filter === 'completed' ? 'active' : ''}`}
                        onClick={() => setFilter('completed')}
                    >
                        Resolved
                    </button>
                </div>

                {/* Claims Feed */}
                <div className="community-feed">
                    {loading ? (
                        <div className="loading-state">
                            <div className="loader-spinner"></div>
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '1rem' }}>Loading community feed...</p>
                        </div>
                    ) : filteredClaims.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🔍</div>
                            <div className="empty-state-title">No claims found</div>
                            <p className="empty-state-text">Be the first to submit a claim!</p>
                            <Link to="/submit">
                                <button className="submit-btn">Submit a Claim</button>
                            </Link>
                        </div>
                    ) : (
                        filteredClaims.map(claim => {
                            const displayStatus = getDisplayStatus(claim);

                            return (
                                <div
                                    key={claim.id}
                                    className="community-claim-card"
                                    onClick={() => setSelectedClaim(claim)}
                                >
                                    {/* Card Header */}
                                    <div className="community-card-header">
                                        <div className="claim-time">{timeAgo(claim.submittedAt)}</div>
                                        {getVerdictBadge(claim)}
                                    </div>

                                    {/* Claim Statement */}
                                    <p className="community-claim-text">{claim.statement}</p>

                                    {/* Confidence if resolved */}
                                    {claim.confidence !== null && displayStatus !== 'active' && (
                                        <div className="community-confidence">
                                            AI Confidence: <span className={claim.confidence >= 70 ? 'high' : 'low'}>{claim.confidence}%</span>
                                        </div>
                                    )}

                                    {/* Card Footer - Voting Displays (Non-interactive) */}
                                    <div className="community-card-footer">
                                        <div className="community-votes">
                                            <div className="community-vote-display upvote">
                                                ▲ {claim.upvotes}
                                            </div>
                                            <div className="community-vote-display downvote">
                                                ▼ {claim.downvotes}
                                            </div>
                                        </div>
                                        <span className="community-claim-id">#{claim.id}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
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
        </div>
    );
}
