import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import "./Dashboard.css";
import "./Leaderboard.css";

interface LeaderboardUser {
    rank: number;
    name: string;
    points: number;
    accuracy: number;
    change: number;
    isCurrentUser?: boolean;
}

export default function Leaderboard() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/user/leaderboard')
            .then(res => res.json())
            .then(data => {
                setLeaderboard(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch leaderboard:", err);
                setLoading(false);
            });
    }, []);

    const topThree = leaderboard.slice(0, 3);
    const rest = leaderboard.slice(3);

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
                    <Link to="/explore" className="nav-link">
                        Explore
                    </Link>
                    <Link to="/notifications" className="nav-link">
                        Notifications
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

                {loading ? (
                    <p>Loading leaderboard...</p>
                ) : (
                    <>
                        <div className="podium">
                            {topThree[1] && (
                                <div className="podium-place second">
                                    <div className="podium-avatar">{topThree[1].name.charAt(0)}</div>
                                    <div className="podium-name">{topThree[1].name}</div>
                                    <div className="podium-points">{topThree[1].points.toLocaleString()}</div>
                                </div>
                            )}
                            {topThree[0] && (
                                <div className="podium-place first">
                                    <div className="podium-avatar">{topThree[0].name.charAt(0)}</div>
                                    <div className="podium-name">{topThree[0].name}</div>
                                    <div className="podium-points">{topThree[0].points.toLocaleString()}</div>
                                </div>
                            )}
                            {topThree[2] && (
                                <div className="podium-place third">
                                    <div className="podium-avatar">{topThree[2].name.charAt(0)}</div>
                                    <div className="podium-name">{topThree[2].name}</div>
                                    <div className="podium-points">{topThree[2].points.toLocaleString()}</div>
                                </div>
                            )}
                        </div>

                        <div className="leaderboard-list">
                            {rest.map((user) => (
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
                    </>
                )}
            </div>
        </div>
    );
}
