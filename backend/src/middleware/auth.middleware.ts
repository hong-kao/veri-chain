import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../generated/prisma/index.js';
import { env } from '../config/env.config.js';
import prisma from '../config/db.config.js';

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number;
                walletAddress?: string | null;
                email?: string | null;
                fullName?: string | null;
            };
        }
    }
}

/**
 * Auth Middleware - Verifies JWT token and attaches user to request
 * Use this to protect routes that require authentication
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify JWT
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // Fetch user from database
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                wallet_address: true,
                email: true,
                full_name: true
            }
        });

        if (!user) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'User not found'
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            walletAddress: user.wallet_address,
            email: user.email,
            fullName: user.full_name
        };

        next();

    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token verification failed'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Please login again'
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            message: 'Internal server error'
        });
    }
};

/**
 * Optional Auth - Attaches user if token is present, but doesn't require it
 * Use for routes that work for both authenticated and unauthenticated users
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, JWT_SECRET) as any;

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    wallet_address: true,
                    email: true,
                    full_name: true
                }
            });

            if (user) {
                req.user = {
                    id: user.id,
                    walletAddress: user.wallet_address,
                    email: user.email,
                    fullName: user.full_name
                };
            }
        }

        next();

    } catch (error) {
        // Silently fail for optional auth
        next();
    }
};

export default { requireAuth, optionalAuth };

