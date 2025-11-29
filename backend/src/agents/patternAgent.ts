import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatOpenAI } from '@langchain/openai';;
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import {
    searchAllPlatforms,
    getRedditPostContext,
    getFarcasterCastContext,
    getRedditUserInfo,
    getFarcasterUserInfo,
    buildSocialGraph,
    calculatePropagationMetrics,
    type SocialPost
} from '../utils/socialFetcher.js';

const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY || '',
    model: "gpt-4o-mini",
    temperature: 0.2
});

// TOOLS

// Keep only the pattern analysis tool (no external API dependencies)
const analyzePropagationPatterns = tool(
    async ({ posts }: { posts: SocialPost[] }) => {
        try {
            if (!posts || posts.length === 0) {
                return JSON.stringify({
                    metrics: {
                        totalPosts: 0,
                        uniqueAuthors: 0,
                        timeSpan: 0,
                        avgEngagement: 0,
                        suspiciousPatterns: []
                    },
                    detectedPatterns: [],
                    analysis: {
                        isOrganic: true,
                        suspicionLevel: 'low',
                        authorDiversity: 0,
                        engagementRate: 0
                    }
                });
            }

            const metrics = calculatePropagationMetrics(posts);
            const graph = buildSocialGraph(posts);

            // Additional pattern detection
            const patterns: string[] = [...metrics.suspiciousPatterns];

            // Detect coordinated timing (multiple posts within minutes)
            const timestamps = posts.map(p => p.createdAt.getTime()).sort((a, b) => a - b);
            for (let i = 1; i < timestamps.length; i++) {
                const timeDiff = (timestamps[i] - timestamps[i - 1]) / (1000 * 60); // minutes
                if (timeDiff < 2) {
                    patterns.push(`coordinated_timing: posts within ${timeDiff.toFixed(1)} minutes`);
                    break;
                }
            }

            // Detect similar content (possible copy-paste)
            const contents = posts.map(p => p.content.toLowerCase().trim());
            const uniqueContents = new Set(contents);
            if (uniqueContents.size < contents.length * 0.7) {
                patterns.push(`duplicate_content: ${contents.length - uniqueContents.size} duplicate posts`);
            }

            // Detect platform concentration
            const platformCounts = posts.reduce((acc, p) => {
                acc[p.platform] = (acc[p.platform] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const maxPlatform = Object.entries(platformCounts).reduce((max, [plat, count]) =>
                count > max.count ? { platform: plat, count } : max
                , { platform: '', count: 0 });

            if (maxPlatform.count > posts.length * 0.9 && posts.length > 10) {
                patterns.push(`single_platform_dominance: ${maxPlatform.count}/${posts.length} posts on ${maxPlatform.platform}`);
            }

            return JSON.stringify({
                metrics,
                graphDepth: Math.max(...graph.map(node => node.depth), 0),
                rootNodes: graph.length,
                detectedPatterns: patterns,
                analysis: {
                    isOrganic: patterns.length <= 1 && metrics.uniqueAuthors > posts.length * 0.5,
                    suspicionLevel: patterns.length >= 3 ? 'high' : patterns.length >= 1 ? 'medium' : 'low',
                    authorDiversity: (metrics.uniqueAuthors / metrics.totalPosts).toFixed(2),
                    engagementRate: metrics.avgEngagement.toFixed(2)
                }
            }, null, 2);
        } catch (error: any) {
            console.error('Propagation analysis error:', error.message);
            return JSON.stringify({
                error: 'Failed to analyze propagation patterns',
                message: error.message
            });
        }
    },
    {
        name: "analyzePropagationPatterns",
        description: "Analyze propagation patterns from a list of social posts to detect bot activity, coordination, and suspicious patterns. Returns metrics, graph analysis, and pattern flags.",
        schema: z.object({
            posts: z.array(z.any()).describe("Array of SocialPost objects to analyze")
        })
    }
);

const tools = [
    analyzePropagationPatterns
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

// STATE

const PropagationPatternState = Annotation.Root({
    ...MessagesAnnotation.spec,

    // Input
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    claimId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    socialMetadata: Annotation<{
        posts?: SocialPost[];
        searchQuery?: string;
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({})
    }),

    // Analysis outputs
    suspicionScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.0
    }),
    flags: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    summary: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    suspiciousAccounts: Annotation<Array<{
        author: string;
        platform: string;
        reason: string;
        score: number;
    }>>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    propagationMetrics: Annotation<{
        totalPosts: number;
        uniqueAuthors: number;
        timeSpan: number;
        avgEngagement: number;
        platforms: string[];
        burstActivity: boolean;
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({
            totalPosts: 0,
            uniqueAuthors: 0,
            timeSpan: 0,
            avgEngagement: 0,
            platforms: [],
            burstActivity: false
        })
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    needsMediaForensics: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false
    }),
    needsOtherAgents: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    })
});

