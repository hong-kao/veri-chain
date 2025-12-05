import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./Onboarding.css";

const CATEGORIES = [
    { id: "politics", label: "Politics" },
    { id: "health", label: "Health" },
    { id: "finance", label: "Finance" },
    { id: "tech", label: "Tech" },
    { id: "sports", label: "Sports" },
    { id: "misc", label: "Miscellaneous" },
];

export default function Onboarding() {
    const navigate = useNavigate();
    const { authType, walletAddress, oauthUser, email: authEmail, token, updateProfile, user } = useAuth();

    const [currentSlide, setCurrentSlide] = useState(0);
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [notifications, setNotifications] = useState({
        claimStatus: true,
        leaderboardChanges: true,
        weeklyDigest: false,
        newAchievements: true,
    });

    // Auto-fill display name from email registration or OAuth
    const getInitialDisplayName = () => {
        if (authType === 'email' && user?.displayName && user.displayName !== 'Guest') {
            return user.displayName;
        }
        if (authType === 'oauth' && oauthUser?.name) {
            return oauthUser.name;
        }
        return '';
    };

    const [profile, setProfile] = useState({
        displayName: getInitialDisplayName(),
        email: authEmail || (authType === 'oauth' ? oauthUser?.email : '') || '',
        reddit: '',
        twitter: '',
        farcaster: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleNext = async () => {
        if (currentSlide === 1 && selectedInterests.length < 3) {
            alert("Please select at least 3 interests");
            return;
        }

        // Validate email on final step
        if (currentSlide === 3 && !profile.email.trim()) {
            alert("Email is required");
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
        setError('');

        try {
            // For email auth, walletAddress is optional
            if (authType === 'wallet' && !walletAddress) {
                throw new Error('Wallet address is required. Please connect your wallet.');
            }

            // Map notification preferences to NotifType enum
            const getNotifType = () => {
                const { claimStatus, leaderboardChanges, weeklyDigest } = notifications;
                if (!claimStatus && !leaderboardChanges && !weeklyDigest) return 'none';
                if (claimStatus && !leaderboardChanges && !weeklyDigest) return 'important_only';
                if (weeklyDigest) return 'frequent';
                return 'standard';
            };

            // Call backend signup endpoint with schema-matching data
            const response = await api.signup({
                authType: authType || 'wallet',
                walletAddress: walletAddress || undefined,
                email: profile.email || authEmail || (authType === 'oauth' ? oauthUser?.email : undefined),
                name: profile.displayName || oauthUser?.name || 'User',
                displayName: profile.displayName || oauthUser?.name || 'User',
                redditHandle: profile.reddit || undefined,
                xHandle: profile.twitter || undefined,
                farcasterHandle: profile.farcaster || undefined,
                interests: selectedInterests,
                notifType: getNotifType(),
            });

            console.log('Onboarding submitted successfully:', response);

            // Save to sessionStorage for redundancy
            const onboardingData = {
                authType,
                walletAddress,
                email: profile.email || (authType === 'oauth' ? oauthUser?.email : undefined),
                displayName: profile.displayName,
                interests: selectedInterests,
                notifications,
                onboardingComplete: true,
            };

            sessionStorage.setItem("claims-user-profile", JSON.stringify(onboardingData));

            // Update the auth context to refresh user displayName
            updateProfile();

            // Navigate to profile
            navigate("/profile");
        } catch (err: any) {
            console.error('Failed to submit onboarding:', err);
            setError(err.response?.data?.error || err.message || 'Failed to submit. Please try again.');
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
                                    <label>Display Name{authType === 'email' && profile.displayName ? ' (from registration)' : ''}</label>
                                    <input
                                        type="text"
                                        placeholder="Enter your name"
                                        value={profile.displayName}
                                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                                        className="premium-input"
                                        disabled={authType === 'email' && !!getInitialDisplayName()}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>
                                        Email
                                        {(authType === 'oauth' || authType === 'email') && profile.email ? ' (from your account)' : ' *'}
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="your@email.com"
                                        value={profile.email}
                                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                        className="premium-input"
                                        disabled={(authType === 'oauth' || authType === 'email') && !!profile.email}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Reddit Profile (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="u/username"
                                        value={profile.reddit}
                                        onChange={(e) => setProfile({ ...profile, reddit: e.target.value })}
                                        className="premium-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>X/Twitter Profile (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="@username"
                                        value={profile.twitter}
                                        onChange={(e) => setProfile({ ...profile, twitter: e.target.value })}
                                        className="premium-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Farcaster Profile (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="@username"
                                        value={profile.farcaster}
                                        onChange={(e) => setProfile({ ...profile, farcaster: e.target.value })}
                                        className="premium-input"
                                    />
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
