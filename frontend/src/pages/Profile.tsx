import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import AppNav from "../components/AppNav";
import "../styles/AppPages.css";

const CATEGORIES = [
    { id: "politics", label: "Politics" },
    { id: "health", label: "Health" },
    { id: "finance", label: "Finance" },
    { id: "tech", label: "Tech" },
    { id: "sports", label: "Sports" },
    { id: "misc", label: "Miscellaneous" },
];

const NOTIFICATION_OPTIONS = [
    { id: "claimStatus", label: "Claim Status Updates", description: "Get notified when your claims are verified or rejected" },
    { id: "leaderboardChanges", label: "Leaderboard Changes", description: "Updates when your ranking changes" },
    { id: "weeklyDigest", label: "Weekly Digest", description: "A weekly summary of platform activity" },
    { id: "newAchievements", label: "New Achievements", description: "Notifications for unlocked achievements" },
];

type ModalType = 'social' | 'interests' | 'notifications' | null;
type SocialType = 'reddit' | 'twitter' | 'farcaster';

export default function Profile() {
    const { user, authType, walletAddress, connectWallet, email, oauthUser } = useAuth();
    const [connecting, setConnecting] = useState(false);

    // Get profile from session storage
    const savedProfile = sessionStorage.getItem('claims-user-profile');
    const initialProfileData = savedProfile ? JSON.parse(savedProfile) : {};

    const [profileData, setProfileData] = useState(initialProfileData);
    const [modalType, setModalType] = useState<ModalType>(null);
    const [editingSocial, setEditingSocial] = useState<SocialType | null>(null);
    const [socialInput, setSocialInput] = useState("");
    const [selectedInterests, setSelectedInterests] = useState<string[]>(initialProfileData?.interests || []);
    const [notifications, setNotifications] = useState({
        claimStatus: initialProfileData?.notifications?.claimStatus ?? true,
        leaderboardChanges: initialProfileData?.notifications?.leaderboardChanges ?? true,
        weeklyDigest: initialProfileData?.notifications?.weeklyDigest ?? false,
        newAchievements: initialProfileData?.notifications?.newAchievements ?? true,
    });

    const handleConnectWallet = async () => {
        setConnecting(true);
        try {
            await connectWallet();
        } catch (error) {
            console.error('Failed to connect wallet:', error);
        } finally {
            setConnecting(false);
        }
    };

    const openSocialModal = (type: SocialType) => {
        setEditingSocial(type);
        setSocialInput(profileData?.[type] || "");
        setModalType('social');
    };

    const saveSocialProfile = () => {
        const updatedProfile = {
            ...profileData,
            [editingSocial!]: socialInput.trim()
        };
        setProfileData(updatedProfile);
        sessionStorage.setItem('claims-user-profile', JSON.stringify(updatedProfile));
        closeModal();
    };

    const openInterestsModal = () => {
        setSelectedInterests(profileData?.interests || []);
        setModalType('interests');
    };

    const toggleInterest = (interestId: string) => {
        setSelectedInterests(prev => {
            if (prev.includes(interestId)) {
                return prev.filter(i => i !== interestId);
            }
            return [...prev, interestId];
        });
    };

    const saveInterests = () => {
        const updatedProfile = {
            ...profileData,
            interests: selectedInterests
        };
        setProfileData(updatedProfile);
        sessionStorage.setItem('claims-user-profile', JSON.stringify(updatedProfile));
        closeModal();
    };

    const openNotificationsModal = () => {
        setNotifications(profileData?.notifications || {
            claimStatus: true,
            leaderboardChanges: true,
            weeklyDigest: false,
            newAchievements: true,
        });
        setModalType('notifications');
    };

    const toggleNotification = (key: keyof typeof notifications) => {
        setNotifications(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const saveNotifications = () => {
        const updatedProfile = {
            ...profileData,
            notifications
        };
        setProfileData(updatedProfile);
        sessionStorage.setItem('claims-user-profile', JSON.stringify(updatedProfile));
        closeModal();
    };

    const closeModal = () => {
        setModalType(null);
        setEditingSocial(null);
        setSocialInput("");
    };

    const userEmail = email || oauthUser?.email || profileData?.email || '';
    const hasWallet = !!walletAddress;

    return (
        <div className="app-page">
            <AppNav />

            <div className="app-container">
                <div className="app-header">
                    <h1 className="app-title">Your Profile</h1>
                    <p className="app-subtitle">Manage your account information</p>
                </div>

                {/* Wallet Info Box */}
                {!hasWallet && (
                    <div className="info-box">
                        <span className="info-box-icon">💡</span>
                        <span className="info-box-text">
                            Connect your wallet to vote on claims and earn rewards
                        </span>
                        <button
                            className="info-box-action"
                            onClick={handleConnectWallet}
                            disabled={connecting}
                        >
                            {connecting ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    </div>
                )}

                {/* Wallet Card (if no wallet) */}
                {!hasWallet && (
                    <div className="wallet-card">
                        <div className="wallet-card-icon">🔗</div>
                        <div className="wallet-card-title">No Wallet Connected</div>
                        <p className="wallet-card-text">
                            Connect your Ethereum wallet to participate in voting and earn VRT tokens
                        </p>
                        <button
                            className="wallet-connect-btn"
                            onClick={handleConnectWallet}
                            disabled={connecting}
                        >
                            {connecting ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    </div>
                )}

                {/* Profile Info Card */}
                <div className="app-card">
                    <div className="app-card-header">
                        <h2 className="app-card-title">Account Information</h2>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">Full Name</span>
                        <span className="profile-value">
                            {user.displayName || profileData?.displayName || 'Not set'}
                        </span>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">Email</span>
                        <span className="profile-value">
                            {userEmail || 'Not set'}
                        </span>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">Auth Method</span>
                        <span className="profile-value">
                            {authType === 'email' ? 'Email & Password' :
                                authType === 'oauth' ? 'Google OAuth' :
                                    authType === 'wallet' ? 'Wallet' : 'Unknown'}
                        </span>
                    </div>

                    {hasWallet && (
                        <div className="profile-row">
                            <span className="profile-label">Wallet Address</span>
                            <span className="profile-value" style={{ fontFamily: 'monospace' }}>
                                {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Social Profiles Card */}
                <div className="app-card">
                    <div className="app-card-header">
                        <h2 className="app-card-title">Social Profiles</h2>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">Reddit</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {profileData?.reddit ? (
                                <>
                                    <span className="profile-value">u/{profileData.reddit}</span>
                                    <button className="profile-action" onClick={() => openSocialModal('reddit')}>Edit</button>
                                </>
                            ) : (
                                <>
                                    <span className="profile-value empty">Not connected</span>
                                    <button className="profile-action" onClick={() => openSocialModal('reddit')}>+ Add</button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">X / Twitter</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {profileData?.twitter ? (
                                <>
                                    <span className="profile-value">@{profileData.twitter}</span>
                                    <button className="profile-action" onClick={() => openSocialModal('twitter')}>Edit</button>
                                </>
                            ) : (
                                <>
                                    <span className="profile-value empty">Not connected</span>
                                    <button className="profile-action" onClick={() => openSocialModal('twitter')}>+ Add</button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="profile-row">
                        <span className="profile-label">Farcaster</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {profileData?.farcaster ? (
                                <>
                                    <span className="profile-value">@{profileData.farcaster}</span>
                                    <button className="profile-action" onClick={() => openSocialModal('farcaster')}>Edit</button>
                                </>
                            ) : (
                                <>
                                    <span className="profile-value empty">Not connected</span>
                                    <button className="profile-action" onClick={() => openSocialModal('farcaster')}>+ Add</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Interests Card */}
                <div className="app-card">
                    <div className="app-card-header">
                        <h2 className="app-card-title">Interests</h2>
                        <button className="profile-action" onClick={openInterestsModal}>Edit</button>
                    </div>
                    {profileData?.interests && profileData.interests.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {profileData.interests.map((interest: string) => (
                                <span
                                    key={interest}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        padding: '0.4rem 1rem',
                                        fontSize: '0.85rem',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {interest}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'rgba(255,255,255,0.5)' }}>No interests selected. Click Edit to add some.</p>
                    )}
                </div>

                {/* Notification Settings Card */}
                <div className="app-card">
                    <div className="app-card-header">
                        <h2 className="app-card-title">Notification Settings</h2>
                        <button className="profile-action" onClick={openNotificationsModal}>Edit</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        {NOTIFICATION_OPTIONS.filter(opt =>
                            profileData?.notifications?.[opt.id as keyof typeof notifications]
                        ).map(opt => (
                            <span
                                key={opt.id}
                                style={{
                                    background: 'rgba(34, 197, 94, 0.1)',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    color: '#22c55e',
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.85rem',
                                }}
                            >
                                ✓ {opt.label}
                            </span>
                        ))}
                        {NOTIFICATION_OPTIONS.filter(opt =>
                            !profileData?.notifications?.[opt.id as keyof typeof notifications]
                        ).map(opt => (
                            <span
                                key={opt.id}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: 'rgba(255,255,255,0.4)',
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.85rem',
                                }}
                            >
                                {opt.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal Overlay */}
            {modalType && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        {/* Social Profile Modal */}
                        {modalType === 'social' && editingSocial && (
                            <>
                                <div className="modal-header">
                                    <h3 className="modal-title">
                                        {editingSocial === 'reddit' ? 'Reddit Profile' :
                                            editingSocial === 'twitter' ? 'X / Twitter Profile' :
                                                'Farcaster Profile'}
                                    </h3>
                                    <button className="modal-close" onClick={closeModal}>✕</button>
                                </div>
                                <div className="modal-body">
                                    <label className="form-label">
                                        {editingSocial === 'reddit' ? 'Reddit Username (without u/)' :
                                            editingSocial === 'twitter' ? 'X/Twitter Handle (without @)' :
                                                'Farcaster Handle (without @)'}
                                    </label>
                                    <input
                                        type="text"
                                        className="modal-input"
                                        placeholder={
                                            editingSocial === 'reddit' ? 'username' :
                                                editingSocial === 'twitter' ? 'handle' :
                                                    'handle'
                                        }
                                        value={socialInput}
                                        onChange={(e) => setSocialInput(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-btn secondary" onClick={closeModal}>Cancel</button>
                                    <button className="modal-btn primary" onClick={saveSocialProfile}>Save</button>
                                </div>
                            </>
                        )}

                        {/* Interests Modal */}
                        {modalType === 'interests' && (
                            <>
                                <div className="modal-header">
                                    <h3 className="modal-title">Edit Interests</h3>
                                    <button className="modal-close" onClick={closeModal}>✕</button>
                                </div>
                                <div className="modal-body">
                                    <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                        Select topics you're interested in (minimum 3)
                                    </p>
                                    <div className="interests-grid">
                                        {CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                className={`interest-btn ${selectedInterests.includes(cat.id) ? 'selected' : ''}`}
                                                onClick={() => toggleInterest(cat.id)}
                                            >
                                                {cat.label}
                                                {selectedInterests.includes(cat.id) && <span className="check">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-btn secondary" onClick={closeModal}>Cancel</button>
                                    <button
                                        className="modal-btn primary"
                                        onClick={saveInterests}
                                        disabled={selectedInterests.length < 3}
                                    >
                                        Save ({selectedInterests.length} selected)
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Notifications Modal */}
                        {modalType === 'notifications' && (
                            <>
                                <div className="modal-header">
                                    <h3 className="modal-title">Notification Settings</h3>
                                    <button className="modal-close" onClick={closeModal}>✕</button>
                                </div>
                                <div className="modal-body">
                                    <div className="notification-options">
                                        {NOTIFICATION_OPTIONS.map(opt => (
                                            <label key={opt.id} className="notification-option">
                                                <div className="notification-option-info">
                                                    <span className="notification-option-label">{opt.label}</span>
                                                    <span className="notification-option-desc">{opt.description}</span>
                                                </div>
                                                <div className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={notifications[opt.id as keyof typeof notifications]}
                                                        onChange={() => toggleNotification(opt.id as keyof typeof notifications)}
                                                    />
                                                    <span className="toggle-slider"></span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="modal-btn secondary" onClick={closeModal}>Cancel</button>
                                    <button className="modal-btn primary" onClick={saveNotifications}>Save</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
