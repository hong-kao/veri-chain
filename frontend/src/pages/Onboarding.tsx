import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
    const { authType, walletAddress, oauthUser } = useAuth();

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
            // Send POST request to backend
            const response = await fetch('http://localhost:3000/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(onboardingData),
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const result = await response.json();
            console.log('Onboarding submitted successfully:', result);

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
                    <button className="skip-button" onClick={handleSkip}>
                        Skip
                    </button>
                </div>

                <div className="progress-dots">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`progress-dot ${i === currentSlide ? "active" : ""} ${i < currentSlide ? "completed" : ""
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <div style={{
                        padding: '1rem',
                        background: 'rgba(244, 63, 94, 0.1)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        borderRadius: '0.5rem',
                        color: '#f43f5e',
                        marginBottom: '1rem',
                    }}>
                        {error}
                    </div>
                )}

                <div className="slides-container">
                    {currentSlide === 0 && (
                        <div className="slide">
                            <h1>Welcome to VeriChain!</h1>
                            <p>Let's personalize your experience in just a few quick steps.</p>
                            <div className="welcome-animation">
                                <div className="welcome-icon">✓</div>
                            </div>
                        </div>
                    )}

                    {currentSlide === 1 && (
                        <div className="slide">
                            <h1>What topics interest you?</h1>
                            <p>Select at least 3 topics</p>
                            <div className="interests-grid">
                                {CATEGORIES.map((category) => (
                                    <button
                                        key={category.id}
                                        className={`interest-card ${selectedInterests.includes(category.id) ? "selected" : ""
                                            }`}
                                        onClick={() => toggleInterest(category.id)}
                                    >
                                        <span className="interest-label">{category.label}</span>
                                        {selectedInterests.includes(category.id) && (
                                            <span className="checkmark">✓</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {currentSlide === 2 && (
                        <div className="slide">
                            <h1>Stay informed, your way</h1>
                            <div className="notifications-list">
                                <label className="notification-item">
                                    <div>
                                        <div className="notification-title">Claim status updates</div>
                                        <div className="notification-desc">
                                            Get notified when your claims are verified
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={notifications.claimStatus}
                                        onChange={(e) =>
                                            setNotifications({ ...notifications, claimStatus: e.target.checked })
                                        }
                                    />
                                    <span className="toggle-slider"></span>
                                </label>

                                <label className="notification-item">
                                    <div>
                                        <div className="notification-title">Leaderboard changes</div>
                                        <div className="notification-desc">
                                            Know when your rank changes
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={notifications.leaderboardChanges}
                                        onChange={(e) =>
                                            setNotifications({
                                                ...notifications,
                                                leaderboardChanges: e.target.checked,
                                            })
                                        }
                                    />
                                    <span className="toggle-slider"></span>
                                </label>

                                <label className="notification-item">
                                    <div>
                                        <div className="notification-title">Weekly digest</div>
                                        <div className="notification-desc">
                                            Summary of your activity
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={notifications.weeklyDigest}
                                        onChange={(e) =>
                                            setNotifications({ ...notifications, weeklyDigest: e.target.checked })
                                        }
                                    />
                                    <span className="toggle-slider"></span>
                                </label>

                                <label className="notification-item">
                                    <div>
                                        <div className="notification-title">New achievements</div>
                                        <div className="notification-desc">
                                            Celebrate your milestones
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={notifications.newAchievements}
                                        onChange={(e) =>
                                            setNotifications({
                                                ...notifications,
                                                newAchievements: e.target.checked,
                                            })
                                        }
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <p className="settings-note">
                                You can change these anytime in settings
                            </p>
                        </div>
                    )}

                    {currentSlide === 3 && (
                        <div className="slide">
                            <h1>Make your profile stand out</h1>
                            <p>Optional - you can skip this step</p>
                            <div className="profile-form">
                                <div className="form-group">
                                    <label>Display Name</label>
                                    <input
                                        type="text"
                                        placeholder="Enter your name"
                                        value={profile.displayName}
                                        onChange={(e) =>
                                            setProfile({ ...profile, displayName: e.target.value })
                                        }
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Bio (150 chars)</label>
                                    <textarea
                                        placeholder="Tell us about yourself"
                                        maxLength={150}
                                        value={profile.bio}
                                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                                    />
                                    <div className="char-count">{profile.bio.length}/150</div>
                                </div>

                                <div className="form-group">
                                    <label>Reddit Account (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="u/username"
                                        value={profile.reddit}
                                        onChange={(e) => setProfile({ ...profile, reddit: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>X (Twitter) Account (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="@username"
                                        value={profile.twitter}
                                        onChange={(e) => setProfile({ ...profile, twitter: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="onboarding-actions">
                    {currentSlide > 0 && (
                        <button className="btn-back" onClick={handleBack} disabled={submitting}>
                            ← Back
                        </button>
                    )}
                    <button className="btn-next" onClick={handleNext} disabled={submitting}>
                        {submitting ? "SUBMITTING..." : (currentSlide === 3 ? "Enter Platform →" : "Next →")}
                    </button>
                </div>
            </div>
        </div>
    );
}
