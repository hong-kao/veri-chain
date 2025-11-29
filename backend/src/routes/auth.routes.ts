import express from 'express';
import { PrismaClient, Interests, NotifType } from '../generated/prisma/index.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';

/**
 * POST /api/auth/signup
 * User onboarding - creates or updates user in database
 * 
 * Body:
 * - authType: 'wallet' | 'oauth'
 * - walletAddress: string (required)
 * - email: string (optional for wallet, from Clerk for oauth)
 * - name: string
 * - displayName: string  
 * - bio: string
 * - redditHandle: string
 * - xHandle: string
 * - interests: string[] (frontend interest IDs)
 * - notifications: { claimStatus, leaderboardChanges, weeklyDigest, newAchievements }
 */
router.post('/signup', async (req, res) => {
    try {
        const {
            authType,
            walletAddress,
            email,
            name,
            displayName,
            bio,
            redditHandle,
            xHandle,
            interests = [],
            notifications = {}
        } = req.body;

        // Validation
        if (!walletAddress) {
            return res.status(400).json({
                error: 'Wallet address is required',
                field: 'walletAddress'
            });
        }

        // Map frontend interests to Prisma enum
        const mappedInterests: Interests[] = interests.map((interest: string) => {
            const mapping: Record<string, Interests> = {
                'science': Interests.misc,
                'technology': Interests.tech,
                'finance': Interests.finance,
                'healthcare': Interests.health,
                'sports': Interests.sports,
                'arts': Interests.misc
            };
            return mapping[interest.toLowerCase()] || Interests.misc;
        });

        // Map notifications to NotifType enum
        let notifType: NotifType = NotifType.standard;
        const notifCount = Object.values(notifications).filter(Boolean).length;

        if (notifCount === 0) {
            notifType = NotifType.none;
        } else if (notifCount === 1 && notifications.claimStatus) {
            notifType = NotifType.important_only;
        } else if (notifCount >= 3) {
            notifType = NotifType.frequent;
        } else {
            notifType = NotifType.standard;
        }

        // Clean profile URLs
        const redditProfile = redditHandle ? redditHandle.replace(/^u\//, '') : null;
        const xProfile = xHandle ? xHandle.replace(/^@/, '') : null;

        // Upsert user (create or update)
        const user = await prisma.user.upsert({
            where: {
                wallet_address: walletAddress.toLowerCase()
            },
            update: {
                full_name: displayName || name || null,
                email: email || null,
                reddit_profile: redditProfile,
                x_profile: xProfile,
                interests: mappedInterests,
                notif_type: notifType,
                updated_at: new Date()
            },
            create: {
                wallet_address: walletAddress.toLowerCase(),
                full_name: displayName || name || null,
                email: email || null,
                reddit_profile: redditProfile,
                x_profile: xProfile,
                interests: mappedInterests,
                notif_type: notifType,
                reputation_score: 0
            }
        });

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                walletAddress: user.wallet_address,
                authType
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`✅ User onboarded: ${user.wallet_address} (ID: ${user.id})`);

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
                error: 'Wallet address already registered',
                field: 'walletAddress'
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
