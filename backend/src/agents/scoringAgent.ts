import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-pro-latest",
    temperature: 0.2
});

//The input types
//We get this from orchestrator

export interface ClaimMetadata {
    claimId: string;
    normalizedText: string;
    platforms: string[];
    claimType?: string;
    urls?: string[];
}

interface LogicAgentOutput {
    verdict: 'true' | 'false' | 'unclear';
    confidence: number;
    reasons: string[];
    flags: string[];
}

interface SourceCredibilityOutput {
    sourceCredibilityScore: number;
    isCredible: boolean;
    confidence: number;
    domainReputations: Array<{
        domain: string;
        trustScore: number;
        analysis: string;
    }>;
    flaggedIssues: string[];
    explanation: string;
}

interface CitationAgentOutput {
    citationScore: number;
    confidence: number;
    supportingSources: Array<{
        url: string;
        verdict: string;
        credibility: number;
    }>;
    contradictingSources: Array<{
        url: string;
        verdict: string;
        credibility: number;
    }>;
    flags: string[];
    explanation: string;
}

interface SocialEvidenceOutput {
    socialScore: number;
    confidence: number;
    summary: string;
    authoritativeAccounts: Array<{
        author: string;
        platform: string;
        stance: string;
        credibility: number;
    }>;
    flags: string[];
}

interface MediaForensicsOutput {
    overallRiskScore: number;
    confidence: number;
    mediaAnalysis: Array<{
        url: string;
        riskScore: number;
        flags: string[];
    }>;
    summary: string;
}

interface PropagationOutput {
    suspicionScore: number;
    confidence: number;
    flags: string[];
    summary: string;
    propagationMetrics: {
        totalPosts: number;
        uniqueAuthors: number;
        platforms: string[];
        burstActivity: boolean;
    };
}

export interface AgentOutputs {
    logic?: LogicAgentOutput;
    sourceCredibility?: SourceCredibilityOutput;
    citation?: CitationAgentOutput;
    socialEvidence?: SocialEvidenceOutput;
    mediaForensics?: MediaForensicsOutput;
    propagation?: PropagationOutput;
}

//Output types

interface AggregatedVerdict {
    aiVerdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    aiConfidence: number; // 0-1
    overallScore: number; // 0-100 (0=definitely false, 100=definitely true, 50=unclear)
    explanation: string;
    breakdown: {
        logicScore: number;
        credibilityScore: number;
        evidenceScore: number;
        socialScore: number;
        mediaScore: number;
        propagationScore: number;
    };
    weights: {
        logic: number;
        credibility: number;
        evidence: number;
        social: number;
        media: number;
        propagation: number;
    };
    strongSignals: string[]; // e.g., "High source credibility", "Logic contradictions found"
    warnings: string[]; // e.g., "Bot-like propagation detected"
}

//weighting for the ai agents
const DEFAULT_WEIGHTS = {
    logic: 0.25,
    credibility: 0.30,
    evidence: 0.25,
    social: 0.05,
    media: 0.10,
    propagation: 0.05
};

//min-max normalisation
function normalizeScore(score: number, min: number = 0, max: number = 1): number {
    return Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
}

