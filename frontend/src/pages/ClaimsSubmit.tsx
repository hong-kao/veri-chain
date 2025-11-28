import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Dashboard.css";
import "./ClaimsSubmit.css";

interface Message {
    type: 'user' | 'agent';
    content: string;
    status?: 'verified' | 'rejected' | 'unclear';
    confidence?: number;
}

export default function ClaimsSubmit() {
    const { authType, canVote } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isProcessing, isTyping]);

    const simulateAgentProcessing = async (claim: string): Promise<Message> => {
        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Mock verdict generation (would call actual API in production)
        const verdicts = [
            {
                status: 'verified' as const,
                content: `**CLAIM VERIFIED**\n\nConfidence: 87%\n\n**Analysis:**\nBased on current market trends and expert predictions, this claim shows strong supporting evidence. Multiple credible sources corroborate this statement.\n\n**Key Factors:**\n• Historical data supports this trajectory\n• Expert consensus aligns with claim\n• No contradictory evidence found\n\n**Recommendation:** Approved for verification`,
                confidence: 87,
            },
            {
                status: 'rejected' as const,
                content: `**CLAIM REJECTED**\n\nConfidence: 23%\n\n**Analysis:**\nInsufficient evidence to support this claim. Multiple factual inconsistencies detected.\n\n**Issues Identified:**\n• Contradicts established data\n• Lacks credible sources\n• Time frame unrealistic\n\n**Recommendation:** Requires substantial revision`,
                confidence: 23,
            },
            {
                status: 'unclear' as const,
                content: `**NEEDS CLARIFICATION**\n\nConfidence: 56%\n\n**Analysis:**\nThe claim requires more specific details for accurate verification.\n\n**Suggestions:**\n• Add specific time frames\n• Provide measurable metrics\n• Include source references\n\n**Recommendation:** Revise and resubmit with additional context`,
                confidence: 56,
            },
        ];

        // Randomly pick a verdict (or use logic based on claim content)
        const verdict = verdicts[Math.floor(Math.random() * verdicts.length)];

        return {
            type: 'agent',
            ...verdict,
        };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        const userMessage: Message = {
            type: 'user',
            content: input,
        };

        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsProcessing(true);

        // Get verdict response
        const verdict = await simulateAgentProcessing(input);

        setIsProcessing(false);
        setIsTyping(true);

        // Simulate typing animation
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsTyping(false);
        setMessages(prev => [...prev, verdict]);
    };

    return (
        <div className="dashboard-page">
            <nav className="dashboard-nav">
                <Link to="/" className="nav-logo">
                    VeriChain
                </Link>
                <div className="nav-links">
                    <Link to="/dashboard" className="nav-link">
                        Dashboard
                    </Link>
                    <Link to="/claims" className="nav-link active">
                        Claims
                    </Link>
                    <Link to="/leaderboard" className="nav-link">
                        Leaderboard
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container chat-container">
                <div className="chat-header">
                    <h1>Submit New Claim</h1>
                    <p>AI agents will verify your claim in real-time</p>
                </div>

                <div className="chat-messages">
                    {messages.length === 0 && (
                        <div className="empty-state">
                            <h3>Start Your Claim</h3>
                            <p>Type a statement you believe can be verified below</p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message ${msg.type}`}>
                            {msg.type === 'user' ? (
                                <div className="message-bubble user-bubble">
                                    {msg.content}
                                </div>
                            ) : (
                                <div className="message-bubble agent-bubble">
                                    <div className="verdict-content">
                                        {msg.content.split('\n').map((line, i) => {
                                            // Simple markdown rendering
                                            if (line.startsWith('**') && line.endsWith('**')) {
                                                return <h3 key={i}>{line.replace(/\*\*/g, '')}</h3>;
                                            }
                                            if (line.startsWith('•')) {
                                                return <li key={i}>{line.substring(1).trim()}</li>;
                                            }
                                            if (line.trim()) {
                                                return <p key={i}>{line}</p>;
                                            }
                                            return <br key={i} />;
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {isProcessing && (
                        <div className="message agent">
                            <div className="agent-loader">
                                <div className="loader-animation">
                                    <div className="agent-avatars">
                                        <div className="agent-avatar">AI</div>
                                    </div>
                                    <div className="orchestration-lines">
                                        <div className="line"></div>
                                        <div className="line"></div>
                                        <div className="line"></div>
                                    </div>
                                </div>
                                <p className="loader-text">AI Agents are cooking...</p>
                                <div className="loader-dots">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        </div>
                    )}

                    {isTyping && (
                        <div className="message agent">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <form className="chat-input-container" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="chat-input"
                        placeholder="Type your claim here..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isProcessing}
                    />
                    <button
                        type="submit"
                        className="chat-send-btn"
                        disabled={!input.trim() || isProcessing}
                    >
                        {isProcessing ? '...' : '→'}
                    </button>
                </form>
            </div>
        </div>
    );
}
