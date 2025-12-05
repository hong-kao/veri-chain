import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AppNav.css";

export default function AppNav() {
    const location = useLocation();
    const { logout, user } = useAuth();

    const isActive = (path: string) => location.pathname === path;

    return (
        <nav className="app-nav">
            <Link to="/" className="app-nav-logo">
                VeriChain
            </Link>

            <div className="app-nav-links">
                <Link
                    to="/profile"
                    className={`app-nav-link ${isActive('/profile') ? 'active' : ''}`}
                >
                    Profile
                </Link>
                <Link
                    to="/claims"
                    className={`app-nav-link ${isActive('/claims') ? 'active' : ''}`}
                >
                    View Claims
                </Link>
                <Link
                    to="/submit"
                    className={`app-nav-link ${isActive('/submit') ? 'active' : ''}`}
                >
                    Submit Claim
                </Link>
            </div>

            <div className="app-nav-user">
                <span className="app-nav-username">{user.displayName}</span>
                <button className="app-nav-logout" onClick={logout}>
                    Log Out
                </button>
            </div>
        </nav>
    );
}
