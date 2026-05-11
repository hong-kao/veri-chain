import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import AppNav from '../components/AppNav';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getSigner } from '../services/contracts';
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts';
import VerificationMarketABI from '../abis/VerificationMarket.json';

// agent display names
const AGENT_LABELS: Record<string, string> = {
    logic_consistency:   'logic & consistency',
    citation_evidence:   'citation evidence',
    source_credibility:  'source credibility',
    social_evidence:     'social evidence',
    media_forensics:     'media forensics',
    propagation_pattern: 'propagation pattern',
};

const AGENT_ICONS: Record<string, string> = {
    logic_consistency:   '🧠',
    citation_evidence:   '📚',
    source_credibility:  '🔍',
    social_evidence:     '💬',
    media_forensics:     '🖼',
    propagation_pattern: '📡',
};

function VerdictBadge({ verdict }: { verdict?: string }) {
    const v = (verdict || '').toLowerCase();
    if (v === 'true' || v === 'true_') return <span className="cd-badge cd-badge--true">✓ TRUE</span>;
    if (v === 'false' || v === 'false_') return <span className="cd-badge cd-badge--false">✗ FALSE</span>;
    if (v === 'unclear' || v === 'uncertain') return <span className="cd-badge cd-badge--unclear">? UNCLEAR</span>;
    return <span className="cd-badge cd-badge--pending">⟳ ANALYZING</span>;
}

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * (value <= 1 ? 100 : 1));
    const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444';
    return (
        <div className="cd-conf-bar-wrap">
            <div className="cd-conf-bar" style={{ width: `${pct}%`, background: color }} />
            <span className="cd-conf-label">{pct}%</span>
        </div>
    );
}

