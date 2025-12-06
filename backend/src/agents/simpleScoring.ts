/**
 * Simple Claim Scoring - Clean Implementation
 * 
 * Design principles:
 * 1. Agents return verdicts: TRUE, FALSE, or UNCLEAR
 * 2. Each FALSE verdict is evidence the claim is misinformation
 * 3. Simple weighted voting: count FALSE vs TRUE verdicts
 * 4. Final verdict based on majority consensus with confidence weighting
 */

import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.config.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY || '',
    model: "gpt-4o-mini",
    temperature: 0.2
});

// Simple input types
export interface ClaimMetadata {
    claimId: string;
    normalizedText: string;
    platforms: string[];
    claimType?: string;
}

export interface AgentVerdict {
    agentName: string;
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    confidence: number;  // 0-1
    weight: number;      // How important is this agent's opinion
}

export interface ScoringResult {
    aiVerdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    aiConfidence: number;  // 0-1
    overallScore: number;  // 0-100 (0=definitely false, 100=definitely true)
    explanation: string;
    breakdown: {
        trueVotes: number;
        falseVotes: number;
        unclearVotes: number;
        totalWeight: number;
    };
    strongSignals: string[];
    warnings: string[];
}

// Agent weights - how much each agent's opinion matters
const AGENT_WEIGHTS: Record<string, number> = {
    'logic_consistency': 0.30,      // Very important - logical analysis
    'citation_evidence': 0.30,      // Very important - factual evidence
    'source_credibility': 0.05,     // Less important - just source quality, not claim truth
    'social_evidence': 0.15,        // Somewhat important - social signals
    'media_forensics': 0.10,        // Somewhat important - media manipulation
    'propagation_pattern': 0.10,    // Somewhat important - spread patterns
};

/**
 * Normalize verdict to uppercase
 */
function normalizeVerdict(verdict: string | undefined): 'TRUE' | 'FALSE' | 'UNCLEAR' {
    if (!verdict) return 'UNCLEAR';
    const v = verdict.toUpperCase();
    // Handle Prisma enum values (false_, true_) AND uppercase strings
    if (v === 'TRUE' || v === 'TRUE_' || v === 'VERIFIED') return 'TRUE';
    if (v === 'FALSE' || v === 'FALSE_' || v === 'FAKE' || v === 'REJECTED') return 'FALSE';
    return 'UNCLEAR';
}

/**
 * Calculate the overall score based on agent verdicts
 * 
 * Simple logic:
 * - FALSE verdicts pull score toward 0 (claim is misinformation)
 * - TRUE verdicts pull score toward 100 (claim is accurate)
 * - UNCLEAR verdicts pull score toward 50 (uncertain)
 * - Each verdict is weighted by agent importance AND agent confidence
 */
function calculateScore(verdicts: AgentVerdict[]): {
    score: number;
    trueWeight: number;
    falseWeight: number;
    unclearWeight: number;
    totalWeight: number;
} {
    let trueWeight = 0;
    let falseWeight = 0;
    let unclearWeight = 0;
    let totalWeight = 0;

    for (const v of verdicts) {
        const effectiveWeight = v.weight * v.confidence;
        totalWeight += effectiveWeight;

        switch (v.verdict) {
            case 'TRUE':
                trueWeight += effectiveWeight;
                break;
            case 'FALSE':
                falseWeight += effectiveWeight;
                break;
            case 'UNCLEAR':
                unclearWeight += effectiveWeight;
                break;
        }
    }

    if (totalWeight === 0) {
        return { score: 50, trueWeight: 0, falseWeight: 0, unclearWeight: 0, totalWeight: 0 };
    }

    // Calculate weighted score
    // TRUE -> 100, FALSE -> 0, UNCLEAR -> 50
    const score = (trueWeight * 100 + falseWeight * 0 + unclearWeight * 50) / totalWeight;

    return { score, trueWeight, falseWeight, unclearWeight, totalWeight };
}

/**
 * Determine final verdict based on score
 */
function determineVerdict(score: number): 'TRUE' | 'FALSE' | 'UNCLEAR' {
    if (score >= 65) return 'TRUE';
    if (score <= 35) return 'FALSE';
    return 'UNCLEAR';
}

/**
 * Calculate confidence based on how decisive the score is
 */
function calculateConfidence(score: number, verdicts: AgentVerdict[]): number {
    // How far from 50 (uncertain) is the score?
    const decisiveness = Math.abs(score - 50) / 50;  // 0-1

    // Average agent confidence
    const avgConfidence = verdicts.length > 0
        ? verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length
        : 0.5;

    // Combine decisiveness with average agent confidence
    const confidence = (decisiveness * 0.6) + (avgConfidence * 0.4);

    return Math.min(1.0, Math.max(0.0, confidence));
}

/**
 * Extract strong signals and warnings from verdicts
 */