// HELPER

function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message &&
        Array.isArray((message as any).tool_calls) &&
        (message as any).tool_calls.length > 0;
}

// NODES

async function analyzePropagation(state: typeof PropagationPatternState.State) {
    // DIRECT TOOL CALLING - analyze provided posts only

    const hasPosts = state.socialMetadata?.posts && state.socialMetadata.posts.length > 0;

    if (!hasPosts) {
        // No posts provided - return no data found
        return {
            messages: [
                new HumanMessage("No social posts provided for pattern analysis. Cannot analyze propagation without data.")
            ]
        };
    }

    // Directly analyze the posts
    console.log(`✓ Analyzing ${state.socialMetadata.posts!.length} posts for propagation patterns...`);

    try {
        const analysisResult = await analyzePropagationPatterns.invoke({
            posts: state.socialMetadata.posts!
        });

        return {
            messages: [
                new HumanMessage(`Pattern analysis complete: ${analysisResult}`)
            ]
        };
    } catch (error: any) {
        console.error('Pattern analysis failed:', error.message);
        return {
            messages: [
                new HumanMessage(`Pattern analysis failed: ${error.message}`)
            ]
        };
    }
}

async function processToolResults(state: typeof PropagationPatternState.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }

    const result: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];

        // Special handling for analyzePropagationPatterns
        if (toolCall.name === 'analyzePropagationPatterns' && state.socialMetadata?.posts) {
            const observation = await (tool as any).invoke({
                posts: state.socialMetadata.posts
            });
            result.push(observation);
        } else {
            const observation = await (tool as any).invoke(toolCall);
            result.push(observation);
        }
    }

    return { messages: result };
}

async function extractVerdict(state: typeof PropagationPatternState.State) {
    // Calculate verdict from actual analysis results
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !lastMessage.content) {
        return {
            suspicionScore: 0.0,
            confidence: 0.3,
            flags: ["no_data"],
            summary: "No propagation data available for analysis",
            suspiciousAccounts: [],
            propagationMetrics: {
                totalPosts: 0,
                uniqueAuthors: 0,
                timeSpan: 0,
                avgEngagement: 0,
                platforms: [],
                burstActivity: false
            }
        };
    }

    try {
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        // Try to parse pattern analysis from the message
        const jsonMatch = content.match(/\{[\s\S]*?\}(?=\s*$)/);
        if (!jsonMatch) {
            throw new Error('No JSON found in analysis results');
        }

        const analysis = JSON.parse(jsonMatch[0]);

        // Calculate suspicion score based on detected patterns
        const patterns = analysis.detectedPatterns || [];
        const metrics = analysis.metrics || {};
        const analysisData = analysis.analysis || {};

        // Score: 0-100 based on number and severity of suspicious patterns
        let suspicionScore = 0;

        // Base score on pattern count (more patterns = more suspicious)
        suspicionScore += patterns.length * 15; // 15 points per pattern

        // Adjust based on suspicion level
        if (analysisData.suspicionLevel === 'high') {
            suspicionScore += 30;
        } else if (analysisData.suspicionLevel === 'medium') {
            suspicionScore += 15;
        }

        // Cap at 100
        suspicionScore = Math.min(suspicionScore, 100);

        // Confidence based on amount of data
        const dataConfidence = metrics.totalPosts > 20 ? 0.8 :
            metrics.totalPosts > 10 ? 0.6 :
                metrics.totalPosts > 0 ? 0.4 : 0.3;

        return {
            suspicionScore,
            confidence: dataConfidence,
            flags: patterns,
            summary: `Analysis of ${metrics.totalPosts || 0} posts found ${patterns.length} suspicious pattern(s). Suspicion level: ${analysisData.suspicionLevel || 'unknown'}.`,
            suspiciousAccounts: [],
            propagationMetrics: {
                totalPosts: metrics.totalPosts || 0,
                uniqueAuthors: metrics.uniqueAuthors || 0,
                timeSpan: metrics.timeSpan || 0,
                avgEngagement: metrics.avgEngagement || 0,
                platforms: metrics.platforms || [],
                burstActivity: metrics.burstActivity || false
            },
            needsMediaForensics: false,
            needsOtherAgents: []
        };
    } catch (error: any) {
        console.error("Failed to parse propagation analysis:", error.message);
        return {
            suspicionScore: 0.0,
            confidence: 0.3,
            flags: ["analysis_error"],
            summary: "Error processing propagation analysis",
            suspiciousAccounts: [],
            propagationMetrics: {
                totalPosts: 0,
                uniqueAuthors: 0,
                timeSpan: 0,
                avgEngagement: 0,
                platforms: [],
                burstActivity: false
            },
            needsMediaForensics: false,
            needsOtherAgents: []
        };
    }
}