function calculateComponentScores(outputs: AgentOutputs): {
    logicScore: number;
    credibilityScore: number;
    evidenceScore: number;
    socialScore: number;
    mediaScore: number;
    propagationScore: number;
} {
    // Logic Score: TRUE=100, FALSE=0, UNCLEAR=50, weighted by confidence
    let logicScore = 50;
    if (outputs.logic) {
        const baseScore = outputs.logic.verdict === 'true' ? 100
            : outputs.logic.verdict === 'false' ? 0
                : 50;
        logicScore = baseScore * outputs.logic.confidence + 50 * (1 - outputs.logic.confidence);
    }

    // Credibility Score: direct score (0-1) -> (0-100)
    let credibilityScore = 50;
    if (outputs.sourceCredibility) {
        credibilityScore = normalizeScore(outputs.sourceCredibility.sourceCredibilityScore);
    }

    // Evidence Score: citation score (0-1) -> (0-100)
    let evidenceScore = 50;
    if (outputs.citation) {
        evidenceScore = normalizeScore(outputs.citation.citationScore);
    }

    // Social Score: (0-1) -> (0-100)
    let socialScore = 50;
    if (outputs.socialEvidence) {
        socialScore = normalizeScore(outputs.socialEvidence.socialScore);
    }

    // Media Score: INVERSE of risk (high risk = low score)
    let mediaScore = 50;
    if (outputs.mediaForensics) {
        // Risk 0-100, so score = 100 - risk
        mediaScore = 100 - outputs.mediaForensics.overallRiskScore;
    }

    // Propagation Score: INVERSE of suspicion (high suspicion = low score)
    let propagationScore = 50;
    if (outputs.propagation) {
        // Suspicion 0-100, so score = 100 - suspicion
        propagationScore = 100 - outputs.propagation.suspicionScore;
    }

    return {
        logicScore,
        credibilityScore,
        evidenceScore,
        socialScore,
        mediaScore,
        propagationScore
    };
}

function calculateWeightedScore(
    scores: ReturnType<typeof calculateComponentScores>,
    weights: typeof DEFAULT_WEIGHTS
): number {
    return (
        scores.logicScore * weights.logic +
        scores.credibilityScore * weights.credibility +
        scores.evidenceScore * weights.evidence +
        scores.socialScore * weights.social +
        scores.mediaScore * weights.media +
        scores.propagationScore * weights.propagation
    );
}

function determineVerdict(overallScore: number): 'TRUE' | 'FALSE' | 'UNCLEAR' {
    if (overallScore >= 70) return 'TRUE';
    if (overallScore <= 30) return 'FALSE';
    return 'UNCLEAR';
}

function calculateConfidence(outputs: AgentOutputs, overallScore: number): number {
    // Average confidence from all agents that ran
    const confidences: number[] = [];

    if (outputs.logic) confidences.push(outputs.logic.confidence);
    if (outputs.sourceCredibility) confidences.push(outputs.sourceCredibility.confidence);
    if (outputs.citation) confidences.push(outputs.citation.confidence);
    if (outputs.socialEvidence) confidences.push(outputs.socialEvidence.confidence);
    if (outputs.mediaForensics) confidences.push(outputs.mediaForensics.confidence);
    if (outputs.propagation) confidences.push(outputs.propagation.confidence);

    const avgConfidence = confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : 0.5;

    // Boost confidence if score is extreme (very high or very low)
    const extremeness = Math.abs(overallScore - 50) / 50; // 0 to 1
    const boostedConfidence = avgConfidence * 0.7 + extremeness * 0.3;

    return Math.min(1.0, boostedConfidence);
}

function extractStrongSignals(
    outputs: AgentOutputs,
    scores: ReturnType<typeof calculateComponentScores>
): string[] {
    const signals: string[] = [];

    // Logic signals
    if (outputs.logic) {
        if (outputs.logic.confidence > 0.8) {
            signals.push(`Logic analysis ${outputs.logic.verdict} with ${(outputs.logic.confidence * 100).toFixed(0)}% confidence`);
        }
        if (outputs.logic.flags.length > 0) {
            signals.push(`Logic flags: ${outputs.logic.flags.join(', ')}`);
        }
    }

    // Credibility signals
    if (outputs.sourceCredibility) {
        if (scores.credibilityScore > 75) {
            signals.push('High source credibility detected');
        } else if (scores.credibilityScore < 25) {
            signals.push('Low source credibility detected');
        }
    }

    // Evidence signals
    if (outputs.citation) {
        const supporting = outputs.citation.supportingSources.length;
        const contradicting = outputs.citation.contradictingSources.length;
        if (supporting > contradicting && supporting > 2) {
            signals.push(`Strong supporting evidence (${supporting} sources)`);
        } else if (contradicting > supporting && contradicting > 2) {
            signals.push(`Strong contradicting evidence (${contradicting} sources)`);
        }
    }

    return signals;
}

