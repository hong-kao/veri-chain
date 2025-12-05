import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FcGoogle } from "react-icons/fc";

import "./Auth.css";

// Password validation function
const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (password.length < 8) {
        errors.push("At least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("1 uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("1 lowercase letter");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push("1 special character");
    }

    return { valid: errors.length === 0, errors };
};

export default function Auth() {
    const navigate = useNavigate();
    const { connectWallet, loginWithOAuth, loginWithEmail, registerWithEmail } = useAuth();

    const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Login form state
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    // Signup form state
    const [signupFullName, setSignupFullName] = useState("");
    const [signupEmail, setSignupEmail] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Password validation state
    const passwordValidation = validatePassword(signupPassword);
    const passwordsMatch = signupPassword === signupConfirmPassword;

    // Form validation
    const isLoginFormValid = loginEmail.trim() !== '' && loginPassword.trim() !== '';
    const isSignupFormValid = signupFullName.trim() !== '' && signupEmail.trim() !== '' && passwordValidation.valid && passwordsMatch;

    const handleWalletConnect = async () => {
        setLoading(true);
        setError("");

        try {
            console.log('🔗 Auth page: Initiating wallet connection...');
            await connectWallet();
            console.log('✅ Wallet connected successfully');
            navigate("/onboarding");
        } catch (err: any) {
            console.error('❌ Wallet connection error:', err);
            setError(err.message || "Failed to connect wallet. Please try again.");
            setLoading(false);
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const { needsOnboarding } = await loginWithEmail(loginEmail, loginPassword);

            if (needsOnboarding) {
                navigate("/onboarding");
            } else {
                navigate("/dashboard");
            }
        } catch (err: any) {
            console.error('❌ Login error:', err);
            setError(err.response?.data?.error || err.message || "Failed to login. Please try again.");
            setLoading(false);
        }
    };

    const handleEmailSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        // Validate password
        if (!passwordValidation.valid) {
            setError("Password does not meet requirements");
            setLoading(false);
            return;
        }

        // Check passwords match
        if (!passwordsMatch) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        try {
            await registerWithEmail(signupFullName, signupEmail, signupPassword, signupConfirmPassword);
            navigate("/onboarding");
        } catch (err: any) {
            console.error('❌ Signup error:', err);
            setError(err.response?.data?.error || err.message || "Failed to sign up. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="grain-bg"></div>

            <nav className="auth-nav">
                <a href="/" className="auth-nav-logo">
                    VeriChain
                </a>
                <div className="auth-nav-links">
                    <a href="/">Home</a>
                </div>
            </nav>

            <div className="auth-content">
                <div className="auth-header">
                    <h1 className="auth-main-title">Welcome to VeriChain</h1>
                    <p className="auth-subtitle">Connect your wallet or sign in to get started</p>
                </div>

                <div className="auth-modal">
                    {/* Tab Navigation */}
                    <div className="auth-tabs">
                        <button
                            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('login'); setError(''); }}
                        >
                            Log In
                        </button>
                        <button
                            className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('signup'); setError(''); }}
                        >
                            Sign Up
                        </button>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    {/* Login Form */}
                    {activeTab === 'login' && (
                        <form className="auth-form" onSubmit={handleEmailLogin}>
                            <div className="auth-form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    className="auth-input"
                                    placeholder="Enter your email"
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="auth-form-group">
                                <label>Password</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        className="auth-input"
                                        placeholder="Enter your password"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="auth-btn-primary"
                                disabled={loading || !isLoginFormValid}
                            >
                                {loading ? "LOGGING IN..." : "LOG IN"}
                            </button>
                        </form>
                    )}

                    {/* Signup Form */}
                    {activeTab === 'signup' && (
                        <form className="auth-form" onSubmit={handleEmailSignup}>
                            <div className="auth-form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    className="auth-input"
                                    placeholder="Enter your full name"
                                    value={signupFullName}
                                    onChange={(e) => setSignupFullName(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="auth-form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    className="auth-input"
                                    placeholder="Enter your email"
                                    value={signupEmail}
                                    onChange={(e) => setSignupEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="auth-form-group">
                                <label>Password</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        className="auth-input"
                                        placeholder="Create a password"
                                        value={signupPassword}
                                        onChange={(e) => setSignupPassword(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                    </button>
                                </div>

                                {/* Password Requirements */}
                                {signupPassword && (
                                    <div className="password-requirements">
                                        <div className={`requirement ${signupPassword.length >= 8 ? 'met' : ''}`}>
                                            ✓ At least 8 characters
                                        </div>
                                        <div className={`requirement ${/[A-Z]/.test(signupPassword) ? 'met' : ''}`}>
                                            ✓ 1 uppercase letter
                                        </div>
                                        <div className={`requirement ${/[a-z]/.test(signupPassword) ? 'met' : ''}`}>
                                            ✓ 1 lowercase letter
                                        </div>
                                        <div className={`requirement ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(signupPassword) ? 'met' : ''}`}>
                                            ✓ 1 special character
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="auth-form-group">
                                <label>Confirm Password</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="auth-input"
                                    placeholder="Confirm your password"
                                    value={signupConfirmPassword}
                                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                                {signupConfirmPassword && !passwordsMatch && (
                                    <div className="password-mismatch">Passwords do not match</div>
                                )}
                                {signupConfirmPassword && passwordsMatch && signupPassword && (
                                    <div className="password-match">Passwords match ✓</div>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="auth-btn-primary"
                                disabled={loading || !isSignupFormValid}
                            >
                                {loading ? "SIGNING UP..." : "SIGN UP"}
                            </button>
                        </form>
                    )}

                    <div className="auth-divider">
                        <span>OR</span>
                    </div>

                    <div className="wallet-options">
                        <button
                            className="wallet-option"
                            onClick={handleWalletConnect}
                            disabled={loading}
                        >
                            {loading ? "CONNECTING..." : "CONNECT WALLET"}
                        </button>
                    </div>

                    <div className="google-section">
                        <button
                            className="google-option"
                            onClick={() => loginWithOAuth('oauth_google')}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        >
                            <FcGoogle size={24} />
                            CONTINUE WITH GOOGLE
                        </button>
                    </div>
                </div>

                <div className="auth-footer">
                    <p>By connecting, you agree to our Terms of Service and Privacy Policy</p>
                </div>
            </div>
        </div>
    );
}
