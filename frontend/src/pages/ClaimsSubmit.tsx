import React, { useState } from 'react';
import './ClaimsSubmit.css';

const ClaimsSubmit: React.FC = () => {
    const [inputValue, setInputValue] = useState("");
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

    const handleSendMessage = () => {
        if (!inputValue.trim()) return;

        const newMessages = [...messages, { role: 'user' as const, text: inputValue }];
        setMessages(newMessages);
        setInputValue("");
        setIsProcessing(true);
        setLoadingText(loadingMessages[0]);

        // Simulate AI response with "insane loader" duration
        setTimeout(() => {
            setMessages(prev => [...prev, {
                role: 'ai',
                verdict: {
                    status: 'verified',
                    confidence: 94,
                    explanation: "Based on cross-referencing multiple trusted sources, this claim appears to be accurate. The event was reported by major news outlets and corroborated by official statements.",
                    evidence: [
                        "Confirmed by Reuters and AP News",
                        "Official press release from the organization",
                        "Corroborated by live video footage"
                    ]
                }
            }]);
            setIsProcessing(false);
        }, 5000);
    };

    return (
        <div className="ai-page-container">
            {/* Sidebar */}
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

            {/* Main Chat Area */}
            <main className="ai-main-card">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <div className="greeting-section">
                            <h1>Hello, Ashrith</h1>
                            <p>How can I help you verify today?</p>
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
                                                {msg.verdict.status}
                                            </div>
                                            <div className="confidence-score">
                                                <span className="score-label">CONFIDENCE</span>
                                                <span className="score-value">{msg.verdict.confidence}%</span>
                                            </div>
                                        </div>
                                        <p className="verdict-explanation">
                                            {msg.verdict.explanation}
                                        </p>
                                        <div className="evidence-section">
                                            <h4>Key Evidence</h4>
                                            <ul className="evidence-list">
                                                {msg.verdict.evidence.map((item, i) => (
                                                    <li key={i} className="evidence-item">
                                                        <span className="evidence-icon">✓</span>
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
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

                {/* Input Area */}
                <div className="chat-input-container">
                    <div className="chat-input-wrapper">
                        <button className="attach-btn"><span className="icon">+</span></button>
                        <input
                            type="text"
                            placeholder="Ask anything..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button className="send-btn" onClick={handleSendMessage}>
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