function extractWarnings(outputs: AgentOutputs): string[] {
    const warnings: string[] = [];

    // Propagation warnings
    if (outputs.propagation) {
        if (outputs.propagation.suspicionScore > 60) {
            warnings.push('Suspicious propagation patterns detected');
        }
        if (outputs.propagation.flags.length > 0) {
            warnings.push(`Propagation flags: ${outputs.propagation.flags.join(', ')}`);
        }
    }

    // Media warnings
    if (outputs.mediaForensics) {
        if (outputs.mediaForensics.overallRiskScore > 60) {
            warnings.push('High media manipulation risk detected');
        }
    }

    // Source warnings
    if (outputs.sourceCredibility) {
        if (outputs.sourceCredibility.flaggedIssues.length > 0) {
            warnings.push(`Source issues: ${outputs.sourceCredibility.flaggedIssues.join(', ')}`);
        }
    }

    return warnings;
}

async function generateExplanation(
    claim: ClaimMetadata,
    outputs: AgentOutputs,
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR',
    overallScore: number,
    breakdown: ReturnType<typeof calculateComponentScores>
): Promise<string> {
    const systemPrompt = `You are an AI verdict explainer for VeriChain, a misinformation detection system.

Your task: Generate a clear, concise 2-3 sentence explanation of why a claim received its verdict.

Focus on:
- The most important factors that influenced the verdict
- Specific evidence or red flags found
- Use natural language, avoid jargon

Be objective and factual.`;

    const agentSummaries: string[] = [];

    if (outputs.logic) {
        agentSummaries.push(`Logic: ${outputs.logic.verdict} (confidence: ${(outputs.logic.confidence * 100).toFixed(0)}%). ${outputs.logic.reasons.slice(0, 2).join('. ')}`);
    }
    if (outputs.sourceCredibility) {
        agentSummaries.push(`Sources: ${outputs.sourceCredibility.explanation}`);
    }
    if (outputs.citation) {
        agentSummaries.push(`Evidence: ${outputs.citation.explanation}`);
    }
    if (outputs.socialEvidence) {
        agentSummaries.push(`Social: ${outputs.socialEvidence.summary}`);
    }
    if (outputs.mediaForensics) {
        agentSummaries.push(`Media: ${outputs.mediaForensics.summary}`);
    }
    if (outputs.propagation) {
        agentSummaries.push(`Propagation: ${outputs.propagation.summary}`);
    }

    const userPrompt = `Claim: "${claim.normalizedText}"

Verdict: ${verdict} (score: ${overallScore.toFixed(1)}/100)

Agent Analysis:
${agentSummaries.join('\n')}

Component Scores:
- Logic: ${breakdown.logicScore.toFixed(1)}/100
- Credibility: ${breakdown.credibilityScore.toFixed(1)}/100
- Evidence: ${breakdown.evidenceScore.toFixed(1)}/100
- Social: ${breakdown.socialScore.toFixed(1)}/100
- Media: ${breakdown.mediaScore.toFixed(1)}/100
- Propagation: ${breakdown.propagationScore.toFixed(1)}/100

Generate a clear 2-3 sentence explanation of why this verdict was reached.`;

    try {
        const response = await llm.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt)
        ]);

        const explanation = typeof response.content === 'string'
            ? response.content.trim()
            : JSON.stringify(response.content);

        return explanation;
    } catch (error) {
        console.error('Failed to generate explanation:', error);
        return `Claim rated as ${verdict} with ${overallScore.toFixed(0)}/100 score based on analysis of ${agentSummaries.length} factors.`;
    }
}

