import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import ResultOrchestrator from '../agents/resultAgentOrchestrator.js';
import prisma from '../config/db.config.js';
import { env } from '../config/env.config.js';

const JWT_SECRET = env.JWT_SECRET || 'verichain-secret-fallback';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow images and videos
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

// Initialize Orchestrator (only if blockchain env vars exist)
let orchestrator: ResultOrchestrator | null = null;
if (env.RPC_URL && env.PRIVATE_KEY) {
    try {
        orchestrator = new ResultOrchestrator(
            env.RPC_URL,
            env.PRIVATE_KEY
        );
        console.log('✅ ResultOrchestrator initialized with blockchain');
    } catch (error) {
        console.warn('⚠️  ResultOrchestrator init failed, running in AI-only mode:', error);
    }
}

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
            platformAuthor
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
            mediaVideos: videoUrls
        };

        if (orchestrator) {
            // Full orchestrator flow (with blockchain)
            try {
                const claimId = await orchestrator.processClaimIntake(claimInput);

                console.log(`✅ Claim ${claimId} created, starting background processing...`);

                // Start background processing (don't await - let it run in background)
                processClaimBackground(claimId, orchestrator).catch(err => {
                    console.error(`❌ Background processing failed for claim ${claimId}:`, err);
                });

                return res.status(201).json({
                    success: true,
                    claimId,
                    status: 'processing',
                    message: 'Claim submitted successfully. AI analysis in progress.',
                    pollingUrl: `/api/claims/${claimId}/status`
                });
            } catch (error: any) {
                console.error('Orchestrator error:', error);
                return res.status(500).json({
                    error: 'Failed to process claim with orchestrator',
                    details: error.message
                });
            }
        } else {
            // AI-only mode (no blockchain) - direct agent calls
            return res.status(501).json({
                error: 'Orchestrator not configured',
                message: 'Please configure RPC_URL and PRIVATE_KEY in .env for full functionality',
                receivedClaim: claim.substring(0, 100)
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
        let aiVerdict = null;
        let finalVerdict = null;
        let confidence = null;

        if (claim.final_verdict) {
            status = 'completed';
            finalVerdict = claim.final_verdict;
        } else if (claim.ai_verdict) {
            status = claim.voting_sessions.length > 0 ? 'voting' : 'ai_complete';
            aiVerdict = claim.ai_verdict;
            confidence = claim.ai_confidence;
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
async function processClaimBackground(claimId: number, orch: ResultOrchestrator) {
    try {
        console.log(`🚀 Starting background processing for claim ${claimId}...`);

        // Phase 2: Run Analysis Agents (textForensics, citation, sourceCred, social, media, pattern)
        await orch.runAnalysisAgents(claimId);
        console.log(`  ✓ Phase 2: Analysis agents completed`);

        // Phase 3: Aggregation & Scoring
        await orch.runAggregation(claimId);
        console.log(`  ✓ Phase 3: Aggregation completed`);

        // Phase 4: Routing (AI-only or community voting)
        await orch.routeClaim(claimId);
        console.log(`  ✓ Phase 4: Routing completed`);

        console.log(`✅ Background processing completed for claim ${claimId}`);

    } catch (error: any) {
        console.error(`❌ Background processing failed for claim ${claimId}:`, error);

        // Mark claim as failed in DB
        try {
            await prisma.claim.update({
                where: { id: claimId },
                data: {
                    ai_verdict: 'unclear',
                    ai_confidence: 0,
                    final_verdict: 'unclear'
                }
            });
        } catch (dbError) {
            console.error('Failed to update claim with error status:', dbError);
        }
    }
}

export default router;
