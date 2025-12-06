import { ChatOpenAI } from '@langchain/openai';;
import { env } from '../config/env.config.js';

// INPUT TYPES
interface ClaimMetadata {
    claimId: string;
    normalizedText: string;
    platforms: string[];
    topic?: string; // e.g., "politics", "health", "crypto", "sports", "entertainment"
    category?: string;
    severity?: 'low' | 'medium' | 'high'; // impact estimate
    isTimeSensitive?: boolean;
    isBreaking?: boolean;
    claimType?: string;
}

interface AIVerdict {
    verdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
    confidence: number; // 0-1
    overallScore: number; // 0-100
}

interface AgentFlags {
    mediaRiskHigh?: boolean;
    propagationSuspicious?: boolean;
    sourceCredLow?: boolean;
    noProfessionalFactChecks?: boolean;
    logicContradictions?: boolean;
    citationMissing?: boolean;
    botActivityDetected?: boolean;
    coordinatedCampaign?: boolean;
}

export interface RoutingInput {
    claim: ClaimMetadata;
    aiVerdict: AIVerdict;
    agentFlags: AgentFlags;
}

// OUTPUT TYPES
export type RouteDecision = 'ai_only' | 'community_vote' | 'defer_archived';
type Urgency = 'low' | 'normal' | 'high';
export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface VoterCohort {
    topics?: string[];
    platforms?: string[];
    minReputationTier?: ReputationTier;
}

export interface RoutingDecision {
    route: RouteDecision;
    urgency: Urgency;
    targetVoterCohorts: VoterCohort[];
    votingWindowSeconds: number;
    minVotesRequired: number;
    reasoning: string;
    notificationPriority: 'low' | 'medium' | 'high';
    escalationReasons: string[];
}

// DECISION LOGIC
function countRedFlags(flags: AgentFlags): number {
    let count = 0;
    if (flags.mediaRiskHigh) count++;
    if (flags.propagationSuspicious) count++;
    if (flags.sourceCredLow) count++;
    if (flags.noProfessionalFactChecks) count++;
    if (flags.logicContradictions) count++;
    if (flags.citationMissing) count++;
    if (flags.botActivityDetected) count++;
    if (flags.coordinatedCampaign) count++;
    return count;
}

function getRedFlagsList(flags: AgentFlags): string[] {
    const list: string[] = [];
    if (flags.mediaRiskHigh) list.push('High media manipulation risk');
    if (flags.propagationSuspicious) list.push('Suspicious propagation patterns');
    if (flags.sourceCredLow) list.push('Low source credibility');
    if (flags.noProfessionalFactChecks) list.push('No professional fact-checks found');
    if (flags.logicContradictions) list.push('Logic contradictions detected');
    if (flags.citationMissing) list.push('Missing or poor citations');
    if (flags.botActivityDetected) list.push('Bot-like activity detected');
    if (flags.coordinatedCampaign) list.push('Coordinated campaign detected');
    return list;
}

function determineRoute(input: RoutingInput): RouteDecision {
    const { aiVerdict, agentFlags } = input;
    const redFlagCount = countRedFlags(agentFlags);

    // HIGH CONFIDENCE AI → AI ONLY
    // Confidence ≥ 0.70 and verdict is clear (TRUE or FALSE, not UNCLEAR)
    if (aiVerdict.confidence >= 0.70 && aiVerdict.verdict !== 'UNCLEAR' && redFlagCount <= 1) {
        return 'ai_only';
    }

    // LOW SIGNAL / LOW IMPACT → DEFER/ARCHIVED
    // Very low confidence (<0.4) or UNCLEAR verdict with low severity
    const isLowImpact = input.claim.severity === 'low' || input.claim.severity === undefined;
    if (aiVerdict.confidence < 0.40 && aiVerdict.verdict === 'UNCLEAR' && isLowImpact && !input.claim.isTimeSensitive) {
        return 'defer_archived';
    }

    // MEDIUM CONFIDENCE OR CONFLICTING SIGNALS → COMMUNITY VOTE
    // Confidence 0.4-0.70, or UNCLEAR verdict, or multiple red flags
    if (
        aiVerdict.confidence < 0.70 ||
        aiVerdict.verdict === 'UNCLEAR' ||
        redFlagCount >= 2
    ) {
        return 'community_vote';
    }

    // HIGH SEVERITY ALWAYS GOES TO COMMUNITY (politics, health)
    if (input.claim.severity === 'high' && aiVerdict.confidence < 0.90) {
        return 'community_vote';
    }

    // DEFAULT: AI ONLY if we reach here
    return 'ai_only';
}

