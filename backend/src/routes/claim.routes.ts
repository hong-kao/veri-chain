import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { orchestrator } from '../agents/resultAgentOrchestrator.js';
import prisma from '../config/db.config.js';
import { env } from '../config/env.config.js';

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';

const router = express.Router();

// configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/quicktime'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and videos are allowed.'));
        }
    }
});

/**
 * POST /api/claims/submit
 * Submit a claim for verification (with optional media files)
 * 
 * Body (multipart/form-data):
 * - claim: string (required) - The claim text
 * - claimType: 'SCIENTIFIC' | 'POLITICAL' | 'HEALTH' | 'FINANCIAL' | 'OTHER'
 * - platform: string (optional) - Source platform (twitter, facebook, etc.)
 * - platformUrl: string (optional) - URL to original post
 * - images: file[] (optional) - Image files
 * - videos: file[] (optional) - Video files
 * - submitterId: number (optional) - User ID (defaults to 1)
 */
router.post('/submit', upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'videos', maxCount: 3 }
]), async (req, res) => {
    try {
        // Extract user ID from JWT token
        const authHeader = req.headers.authorization;
        let userId = 1; // Fallback default

        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.substring(7);
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                userId = decoded.userId;
                console.log(`🔐 Authenticated user ID: ${userId}`);
            } catch (err) {
                console.warn('⚠️ Invalid token, using default submitterId');
            }
        } else {
            console.warn('⚠️ No auth token provided, using default submitterId');
        }

        const {
            claim,
            claimType = 'OTHER',
            platform,
            platformUrl,
            platformAuthor,
            onchainTxHash,
            claimHash
        } = req.body;

        // Validation
        if (!claim || claim.trim().length === 0) {
            return res.status(400).json({
                error: 'Claim text is required',
                field: 'claim'
            });
        }

        if (claim.length > 5000) {
            return res.status(400).json({
                error: 'Claim must be less than 5000 characters',
                field: 'claim'
            });
        }

        console.log(`📝 Received claim: "${claim.substring(0, 80)}..."`);

        // Extract file paths
        const files = req.files as { images?: Express.Multer.File[], videos?: Express.Multer.File[] };
        const imageUrls = files?.images?.map(f => `/uploads/${f.filename}`) || [];
        const videoUrls = files?.videos?.map(f => `/uploads/${f.filename}`) || [];

        console.log(`📎 Attachments: ${imageUrls.length} images, ${videoUrls.length} videos`);

        // Determine ClaimType based on content
        let derivedClaimType = 'text';
        const hasImages = imageUrls.length > 0;
        const hasVideos = videoUrls.length > 0;
        const hasLinks = extractUrls(claim).length > 0;

        if (hasVideos) {
            derivedClaimType = hasImages || hasLinks ? 'mixed' : 'video';
        } else if (hasImages) {
            derivedClaimType = hasLinks ? 'mixed' : 'image';
        } else if (hasLinks) {
            derivedClaimType = 'link';
        }

        // Create claim input
        const claimInput = {
            submitterId: userId,  // Use extracted userId from JWT
            rawInput: claim,
            normalizedText: claim.trim(),
            claimType: derivedClaimType,
            platform: platform || null,
            platformUrl: platformUrl || null,
            platformAuthor: platformAuthor || null,
            extractedUrls: extractUrls(claim),
            mediaImages: imageUrls,
            mediaVideos: videoUrls,
            onchainTxHash: onchainTxHash || null,  // User-provided on-chain tx hash
            claimHash: claimHash || null            // User-provided claim hash
        };

        try {
            const claimId = await orchestrator.registerClaim(claimInput);

            // fire-and-forget background pipeline
            processClaimBackground(claimId).catch(err => {
                console.error(`background processing failed for claim ${claimId}:`, err);
            });

            return res.status(201).json({
                success: true,
                claimId,
                status: 'processing',
                message: 'claim submitted. ai analysis in progress.',
                pollingUrl: `/api/claims/${claimId}/status`
            });
        } catch (error: any) {
            console.error('orchestrator error:', error);
            return res.status(500).json({
                error: 'failed to process claim',
                details: error.message
            });
        }

    } catch (error: any) {
        console.error('Error in /submit:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/claims
 * Get all claims (for View Claims page)
 */
router.get('/', async (req, res) => {
    try {
        const claims = await prisma.claim.findMany({
            orderBy: {
                created_at: 'desc'
            },
            select: {
                id: true,
                normalized_text: true,
                claim_type: true,
                ai_verdict: true,
                ai_confidence: true,
                final_verdict: true,
                status: true,
                created_at: true,
                updated_at: true,
                submitter_id: true
            }
        });

        res.json({
            success: true,
            claims: claims.map(claim => ({
                id: claim.id,
                statement: claim.normalized_text,
                category: claim.claim_type,
                verdict: claim.final_verdict || claim.ai_verdict,
                confidence: claim.ai_confidence
                    ? (claim.ai_confidence > 1
                        ? Math.round(claim.ai_confidence)  // Already a percentage (0-100)
                        : Math.round(claim.ai_confidence * 100))  // Convert from 0-1 to percentage
                    : null,
                status: claim.status,
                submittedAt: claim.created_at,
                resolvedAt: claim.updated_at,
                submitter_id: claim.submitter_id
            }))
        });
    } catch (error: any) {
        console.error('Error fetching claims:', error);
        res.status(500).json({
            error: 'Failed to fetch claims',
            message: error.message
        });
    }
});

/**
 * GET /api/claims/:claimId/status
 * Get the current status and results of a claim
 */
router.get('/:id/status', async (req, res) => {
    try {
        const claimId = parseInt(req.params.id);

        if (isNaN(claimId)) {
            return res.status(400).json({ error: 'Invalid claim ID' });
        }

        // Fetch claim from database
        const claim = await prisma.claim.findUnique({
            where: { id: claimId },
            include: {
                agent_results: true,
                voting_sessions: true
            }
        });

        if (!claim) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        // Determine current status
        let status = 'processing';
        let aiVerdict = claim.ai_verdict || null;
        let finalVerdict = claim.final_verdict || null;
        let confidence = claim.ai_confidence ?? null;

        if (claim.final_verdict) {
            status = 'completed';
        } else if (claim.ai_verdict) {
            status = claim.voting_sessions.length > 0 ? 'voting' : 'ai_complete';
        }

        res.json({
            success: true,
            claimId,
            status,
            claim: {
                text: claim.normalized_text,
                type: claim.claim_type,
                platform: claim.platform,
                submittedAt: claim.created_at
            },
            results: {
                aiVerdict,
                aiConfidence: confidence,
                finalVerdict,
                agentResults: claim.agent_results.map((ar: any) => ({
                    agent: ar.agent_name,
                    verdict: ar.verdict,
                    confidence: ar.confidence,
                    completedAt: ar.created_at
                }))
            },
            voting: claim.voting_sessions.length > 0 ? {
                sessionId: claim.voting_sessions[0].id,
                status: claim.voting_sessions[0].status,
                closesAt: claim.voting_sessions[0].closes_at
            } : null
        });

    } catch (error: any) {
        console.error('Error in /status:', error);
        res.status(500).json({
            error: 'Failed to fetch claim status',
            message: error.message
        });
    }
});

/**
 * GET /api/claims/:claimId
 * Get full claim details including agent analysis breakdown
 */
router.get('/:claimId', async (req, res) => {
    try {
        const claimId = parseInt(req.params.claimId);

        if (isNaN(claimId)) {
            return res.status(400).json({ error: 'Invalid claim ID' });
        }

        const claim = await prisma.claim.findUnique({
            where: { id: claimId },
            include: {
                agent_results: {
                    orderBy: { created_at: 'asc' }
                },
                voting_sessions: {
                    include: {
                        votes: {
                            include: {
                                voter: {
                                    select: {
                                        id: true,
                                        wallet_address: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!claim) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        res.json({
            success: true,
            data: claim
        });

    } catch (error: any) {
        console.error('Error in GET /:claimId:', error);
        res.status(500).json({
            error: 'Failed to fetch claim',
            message: error.message
        });
    }
});

/**
 * Helper: Extract URLs from claim text
 */
function extractUrls(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

/**
 * Helper: Background processing of claim through all agents
 */
async function processClaimBackground(claimId: number) {
    try {
        // phase 2: run analysis agents
        await orchestrator.runAnalysisAgents(claimId);

        // phase 3: aggregate + score
        await orchestrator.runAggregation(claimId);

        // phase 4: route to ai-only or community vote
        await orchestrator.routeClaim(claimId);

        console.log(`✅ Background processing completed for claim ${claimId}`);

    } catch (error: any) {
        console.error(`❌ Background processing failed for claim ${claimId}:`, error);

        // Only mark claim as failed if no verdict was computed yet
        // Don't overwrite a valid verdict just because on-chain publishing failed
        try {
            const existingClaim = await prisma.claim.findUnique({
                where: { id: claimId },
                select: { ai_verdict: true, ai_confidence: true, final_verdict: true }
            });

            // Only set to unclear if no verdict exists at all
            // IMPORTANT: UNCLEAR IS a valid verdict! Only overwrite if null/undefined
            const hasValidVerdict = existingClaim?.ai_verdict &&
                existingClaim.ai_confidence !== null &&
                existingClaim.ai_confidence !== undefined;

            if (!hasValidVerdict) {
                await prisma.claim.update({
                    where: { id: claimId },
                    data: {
                        ai_verdict: 'unclear',
                        ai_confidence: 0,
                        final_verdict: 'unclear',
                        final_confidence: 0
                    }
                });
                console.log(`  → Marked claim ${claimId} as unclear (no valid verdict was computed)`);
            } else {
                // Verdict was computed successfully, just log the error
                console.log(`  → Claim ${claimId} already has verdict: ${existingClaim.ai_verdict} (${Math.round((existingClaim.ai_confidence || 0) * 100)}% confidence)`);
                console.log(`  → On-chain publishing failed but verdict is preserved`);

                // If final_verdict wasn't set, copy from ai_verdict INCLUDING the confidence
                if (!existingClaim.final_verdict) {
                    await prisma.claim.update({
                        where: { id: claimId },
                        data: {
                            final_verdict: existingClaim.ai_verdict,
                            final_confidence: existingClaim.ai_confidence,  // FIXED: Also copy confidence!
                            status: 'resolved'
                        }
                    });
                    console.log(`  → Set final_verdict from ai_verdict (confidence: ${Math.round((existingClaim.ai_confidence || 0) * 100)}%)`);
                }
            }
        } catch (dbError) {
            console.error('Failed to update claim with error status:', dbError);
        }
    }
}

// POST /api/claims/:id/process
// triggered internally by the mcp server after submit_to_verichain creates a claim
router.post('/:id/process', async (req, res) => {
    const claimId = parseInt(req.params.id);
    if (isNaN(claimId)) return res.status(400).json({ error: 'invalid claim id' });

    const claim = await prisma.claim.findUnique({ where: { id: claimId }, select: { id: true, status: true } });
    if (!claim) return res.status(404).json({ error: `claim ${claimId} not found` });
    if (claim.status !== 'pending_ai') {
        return res.status(409).json({ error: 'claim is not in pending_ai state', status: claim.status });
    }

    // fire-and-forget
    processClaimBackground(claimId).catch(err => {
        console.error(`mcp-triggered pipeline failed for claim ${claimId}:`, err);
    });

    return res.status(202).json({ accepted: true, claimId, message: 'pipeline started' });
});

export default router;
