import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { registerClaimOnChain, isWalletConnected } from "../services/contracts";
import AppNav from "../components/AppNav";
import ClaimDetailsModal from "../components/ClaimDetailsModal";
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

    // Restore state from sessionStorage on mount
    const [claimText, setClaimText] = useState(() => {
        const saved = sessionStorage.getItem('pendingClaimText');
        return saved || "";
    });
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [response, setResponse] = useState<{
        verdict: 'true' | 'false' | 'uncertain' | 'true_' | 'false_' | 'unclear';
        confidence: number;
        explanation: string;
        claimId?: number;
        needsVoting?: boolean;
        agentResults?: Array<{ name: string; verdict: string; confidence: number }>;
    } | null>(() => {
        const saved = sessionStorage.getItem('pendingClaimResponse');
        return saved ? JSON.parse(saved) : null;
    });
    const [showModal, setShowModal] = useState(false);

    const [randomQuote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

    // Persist claim text to sessionStorage
    useEffect(() => {
        if (claimText) {
            sessionStorage.setItem('pendingClaimText', claimText);
        } else {
            sessionStorage.removeItem('pendingClaimText');
        }
    }, [claimText]);

    // Persist response to sessionStorage
    useEffect(() => {
        if (response) {
            sessionStorage.setItem('pendingClaimResponse', JSON.stringify(response));
        } else {
            sessionStorage.removeItem('pendingClaimResponse');
        }
    }, [response]);

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
                    console.log(`Status check ${attempts}: `, statusResult.status);

                    // Update status message based on progress
                    if (statusResult.results?.agentResults?.length > 0) {
                        const completedAgents = statusResult.results.agentResults.length;
                        setStatusMessage(`Analyzing with AI agents(${completedAgents} completed)...`);
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

                        // Parse agent results for modal display
                        let parsedAgentResults: Array<{ name: string; verdict: string; confidence: number }> = [];
                        if (statusResult.results?.agentResults && statusResult.results.agentResults.length > 0) {
                            parsedAgentResults = statusResult.results.agentResults.map((ar: any) => ({
                                name: ar.agent.replace(/_/g, ' '),
                                verdict: ar.verdict?.toLowerCase() || 'unclear',
                                confidence: Math.round((ar.confidence || 0.5) * 100)
                            }));
                        }

                        // Determine if voting is needed based on confidence
                        const confidence = Math.round((statusResult.results?.aiConfidence ?? 0.5) * 100);
                        const needsVoting = confidence < 70;

                        // Brief summary for simplified display
                        const briefSummary = needsVoting
                            ? "AI analysis is uncertain. This claim requires community voting to reach a final verdict."
                            : `AI has determined this claim is ${verdictType === 'true' ? 'likely true' : verdictType === 'false' ? 'likely false' : 'uncertain'} with ${confidence}% confidence.`;

                        setResponse({
                            verdict: verdictType,
                            confidence,
                            explanation: briefSummary,
                            claimId: claimId,
                            needsVoting,
                            agentResults: parsedAgentResults
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
                    console.warn(`Polling attempt ${attempts} failed: `, pollError);
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
                explanation: `Error: ${err.message || 'Failed to submit claim. Please check that the backend is running.'} `
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
        // Clear persisted state
        sessionStorage.removeItem('pendingClaimText');
        sessionStorage.removeItem('pendingClaimResponse');
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
                            <div className={`verdict - badge ${response.verdict} `}>
                                {(response.verdict === 'true' || response.verdict === 'true_') && '✓ Likely True'}
                                {(response.verdict === 'false' || response.verdict === 'false_') && '✗ Likely False'}
                                {(response.verdict === 'uncertain' || response.verdict === 'unclear') && '? Uncertain'}
                                <span className="confidence">({response.confidence}% confidence)</span>
                            </div>

                            {/* Simplified display */}
                            <p className="response-text">{response.explanation}</p>

                            {/* More Details button */}
                            <button className="new-claim-btn" onClick={() => setShowModal(true)} style={{ marginBottom: '1rem' }}>
                                More Details
                            </button>

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

            {/* Claim Details Modal */}
            {showModal && response && response.claimId && (
                <ClaimDetailsModal
                    claim={{
                        id: response.claimId,
                        statement: claimText,
                        category: "General",
                        verdict: response.verdict,
                        confidence: response.confidence,
                        status: response.needsVoting ? 'active' : 'completed',
                        submittedAt: new Date().toISOString(),
                        resolvedAt: response.needsVoting ? null : new Date().toISOString()
                    }}
                    agentResults={response.agentResults}
                    explanation={response.explanation}
                    showVoting={false}
                    onClose={() => setShowModal(false)}
                    navigateOnClose="/claims"
                    customButtonText={response.needsVoting ? "See Voting Status" : "Go to Claims Page"}
                />
            )}
        </div>
    );
}