async function shouldContinue(state: typeof PropagationPatternState.State) {
    // Direct flow: analyze -> verdict
    if (!state.summary) {
        return "extractVerdict";
    }
    return END;
}

// GRAPH

const propagationPatternAgent = new StateGraph(PropagationPatternState)
    .addNode("analyzePropagation", analyzePropagation)
    .addNode("processToolResults", processToolResults)
    .addNode("extractVerdict", extractVerdict)
    .addEdge(START, "analyzePropagation")
    .addConditionalEdges("analyzePropagation", shouldContinue, {
        "processToolResults": "processToolResults",
        "extractVerdict": "extractVerdict",
        [END]: END
    })
    .addEdge("processToolResults", "analyzePropagation")
    .addEdge("extractVerdict", END)
    .compile();

export { propagationPatternAgent, PropagationPatternState };

// TESTING

async function testPropagationPatternAgent() {
    console.log("🔍 Testing Propagation & Pattern Agent (MCP)\n");

    const testCases = [
        {
            name: "Organic Discussion",
            claim: "New study shows benefits of Mediterranean diet",
            claimId: "claim_123",
            socialMetadata: {}
        },
        {
            name: "Potential Bot Campaign",
            claim: "BREAKING: Cryptocurrency scam exposed",
            claimId: "claim_456",
            socialMetadata: {
                searchQuery: "cryptocurrency scam exposed"
            }
        },
        {
            name: "Coordinated Misinformation",
            claim: "Vaccines cause autism",
            claimId: "claim_789",
            socialMetadata: {}
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"`);
        console.log(`Claim ID: ${testCase.claimId}\n`);

        const result = await propagationPatternAgent.invoke({
            claim: testCase.claim,
            claimId: testCase.claimId,
            socialMetadata: testCase.socialMetadata,
            messages: []
        });

        console.log("📊 Propagation Pattern Analysis:");
        console.log(`  Suspicion Score: ${result.suspicionScore}/100`);
        console.log(`  Confidence: ${result.confidence.toFixed(2)}`);

        if (result.flags.length > 0) {
            console.log(`\n  🚩 Flags: ${result.flags.join(', ')}`);
        }

        console.log(`\n  📝 Summary: ${result.summary}`);

        console.log(`\n  📈 Propagation Metrics:`);
        console.log(`    Total Posts: ${result.propagationMetrics.totalPosts}`);
        console.log(`    Unique Authors: ${result.propagationMetrics.uniqueAuthors}`);
        console.log(`    Time Span: ${result.propagationMetrics.timeSpan.toFixed(1)} hours`);
        console.log(`    Avg Engagement: ${result.propagationMetrics.avgEngagement.toFixed(2)}`);
        console.log(`    Platforms: ${result.propagationMetrics.platforms.join(', ') || 'None'}`);
        console.log(`    Burst Activity: ${result.propagationMetrics.burstActivity ? '⚠️ Yes' : '✅ No'}`);

        if (result.suspiciousAccounts.length > 0) {
            console.log(`\n  🔍 Suspicious Accounts:`);
            result.suspiciousAccounts.forEach(acc => {
                console.log(`    - ${acc.author} (${acc.platform}): ${acc.reason} [Score: ${acc.score.toFixed(2)}]`);
            });
        }

        if (result.needsMediaForensics) {
            console.log(`\n  📸 Needs Media Forensics: Yes`);
        }

        if (result.needsOtherAgents.length > 0) {
            console.log(`\n  🔗 Needs Other Agents: ${result.needsOtherAgents.join(', ')}`);
        }
    }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testPropagationPatternAgent();
}