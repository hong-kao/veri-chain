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
            <AppFooter />
        </>
    );
}
