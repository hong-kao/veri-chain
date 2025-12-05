import { useState } from "react";
import Nav from "../components/Nav";
import WaterCanvas from "../components/WaterCanvas";
import WaterFillLoader from "../components/WaterFillLoader";
import AppFooter from "../components/AppFooter";
import { useAuth } from "../context/AuthContext";

export default function Home() {
    const [showLoading, setShowLoading] = useState(true);
    const { isConnected } = useAuth();

    const handleLoadingComplete = () => {
        setShowLoading(false);
    };

    // Check if onboarding is complete (user has profile saved)
    const hasCompletedOnboarding = !!sessionStorage.getItem('claims-user-profile');
    const isFullyLoggedIn = isConnected && hasCompletedOnboarding;

    return (
        <>
            {showLoading && <WaterFillLoader onComplete={handleLoadingComplete} />}
            <Nav />
            <WaterCanvas />

            <div style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px'
            }}>
                {!isFullyLoggedIn ? (
                    <a href="/auth" style={{ textDecoration: 'none' }}>
                        <button className="nav-link" style={{
                            fontSize: '1.2rem',
                            padding: '12px 32px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            Let's get started <span style={{ fontSize: '1.2em' }}>→</span>
                        </button>
                    </a>
                ) : (
                    <a href="/profile" style={{ textDecoration: 'none' }}>
                        <button className="nav-link" style={{
                            fontSize: '1.2rem',
                            padding: '12px 32px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            Go to Profile <span style={{ fontSize: '1.2em' }}>→</span>
                        </button>
                    </a>
                )}
            </div>

            <AppFooter />
        </>
    );
}
