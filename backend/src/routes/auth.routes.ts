import express from 'express';
import { Interests, NotifType } from '../generated/prisma/index.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config/env.config.js';
import prisma from '../config/db.config.js';

const router = express.Router();

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';
const SALT_ROUNDS = 12;

// Password validation: at least 1 uppercase, 1 lowercase, 1 special character
const validatePassword = (password: string): { valid: boolean; message: string } => {
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 lowercase letter' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 special character' };
    }
    return { valid: true, message: '' };
};

/**
 * POST /api/auth/register
 * Traditional email/password registration
 * 
 * Body:
 * - fullName: string (required)
 * - email: string (required)
 * - password: string (required)
 * - confirmPassword: string (required)
 */
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;

        // Validation
        if (!fullName || !email || !password || !confirmPassword) {
            return res.status(400).json({
                error: 'All fields are required',
                fields: ['fullName', 'email', 'password', 'confirmPassword']
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Invalid email format',
                field: 'email'
            });
        }

        // Password match check
        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match',
                field: 'confirmPassword'
            });
        }

        // Password strength validation
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: passwordValidation.message,
                field: 'password'
            });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return res.status(409).json({
                error: 'Email already registered',
                field: 'email'
            });
        }

        // Hash password with salt (bcrypt automatically generates salt)
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                full_name: fullName,
                email: email.toLowerCase(),
                password_hash: passwordHash,
                reputation_score: 0
            }
        });

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                authType: 'email'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`✅ User registered with email: ${user.email} (ID: ${user.id})`);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                reputationScore: user.reputation_score
            },
            token,
            needsOnboarding: true
        });

    } catch (error: any) {
        console.error('Registration error:', error);

        if (error.code === 'P2002') {
            return res.status(409).json({
                error: 'Email already registered',
                field: 'email'
            });
        }

        res.status(500).json({
            error: 'Failed to register user',
            message: error.message
        });
    }
});

/**
 * POST /api/auth/login
 * Traditional email/password login
 * 
 * Body:
 * - email: string (required)
 * - password: string (required)
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                fields: ['email', 'password']
            });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Check if user has a password (might be wallet-only user)
        if (!user.password_hash) {
            return res.status(401).json({
                error: 'This account uses wallet authentication. Please connect your wallet to log in.'
            });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                authType: 'email'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`✅ User logged in: ${user.email} (ID: ${user.id})`);

        // Check if user has completed onboarding (has interests set)
        const hasOnboarded = user.interests && user.interests.length > 0;

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                walletAddress: user.wallet_address,
                interests: user.interests,
                reputationScore: user.reputation_score
            },
            token,
            needsOnboarding: !hasOnboarded
        });

    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Failed to log in',
            message: error.message
        });
    }
});

/**
 * POST /api/auth/signup
 * User onboarding - creates or updates user in database
 * 
 * Body:
 * - authType: 'wallet' | 'oauth' | 'email'
 * - walletAddress: string (required for wallet auth)
 * - email: string (optional for wallet, from Clerk for oauth)
 * - name: string
 * - displayName: string  
 * - redditHandle: string
 * - xHandle: string
 * - farcasterHandle: string
 * - interests: string[] (frontend interest IDs)
 * - notifType: string
 */
