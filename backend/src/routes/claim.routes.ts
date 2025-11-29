import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import ResultOrchestrator from '../agents/resultAgentOrchestrator.js';
import { env } from '../config/env.config.js';

const router = express.Router();
const prisma = new PrismaClient();

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
        const {
            claim,
            claimType = 'OTHER',
            platform,
            platformUrl,
            platformAuthor,
            submitterId = 1
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

        // Create claim input
        const claimInput = {
            submitterId: parseInt(submitterId),
            rawInput: claim,
            normalizedText: claim.trim(),
            claimType,
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

                // Start background processing
                processClaimBackground(claimId, orchestrator);

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
router.get('/:claimId/status', async (req, res) => {
    try {
        const claimId = parseInt(req.params.claimId);

        if (isNaN(claimId)) {
            return res.status(400).json({ error: 'Invalid claim ID' });
        }

        // Fetch claim from database
        const claim = await prisma.claim.findUnique({
            where: { id: claimId },
            include: {
                agentResults: true,
                votingSession: true
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

        if (claim.finalVerdict) {
            status = 'completed';
            finalVerdict = claim.finalVerdict;
        } else if (claim.aiVerdict) {
            status = claim.votingSession ? 'voting' : 'ai_complete';
            aiVerdict = claim.aiVerdict;
            confidence = claim.aiConfidence;
        }

        res.json({
            success: true,
            claimId,
            status,
            claim: {
                text: claim.normalizedText,
                type: claim.claimType,
                platform: claim.platform,
                submittedAt: claim.createdAt
            },
            results: {
                aiVerdict,
                aiConfidence: confidence,
                finalVerdict,
                agentResults: claim.agentResults.map(ar => ({
                    agent: ar.agentType,
                    verdict: ar.verdict,
                    confidence: ar.confidence,
                    completedAt: ar.createdAt
                }))
            },
            voting: claim.votingSession ? {
                sessionId: claim.votingSession.id,
                totalVotes: claim.votingSession.totalVotes,
                votingEndsAt: claim.votingSession.votingEndsAt
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
                agentResults: {
                    orderBy: { createdAt: 'asc' }
                },
                votingSession: {
                    include: {
                        votes: {
                            include: {
                                voter: {
                                    select: {
                                        id: true,
                                        walletAddress: true
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
                    aiVerdict: 'UNCLEAR',
                    aiConfidence: 0,
                    finalVerdict: 'UNCLEAR'
                }
            });
        } catch (dbError) {
            console.error('Failed to update claim with error status:', dbError);
        }
    }
}

export default router;
