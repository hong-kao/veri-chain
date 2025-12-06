import React, { useState, useRef, useEffect } from 'react';
import { IoSend, IoAdd, IoDocumentAttach, IoLink, IoClose } from "react-icons/io5";
import Loader from '../components/Loader';
import { api } from '../services/api';
import './ClaimsSubmit.css';

const ClaimsSubmit: React.FC = () => {
    // Loader runs every time, simulating network speed
    const [isPageLoading, setIsPageLoading] = useState(true);

    const [inputValue, setInputValue] = useState("");
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [messages, setMessages] = useState<{
        role: 'user' | 'ai',
        text?: string,
        verdict?: {
            status: 'verified' | 'fake' | 'uncertain';
            confidence: number;
            explanation: string;
            evidence: string[];
        }
    }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingText, setLoadingText] = useState("Thinking deeply about your claim...");

    const loadingMessages = [
        "Thinking deeply about your claim...",
        "Cross-referencing 10,000+ sources...",
        "Running credibility checks...",
        "Brewing verification magic...",
        "Almost there..."
    ];

    React.useEffect(() => {
        let interval: any;
        if (isProcessing) {
            let index = 0;
            interval = setInterval(() => {
                index = (index + 1) % loadingMessages.length;
                setLoadingText(loadingMessages[index]);
            }, 800);
        }
        return () => clearInterval(interval);
    }, [isProcessing]);

    const handleLoaderComplete = () => {
        setIsPageLoading(false);
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() && !attachedFile) return;

        const messageText = attachedFile ? `${inputValue} (Attached: ${attachedFile.name})` : inputValue;
        const newMessages = [...messages, { role: 'user' as const, text: messageText }];
        setMessages(newMessages);

        const claimText = inputValue;
        const files = attachedFile ? [attachedFile] : [];

        setInputValue("");
        setAttachedFile(null);
        setIsProcessing(true);
        setLoadingText(loadingMessages[0]);

        try {
            // Submit claim to backend
            const submitResponse = await api.submitClaim({
                claim: claimText,
                images: files.filter(f => f.type.startsWith('image/')),
                videos: files.filter(f => f.type.startsWith('video/')),
            });

            console.log('Claim submitted:', submitResponse);
            const claimId = submitResponse.claimId;

            // Poll for claim status
            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await api.getClaimStatus(claimId);
                    console.log('Claim status:', statusResponse);

                    if (statusResponse.status === 'completed' || statusResponse.status === 'ai_complete') {
                        clearInterval(pollInterval);
                        setIsProcessing(false);

                        // Map backend verdict to frontend format
                        const verdict = statusResponse.results.aiVerdict || statusResponse.results.finalVerdict || 'uncertain';
                        const confidence = statusResponse.results.aiConfidence || 0;

                        // Create evidence list from agent results
                        const evidence = statusResponse.results.agentResults.map(
                            ar => `${ar.agent}: ${ar.verdict} (${ar.confidence}% confidence)`
                        );

                        setMessages(prev => [...prev, {
                            role: 'ai',
                            verdict: {
                                status: verdict === 'true' ? 'verified' : verdict === 'false' ? 'fake' : 'uncertain',
                                confidence: confidence,
                                explanation: `Analysis complete. AI verdict: ${verdict}. Based on ${statusResponse.results.agentResults.length} agent analyses.`,
                                evidence: evidence.length > 0 ? evidence : ['Analysis completed by AI agents']
                            }
                        }]);
                    }
                } catch (error) {
                    console.error('Error polling claim status:', error);
                    clearInterval(pollInterval);
                    setIsProcessing(false);
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        verdict: {
                            status: 'uncertain',
                            confidence: 0,
                            explanation: 'Failed to retrieve verification results. Please try again.',
                            evidence: ['Error: Unable to connect to verification service']
                        }
                    }]);
                }
            }, 3000); // Poll every 3 seconds

            // Timeout after 2 minutes
            setTimeout(() => {
                clearInterval(pollInterval);
                if (isProcessing) {
                    setIsProcessing(false);
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        verdict: {
                            status: 'uncertain',
                            confidence: 0,
                            explanation: 'Verification is taking longer than expected. Please check back later.',
                            evidence: ['Claim is still being processed']
                        }
                    }]);
                }
            }, 120000);

        } catch (error: any) {
            console.error('Error submitting claim:', error);
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                role: 'ai',
                verdict: {
                    status: 'uncertain',
                    confidence: 0,
                    explanation: error.response?.data?.error || 'Failed to submit claim. Please try again.',
                    evidence: ['Error: ' + (error.message || 'Unknown error')]
                }
            }]);
        }
    };

    return (
        <>
            {isPageLoading && <Loader fullScreen text="Initializing secure channel..." />}
            <div className="ai-page-container" style={{ opacity: isPageLoading ? 0 : 1, transition: 'opacity 0.5s ease' }}>
                {/* Main Terminal Window */}
                <main className="ai-main-card">
                    <div className="terminal-header">
                        <div className="terminal-controls">
                            <span className="control close"></span>
                            <span className="control minimize"></span>
                            <span className="control maximize"></span>
                        </div>
                        <div className="terminal-title">visitor@verichain: ~</div>
                    </div>

                    {messages.length === 0 ? (
                        <div className="empty-state">
                            <div className="greeting-section">
                                <p className="system-msg">Welcome to VeriChain OS v1.0.0 (GNU/Linux x86_64)</p>
                                <br />
                                <p className="system-msg"> * Documentation:  https://docs.verichain.ai</p>
                                <p className="system-msg"> * Status:         SYSTEM ONLINE</p>
                                <p className="system-msg"> * Security:       ENCRYPTED</p>
                                <br />
                                <p className="system-msg">System information as of {new Date().toUTCString()}</p>
                                <br />
                                <p className="system-msg">VeriChain AI Protocol initialized...</p>
                                <p className="system-msg">Type 'help' to see available commands.</p>
                            </div>

                            <div className="suggestions-grid">
                                <div className="suggestion-card" onClick={() => setInputValue("./verify_news.sh")}>
                                    <span className="command-prefix">./</span>
                                    <p>verify_news.sh</p>
                                </div>
                                <div className="suggestion-card" onClick={() => setInputValue("./check_crypto.sh")}>
                                    <span className="command-prefix">./</span>
                                    <p>check_crypto.sh</p>
                                </div>
                                <div className="suggestion-card" onClick={() => setInputValue("./analyze_social.sh")}>
                                    <span className="command-prefix">./</span>
                                    <p>analyze_social.sh</p>
                                </div>
                                <div className="suggestion-card" onClick={() => setInputValue("./detect_deepfake.sh")}>
                                    <span className="command-prefix">./</span>
                                    <p>detect_deepfake.sh</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="chat-feed">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`message-bubble ${msg.role}`}>
                                    {msg.role === 'user' ? (
                                        <div className="message-content">
                                            <span className="prompt-user">visitor@verichain</span>
                                            <span className="prompt-sep">:</span>
                                            <span className="prompt-path">~</span>
                                            <span className="prompt-sign">$</span>
                                            <span className="command-text">{msg.text}</span>
                                        </div>
                                    ) : (
                                        <div className="message-content system-output">
                                            {msg.verdict && (
                                                <div className="verdict-card">
                                                    <div className="verdict-header">
                                                        <div className={`verdict-status status-${msg.verdict.status}`}>
                                                            [{msg.verdict.status.toUpperCase()}]
                                                        </div>
                                                        <div className="confidence-score">
                                                            CONFIDENCE: {msg.verdict.confidence}%
                                                        </div>
                                                    </div>
                                                    <p className="verdict-explanation">
                                                        {msg.verdict.explanation}
                                                    </p>
                                                    <div className="evidence-section">
                                                        <h4>EVIDENCE_LOG:</h4>
                                                        <ul className="evidence-list">
                                                            {msg.verdict.evidence.map((item, i) => (
                                                                <li key={i} className="evidence-item">
                                                                    <span className="evidence-icon">[+]</span>
                                                                    {item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isProcessing && (
                                <div className="thinking-state">
                                    <span>{loadingText}</span>
                                    <span className="cursor-block">█</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="chat-input-container">
                        <div className="chat-input-wrapper">
                            <span className="prompt-user">visitor@verichain</span>
                            <span className="prompt-sep">:</span>
                            <span className="prompt-path">~</span>
                            <span className="prompt-sign">$</span>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '10px' }}>
                                {attachedFile && (
                                    <div className="file-preview">
                                        <span>[ATTACHED: {attachedFile.name}]</span>
                                        <button onClick={() => {
                                            setAttachedFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}>
                                            [x]
                                        </button>
                                    </div>
                                )}
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                    autoFocus
                                />
                            </div>

                            <div className="attach-container">
                                <button
                                    className="attach-btn"
                                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                                >
                                    <IoAdd size={24} />
                                </button>
                                {showAttachMenu && (
                                    <div className="attach-menu">
                                        <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}>
                                            Upload File
                                        </button>
                                        <button onClick={() => { setInputValue("Link: "); setShowAttachMenu(false); }}>
                                            Submit Link
                                        </button>
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*,video/*,audio/*"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) setAttachedFile(e.target.files[0]);
                                }}
                            />
                            <button className="send-btn" onClick={handleSendMessage} style={{ background: 'transparent', border: 'none', color: '#8ae234', cursor: 'pointer', marginLeft: '10px' }}>
                                <IoSend size={24} />
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
};

export default ClaimsSubmit;