router.post('/signup', async (req, res) => {
    try {
        const {
            authType,
            walletAddress,
            email,
            name,
            displayName,
            redditHandle,
            xHandle,
            farcasterHandle,
            interests = [],
            notifType: notifTypeStr
        } = req.body;

        // Validation - need either wallet or email
        if (!walletAddress && !email) {
            return res.status(400).json({
                error: 'Either wallet address or email is required',
                field: 'walletAddress'
            });
        }

        // Map frontend interests to Prisma enum
        const mappedInterests: Interests[] = interests.map((interest: string) => {
            const mapping: Record<string, Interests> = {
                'politics': Interests.politics,
                'health': Interests.health,
                'finance': Interests.finance,
                'tech': Interests.tech,
                'sports': Interests.sports,
                'misc': Interests.misc,
                // Legacy mappings
                'science': Interests.misc,
                'technology': Interests.tech,
                'healthcare': Interests.health,
                'arts': Interests.misc
            };
            return mapping[interest.toLowerCase()] || Interests.misc;
        });

        // Map notifType string to enum
        let notifType: NotifType = NotifType.standard;
        if (notifTypeStr) {
            const notifMapping: Record<string, NotifType> = {
                'none': NotifType.none,
                'important_only': NotifType.important_only,
                'standard': NotifType.standard,
                'frequent': NotifType.frequent
            };
            notifType = notifMapping[notifTypeStr] || NotifType.standard;
        }

        // Clean profile URLs
        const redditProfile = redditHandle ? redditHandle.replace(/^u\//, '') : null;
        const xProfile = xHandle ? xHandle.replace(/^@/, '') : null;
        const farcasterProfile = farcasterHandle ? farcasterHandle.replace(/^@/, '') : null;

        // Determine unique identifier for upsert
        let user;

        if (walletAddress) {
            // Upsert by wallet address
            user = await prisma.user.upsert({
                where: {
                    wallet_address: walletAddress.toLowerCase()
                },
                update: {
                    full_name: displayName || name || null,
                    email: email?.toLowerCase() || null,
                    reddit_profile: redditProfile,
                    x_profile: xProfile,
                    farcaster_profile: farcasterProfile,
                    interests: mappedInterests,
                    notif_type: notifType,
                    updated_at: new Date()
                },
                create: {
                    wallet_address: walletAddress.toLowerCase(),
                    full_name: displayName || name || null,
                    email: email?.toLowerCase() || null,
                    reddit_profile: redditProfile,
                    x_profile: xProfile,
                    farcaster_profile: farcasterProfile,
                    interests: mappedInterests,
                    notif_type: notifType,
                    reputation_score: 0
                }
            });
        } else if (email) {
            // Update existing email user with onboarding data
            user = await prisma.user.update({
                where: {
                    email: email.toLowerCase()
                },
                data: {
                    full_name: displayName || name || null,
                    reddit_profile: redditProfile,
                    x_profile: xProfile,
                    farcaster_profile: farcasterProfile,
                    interests: mappedInterests,
                    notif_type: notifType,
                    updated_at: new Date()
                }
            });
        }

        if (!user) {
            return res.status(400).json({
                error: 'Failed to create or update user'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                walletAddress: user.wallet_address,
                email: user.email,
                authType
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`✅ User onboarded: ${user.wallet_address || user.email} (ID: ${user.id})`);

        res.status(201).json({
            success: true,
            message: 'User onboarded successfully',
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                fullName: user.full_name,
                email: user.email,
                interests: user.interests,
                reputationScore: user.reputation_score
            },
            token
        });

    } catch (error: any) {
        console.error('Signup error:', error);

        if (error.code === 'P2002') {
            return res.status(409).json({
                error: 'Wallet address or email already registered',
                field: 'walletAddress'
            });
        }

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'User not found. Please register first.',
                field: 'email'
            });
        }

        res.status(500).json({
            error: 'Failed to create user',
            message: error.message
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile (requires auth)
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                wallet_address: true,
                full_name: true,
                email: true,
                reddit_profile: true,
                x_profile: true,
                farcaster_profile: true,
                interests: true,
                notif_type: true,
                reputation_score: true,
                created_at: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user
        });

    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }

        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});

/**
 * POST /api/auth/verify-wallet
 * Verify wallet ownership (optional enhancement)
 */
router.post('/verify-wallet', async (req, res) => {
    const { walletAddress } = req.body;

    if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address required' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { wallet_address: walletAddress.toLowerCase() }
        });

        if (user) {
            // Generate JWT for existing user
            const token = jwt.sign(
                {
                    userId: user.id,
                    walletAddress: user.wallet_address
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                exists: true,
                needsOnboarding: false,
                user: {
                    id: user.id,
                    walletAddress: user.wallet_address,
                    fullName: user.full_name
                },
                token
            });
        } else {
            res.json({
                success: true,
                exists: false,
                needsOnboarding: true
            });
        }
    } catch (error: any) {
        console.error('Verify wallet error:', error);
        res.status(500).json({ error: 'Failed to verify wallet' });
    }
});

export default router;

