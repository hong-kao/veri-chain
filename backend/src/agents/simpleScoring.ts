// simple claim scoring -- weighted voting across agent verdicts.
// no llm calls here. explanation is a synchronous template built from verdict data.

import { env } from '../config/env.config.js';

export interface ClaimMetadata {
    claimId: string;
    normalizedText: string;
    platforms: string[];
    claimType?: string;
}

export interface AgentVerdict {
    agentName: string;
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    confidence: number;
    weight: number;
}

export interface ScoringResult {
    aiVerdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    aiConfidence: number;
    overallScore: number;
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

// citation_evidence is weighted highest -- it finds real fact-check evidence
const AGENT_WEIGHTS: Record<string, number> = {
    citation_evidence:   0.40,
    logic_consistency:   0.20,
    social_evidence:     0.15,
    media_forensics:     0.10,
    propagation_pattern: 0.10,
    source_credibility:  0.05,
};

function normalizeVerdict(verdict: string | undefined): 'TRUE' | 'FALSE' | 'UNCLEAR' {
    if (!verdict) return 'UNCLEAR';
    const v = verdict.toUpperCase();
    if (v === 'TRUE' || v === 'TRUE_' || v === 'VERIFIED') return 'TRUE';
    if (v === 'FALSE' || v === 'FALSE_' || v === 'FAKE' || v === 'REJECTED') return 'FALSE';
    return 'UNCLEAR';
}

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
        if (v.verdict === 'TRUE') trueWeight += effectiveWeight;
        else if (v.verdict === 'FALSE') falseWeight += effectiveWeight;
        else unclearWeight += effectiveWeight;
    }

    if (totalWeight === 0) {
        return { score: 50, trueWeight: 0, falseWeight: 0, unclearWeight: 0, totalWeight: 0 };
    }

    // true -> 100, false -> 0, unclear -> 50
    const score = (trueWeight * 100 + falseWeight * 0 + unclearWeight * 50) / totalWeight;
    return { score, trueWeight, falseWeight, unclearWeight, totalWeight };
}

function determineVerdict(score: number): 'TRUE' | 'FALSE' | 'UNCLEAR' {
    if (score >= 65) return 'TRUE';
    if (score <= 35) return 'FALSE';
    return 'UNCLEAR';
}

function calculateConfidence(score: number, verdicts: AgentVerdict[]): number {
    if (verdicts.length === 0) return 0.5;

    let totalWeight = 0;
    let weightedConfidence = 0;
    for (const v of verdicts) {
        const w = v.weight * v.confidence;
        weightedConfidence += v.confidence * w;
        totalWeight += w;
    }
    const avgConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0.5;
    const decisiveness = Math.abs(score - 50) / 50;

    // 60% from avg agent confidence, 40% from how decisive the score is
    return Math.min(0.95, avgConfidence * 0.6 + decisiveness * 0.4);
}

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

// synchronous template -- no llm call
function buildExplanation(
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR',
    score: number,
    verdicts: AgentVerdict[]
): string {
    const falseAgents = verdicts.filter(v => v.verdict === 'FALSE').map(v => v.agentName);
    const trueAgents  = verdicts.filter(v => v.verdict === 'TRUE').map(v => v.agentName);
    const scoreStr    = score.toFixed(0);

    if (verdict === 'FALSE') {
        const agentList = falseAgents.length ? falseAgents.join(', ') : 'multiple agents';
        return `this claim was rated false (score ${scoreStr}/100). analysis from ${agentList} indicates it is likely misinformation. the weighted evidence strongly contradicts the claim.`;
    }

    if (verdict === 'TRUE') {
        const agentList = trueAgents.length ? trueAgents.join(', ') : 'multiple agents';
        return `this claim was rated true (score ${scoreStr}/100). ${agentList} found supporting evidence. the weighted analysis supports the claim's accuracy.`;
    }

    return `this claim could not be definitively verified (score ${scoreStr}/100). the analysis was split or inconclusive -- community voting may help resolve it.`;
}

export async function scoreClaimSimple(
    claim: ClaimMetadata,
    agentResults: Array<{
        agent_name: string;
        verdict: string;
        confidence: number;
    }>
): Promise<ScoringResult> {
    const verdicts: AgentVerdict[] = agentResults.map(ar => ({
        agentName:  ar.agent_name,
        verdict:    normalizeVerdict(ar.verdict),
        confidence: ar.confidence ?? 0.5,
        weight:     AGENT_WEIGHTS[ar.agent_name] ?? 0.1
    }));

    const { score, trueWeight, falseWeight, unclearWeight, totalWeight } = calculateScore(verdicts);
    const aiVerdict    = determineVerdict(score);
    const aiConfidence = calculateConfidence(score, verdicts);
    const { strongSignals, warnings } = extractSignalsAndWarnings(verdicts);
    const explanation  = buildExplanation(aiVerdict, score, verdicts);

    return {
        aiVerdict,
        aiConfidence,
        overallScore: score,
        explanation,
        breakdown: {
            trueVotes:   verdicts.filter(v => v.verdict === 'TRUE').length,
            falseVotes:  verdicts.filter(v => v.verdict === 'FALSE').length,
            unclearVotes: verdicts.filter(v => v.verdict === 'UNCLEAR').length,
            totalWeight
        },
        strongSignals,
        warnings
    };
}

export { scoreClaimSimple as aggregateAndScoreSimple };