function determineUrgency(input: RoutingInput, route: RouteDecision): Urgency {
    if (route === 'defer_archived') return 'low';
    if (route === 'ai_only') return 'low';

    // For community_vote
    const { claim, agentFlags } = input;

    // HIGH URGENCY: time-sensitive, breaking news, high severity, or coordinated attacks
    if (
        claim.isTimeSensitive ||
        claim.isBreaking ||
        claim.severity === 'high' ||
        agentFlags.coordinatedCampaign ||
        agentFlags.botActivityDetected
    ) {
        return 'high';
    }

    // NORMAL URGENCY: standard claims
    return 'normal';
}

function determineVoterCohorts(input: RoutingInput, route: RouteDecision): VoterCohort[] {
    if (route !== 'community_vote') return [];

    const cohorts: VoterCohort[] = [];
    const { claim, agentFlags } = input;
    const redFlagCount = countRedFlags(agentFlags);

    // Base cohort with topic filtering
    const baseCohort: VoterCohort = {};

    // Topic-based targeting
    if (claim.topic) {
        baseCohort.topics = [claim.topic];
    }

    // Platform-based targeting (if claim is platform-specific)
    if (claim.platforms && claim.platforms.length > 0) {
        baseCohort.platforms = claim.platforms;
    }

    // Reputation tier based on complexity and red flags
    if (claim.severity === 'high' || redFlagCount >= 3) {
        // High-stakes claims need experienced voters
        baseCohort.minReputationTier = 'silver';
    } else if (redFlagCount >= 2) {
        baseCohort.minReputationTier = 'bronze';
    }
    // If no red flags, any voter can participate (no tier requirement)

    cohorts.push(baseCohort);

    // For high-severity health/politics, add a second cohort of high-reputation voters
    if (claim.severity === 'high' && (claim.topic === 'health' || claim.topic === 'politics')) {
        cohorts.push({
            topics: [claim.topic],
            minReputationTier: 'gold'
        });
    }

    return cohorts;
}

function determineVotingWindow(input: RoutingInput, urgency: Urgency): number {
    // Time in seconds
    switch (urgency) {
        case 'high':
            return 180; // 3 minutes
        case 'normal':
            return 300; // 5 minutes
        case 'low':
            return 600; // 10 minutes
        default:
            return 300;
    }
}

function determineMinVotes(input: RoutingInput, urgency: Urgency): number {
    const { claim } = input;

    // High-severity claims need more votes for consensus
    if (claim.severity === 'high') {
        return urgency === 'high' ? 20 : 25;
    }

    // Medium severity
    if (claim.severity === 'medium') {
        return urgency === 'high' ? 15 : 20;
    }

    // Low severity or default
    return urgency === 'high' ? 10 : 15;
}

function determineNotificationPriority(input: RoutingInput, route: RouteDecision, urgency: Urgency): 'low' | 'medium' | 'high' {
    if (route === 'defer_archived') return 'low';
    if (route === 'ai_only') return 'low';

    // For community_vote
    if (urgency === 'high') return 'high';
    if (input.claim.severity === 'high') return 'high';
    if (urgency === 'normal') return 'medium';

    return 'low';
}

