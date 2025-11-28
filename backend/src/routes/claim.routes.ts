import express from 'express';
import { ResultOrchestrator } from '../agents/resultAgentOrchestrator.js';
import { env } from '../config/env.config.js';

const router = express.Router();

// Initialize Orchestrator
const orchestrator = new ResultOrchestrator(
    env.RPC_URL,
    env.PRIVATE_KEY,
    env.CLAIM_REGISTRY_ADDRESS,
    env.STAKING_VOTING_ADDRESS
);

router.post('/submit', async (req, res) => {
    try {
        const {
            content,
            claimType = 'text',
            platform = 'other',
            platformId,
            platformAuthor,
            platformUrl,
            submitterId = 1 // Default to ID 1 for now if not provided (dev mode)
        } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        console.log(`📝 Received claim submission: "${content.substring(0, 50)}..."`);

        // 1. Process Intake (Synchronous - creates DB record)
        const claimId = await orchestrator.processClaimIntake({
            submitterId,
            rawInput: content,
            normalizedText: content, // In a real app, we might normalize this first
            claimType,
            platform,
            platformPostId: platformId,
            platformAuthor,
            platformUrl
        });

        // 2. Trigger Background Processing (Fire and Forget)
        // We don't await this so the user gets a response immediately
        (async () => {
            try {
                console.log(`🚀 Starting background processing for claim ${claimId}...`);

                // Phase 2: Analysis Agents
                await orchestrator.runAnalysisAgents(claimId);

                // Phase 3: Aggregation
                await orchestrator.runAggregation(claimId);

                // Phase 4: Routing
                await orchestrator.routeClaim(claimId);

                console.log(`✅ Background processing completed for claim ${claimId}`);
            } catch (error) {
                console.error(`❌ Background processing failed for claim ${claimId}:`, error);
            }
        })();

        // Return immediate response with Claim ID
        res.status(201).json({
            message: 'Claim submitted successfully',
            claimId,
            status: 'processing',
            info: 'Analysis and verification started in background'
        });

    } catch (error) {
        console.error('Error submitting claim:', error);
        res.status(500).json({ error: 'Failed to submit claim' });
    }
});

export default router;
