import { Link } from "react-router-dom";
import "./Dashboard.css";
import "./Leaderboard.css";

const MOCK_LEADERBOARD = [
    { rank: 1, name: "Abinav", points: 3890, accuracy: 95, change: 2 },
    { rank: 2, name: "Shirrish", points: 2345, accuracy: 92, change: -1 },
    { rank: 3, name: "Ashrith", points: 2100, accuracy: 89, change: 1 },
    { rank: 4, name: "David", points: 1890, accuracy: 88, change: 3 },
    { rank: 5, name: "Eve", points: 1750, accuracy: 91, change: -1 },
    { rank: 43, name: "You", points: 1247, accuracy: 89, change: 5, isCurrentUser: true },
];

export default function Leaderboard() {
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
                    <Link to="/leaderboard" className="nav-link active">
                        Leaderboard
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container">
                <h1 className="leaderboard-title">Top Truth Seekers</h1>

                <div className="leaderboard-filters">
                    <button className="filter-btn active">All Time</button>
                    <button className="filter-btn">This Month</button>
                    <button className="filter-btn">This Week</button>
                </div>

                <div className="podium">
                    <div className="podium-place second">
                        <div className="podium-avatar">S</div>
                        <div className="podium-name">Shirrish</div>
                        <div className="podium-points">2,345</div>
                    </div>
                    <div className="podium-place first">
                        <div className="podium-avatar">A</div>
                        <div className="podium-name">Abinav</div>
                        <div className="podium-points">3,890</div>
                    </div>
                    <div className="podium-place third">
                        <div className="podium-avatar">A</div>
                        <div className="podium-name">Ashrith</div>
                        <div className="podium-points">2,100</div>
                    </div>
                </div>

                <div className="leaderboard-list">
                    {MOCK_LEADERBOARD.map((user) => (
                        <div
                            key={user.rank}
                            className={`leaderboard-card ${user.isCurrentUser ? "current-user" : ""}`}
                        >
                            <div className="rank-number">#{user.rank}</div>
                            <div className="user-avatar">{user.name.charAt(0)}</div>
                            <div className="user-details">
                                <div className="user-name">{user.name}</div>
                                <div className="user-stats">
                                    {user.accuracy}% accuracy • {user.points.toLocaleString()} points
                                </div>
                            </div>
                            <div className="rank-change">
                                {user.change > 0 && (
                                    <span className="change-up">↑ +{user.change}</span>
                                )}
                                {user.change < 0 && (
                                    <span className="change-down">↓ {user.change}</span>
                                )}
                                {user.change === 0 && <span className="change-same">—</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