function extractSignalsAndWarnings(verdicts: AgentVerdict[]): {
    strongSignals: string[];
    warnings: string[];
} {
    const strongSignals: string[] = [];
    const warnings: string[] = [];

    for (const v of verdicts) {
        if (v.confidence > 0.7) {
            if (v.verdict === 'FALSE') {
                warnings.push(`${v.agentName} says FALSE with ${Math.round(v.confidence * 100)}% confidence`);
            } else if (v.verdict === 'TRUE') {
                strongSignals.push(`${v.agentName} says TRUE with ${Math.round(v.confidence * 100)}% confidence`);
            }
        }
    }

    return { strongSignals, warnings };
}

/**
 * Generate a human-readable explanation
 */
async function generateExplanation(
    claim: ClaimMetadata,
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR',
    score: number,
    verdicts: AgentVerdict[]
): Promise<string> {
    const falseAgents = verdicts.filter(v => v.verdict === 'FALSE');
    const trueAgents = verdicts.filter(v => v.verdict === 'TRUE');

    const systemPrompt = `Generate a 2-3 sentence explanation for why a claim was rated as ${verdict}. Be concise and factual.`;

    const userPrompt = `
Claim: "${claim.normalizedText}"
Verdict: ${verdict} (score: ${score.toFixed(1)}/100)

Agent analysis:
- ${falseAgents.length} agents say FALSE: ${falseAgents.map(a => a.agentName).join(', ') || 'none'}
- ${trueAgents.length} agents say TRUE: ${trueAgents.map(a => a.agentName).join(', ') || 'none'}

Generate a brief explanation.`;

    try {
        const response = await llm.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt)
        ]);
        return typeof response.content === 'string'
            ? response.content.trim()
            : JSON.stringify(response.content);
    } catch (error) {
        // Fallback explanation
        if (verdict === 'FALSE') {
            return `This claim was rated FALSE based on analysis from ${falseAgents.length} agents with an overall score of ${score.toFixed(0)}/100. The evidence suggests this is misinformation.`;
        } else if (verdict === 'TRUE') {
            return `This claim was rated TRUE with an overall score of ${score.toFixed(0)}/100. Supporting evidence was found from ${trueAgents.length} analysis agents.`;
        }
        return `This claim could not be definitively verified. The analysis was inconclusive with a score of ${score.toFixed(0)}/100.`;
    }
}

/**
 * MAIN FUNCTION: Score a claim based on agent results
 * 
 * This is the simple, clean replacement for the old complex scoring system.
 */
export async function scoreClaimSimple(
    claim: ClaimMetadata,
    agentResults: Array<{
        agent_name: string;
        verdict: string;
        confidence: number;
    }>
): Promise<ScoringResult> {
    console.log(`\n📊 [SimpleScoring] Scoring claim ${claim.claimId}...`);

    // Convert agent results to verdicts
    const verdicts: AgentVerdict[] = agentResults.map(ar => ({
        agentName: ar.agent_name,
        verdict: normalizeVerdict(ar.verdict),
        confidence: ar.confidence ?? 0.5,
        weight: AGENT_WEIGHTS[ar.agent_name] ?? 0.1
    }));

    // Log what we're working with
    console.log(`   Verdicts received:`);
    for (const v of verdicts) {
        console.log(`     - ${v.agentName}: ${v.verdict} (${Math.round(v.confidence * 100)}% conf, weight ${v.weight})`);
    }

    // Calculate score
    const { score, trueWeight, falseWeight, unclearWeight, totalWeight } = calculateScore(verdicts);
    console.log(`   Raw score: ${score.toFixed(1)}/100`);
    console.log(`   Weights - TRUE: ${trueWeight.toFixed(2)}, FALSE: ${falseWeight.toFixed(2)}, UNCLEAR: ${unclearWeight.toFixed(2)}`);

    // Determine verdict
    const aiVerdict = determineVerdict(score);
    console.log(`   Final verdict: ${aiVerdict}`);

    // Calculate confidence
    const aiConfidence = calculateConfidence(score, verdicts);
    console.log(`   Confidence: ${(aiConfidence * 100).toFixed(0)}%`);

    // Extract signals
    const { strongSignals, warnings } = extractSignalsAndWarnings(verdicts);

    // Generate explanation
    const explanation = await generateExplanation(claim, aiVerdict, score, verdicts);

    console.log(`✅ [SimpleScoring] Complete: ${aiVerdict} (${(aiConfidence * 100).toFixed(0)}%)\n`);

    return {
        aiVerdict,
        aiConfidence,
        overallScore: score,
        explanation,
        breakdown: {
            trueVotes: verdicts.filter(v => v.verdict === 'TRUE').length,
            falseVotes: verdicts.filter(v => v.verdict === 'FALSE').length,
            unclearVotes: verdicts.filter(v => v.verdict === 'UNCLEAR').length,
            totalWeight
        },
        strongSignals,
        warnings
    };
}

// Re-export as aggregateAndScore for compatibility with existing code
export { scoreClaimSimple as aggregateAndScoreSimple };
