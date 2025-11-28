import { Link } from "react-router-dom";

export default function Nav() {
    return (
        <nav>
            <div className="logo">
                <Link to="/" className="logo-link">
                    <div className="logo-container">
                        <p>VeriChain</p>
                    </div>
                </Link>
            </div>

            <div className="nav-items">
                <Link to="/dashboard">
                    <p>Dashboard</p>
                </Link>
                <Link to="/claims">
                    <p>Claims</p>
                </Link>
                <Link to="/leaderboard">
                    <p>Leaderboard</p>
                </Link>
                <Link to="/auth">
                    <button className="nav-link">Sign In</button>
                </Link>
            </div>
        </nav>
    );
}
