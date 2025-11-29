import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Nav() {
    const { isConnected } = useAuth();

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
                {isConnected && (
                    <>
                        <Link to="/dashboard">
                            <p>Dashboard</p>
                        </Link>
                        <Link to="/claims">
                            <p>Claims</p>
                        </Link>
                        <Link to="/leaderboard">
                            <p>Leaderboard</p>
                        </Link>
                    </>
                )}
                {!isConnected && (
                    <>
                        <Link to="/auth?mode=signin">
                            <button className="nav-link">Sign In</button>
                        </Link>
                        <Link to="/auth?mode=signup">
                            <button className="nav-link nav-link-signup">Sign Up</button>
                        </Link>
                    </>
                )}
            </div>
        </nav>
    );
}
