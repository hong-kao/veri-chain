import { useNavigate } from "react-router-dom";
import "../styles/AppPages.css";

interface AgentResult {
    name: string;
    verdict: string;
    confidence: number;
}

interface Claim {
    id: number;
    statement: string;
    category: string;
    verdict: string | null;
    confidence: number | null;
    status: string;
    submittedAt: string;
    resolvedAt: string | null;
    upvotes?: number;
    downvotes?: number;
    submitter_id?: number;
}

interface ClaimDetailsModalProps {
    claim: Claim;
    agentResults?: AgentResult[];
    explanation?: string;
    showVoting: boolean;
    currentUserId?: number;
    onClose: () => void;
    onVote?: (claimId: number, voteType: 'up' | 'down') => void;
    navigateOnClose?: string;
    customButtonText?: string;
}

export default function ClaimDetailsModal({
    claim,
    agentResults = [],
    explanation,
    showVoting,
    currentUserId,
    onClose,
    onVote,
    navigateOnClose,
    customButtonText
}: ClaimDetailsModalProps) {
    const navigate = useNavigate();

    const isOwnClaim = currentUserId !== undefined && currentUserId === claim.submitter_id;
    // Check if claim is in a voteable state (not resolved)
    const isClaimActive = claim.status === 'active' || claim.status === 'needs_vote' || claim.status === 'pending_ai' || claim.status === 'ai_evaluated';
    const canVote = showVoting && !isOwnClaim && isClaimActive;

    const handleNavigationButton = () => {
        onClose();
        if (navigateOnClose) {
            navigate(navigateOnClose);
        }
    };

    const getVerdictLabel = (verdict: string | null) => {
        if (!verdict) return '? UNCLEAR';
        const v = verdict.toLowerCase();
        if (v === 'true' || v === 'true_') return '✓ TRUE';
        if (v === 'false' || v === 'false_') return '✗ FALSE';
        return '? UNCLEAR';
    };

    const getVerdictClass = (verdict: string | null) => {
        if (!verdict) return 'unclear';
        const v = verdict.toLowerCase();
        if (v === 'true' || v === 'true_') return 'true';
        if (v === 'false' || v === 'false_') return 'false';
        return 'unclear';
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content claim-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Claim Details</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {/* Claim Statement */}
                    <div className="claim-detail-section">
                        <h3 className="claim-detail-heading">Claim Statement</h3>
                        <p className="claim-detail-text">{claim.statement}</p>
                    </div>

                    {/* Meta Information */}
                    <div className="claim-detail-meta">
                        <div className="meta-item">
                            <span className="meta-label">Submitted:</span>
                            <span className="meta-value">{new Date(claim.submittedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Claim ID:</span>
                            <span className="meta-value">#{claim.id}</span>
                        </div>
                    </div>

                    {/* AI Verdict */}
                    {claim.verdict && (
                        <div className="claim-detail-section">
                            <div className={`verdict-badge ${getVerdictClass(claim.verdict)}`}>
                                {getVerdictLabel(claim.verdict)}
                                {claim.confidence !== null && (
                                    <span className="confidence">({claim.confidence}% confidence)</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Explanation Text */}
                    {explanation && !agentResults.length && (
                        <div className="claim-detail-section">
                            <h3 className="claim-detail-heading">Explanation</h3>
                            <p className="claim-detail-text">{explanation}</p>
                        </div>
                    )}

                    {/* Agent Analysis */}
                    {agentResults && agentResults.length > 0 && (
                        <div className="claim-detail-section">
                            <h3 className="claim-detail-heading">Individual Agent Analysis</h3>
                            <div className="agent-results-grid">
                                {agentResults.map((agent, index) => {
                                    const confidenceLevel = agent.confidence >= 70 ? 'high' : agent.confidence >= 40 ? 'medium' : 'low';
                                    return (
                                        <div
                                            key={index}
                                            className="agent-result-card"
                                            style={{ '--index': index } as React.CSSProperties}
                                        >
                                            <div className="agent-result-header">
                                                <div className="agent-name">{agent.name}</div>
                                                <div className={`agent-verdict ${agent.verdict}`}>
                                                    {agent.verdict}
                                                </div>
                                            </div>
                                            <div className="agent-confidence-bar">
                                                <div
                                                    className={`agent-confidence-fill ${confidenceLevel}`}
                                                    style={{ width: `${agent.confidence}%` }}
                                                ></div>
                                            </div>
                                            <div className="agent-confidence-text">
                                                {agent.confidence}% confidence
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Voting Section - Always show stats */}
                    {showVoting && (
                        <div className="claim-detail-section voting-section">
                            <h3 className="claim-detail-heading">Community Voting</h3>
                            <div className="voting-stats">
                                <span className="vote-stat upvote">▲ {claim.upvotes || 0} upvotes</span>
                                <span className="vote-stat downvote">▼ {claim.downvotes || 0} downvotes</span>
                            </div>
                            {/* Vote buttons - show for everyone on active claims */}
                            {isClaimActive ? (
                                <>
                                    <div className="modal-voting-buttons">
                                        <button
                                            className={`vote-btn-large upvote ${isOwnClaim ? 'disabled' : ''}`}
                                            onClick={() => !isOwnClaim && onVote && onVote(claim.id, 'up')}
                                            disabled={isOwnClaim}
                                        >
                                            ▲ Upvote
                                        </button>
                                        <button
                                            className={`vote-btn-large downvote ${isOwnClaim ? 'disabled' : ''}`}
                                            onClick={() => !isOwnClaim && onVote && onVote(claim.id, 'down')}
                                            disabled={isOwnClaim}
                                        >
                                            ▼ Downvote
                                        </button>
                                    </div>
                                    {isOwnClaim && (
                                        <p className="author-note">Authors can't vote on their own claims 😉</p>
                                    )}
                                </>
                            ) : (
                                <p className="voting-disabled-message">
                                    Voting is closed for this claim.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {navigateOnClose ? (
                        <button className="modal-btn primary" onClick={handleNavigationButton}>
                            {customButtonText || "View in Claims Page"}
                        </button>
                    ) : (
                        <button className="modal-btn secondary" onClick={onClose}>
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
