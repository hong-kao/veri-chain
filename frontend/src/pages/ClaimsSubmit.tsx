import React, { useState, useRef } from 'react';
import './ClaimsSubmit.css';

// API Configuration - will default to localhost:8080
const API_BASE_URL = 'http://localhost:8080';

const ClaimsSubmit: React.FC = () => {
    const [inputValue, setInputValue] = useState("");
    const [messages, setMessages] = useState<any[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingText, setLoadingText] = useState("Analyzing claim with AI agents...");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadingMessages = [
        "Analyzing claim with AI agents...",
        "Text Forensics: Checking logical consistency...",
        "Citation Agent: Cross-referencing sources...",
        "Source Credibility: Analyzing domain reputation...",
        "Social Evidence: Scanning Reddit discussions...",
        "Media Forensics: Detecting AI-generated content...",
        "Scoring Agent: Aggregating results...",
        "Almost there..."
    ];

    React.useEffect(() => {
        let interval: any;
        if (isProcessing) {
            let index = 0;
            interval = setInterval(() => {
                index = (index + 1) % loadingMessages.length;
                setLoadingText(loadingMessages[index]);
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [isProcessing, loadingMessages]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        setSelectedFiles(prev => [...prev, ...files].slice(0, 8)); // Max 8 files
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const pollClaimStatus = async (claimId: number) => {
        const maxAttempts = 60;
        let attempts = 0;

        const poll = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/claims/${claimId}/status`);
                const data = await response.json();

                if (data.status === 'completed' || data.status === 'ai_complete' || data.status === 'voting') {
                    const verdict = data.results.aiVerdict || data.results.finalVerdict;
                    const confidence = data.results.aiConfidence || 0;

                    setMessages(prev => [...prev, {
                        role: 'ai',
                        verdict: {
                            status: verdict === 'TRUE' ? 'verified' : verdict === 'FALSE' ? 'fake' : 'uncertain',
                            confidence: Math.round(confidence * 100),
                            explanation: generateExplanation(data),
                            evidence: (data.results.agentResults || []).map((a: any) =>
                                `${a.agent.replace(/_/g, ' ')}: ${a.verdict} (${Math.round(a.confidence * 100)}%)`
                            ),
                            isVoting: data.status === 'voting'
                        }
                    }]);
                    setIsProcessing(false);
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 3000);
                } else {
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        verdict: {
                            status: 'uncertain',
                            confidence: 50,
                            explanation: 'Analysis is taking longer than expected. Check the Claims page for updates.',
                            evidence: []
                        }
                    }]);
                    setIsProcessing(false);
                }
            } catch (error) {
                console.error('Polling error:', error);
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 3000);
                }
            }
        };

        poll();
    };

    const generateExplanation = (data: any): string => {
        if (data.status === 'voting') {
            return 'Our AI analysis was inconclusive. This claim has been sent to the community for voting. Community voters have been notified via email. Track voting progress in the Claims page.';
        }

        const verdict = data.results.aiVerdict || data.results.finalVerdict;
        const confidence = Math.round((data.results.aiConfidence || 0) * 100);
        const agentCount = (data.results.agentResults || []).length;

        if (verdict === 'TRUE') {
            return `Based on analysis by ${agentCount} AI agents, this claim appears to be TRUE with ${confidence}% confidence. Multiple sources corroborate this claim.`;
        } else if (verdict === 'FALSE') {
            return `Based on analysis by ${agentCount} AI agents, this claim appears to be FALSE with ${confidence}% confidence. Evidence contradicts this claim.`;
        } else {
            return `Based on analysis by ${agentCount} AI agents, we cannot definitively verify this claim (${confidence}% confidence). The evidence is mixed or insufficient.`;
        }
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() && selectedFiles.length === 0) return;

        setMessages(prev => [...prev, { role: 'user', text: inputValue }]);
        const claimText = inputValue;
        setInputValue("");
        setIsProcessing(true);

        try {
            const formData = new FormData();
            formData.append('claim', claimText);
            formData.append('claimType', 'OTHER');

            selectedFiles.forEach((file, idx) => {
                if (file.type.startsWith('image/')) {
                    formData.append('images', file);
                } else if (file.type.startsWith('video/')) {
                    formData.append('videos', file);
                }
            });

            const response = await fetch(`${API_BASE_URL}/api/claims/submit`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (result.success && result.claimId) {
                setSelectedFiles([]);
                pollClaimStatus(result.claimId);
            } else {
                throw new Error(result.error || 'Failed to submit claim');
            }

        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'ai',
                verdict: {
                    status: 'uncertain',
                    confidence: 0,
                    explanation: `Error: ${error.message}. Make sure the backend is running on localhost:8080.`,
                    evidence: []
                }
            }]);
            setIsProcessing(false);
        }
    };

    return (
        <div className="ai-page-container">
            <aside className="ai-sidebar-strip">
                <div className="sidebar-top">
                    <button className="sidebar-icon-btn active"><span className="icon">+</span></button>
                    <button className="sidebar-icon-btn"><span className="icon">S</span></button>
                    <button className="sidebar-icon-btn"><span className="icon">E</span></button>
                </div>
                <div className="sidebar-bottom">
                    <div className="user-avatar-circle">N</div>
                </div>
            </aside>

            <main className="ai-main-card">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <div className="greeting-section">
                            <h1>Hello, Ashrith</h1>
                            <p>Submit any claim for AI-powered verification</p>
                        </div>

                        <div className="suggestions-grid">
                            <div className="suggestion-card">
                                <span className="card-icon">N</span>
                                <p>Verify a recent news article</p>
                            </div>
                            <div className="suggestion-card">
                                <span className="card-icon">C</span>
                                <p>Check a crypto project</p>
                            </div>
                            <div className="suggestion-card">
                                <span className="card-icon">S</span>
                                <p>Analyze a social media post</p>
                            </div>
                            <div className="suggestion-card">
                                <span className="card-icon">D</span>
                                <p>Deepfake detection</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="chat-feed">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`message-bubble ${msg.role}`}>
                                {msg.text && <div className="message-content">{msg.text}</div>}
                                {msg.verdict && (
                                    <div className="verdict-card">
                                        <div className="verdict-header">
                                            <div className={`verdict-status status-${msg.verdict.status}`}>
                                                {msg.verdict.isVoting ? 'VOTING IN PROGRESS' : msg.verdict.status}
                                            </div>
                                            <div className="confidence-score">
                                                <span className="score-label">CONFIDENCE</span>
                                                <span className="score-value">{msg.verdict.confidence}%</span>
                                            </div>
                                        </div>
                                        <p className="verdict-explanation">{msg.verdict.explanation}</p>
                                        {msg.verdict.evidence.length > 0 && (
                                            <div className="evidence-section">
                                                <h4>Agent Analysis Results</h4>
                                                <ul className="evidence-list">
                                                    {msg.verdict.evidence.map((item: string, i: number) => (
                                                        <li key={i} className="evidence-item">
                                                            <span className="evidence-icon">✓</span>
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {msg.verdict.isVoting && (
                                            <div style={{
                                                marginTop: '1rem',
                                                padding: '1rem',
                                                background: 'rgba(255, 193, 7, 0.1)',
                                                borderRadius: '0.5rem',
                                                border: '1px solid rgba(255, 193, 7, 0.3)'
                                            }}>
                                                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                                    📧 Community voters notified via email. Track progress in Claims page.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="thinking-state">
                                <div className="infinity-loader"></div>
                                <span>{loadingText}</span>
                            </div>
                        )}
                    </div>
                )}

                {selectedFiles.length > 0 && (
                    <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {selectedFiles.map((file, idx) => (
                            <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                                <div style={{
                                    width: '60px', height: '60px', background: '#f0f0f0', borderRadius: '0.25rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem'
                                }}>
                                    {file.type.startsWith('image/') ? '🖼️' : '🎥'} {file.name.substring(0, 8)}
                                </div>
                                <button onClick={() => removeFile(idx)} style={{
                                    position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white',
                                    border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px'
                                }}>×</button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="chat-input-container">
                    <div className="chat-input-wrapper">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="image/*,video/*"
                            multiple
                            style={{ display: 'none' }}
                        />
                        <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>
                            <span className="icon">+</span>
                        </button>
                        <input
                            type="text"
                            placeholder="Enter claim to verify..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
                            disabled={isProcessing}
                        />
                        <button className="send-btn" onClick={handleSendMessage} disabled={isProcessing}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ClaimsSubmit;
