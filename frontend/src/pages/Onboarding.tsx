import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./Onboarding.css";

const CATEGORIES = [
    { id: "science", label: "Science" },
    { id: "technology", label: "Technology" },
    { id: "finance", label: "Finance" },
    { id: "healthcare", label: "Healthcare" },
    { id: "sports", label: "Sports" },
    { id: "arts", label: "Arts" },
];

export default function Onboarding() {
    const navigate = useNavigate();
    const { authType, walletAddress, oauthUser, token } = useAuth();

    const [currentSlide, setCurrentSlide] = useState(0);
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [notifications, setNotifications] = useState({
        claimStatus: true,
        leaderboardChanges: true,
        weeklyDigest: false,
        newAchievements: true,
    });
    const [profile, setProfile] = useState({
        displayName: "",
        bio: "",
        reddit: "",
        twitter: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleNext = async () => {
        if (currentSlide === 1 && selectedInterests.length < 3) {
            alert("Please select at least 3 interests");
            return;
        }

        if (currentSlide < 3) {
            setCurrentSlide(currentSlide + 1);
        } else {
            // Final step - submit to backend
            await handleSubmitOnboarding();
        }
    };

    const handleSubmitOnboarding = async () => {
        setSubmitting(true);
        setError("");

        const onboardingData = {
            authType,
            walletAddress: authType === 'wallet' ? walletAddress : undefined,
            email: authType === 'oauth' ? oauthUser?.email : undefined,
            name: oauthUser?.name || profile.displayName,
            displayName: profile.displayName || oauthUser?.name || "User",
            bio: profile.bio,
            redditHandle: profile.reddit,
            xHandle: profile.twitter,
            interests: selectedInterests,
            notifications,
            onboardingComplete: true,
        };

        try {
            if (!token) {
                throw new Error("Authentication token missing. Please login again.");
            }

            // Send POST request to backend using api service
            await api.submitOnboarding(token, onboardingData);

            console.log('Onboarding submitted successfully');

            // Save to localStorage
            localStorage.setItem(
                "claims-user-profile",
                JSON.stringify(onboardingData)
            );

            navigate("/dashboard");
        } catch (err: any) {
            console.error('Failed to submit onboarding:', err);
            setError(err.message || 'Failed to submit. Continuing anyway...');

            // Save locally even if backend fails
            localStorage.setItem(
                "claims-user-profile",
                JSON.stringify(onboardingData)
            );

            // Navigate after 2 seconds even on error
            setTimeout(() => navigate("/dashboard"), 2000);
        } finally {
            setSubmitting(false);
        }
    };

    const handleBack = () => {
        if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
        }
    };

    const handleSkip = () => {
        const defaultData = {
            authType,
            walletAddress: authType === 'wallet' ? walletAddress : undefined,
            email: authType === 'oauth' ? oauthUser?.email : undefined,
            interests: ["technology", "science", "finance"],
            notifications,
            onboardingComplete: true,
        };

        localStorage.setItem(
            "claims-user-profile",
            JSON.stringify(defaultData)
        );
        navigate("/dashboard");
    };

    const toggleInterest = (id: string) => {
        setSelectedInterests((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    return (
        <div className="onboarding-page">
            <div className="onboarding-container">
                <div className="onboarding-header">
                    <div className="logo-small">VeriChain</div>
                    <button className="skip-button" onClick={handleSkip}>
                        Skip Setup
                    </button>
                </div>

                <div className="progress-bar-container">
                    <div className="progress-track">
                        <div
                            className="progress-fill"
                            style={{ width: `${((currentSlide + 1) / 4) * 100}%` }}
                        ></div>
                    </div>
                </div>

                {error && (
                    <div className="error-banner">
                        {error}
                    </div>
                )}

                <div className="slides-container">
                    {currentSlide === 0 && (
                        <div className="slide fade-in">
                            <h1 className="slide-title">Welcome to VeriChain</h1>
                            <p className="slide-subtitle">Let's personalize your experience in just a few quick steps.</p>
                            <div className="welcome-animation">
                                <div className="welcome-circle">
                                    <span className="welcome-icon">✓</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentSlide === 1 && (
                        <div className="slide fade-in">
                            <h1 className="slide-title">What interests you?</h1>
                            <p className="slide-subtitle">Select at least 3 topics to customize your feed</p>
                            <div className="interests-grid">
                                {CATEGORIES.map((category) => (
                                    <button
                                        key={category.id}
                                        className={`interest-card ${selectedInterests.includes(category.id) ? "selected" : ""}`}
                                        onClick={() => toggleInterest(category.id)}
                                    >
                                        <span className="interest-label">{category.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {currentSlide === 2 && (
                        <div className="slide fade-in">
                            <h1 className="slide-title">Stay informed</h1>
                            <p className="slide-subtitle">Choose how you want to be notified</p>
                            <div className="notifications-list">
                                <label className="notification-item">
                                    <div className="notif-info">
                                        <div className="notification-title">Claim status updates</div>
                                        <div className="notification-desc">Get notified when your claims are verified</div>
                                    </div>
                                    <div className="toggle-wrapper">
                                        <input
                                            type="checkbox"
                                            checked={notifications.claimStatus}
                                            onChange={(e) => setNotifications({ ...notifications, claimStatus: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </div>
                                </label>

                                <label className="notification-item">
                                    <div className="notif-info">
                                        <div className="notification-title">Leaderboard changes</div>
                                        <div className="notification-desc">Know when your rank changes</div>
                                    </div>
                                    <div className="toggle-wrapper">
                                        <input
                                            type="checkbox"
                                            checked={notifications.leaderboardChanges}
                                            onChange={(e) => setNotifications({ ...notifications, leaderboardChanges: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </div>
                                </label>

                                <label className="notification-item">
                                    <div className="notif-info">
                                        <div className="notification-title">Weekly digest</div>
                                        <div className="notification-desc">Summary of your activity</div>
                                    </div>
                                    <div className="toggle-wrapper">
                                        <input
                                            type="checkbox"
                                            checked={notifications.weeklyDigest}
                                            onChange={(e) => setNotifications({ ...notifications, weeklyDigest: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {currentSlide === 3 && (
                        <div className="slide fade-in">
                            <h1 className="slide-title">Complete Profile</h1>
                            <p className="slide-subtitle">Tell us a bit about yourself</p>
                            <div className="profile-form">
                                <div className="form-group">
                                    <label>Display Name</label>
                                    <input
                                        type="text"
                                        placeholder="Enter your name"
                                        value={profile.displayName}
                                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                                        className="premium-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Bio</label>
                                    <textarea
                                        placeholder="Tell us about yourself"
                                        maxLength={150}
                                        value={profile.bio}
                                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                                        className="premium-input"
                                    />
                                    <div className="char-count">{profile.bio.length}/150</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="onboarding-actions">
                    {currentSlide > 0 && (
                        <button className="btn-back" onClick={handleBack} disabled={submitting}>
                            Back
                        </button>
                    )}
                    <button className="btn-next" onClick={handleNext} disabled={submitting}>
                        {submitting ? "Submitting..." : (currentSlide === 3 ? "Complete Setup" : "Continue")}
                    </button>
                </div>
            </div>
        </div>
    );
}
