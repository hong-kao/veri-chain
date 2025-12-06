import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { registerClaimOnChain, isWalletConnected } from "../services/contracts";
import AppNav from "../components/AppNav";
import "../styles/AppPages.css";

const QUOTES = [
    "\"The truth is rarely pure and never simple.\" — Oscar Wilde",
    "\"A lie can travel half way around the world while the truth is putting on its shoes.\" — Mark Twain",
    "\"In a time of deceit telling the truth is a revolutionary act.\" — George Orwell",
    "\"Facts do not cease to exist because they are ignored.\" — Aldous Huxley",
];

export default function SubmitClaim() {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [claimText, setClaimText] = useState("");
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [response, setResponse] = useState<{
        verdict: 'true' | 'false' | 'uncertain' | 'true_' | 'false_' | 'unclear';
        confidence: number;
        explanation: string;
    } | null>(null);

    const [randomQuote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachedFile(file);
        }
    };

    const removeFile = () => {
        setAttachedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!claimText.trim() || submitting) return;

        setSubmitting(true);
        setResponse(null);
        setStatusMessage("Checking wallet connection...");

        try {
            // Check if wallet is connected
            const walletConnected = await isWalletConnected();
            if (!walletConnected) {
                throw new Error("Please connect your wallet to submit claims on-chain. This ensures true decentralization.");
            }

            console.log("Submitting claim:", claimText);

            // Step 1: Generate a temporary claim UUID for on-chain registration
            const tempUuid = crypto.randomUUID();

            // Step 2: Register on-chain FIRST (user signs with their wallet)
            setStatusMessage("Please confirm the transaction in your wallet...");
            const onchainResult = await registerClaimOnChain(claimText.trim(), tempUuid);

            if (!onchainResult) {
                throw new Error("Failed to register claim on-chain");
            }

            console.log("✅ On-chain registration complete:", onchainResult.txHash);
            setStatusMessage("Claim registered on-chain! Submitting to AI agents...");

            // Step 3: Prepare files for upload
            const images: File[] = [];
            const videos: File[] = [];

            if (attachedFile) {
                if (attachedFile.type.startsWith('image/')) {
                    images.push(attachedFile);
                } else if (attachedFile.type.startsWith('video/')) {
                    videos.push(attachedFile);
                }
            }

            // Step 4: Submit claim to backend WITH the on-chain tx hash
            const submitResult = await api.submitClaim({
                claim: claimText.trim(),
                claimType: 'OTHER',
                images: images.length > 0 ? images : undefined,
                videos: videos.length > 0 ? videos : undefined,
                onchainTxHash: onchainResult.txHash,
                claimHash: onchainResult.claimHash,
            });

            console.log("Claim submitted to backend:", submitResult);

            if (!submitResult.success || !submitResult.claimId) {
                throw new Error(submitResult.message || 'Failed to submit claim to backend');
            }

            const claimId = submitResult.claimId;
            setStatusMessage("AI agents are analyzing your claim...");

            // Poll for results
            const maxAttempts = 120; // 4 minutes max (2s intervals)
            let attempts = 0;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                attempts++;

                try {
                    const statusResult = await api.getClaimStatus(claimId);
                    console.log(`Status check ${attempts}:`, statusResult.status);

                    // Update status message based on progress
                    if (statusResult.results?.agentResults?.length > 0) {
                        const completedAgents = statusResult.results.agentResults.length;
                        setStatusMessage(`Analyzing with AI agents (${completedAgents} completed)...`);
                    }

                    // Check if processing is complete
                    if (statusResult.status === 'ai_complete' || statusResult.status === 'completed') {
                        // Map backend verdict to frontend format
                        let verdictType: 'true' | 'false' | 'uncertain' | 'true_' | 'false_' | 'unclear' = 'uncertain';
                        const aiVerdict = (statusResult.results?.aiVerdict || statusResult.results?.finalVerdict || 'uncertain').toLowerCase();

                        // Handle both Prisma enum format (true_, false_, unclear) and legacy format (true, false, uncertain)
                        if (aiVerdict === 'true' || aiVerdict === 'true_' || aiVerdict === 'verified') {
                            verdictType = 'true';
                        } else if (aiVerdict === 'false' || aiVerdict === 'false_' || aiVerdict === 'rejected') {
                            verdictType = 'false';
                        }

                        // Generate explanation from agent results
                        let explanation = "Analysis complete. ";
                        if (statusResult.results?.agentResults && statusResult.results.agentResults.length > 0) {
                            const agentSummaries = statusResult.results.agentResults
                                .map((ar: any) => `${ar.agent}: ${ar.verdict} (${Math.round((ar.confidence || 0.5) * 100)}%)`)
                                .join(', ');
                            explanation += `Agent analysis: ${agentSummaries}`;
                        } else {
                            explanation += "Our AI has analyzed this claim based on multiple factors including source credibility, citation verification, and pattern analysis.";
                        }

                        setResponse({
                            verdict: verdictType,
                            confidence: Math.round((statusResult.results?.aiConfidence ?? 0.5) * 100),
                            explanation
                        });
                        break;
                    }

                    // Check for voting status
                    if (statusResult.status === 'voting') {
                        setResponse({
                            verdict: 'uncertain',
                            confidence: Math.round((statusResult.results?.aiConfidence ?? 0.5) * 100),
                            explanation: "This claim is now in community voting. The final verdict will be determined by community consensus."
                        });
                        break;
                    }
                } catch (pollError) {
                    console.warn(`Polling attempt ${attempts} failed:`, pollError);
                    // Continue polling on error
                }
            }

            // If we exhausted all attempts
            if (attempts >= maxAttempts && !response) {
                setResponse({
                    verdict: 'uncertain',
                    confidence: 0,
                    explanation: "Analysis is taking longer than expected. Please check back later for results."
                });
            }

        } catch (err: any) {
            console.error("Failed to submit claim:", err);
            setResponse({
                verdict: 'uncertain',
                confidence: 0,
                explanation: `Error: ${err.message || 'Failed to submit claim. Please check that the backend is running.'}`
            });
        } finally {
            setSubmitting(false);
            setStatusMessage("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const resetChat = () => {
        setClaimText("");
        setAttachedFile(null);
        setResponse(null);
    };

    return (
        <div className="app-page">
            <AppNav />

            <div className="submit-chat-container">
                {/* Hero Section */}
                <div className="submit-hero">
                    <h1 className="submit-title">Submit a Claim</h1>
                    <p className="submit-quote">{randomQuote}</p>
                </div>

                {/* Chat Area */}
                <div className="chat-area">
                    {/* Response from AI */}
                    {response && (
                        <div className="ai-response">
                            <div className="response-header">
                                <span className="response-icon">🤖</span>
                                <span className="response-label">AI Analysis</span>
                            </div>
                            <div className={`verdict-badge ${response.verdict}`}>
                                {(response.verdict === 'true' || response.verdict === 'true_') && '✓ Likely True'}
                                {(response.verdict === 'false' || response.verdict === 'false_') && '✗ Likely False'}
                                {(response.verdict === 'uncertain' || response.verdict === 'unclear') && '? Uncertain'}
                                <span className="confidence">({response.confidence}% confidence)</span>
                            </div>

                            {/* Parse and display agent results if available */}
                            {(() => {
                                // Extract agent analysis from explanation
                                const agentMatch = response.explanation.match(/Agent analysis: (.+)/);
                                if (agentMatch) {
                                    const agentData = agentMatch[1];
                                    const agents = agentData.split(', ').map((item, index) => {
                                        const parts = item.match(/([^:]+): ([^(]+) \((\d+)%\)/);
                                        if (parts) {
                                            return {
                                                name: parts[1].replace(/_/g, ' '),
                                                verdict: parts[2].trim().toLowerCase(),
                                                confidence: parseInt(parts[3])
                                            };
                                        }
                                        return null;
                                    }).filter(Boolean);

                                    if (agents.length > 0) {
                                        return (
                                            <div className="agent-analysis-section">
                                                <div className="agent-analysis-title">Individual Agent Analysis</div>
                                                <div className="agent-results-grid">
                                                    {agents.map((agent: any, index: number) => {
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
                                        );
                                    }
                                }
                                return <p className="response-text">{response.explanation}</p>;
                            })()}

                            <button className="new-claim-btn" onClick={resetChat}>
                                Submit Another Claim
                            </button>
                        </div>
                    )}

                    {/* Submitted claim display */}
                    {response && (
                        <div className="user-message">
                            <div className="message-header">
                                <span className="message-icon">👤</span>
                                <span className="message-label">Your Claim</span>
                            </div>
                            <p className="message-text">{claimText}</p>
                            {attachedFile && (
                                <div className="attached-file-display">
                                    📎 {attachedFile.name}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input Area - Only show when no response */}
                {!response && (
                    <div className="chat-input-container">
                        {/* Attached file preview */}
                        {attachedFile && (
                            <div className="file-preview">
                                <span>📎 {attachedFile.name}</span>
                                <button className="remove-file" onClick={removeFile}>✕</button>
                            </div>
                        )}

                        <div className="chat-input-wrapper">
                            <button
                                className="attach-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={submitting}
                                title="Attach file"
                            >
                                📎
                            </button>

                            <textarea
                                className="chat-input"
                                placeholder="Enter a claim to verify..."
                                value={claimText}
                                onChange={(e) => setClaimText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={submitting}
                                rows={1}
                            />

                            <button
                                className="send-btn"
                                onClick={handleSubmit}
                                disabled={!claimText.trim() || submitting}
                            >
                                {submitting ? (
                                    <span className="loading-spinner">⟳</span>
                                ) : (
                                    '→'
                                )}
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />

                        <p className="input-hint">
                            {submitting && statusMessage ? (
                                <span className="status-message">{statusMessage}</span>
                            ) : (
                                "Press Enter to submit • Shift+Enter for new line"
                            )}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