export default function ClaimDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { walletAddress } = useAuth();
    const claimId = parseInt(id || '');

    const [claim, setClaim] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [polling, setPolling] = useState(false);

    // vote state
    const [stakeAmount, setStakeAmount] = useState('0.001');
    const [voting, setVoting] = useState(false);
    const [voteTx, setVoteTx] = useState('');
    const [voteError, setVoteError] = useState('');

    // reward state
    const [claiming, setClaiming] = useState(false);
    const [rewardTx, setRewardTx] = useState('');

    const load = useCallback(async () => {
        if (!claimId) return;
        try {
            const [statusRes, detailRes] = await Promise.allSettled([
                api.getClaimStatus(claimId),
                api.getClaimDetails(claimId),
            ]);
            // prefer detail (richer), fall back to status
            const data = detailRes.status === 'fulfilled' ? detailRes.value
                       : statusRes.status === 'fulfilled' ? statusRes.value
                       : null;
            if (!data) throw new Error('claim not found');
            setClaim(data);

            // keep polling if still processing
            const status = data.status || data.claim?.status;
            if (status === 'pending_ai' || status === 'processing') {
                setPolling(true);
            } else {
                setPolling(false);
            }
        } catch (e: any) {
            setError(e.message || 'failed to load claim');
        } finally {
            setLoading(false);
        }
    }, [claimId]);

    useEffect(() => { load(); }, [load]);

    // auto-poll while processing
    useEffect(() => {
        if (!polling) return;
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, [polling, load]);

    async function castVote(support: boolean) {
        if (!walletAddress) { setVoteError('connect wallet to vote'); return; }
        setVoting(true);
        setVoteError('');
        try {
            const signer = await getSigner();
            if (!signer) throw new Error('wallet not connected');
            const contract = new ethers.Contract(
                CONTRACT_ADDRESSES.VerificationMarket,
                VerificationMarketABI.abi,
                signer
            );
            const amountWei = ethers.parseEther(stakeAmount);
            // deposit first (staking requires balance)
            const depositTx = await contract.deposit({ value: amountWei });
            await depositTx.wait();
            // then vote
            const voteTxR = await contract.vote(claimId, support, amountWei);
            const receipt = await voteTxR.wait();
            setVoteTx(receipt.hash);
        } catch (e: any) {
            if (e.code === 'ACTION_REJECTED') setVoteError('transaction rejected');
            else setVoteError(e.message || 'vote failed');
        } finally {
            setVoting(false);
        }
    }

    async function claimReward() {
        setClaiming(true);
        try {
            const signer = await getSigner();
            if (!signer) throw new Error('wallet not connected');
            const contract = new ethers.Contract(
                CONTRACT_ADDRESSES.VerificationMarket,
                VerificationMarketABI.abi,
                signer
            );
            const tx = await contract.claimReward(claimId);
            const receipt = await tx.wait();
            setRewardTx(receipt.hash);
        } catch (e: any) {
            if (e.code === 'ACTION_REJECTED') setVoteError('transaction rejected');
            else setVoteError(e.message || 'reward claim failed');
        } finally {
            setClaiming(false);
        }
    }

    // ---- normalize data from either endpoint shape ----
    const claimText    = claim?.claim?.text || claim?.raw_input || claim?.normalized_text || '';
    const claimStatus  = claim?.status || claim?.claim?.status || '';
    const aiVerdict    = claim?.results?.aiVerdict || claim?.ai_verdict || '';
    const finalVerdict = claim?.results?.finalVerdict || claim?.final_verdict || '';
    const displayVerdict = finalVerdict || aiVerdict;
    const aiConf       = claim?.results?.aiConfidence ?? claim?.ai_confidence;
    const explanation  = claim?.ai_explanation || claim?.results?.explanation || '';
    const agentResults: any[] = claim?.results?.agentResults || claim?.agent_results || [];
    const onchainTx    = claim?.onchain_resolve_tx || claim?.onchain_claim_tx || '';
    const needsVote    = claimStatus === 'needs_vote' || claimStatus === 'voting';
    const isResolved   = claimStatus === 'resolved' || claimStatus === 'completed' || claimStatus === 'ai_complete';
    const isProcessing = claimStatus === 'pending_ai' || claimStatus === 'processing' || claimStatus === 'ai_evaluated';

    if (loading) return (
        <div className="app-page">
            <AppNav />
            <div className="cd-loading">
                <div className="cd-spinner" />
                <p>loading claim...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="app-page">
            <AppNav />
            <div className="cd-error">
                <p>⚠ {error}</p>
                <button onClick={() => navigate('/claims')}>← back to claims</button>
            </div>
        </div>
    );

    return (
        <div className="app-page">
            <AppNav />
            <div className="cd-container">

                {/* back */}
                <button className="cd-back" onClick={() => navigate('/claims')}>← claims</button>

                {/* header */}
                <div className="cd-header">
                    <div className="cd-header-top">
                        <VerdictBadge verdict={displayVerdict || (isProcessing ? 'analyzing' : undefined)} />
                        <span className="cd-claim-id">#{claimId}</span>
                    </div>
                    <p className="cd-claim-text">{claimText}</p>
                    {aiConf != null && (
                        <div className="cd-conf-row">
                            <span className="cd-conf-title">ai confidence</span>
                            <ConfidenceBar value={aiConf} />
                        </div>
                    )}
                    {explanation && <p className="cd-explanation">{explanation}</p>}
                    {isProcessing && (
                        <div className="cd-processing">
                            <div className="cd-spinner-sm" />
                            agents are analyzing this claim...
                        </div>
                    )}
                </div>

                {/* agent breakdown */}
                {agentResults.length > 0 && (
                    <div className="cd-section">
                        <h2 className="cd-section-title">agent breakdown</h2>
                        <div className="cd-agents">
                            {agentResults.map((ar: any, i: number) => {
                                const name = ar.agent || ar.agent_name || '';
                                const v = (ar.verdict || '').toLowerCase();
                                const conf = ar.confidence ?? 0.5;
                                return (
                                    <div key={i} className="cd-agent-row">
                                        <div className="cd-agent-meta">
                                            <span className="cd-agent-icon">{AGENT_ICONS[name] || '🔬'}</span>
                                            <span className="cd-agent-name">{AGENT_LABELS[name] || name}</span>
                                        </div>
                                        <div className="cd-agent-result">
                                            <span className={`cd-agent-verdict cd-agent-verdict--${v === 'true_' ? 'true' : v === 'false_' ? 'false' : v}`}>
                                                {v === 'true' || v === 'true_' ? '✓' : v === 'false' || v === 'false_' ? '✗' : '?'}
                                            </span>
                                            <ConfidenceBar value={conf} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* voting UI */}
                {needsVote && !voteTx && (
                    <div className="cd-section">
                        <h2 className="cd-section-title">community vote</h2>
                        <p className="cd-vote-hint">ai confidence was low. stake ETH to cast your vote and earn rewards.</p>
                        <div className="cd-stake-row">
                            <label className="cd-stake-label">stake (ETH)</label>
                            <input
                                id="stake-amount-input"
                                className="cd-stake-input"
                                type="number"
                                step="0.001"
                                min="0.001"
                                value={stakeAmount}
                                onChange={e => setStakeAmount(e.target.value)}
                                disabled={voting}
                            />
                        </div>
                        <div className="cd-vote-btns">
                            <button
                                id="vote-true-btn"
                                className="cd-vote-btn cd-vote-btn--true"
                                onClick={() => castVote(true)}
                                disabled={voting || !walletAddress}
                            >
                                {voting ? '...' : '✓ vote TRUE'}
                            </button>
                            <button
                                id="vote-false-btn"
                                className="cd-vote-btn cd-vote-btn--false"
                                onClick={() => castVote(false)}
                                disabled={voting || !walletAddress}
                            >
                                {voting ? '...' : '✗ vote FALSE'}
                            </button>
                        </div>
                        {!walletAddress && <p className="cd-vote-warn">connect wallet to vote</p>}
                        {voteError && <p className="cd-vote-error">{voteError}</p>}
                    </div>
                )}

                {/* vote confirmed */}
                {voteTx && (
                    <div className="cd-section cd-tx-confirm">
                        <span>✓ vote submitted</span>
                        <a
                            href={`${NETWORK_CONFIG.blockExplorer}/tx/${voteTx}`}
                            target="_blank"
                            rel="noreferrer"
                            className="cd-tx-link"
                        >
                            view on basescan →
                        </a>
                    </div>
                )}

                {/* claim reward */}
                {isResolved && !rewardTx && (
                    <div className="cd-section">
                        <h2 className="cd-section-title">claim reward</h2>
                        <p className="cd-vote-hint">if you voted on the winning side, claim your proportional pool reward.</p>
                        <button
                            id="claim-reward-btn"
                            className="cd-claim-btn"
                            onClick={claimReward}
                            disabled={claiming || !walletAddress}
                        >
                            {claiming ? 'confirming...' : '💰 claim reward'}
                        </button>
                        {voteError && <p className="cd-vote-error">{voteError}</p>}
                    </div>
                )}

                {/* reward confirmed */}
                {rewardTx && (
                    <div className="cd-section cd-tx-confirm">
                        <span>✓ reward claimed</span>
                        <a
                            href={`${NETWORK_CONFIG.blockExplorer}/tx/${rewardTx}`}
                            target="_blank"
                            rel="noreferrer"
                            className="cd-tx-link"
                        >
                            view on basescan →
                        </a>
                    </div>
                )}

                {/* on-chain proof */}
                {onchainTx && (
                    <div className="cd-section cd-onchain">
                        <span className="cd-onchain-label">⛓ on-chain proof</span>
                        <a
                            id="basescan-link"
                            href={`${NETWORK_CONFIG.blockExplorer}/tx/${onchainTx}`}
                            target="_blank"
                            rel="noreferrer"
                            className="cd-tx-link"
                        >
                            {onchainTx.slice(0, 12)}...{onchainTx.slice(-6)} ↗
                        </a>
                    </div>
                )}
            </div>

            <style>{`
                .cd-container {
                    max-width: 720px;
                    margin: 0 auto;
                    padding: 1.5rem 1rem 4rem;
                }
                .cd-back {
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.4);
                    font-size: 0.85rem;
                    cursor: pointer;
                    padding: 0;
                    margin-bottom: 1.5rem;
                    transition: color 0.2s;
                }
                .cd-back:hover { color: rgba(255,255,255,0.8); }
                .cd-loading, .cd-error {
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    min-height: 40vh; gap: 1rem;
                    color: rgba(255,255,255,0.5);
                }
                .cd-spinner {
                    width: 36px; height: 36px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #60a5fa;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                .cd-spinner-sm {
                    width: 14px; height: 14px;
                    border: 2px solid rgba(255,255,255,0.15);
                    border-top-color: #60a5fa;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    display: inline-block;
                }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* header */
                .cd-header {
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    padding: 1.5rem;
                    margin-bottom: 1.25rem;
                }
                .cd-header-top {
                    display: flex; align-items: center;
                    justify-content: space-between;
                    margin-bottom: 0.75rem;
                }
                .cd-claim-id { color: rgba(255,255,255,0.25); font-size: 0.8rem; }
                .cd-claim-text {
                    font-size: 1.05rem; line-height: 1.6;
                    color: rgba(255,255,255,0.9);
                    margin: 0 0 0.75rem;
                }
                .cd-explanation {
                    font-size: 0.85rem;
                    color: rgba(255,255,255,0.5);
                    line-height: 1.5;
                    margin: 0.75rem 0 0;
                    font-style: italic;
                }
                .cd-processing {
                    display: flex; align-items: center; gap: 0.5rem;
                    color: #60a5fa; font-size: 0.82rem;
                    margin-top: 0.75rem;
                }
                .cd-conf-row {
                    display: flex; align-items: center; gap: 0.75rem;
                    margin-top: 0.5rem;
                }
                .cd-conf-title { color: rgba(255,255,255,0.4); font-size: 0.78rem; white-space: nowrap; }
                .cd-conf-bar-wrap {
                    flex: 1; height: 6px;
                    background: rgba(255,255,255,0.08);
                    border-radius: 3px; position: relative;
                    display: flex; align-items: center;
                }
                .cd-conf-bar {
                    height: 100%; border-radius: 3px;
                    transition: width 0.5s ease;
                }
                .cd-conf-label {
                    font-size: 0.72rem; color: rgba(255,255,255,0.4);
                    margin-left: 0.5rem; white-space: nowrap;
                }

                /* verdict badges */
                .cd-badge {
                    font-size: 0.75rem; font-weight: 700;
                    padding: 0.25rem 0.75rem;
                    border-radius: 100px;
                    letter-spacing: 0.04em;
                }
                .cd-badge--true    { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
                .cd-badge--false   { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
                .cd-badge--unclear { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
                .cd-badge--pending { background: rgba(96,165,250,0.1); color: #93c5fd; border: 1px solid rgba(96,165,250,0.2); }

                /* sections */
                .cd-section {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 14px;
                    padding: 1.25rem;
                    margin-bottom: 1.25rem;
                }
                .cd-section-title {
                    font-size: 0.72rem;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: rgba(255,255,255,0.3);
                    margin: 0 0 1rem;
                }

                /* agent rows */
                .cd-agents { display: flex; flex-direction: column; gap: 0.6rem; }
                .cd-agent-row {
                    display: flex; align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                    padding: 0.5rem 0.75rem;
                    background: rgba(255,255,255,0.03);
                    border-radius: 8px;
                }
                .cd-agent-meta { display: flex; align-items: center; gap: 0.5rem; min-width: 160px; }
                .cd-agent-icon { font-size: 1rem; }
                .cd-agent-name { font-size: 0.82rem; color: rgba(255,255,255,0.6); }
                .cd-agent-result { display: flex; align-items: center; gap: 0.75rem; flex: 1; }
                .cd-agent-verdict {
                    font-size: 0.8rem; font-weight: 700;
                    width: 18px; text-align: center;
                }
                .cd-agent-verdict--true, .cd-agent-verdict--true_ { color: #4ade80; }
                .cd-agent-verdict--false, .cd-agent-verdict--false_ { color: #f87171; }
                .cd-agent-verdict--unclear, .cd-agent-verdict--uncertain { color: #fbbf24; }

                /* voting */
                .cd-vote-hint { font-size: 0.85rem; color: rgba(255,255,255,0.45); margin: 0 0 1rem; }
                .cd-stake-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
                .cd-stake-label { font-size: 0.8rem; color: rgba(255,255,255,0.4); white-space: nowrap; }
                .cd-stake-input {
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    padding: 0.4rem 0.6rem;
                    color: #fff;
                    font-size: 0.9rem;
                    width: 120px;
                }
                .cd-vote-btns { display: flex; gap: 0.75rem; }
                .cd-vote-btn {
                    flex: 1; padding: 0.75rem;
                    border: none; border-radius: 10px;
                    font-size: 0.9rem; font-weight: 600;
                    cursor: pointer; transition: opacity 0.2s, transform 0.1s;
                }
                .cd-vote-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
                .cd-vote-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                .cd-vote-btn--true  { background: linear-gradient(135deg,#16a34a,#15803d); color: #fff; }
                .cd-vote-btn--false { background: linear-gradient(135deg,#dc2626,#b91c1c); color: #fff; }
                .cd-vote-warn { color: #fbbf24; font-size: 0.78rem; margin-top: 0.5rem; }
                .cd-vote-error { color: #f87171; font-size: 0.78rem; margin-top: 0.5rem; }
                .cd-vote-warn { color: #fbbf24; font-size: 0.78rem; margin-top: 0.5rem; }

                /* claim reward */
                .cd-claim-btn {
                    width: 100%; padding: 0.75rem;
                    background: linear-gradient(135deg,#7c3aed,#4f46e5);
                    border: none; border-radius: 10px;
                    color: #fff; font-size: 0.9rem; font-weight: 600;
                    cursor: pointer; transition: opacity 0.2s;
                }
                .cd-claim-btn:hover:not(:disabled) { opacity: 0.85; }
                .cd-claim-btn:disabled { opacity: 0.4; cursor: not-allowed; }

                /* tx confirm / onchain */
                .cd-tx-confirm {
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(34,197,94,0.08) !important;
                    border-color: rgba(34,197,94,0.2) !important;
                    color: #4ade80; font-size: 0.85rem;
                }
                .cd-onchain {
                    display: flex; align-items: center; justify-content: space-between;
                }
                .cd-onchain-label { font-size: 0.8rem; color: rgba(255,255,255,0.35); }
                .cd-tx-link {
                    font-size: 0.82rem;
                    color: #60a5fa;
                    text-decoration: none;
                    transition: color 0.2s;
                }
                .cd-tx-link:hover { color: #93c5fd; text-decoration: underline; }
            `}</style>
        </div>
    );
}
