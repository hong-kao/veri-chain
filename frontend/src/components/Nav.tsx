import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Nav() {
    const { isConnected, logout } = useAuth();
    const navigate = useNavigate();

    // Check if onboarding is complete (user has profile saved)
    const hasCompletedOnboarding = !!sessionStorage.getItem('claims-user-profile');
    const isFullyLoggedIn = isConnected && hasCompletedOnboarding;

    const handleLogout = () => {
        logout();
        navigate('/');
    };

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
                {isFullyLoggedIn ? (
                    <>
                        <Link to="/profile">
                            <p>Profile</p>
                        </Link>
                        <Link to="/claims">
                            <p>Claims</p>
                        </Link>
                        <Link to="/submit">
                            <p>Submit</p>
                        </Link>
                        <button
                            className="nav-link"
                            onClick={handleLogout}
                            style={{
                                marginLeft: '1em',
                                fontSize: '14px',
                                padding: '0.4em 1em',
                                cursor: 'pointer'
                            }}
                        >
                            Log Out
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/auth" state={{ mode: 'signup' }}>
                            <button className="nav-link" style={{
                                fontSize: '14px',
                                padding: '0.4em 1em'
                            }}>
                                Sign Up
                            </button>
                        </Link>
                        <Link to="/auth" state={{ mode: 'login' }}>
                            <button className="nav-link" style={{
                                fontSize: '14px',
                                padding: '0.4em 1em',
                                background: 'rgba(255, 255, 255, 0.1)'
                            }}>
                                Log In
                            </button>
                        </Link>
                    </>
                )}
            </div>
        </nav>
    );
}
