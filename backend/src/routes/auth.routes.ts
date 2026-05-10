import express from 'express';
import { Interests, NotifType } from '../generated/prisma/index.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import prisma from '../config/db.config.js';

const router = express.Router();

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';

// POST /api/auth/verify-wallet
// looks up or creates a user by wallet address, returns a jwt
router.post('/verify-wallet', async (req, res) => {
    const { walletAddress } = req.body;

    if (!walletAddress) {
        return res.status(400).json({ error: 'wallet address required' });
    }

    try {
        let user = await prisma.user.findUnique({
            where: { wallet_address: walletAddress.toLowerCase() }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    wallet_address: walletAddress.toLowerCase(),
                    reputation_score: 0
                }
            });
        }

        const token = jwt.sign(
            { userId: user.id, walletAddress: user.wallet_address },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            exists: true,
            needsOnboarding: !user.full_name,
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                fullName: user.full_name,
                reputationScore: user.reputation_score
            },
            token
        });

    } catch (error: any) {
        console.error('verify-wallet error:', error);
        res.status(500).json({ error: 'failed to verify wallet' });
    }
});

// POST /api/auth/signup
// onboarding -- attaches profile data to an existing wallet user
router.post('/signup', async (req, res) => {
    try {
        const {
            walletAddress,
            name,
            displayName,
            redditHandle,
            xHandle,
            farcasterHandle,
            interests = [],
            notifType: notifTypeStr
        } = req.body;

        if (!walletAddress) {
            return res.status(400).json({ error: 'wallet address required' });
        }

        const mappedInterests: Interests[] = interests.map((interest: string) => {
            const mapping: Record<string, Interests> = {
                politics: Interests.politics,
                health: Interests.health,
                finance: Interests.finance,
                tech: Interests.tech,
                sports: Interests.sports,
                misc: Interests.misc,
                science: Interests.misc,
                technology: Interests.tech,
                healthcare: Interests.health,
                arts: Interests.misc
            };
            return mapping[interest.toLowerCase()] || Interests.misc;
        });

        const notifMapping: Record<string, NotifType> = {
            none: NotifType.none,
            important_only: NotifType.important_only,
            standard: NotifType.standard,
            frequent: NotifType.frequent
        };
        const notifType: NotifType = notifMapping[notifTypeStr] || NotifType.standard;

        const user = await prisma.user.upsert({
            where: { wallet_address: walletAddress.toLowerCase() },
            update: {
                full_name: displayName || name || null,
                reddit_profile: redditHandle?.replace(/^u\//, '') || null,
                x_profile: xHandle?.replace(/^@/, '') || null,
                farcaster_profile: farcasterHandle?.replace(/^@/, '') || null,
                interests: mappedInterests,
                notif_type: notifType,
                updated_at: new Date()
            },
            create: {
                wallet_address: walletAddress.toLowerCase(),
                full_name: displayName || name || null,
                reddit_profile: redditHandle?.replace(/^u\//, '') || null,
                x_profile: xHandle?.replace(/^@/, '') || null,
                farcaster_profile: farcasterHandle?.replace(/^@/, '') || null,
                interests: mappedInterests,
                notif_type: notifType,
                reputation_score: 0
            }
        });

        const token = jwt.sign(
            { userId: user.id, walletAddress: user.wallet_address },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                fullName: user.full_name,
                interests: user.interests,
                reputationScore: user.reputation_score
            },
            token
        });

    } catch (error: any) {
        console.error('signup error:', error);

        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'wallet address already registered' });
        }

        res.status(500).json({ error: 'failed to create user' });
    }
});

export default router;
