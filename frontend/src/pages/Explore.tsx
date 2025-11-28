import { Link } from "react-router-dom";
import "./Dashboard.css";
import "./Explore.css";

export default function Explore() {
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
                    <div className="explore-card">
                        <span className="explore-badge verified">Verified</span>
                        <h3>AI in Healthcare</h3>
                        <p>AI will revolutionize healthcare in the next decade</p>
                        <div className="explore-meta">87% confidence • 234 views</div>
                    </div>

                    <div className="explore-card">
                        <span className="explore-badge pending">Pending</span>
                        <h3>Bitcoin Prediction</h3>
                        <p>Bitcoin will reach $100k by Q1 2026</p>
                        <div className="explore-meta">78% confidence • 89 views</div>
                    </div>

                    <div className="explore-card">
                        <span className="explore-badge verified">Verified</span>
                        <h3>Climate Action</h3>
                        <p>Renewable energy will surpass fossil fuels by 2030</p>
                        <div className="explore-meta">92% confidence • 512 views</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