function generateReasoning(input: RoutingInput, route: RouteDecision, urgency: Urgency): string {
    const { aiVerdict, claim, agentFlags } = input;
    const redFlagCount = countRedFlags(agentFlags);

    if (route === 'ai_only') {
        return `AI has high confidence (${(aiVerdict.confidence * 100).toFixed(0)}%) with verdict ${aiVerdict.verdict} and minimal red flags (${redFlagCount}). No community voting needed.`;
    }

    if (route === 'defer_archived') {
        return `Low AI confidence (${(aiVerdict.confidence * 100).toFixed(0)}%), unclear verdict, and low severity/impact. Claim deferred for future review.`;
    }

    // community_vote
    const reasons: string[] = [];

    if (aiVerdict.confidence < 0.70) {
        reasons.push(`moderate AI confidence (${(aiVerdict.confidence * 100).toFixed(0)}%)`);
    }

    if (aiVerdict.verdict === 'UNCLEAR') {
        reasons.push('unclear AI verdict');
    }

    if (redFlagCount >= 2) {
        reasons.push(`${redFlagCount} red flags detected`);
    }

    if (claim.severity === 'high') {
        reasons.push('high-severity topic');
    }

    if (claim.isTimeSensitive || claim.isBreaking) {
        reasons.push('time-sensitive or breaking news');
    }

    if (agentFlags.coordinatedCampaign || agentFlags.botActivityDetected) {
        reasons.push('suspicious propagation patterns');
    }

    return `Community voting required due to: ${reasons.join(', ')}. Urgency: ${urgency}.`;
}

// MAIN ROUTING FUNCTION
export function routeToVoting(input: RoutingInput): RoutingDecision {
    // Step 1: Determine route
    const route = determineRoute(input);

    // Step 2: Determine urgency
    const urgency = determineUrgency(input, route);

    // Step 3: Determine voter cohorts
    const targetVoterCohorts = determineVoterCohorts(input, route);

    // Step 4: Determine voting parameters
    const votingWindowSeconds = determineVotingWindow(input, urgency);
    const minVotesRequired = determineMinVotes(input, urgency);

    // Step 5: Notification priority
    const notificationPriority = determineNotificationPriority(input, route, urgency);

    // Step 6: Generate reasoning
    const reasoning = generateReasoning(input, route, urgency);

    // Step 7: Get escalation reasons (red flags)
    const escalationReasons = getRedFlagsList(input.agentFlags);

    return {
        route,
        urgency,
        targetVoterCohorts,
        votingWindowSeconds,
        minVotesRequired,
        notificationPriority,
        reasoning,
        escalationReasons
    };
}



