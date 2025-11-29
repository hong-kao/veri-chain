import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import "./Dashboard.css";
import "./Notifications.css";

interface Notification {
    id: number;
    type: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
}

export default function Notifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/user/notifications')
            .then(res => res.json())
            .then(data => {
                setNotifications(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch notifications:", err);
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
                    <Link to="/explore" className="nav-link">
                        Explore
                    </Link>
                    <Link to="/notifications" className="nav-link active">
                        Notifications
                    </Link>
                </div>
            </nav>

            <div className="dashboard-container">
                <div className="notifications-header">
                    <h1>Notifications</h1>
                    <button className="btn-mark-all">Mark all as read</button>
                </div>

                <div className="notifications-list-container">
                    {loading ? (
                        <p>Loading notifications...</p>
                    ) : (
                        notifications.map((notif) => (
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
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
