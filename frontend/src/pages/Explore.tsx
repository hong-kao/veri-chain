import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import "./Dashboard.css";
import "./Explore.css";

interface Claim {
    id: number;
    title: string;
    content: string;
    status: string;
    confidence: number;
    views: number;
}

export default function Explore() {
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/claims/explore')
            .then(res => res.json())
            .then(data => {
                setClaims(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch explore claims:", err);
                setLoading(false);
            });
    }, []);

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
                    <Link to="/claims" className="nav-link">
                        Claims
                    </Link>
                    <Link to="/leaderboard" className="nav-link">
                        Leaderboard
                    </Link>
                    <Link to="/explore" className="nav-link active">
                        Explore
                    </Link>
                    <Link to="/notifications" className="nav-link">
                        Notifications
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container">
                <h1>Explore Claims</h1>
                <p className="explore-subtitle">Discover and verify claims from the community</p>

                <div className="search-bar">
                    <input type="text" placeholder="Search claims..." />
                    <button>Search</button>
                </div>

                <div className="explore-filters">
                    <button className="filter-btn active">All</button>
                    <button className="filter-btn">Technology</button>
                    <button className="filter-btn">Finance</button>
                    <button className="filter-btn">Sports</button>
                </div>

                <div className="explore-grid">
                    {loading ? (
                        <p>Loading claims...</p>
                    ) : (
                        claims.map((claim) => (
                            <div key={claim.id} className="explore-card">
                                <span className={`explore-badge ${claim.status.toLowerCase()}`}>{claim.status}</span>
                                <h3>{claim.title}</h3>
                                <p>{claim.content}</p>
                                <div className="explore-meta">{claim.confidence}% confidence • {claim.views} views</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
