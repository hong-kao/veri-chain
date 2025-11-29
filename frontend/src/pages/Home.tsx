import { useState } from "react";
import Nav from "../components/Nav";
import AppFooter from "../components/AppFooter";
import WaterCanvas from "../components/WaterCanvas";
import WaterFillLoader from "../components/WaterFillLoader";

export default function Home() {
    const [showLoading, setShowLoading] = useState(true);

    const handleLoadingComplete = () => {
        setShowLoading(false);
    };

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
                <a href="/auth" style={{ textDecoration: 'none' }}>
                    <button className="nav-link" style={{
                        fontSize: '1.2rem',
                        padding: '12px 32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        Let's Get Started <span style={{ fontSize: '1.2em' }}>→</span>
                    </button>
                </a>
            </div>

            <AppFooter />
        </>
    );
}