// TESTING
function testCommunityRoutingAgent() {
    console.log("🔍 Testing Community Routing Agent\n");

    const testCases: RoutingInput[] = [
        {
            name: "High Confidence AI - No Voting Needed",
            claim: {
                claimId: "claim_001",
                normalizedText: "The Earth orbits the Sun",
                platforms: ["twitter"],
                topic: "science",
                severity: "low",
                isTimeSensitive: false
            },
            aiVerdict: {
                verdict: 'TRUE',
                confidence: 0.95,
                overallScore: 92
            },
            agentFlags: {}
        } as any,
        {
            name: "Medium Confidence - Community Vote",
            claim: {
                claimId: "claim_002",
                normalizedText: "New study shows coffee prevents cancer",
                platforms: ["reddit"],
                topic: "health",
                severity: "high",
                isTimeSensitive: false
            },
            aiVerdict: {
                verdict: 'UNCLEAR',
                confidence: 0.65,
                overallScore: 55
            },
            agentFlags: {
                noProfessionalFactChecks: true,
                sourceCredLow: true
            }
        },
        {
            name: "Low Confidence Low Impact - Defer",
            claim: {
                claimId: "claim_003",
                normalizedText: "Celebrity X is dating Celebrity Y",
                platforms: ["twitter"],
                topic: "entertainment",
                severity: "low",
                isTimeSensitive: false
            },
            aiVerdict: {
                verdict: 'UNCLEAR',
                confidence: 0.35,
                overallScore: 48
            },
            agentFlags: {}
        },
        {
            name: "Coordinated Campaign - High Urgency Vote",
            claim: {
                claimId: "claim_004",
                normalizedText: "Election results were tampered with",
                platforms: ["twitter", "reddit"],
                topic: "politics",
                severity: "high",
                isTimeSensitive: true,
                isBreaking: true
            },
            aiVerdict: {
                verdict: 'FALSE',
                confidence: 0.72,
                overallScore: 28
            },
            agentFlags: {
                propagationSuspicious: true,
                botActivityDetected: true,
                coordinatedCampaign: true,
                sourceCredLow: true
            }
        },
        {
            name: "High Severity Health Claim - Gold Tier Voters",
            claim: {
                claimId: "claim_005",
                normalizedText: "Miracle cure for diabetes discovered",
                platforms: ["facebook", "twitter"],
                topic: "health",
                severity: "high",
                isTimeSensitive: false
            },
            aiVerdict: {
                verdict: 'FALSE',
                confidence: 0.78,
                overallScore: 25
            },
            agentFlags: {
                sourceCredLow: true,
                noProfessionalFactChecks: true,
                logicContradictions: true
            }
        },
        {
            name: "Media Manipulation - Normal Urgency Vote",
            claim: {
                claimId: "claim_006",
                normalizedText: "Video shows politician accepting bribe",
                platforms: ["twitter"],
                topic: "politics",
                severity: "high",
                isTimeSensitive: false
            },
            aiVerdict: {
                verdict: 'UNCLEAR',
                confidence: 0.60,
                overallScore: 50
            },
            agentFlags: {
                mediaRiskHigh: true,
                propagationSuspicious: true
            }
        }
    ];

    testCases.forEach((testCase: any, index) => {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test ${index + 1}: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim.normalizedText}"`);
        console.log(`Topic: ${testCase.claim.topic || 'N/A'} | Severity: ${testCase.claim.severity || 'N/A'}`);
        console.log(`AI Verdict: ${testCase.aiVerdict.verdict} (${(testCase.aiVerdict.confidence * 100).toFixed(0)}% confidence)`);
        console.log(`Red Flags: ${countRedFlags(testCase.agentFlags)}\n`);

        const decision = routeToVoting(testCase);

        console.log("📊 Routing Decision:");
        console.log(`  Route: ${decision.route.toUpperCase()}`);
        console.log(`  Urgency: ${decision.urgency}`);
        console.log(`  Notification Priority: ${decision.notificationPriority}`);

        if (decision.route === 'community_vote') {
            console.log(`\n  🗳️  Voting Parameters:`);
            console.log(`    Voting Window: ${decision.votingWindowSeconds}s (${(decision.votingWindowSeconds / 60).toFixed(1)} min)`);
            console.log(`    Min Votes Required: ${decision.minVotesRequired}`);

            if (decision.targetVoterCohorts.length > 0) {
                console.log(`\n    Target Voter Cohorts:`);
                decision.targetVoterCohorts.forEach((cohort, i) => {
                    console.log(`      Cohort ${i + 1}:`);
                    if (cohort.topics) console.log(`        Topics: ${cohort.topics.join(', ')}`);
                    if (cohort.platforms) console.log(`        Platforms: ${cohort.platforms.join(', ')}`);
                    if (cohort.minReputationTier) console.log(`        Min Reputation: ${cohort.minReputationTier}`);
                });
            }
        }

        if (decision.escalationReasons.length > 0) {
            console.log(`\n  ⚠️  Escalation Reasons:`);
            decision.escalationReasons.forEach(reason => console.log(`    - ${reason}`));
        }

        console.log(`\n  💡 Reasoning: ${decision.reasoning}`);
    });
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testCommunityRoutingAgent();
}