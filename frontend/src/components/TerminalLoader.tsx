import React, { useState, useEffect } from 'react';
import './TerminalLoader.css';

interface TerminalLoaderProps {
    onComplete?: () => void;
}

const TerminalLoader: React.FC<TerminalLoaderProps> = ({ onComplete }) => {
    const [percentage, setPercentage] = useState(0);
    const [blockchain, setBlockchain] = useState<string[]>([]);

    // ASCII Blockchain Animation
    useEffect(() => {
        const interval = setInterval(() => {
            setBlockchain(prev => {
                const newBlock = "[#]";
                if (prev.length >= 5) return [newBlock]; // Reset chain
                return [...prev, newBlock];
            });
        }, 800);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const startTime = Date.now();
        const minDuration = 5000; // 5 seconds max as per user request

        let current = 0;
        const simulateNetworkLoad = () => {
            const elapsedTime = Date.now() - startTime;
            const progress = elapsedTime / minDuration;

            // Calculate target percentage based on time, but add some randomness
            // Ensure we don't exceed 100% until minDuration is passed
            let target = Math.min(Math.floor(progress * 100), 99);

            // Add some jitter to make it look like network activity
            if (Math.random() > 0.7) {
                target += Math.floor(Math.random() * 5);
            }

            // Clamp between current and 99 (until done)
            current = Math.max(current, Math.min(target, 99));

            if (elapsedTime >= minDuration) {
                setPercentage(100);
                if (onComplete) {
                    setTimeout(onComplete, 1000); // 1s delay at 100%
                }
            } else {
                setPercentage(current);
                setTimeout(simulateNetworkLoad, 100);
            }
        };

        simulateNetworkLoad();
    }, [onComplete]);

    return (
        <div className="terminal-loader">
            <div className="loader-content">
                <div className="loader-text">
                    <span className="prefix">root@verichain:~#</span>
                    <span className="command"> initiate_secure_protocol.sh</span>
                </div>
                <div className="system-logs">
                    <p>{`> ESTABLISHING SECURE CONNECTION... [${percentage}%]`}</p>
                    <p>{`> VERIFYING ENCRYPTION KEYS... OK`}</p>
                    <p>{`> SYNCING WITH BLOCKCHAIN NODES...`}</p>
                    <p>{`> LOADING NEURAL MODULES...`}</p>
                </div>
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                </div>

                {/* ASCII Blockchain Animation */}
                <div className="blockchain-animation">
                    <div className="chain-container">
                        {blockchain.map((block, i) => (
                            <React.Fragment key={i}>
                                <span className="block">{block}</span>
                                {i < blockchain.length - 1 && <span className="link">--</span>}
                            </React.Fragment>
                        ))}
                        <span className="cursor">_</span>
                    </div>
                    <p className="mining-text">MINING_BLOCK_{Math.floor(Math.random() * 999999)}</p>
                </div>
            </div>
        </div>
    );
};

export default TerminalLoader;