//main aggregator
export async function aggregateAndScore(
    claim: ClaimMetadata,
    agentOutputs: AgentOutputs,
    customWeights?: Partial<typeof DEFAULT_WEIGHTS>
): Promise<AggregatedVerdict> {
    // Merge custom weights with defaults
    const weights = { ...DEFAULT_WEIGHTS, ...customWeights };

    // Calculate component scores
    const breakdown = calculateComponentScores(agentOutputs);

    // Calculate weighted overall score
    const overallScore = calculateWeightedScore(breakdown, weights);

    // Determine verdict
    const aiVerdict = determineVerdict(overallScore);

    // Calculate confidence
    const aiConfidence = calculateConfidence(agentOutputs, overallScore);

    // Extract strong signals and warnings
    const strongSignals = extractStrongSignals(agentOutputs, breakdown);
    const warnings = extractWarnings(agentOutputs);

    // Generate natural language explanation
    const explanation = await generateExplanation(
        claim,
        agentOutputs,
        aiVerdict,
        overallScore,
        breakdown
    );

    return {
        aiVerdict,
        aiConfidence,
        overallScore,
        explanation,
        breakdown,
        weights,
        strongSignals,
        warnings
    };
}



//TESTING!!!
async function testAggregationAgent() {
    console.log("🔍 Testing Aggregation & Scoring Agent\n");
    console.log("\n");
    const testCases = [
        {
            name: "High Credibility True Claim",
            claim: {
                claimId: "claim_001",
                normalizedText: "Scientists at MIT developed new quantum computing breakthrough",
                platforms: ["twitter", "reddit"]
            },
            outputs: {
                logic: {
                    verdict: 'true' as const,
                    confidence: 0.85,
                    reasons: ["Claim is logically consistent", "No contradictions found"],
                    flags: []
                },
                sourceCredibility: {
                    sourceCredibilityScore: 0.90,
                    isCredible: true,
                    confidence: 0.88,
                    domainReputations: [
                        { domain: "nature.com", trustScore: 0.95, analysis: "Top-tier peer-reviewed journal" }
                    ],
                    flaggedIssues: [],
                    explanation: "Highly credible sources from academic institutions"
                },
                citation: {
                    citationScore: 0.85,
                    confidence: 0.82,
                    supportingSources: [
                        { url: "https://nature.com/article", verdict: "supports", credibility: 0.95 }
                    ],
                    contradictingSources: [],
                    flags: [],
                    explanation: "Strong supporting evidence from peer-reviewed sources"
                },
                propagation: {
                    suspicionScore: 15,
                    confidence: 0.75,
                    flags: [],
                    summary: "Organic spread with diverse authors",
                    propagationMetrics: {
                        totalPosts: 50,
                        uniqueAuthors: 45,
                        platforms: ["reddit", "twitter"],
                        burstActivity: false
                    }
                }
            } as AgentOutputs
        },
        {
            name: "Low Credibility False Claim",
            claim: {
                claimId: "claim_002",
                normalizedText: "Bill Gates admits vaccines contain microchips",
                platforms: ["twitter"]
            },
            outputs: {
                logic: {
                    verdict: 'false' as const,
                    confidence: 0.92,
                    reasons: ["Extraordinary claim lacks evidence", "Known conspiracy theory"],
                    flags: ["conspiracy_theory"]
                },
                sourceCredibility: {
                    sourceCredibilityScore: 0.15,
                    isCredible: false,
                    confidence: 0.90,
                    domainReputations: [
                        { domain: "naturalnews.com", trustScore: 0.15, analysis: "Known for misinformation" }
                    ],
                    flaggedIssues: ["unreliable_domain"],
                    explanation: "Sources known for spreading misinformation"
                },
                citation: {
                    citationScore: 0.20,
                    confidence: 0.88,
                    supportingSources: [],
                    contradictingSources: [
                        { url: "https://factcheck.org/debunk", verdict: "false", credibility: 0.90 }
                    ],
                    flags: ["fact_check_false"],
                    explanation: "Multiple fact-checkers rated as false"
                },
                propagation: {
                    suspicionScore: 75,
                    confidence: 0.80,
                    flags: ["bot_like_activity", "coordinated_campaign"],
                    summary: "Suspicious propagation patterns detected",
                    propagationMetrics: {
                        totalPosts: 200,
                        uniqueAuthors: 50,
                        platforms: ["twitter"],
                        burstActivity: true
                    }
                },
                mediaForensics: {
                    overallRiskScore: 65,
                    confidence: 0.70,
                    mediaAnalysis: [
                        { url: "image1.jpg", riskScore: 65, flags: ["possible_manipulation"] }
                    ],
                    summary: "Moderate manipulation risk in attached media"
                }
            } as AgentOutputs
        },
        {
            name: "Unclear Mixed Signals",
            claim: {
                claimId: "claim_003",
                normalizedText: "New study suggests coffee may prevent Alzheimer's",
                platforms: ["reddit"]
            },
            outputs: {
                logic: {
                    verdict: 'unclear' as const,
                    confidence: 0.60,
                    reasons: ["Claim is plausible but needs more research", "Correlation vs causation unclear"],
                    flags: []
                },
                sourceCredibility: {
                    sourceCredibilityScore: 0.55,
                    isCredible: true,
                    confidence: 0.65,
                    domainReputations: [
                        { domain: "healthnews.com", trustScore: 0.55, analysis: "Mixed reliability health news site" }
                    ],
                    flaggedIssues: [],
                    explanation: "Moderate credibility sources"
                },
                citation: {
                    citationScore: 0.50,
                    confidence: 0.60,
                    supportingSources: [
                        { url: "https://study.com/coffee", verdict: "supports", credibility: 0.60 }
                    ],
                    contradictingSources: [
                        { url: "https://other-study.com", verdict: "contradicts", credibility: 0.55 }
                    ],
                    flags: [],
                    explanation: "Mixed evidence from various studies"
                }
            } as AgentOutputs
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim.normalizedText}"`);
        console.log(`Claim ID: ${testCase.claim.claimId}\n`);

        const result = await aggregateAndScore(testCase.claim, testCase.outputs);

        console.log("📊 Aggregated Verdict:");
        console.log(`  AI Verdict: ${result.aiVerdict}`);
        console.log(`  Overall Score: ${result.overallScore.toFixed(1)}/100`);
        console.log(`  Confidence: ${(result.aiConfidence * 100).toFixed(1)}%`);

        console.log(`\n  📈 Breakdown:`);
        console.log(`    Logic: ${result.breakdown.logicScore.toFixed(1)}/100 (weight: ${(result.weights.logic * 100).toFixed(0)}%)`);
        console.log(`    Credibility: ${result.breakdown.credibilityScore.toFixed(1)}/100 (weight: ${(result.weights.credibility * 100).toFixed(0)}%)`);
        console.log(`    Evidence: ${result.breakdown.evidenceScore.toFixed(1)}/100 (weight: ${(result.weights.evidence * 100).toFixed(0)}%)`);
        console.log(`    Social: ${result.breakdown.socialScore.toFixed(1)}/100 (weight: ${(result.weights.social * 100).toFixed(0)}%)`);
        console.log(`    Media: ${result.breakdown.mediaScore.toFixed(1)}/100 (weight: ${(result.weights.media * 100).toFixed(0)}%)`);
        console.log(`    Propagation: ${result.breakdown.propagationScore.toFixed(1)}/100 (weight: ${(result.weights.propagation * 100).toFixed(0)}%)`);

        if (result.strongSignals.length > 0) {
            console.log(`\n  ✨ Strong Signals:`);
            result.strongSignals.forEach(signal => console.log(`    - ${signal}`));
        }

        if (result.warnings.length > 0) {
            console.log(`\n  ⚠️  Warnings:`);
            result.warnings.forEach(warning => console.log(`    - ${warning}`));
        }

        console.log(`\n  💡 Explanation:`);
        console.log(`    ${result.explanation}`);
    }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testAggregationAgent();
}

