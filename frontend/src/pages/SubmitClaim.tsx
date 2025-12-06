import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
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
    const [response, setResponse] = useState<{
        verdict: 'true' | 'false' | 'uncertain';
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

        try {
            // TODO: Replace with actual API call to AI engine
            console.log("Submitting claim:", claimText);
            console.log("Attached file:", attachedFile?.name);

            // Simulate AI inference delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Mock response - replace with actual API response
            setResponse({
                verdict: 'uncertain',
                confidence: 72,
                explanation: "This claim requires further verification. Our AI analysis suggests there may be elements of truth, but key facts need to be independently confirmed through additional sources."
            });

        } catch (err: any) {
            console.error("Failed to submit claim:", err);
        } finally {
            setSubmitting(false);
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
                                {response.verdict === 'true' && '✓ Likely True'}
                                {response.verdict === 'false' && '✗ Likely False'}
                                {response.verdict === 'uncertain' && '? Uncertain'}
                                <span className="confidence">({response.confidence}% confidence)</span>
                            </div>
                            <p className="response-text">{response.explanation}</p>
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
                            Press Enter to submit • Shift+Enter for new line
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
