import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';
import AppNav from '../components/AppNav';
import api from '../services/api';
import '../styles/AppPages.css';

type FilterType = 'all' | 'active' | 'completed';

interface Claim {
    id: number;
    statement: string;
    verdict: string | null;
    confidence: number | null;
    status: string;
    submittedAt: string;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function verdictLabel(claim: Claim): { label: string; cls: string } {
    const v = (claim.verdict || '').toLowerCase();
    if (v === 'true' || v === 'true_') return { label: 'TRUE', cls: 'verified' };
    if (v === 'false' || v === 'false_') return { label: 'FALSE', cls: 'rejected' };
    if (claim.status === 'needs_vote') return { label: 'VOTING', cls: 'active' };
    if (claim.status === 'ai_evaluated') return { label: 'PENDING', cls: 'pending' };
    return { label: 'ANALYZING', cls: 'active' };
}

export default function ViewClaims() {
    const navigate = useNavigate();
    const [filter, setFilter] = useState<FilterType>('all');
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.getAllClaims();
                if (res.success) setClaims(res.claims);
            } catch {
                // silent -- empty state handles it
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const filtered = claims.filter(c => {
        if (filter === 'all') return true;
        const { cls } = verdictLabel(c);
        if (filter === 'active') return cls === 'active' || cls === 'pending';
        return cls === 'verified' || cls === 'rejected';
    });

    return (
        <div className="app-page">
            <AppNav />
            <div className="community-container">
                <div className="community-header">
                    <div className="community-header-content">
                        <h1 className="community-title">claims</h1>
                        <p className="community-subtitle">vote on verdicts. earn rewards.</p>
                        <div className="community-stats">
                            <div className="stat-item">
                                <span className="stat-value">{claims.length}</span>
                                <span className="stat-label">total</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{claims.filter(c => verdictLabel(c).cls === 'active').length}</span>
                                <span className="stat-label">active</span>
                            </div>
                        </div>
                    </div>
                    <button className="community-submit-btn" onClick={() => navigate('/submit')}>
                        + submit claim
                    </button>
                </div>

                <div className="community-filters">
                    {(['all', 'active', 'completed'] as FilterType[]).map(f => (
                        <button
                            key={f}
                            className={`community-filter-btn ${filter === f ? 'active' : ''}`}
                            onClick={() => setFilter(f)}
                        >{f}</button>
                    ))}
                </div>

                <div className="community-feed">
                    {loading ? (
                        <div className="loading-state"><Loader text="loading claims..." /></div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🔍</div>
                            <div className="empty-state-title">no claims yet</div>
                            <p className="empty-state-text">be the first to submit one.</p>
                            <button className="submit-btn" onClick={() => navigate('/submit')}>
                                submit a claim
                            </button>
                        </div>
                    ) : (
                        filtered.map(claim => {
                            const { label, cls } = verdictLabel(claim);
                            return (
                                <div
                                    key={claim.id}
                                    id={`claim-${claim.id}`}
                                    className="community-claim-card"
                                    onClick={() => navigate(`/claims/${claim.id}`)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="community-card-header">
                                        <div className="claim-time">{timeAgo(claim.submittedAt)}</div>
                                        <span className={`community-verdict ${cls}`}>{label}</span>
                                    </div>
                                    <p className="community-claim-text">{claim.statement}</p>
                                    {claim.confidence !== null && cls !== 'active' && (
                                        <div className="community-confidence">
                                            ai confidence: <span className={claim.confidence >= 70 ? 'high' : 'low'}>{claim.confidence}%</span>
                                        </div>
                                    )}
                                    <div className="community-card-footer">
                                        <span className="community-claim-id">#{claim.id}</span>
                                        <span className="view-detail">view →</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
