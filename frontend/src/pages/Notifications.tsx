import { Link } from "react-router-dom";
import "./Dashboard.css";
import "./Notifications.css";

const MOCK_NOTIFICATIONS = [
    {
        id: 1,
        type: "success",
        title: "Claim Verified!",
        message: "Your claim #1234 has been verified. You earned 150 points!",
        time: "2h ago",
        read: false,
    },
    {
        id: 2,
        type: "rank",
        title: "Rank Update",
        message: "Congratulations! You moved up 5 ranks on the leaderboard.",
        time: "1d ago",
        read: false,
    },
    {
        id: 3,
        type: "pending",
        title: "Claim Processing",
        message: "Your claim #1235 is currently being analyzed.",
        time: "1d ago",
        read: true,
    },
];

export default function Notifications() {
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
                <div className="notifications-header">
                    <h1>Notifications</h1>
                    <button className="btn-mark-all">Mark all as read</button>
                </div>

                <div className="notifications-list-container">
                    {MOCK_NOTIFICATIONS.map((notif) => (
                        <div
                            key={notif.id}
                            className={`notification-card ${notif.read ? "read" : "unread"}`}
                        >
                            <div className="notification-icon">
                                {notif.type === "success" && "✓"}
                                {notif.type === "rank" && "↑"}
                                {notif.type === "pending" && "..."}
                            </div>
                            <div className="notification-content">
                                <div className="notification-title">{notif.title}</div>
                                <div className="notification-message">{notif.message}</div>
                                <div className="notification-time">{notif.time}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
