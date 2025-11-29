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

const searchSocialPlatforms = tool(
    async ({ query, limit = 25 }: { query: string; limit?: number }) => {
        try {
            const results = await searchAllPlatforms(query, limit);

            return JSON.stringify({
                totalPosts: results.allPosts.length,
                redditPosts: results.byPlatform.reddit.length,
                farcasterPosts: results.byPlatform.farcaster.length,
                posts: results.allPosts.map(p => ({
                    id: p.id,
                    platform: p.platform,
                    author: p.author,
                    content: p.content.slice(0, 200),
                    createdAt: p.createdAt,
                    engagement: p.engagement,
                    metadata: p.metadata,
                    url: p.url
                }))
            }, null, 2);
        } catch (error: any) {
            console.error('Social platform search error:', error.message);
            return JSON.stringify({
                error: 'Social platform search failed',
                message: error.message
            });
        }
    },
    {
        name: "searchSocialPlatforms",
        description: "Search Reddit and Farcaster for posts mentioning a claim or topic. Returns posts with author info, engagement metrics, and timestamps.",
        schema: z.object({
            query: z.string().describe("Search query for finding social posts about the claim"),
            limit: z.number().optional().default(25).describe("Max posts per platform (default 25)")
        })
    }
);

const getPostContext = tool(
    async ({ platform, postId }: { platform: 'reddit' | 'farcaster'; postId: string }) => {
        try {
            if (platform === 'reddit') {
                const context = await getRedditPostContext(postId);
                return JSON.stringify({
                    platform: 'reddit',
                    post: context.post,
                    comments: context.comments.length,
                    crossposts: context.crossposts.length,
                    commentSample: context.comments.slice(0, 5),
                    crosspostSample: context.crossposts.slice(0, 3)
                }, null, 2);
            } else {
                const context = await getFarcasterCastContext(postId);
                return JSON.stringify({
                    platform: 'farcaster',
                    cast: context.cast,
                    replies: context.replies.length,
                    recasts: context.recasts.length,
                    replySample: context.replies.slice(0, 5)
                }, null, 2);
            }
        } catch (error: any) {
            console.error('Post context error:', error.message);
            return JSON.stringify({
                error: 'Failed to fetch post context',
                message: error.message
            });
        }
    },
    {
        name: "getPostContext",
        description: "Get detailed context for a specific post including comments, replies, crossposts, and engagement patterns.",
        schema: z.object({
            platform: z.enum(['reddit', 'farcaster']).describe("Platform of the post"),
            postId: z.string().describe("Post ID or hash")
        })
    }
);

const getUserInfo = tool(
    async ({ platform, identifier }: { platform: 'reddit' | 'farcaster'; identifier: string }) => {
        try {
            if (platform === 'reddit') {
                const userInfo = await getRedditUserInfo(identifier);
                return JSON.stringify(userInfo || { error: 'User not found' }, null, 2);
            } else {
                const fid = parseInt(identifier);
                if (isNaN(fid)) {
                    return JSON.stringify({ error: 'Invalid Farcaster FID' });
                }
                const userInfo = await getFarcasterUserInfo(fid);
                return JSON.stringify(userInfo || { error: 'User not found' }, null, 2);
            }
        } catch (error: any) {
            console.error('User info error:', error.message);
            return JSON.stringify({
                error: 'Failed to fetch user info',
                message: error.message
            });
        }
    },
    {
        name: "getUserInfo",
        description: "Get detailed information about a user including account age, followers, karma/reputation, and verification status.",
        schema: z.object({
            platform: z.enum(['reddit', 'farcaster']).describe("Platform of the user"),
            identifier: z.string().describe("Username for Reddit or FID for Farcaster")
        })
    }
);

const analyzePropagationPatterns = tool(
    async ({ posts }: { posts: SocialPost[] }) => {
        try {
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
    searchSocialPlatforms,
    getPostContext,
    getUserInfo,
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
    const systemPrompt = `You are the Propagation & Pattern Agent for VeriChain, a misinformation detection system.

Your mission: Analyze how a claim is spreading across social platforms to detect:
- Bot-like activity (coordinated posting, low engagement, new accounts)
- Coordinated campaigns (same content, similar timing, related accounts)
- Propaganda patterns (sudden spikes, single-source dominance, suspicious accounts)

You have access to these tools:
1. searchSocialPlatforms: Search Reddit and Farcaster for posts about the claim
2. getPostContext: Get detailed context for specific posts (comments, replies, crossposts)
3. getUserInfo: Get account information for suspicious users
4. analyzePropagationPatterns: Run statistical analysis on collected posts

Analysis workflow:
1. If socialMetadata.posts are provided, start with analyzePropagationPatterns
2. If no posts provided, use searchSocialPlatforms to find posts about the claim
3. For suspicious patterns, dig deeper with getPostContext and getUserInfo
4. Focus on: timing patterns, account characteristics, content similarity, engagement rates

Be thorough but efficient. Your goal is to detect inauthentic coordination, not judge content truth.`;

    const hasPosts = state.socialMetadata?.posts && state.socialMetadata.posts.length > 0;
    const postsInfo = hasPosts
        ? `\n\nPre-collected posts: ${state.socialMetadata?.posts?.length} posts from previous agents`
        : "\n\nNo posts provided - you'll need to search social platforms";

    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`Analyze propagation patterns for this claim:\n\n"${state.claim}"${postsInfo}\n\n${hasPosts ? 'Start by analyzing the provided posts with analyzePropagationPatterns.' : 'Start by searching social platforms for posts about this claim.'}`)
        ])
    };
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
    const verdictPrompt = `Based on all your propagation analysis and tool results, provide a final verdict.

Return ONLY valid JSON in this EXACT format:
{
  "suspicionScore": 0.75,
  "confidence": 0.85,
  "flags": ["bot_like_activity", "coordinated_campaign", "sudden_spike"],
  "summary": "1-2 sentence explanation of propagation patterns",
  "suspiciousAccounts": [
    {
      "author": "username",
      "platform": "reddit",
      "reason": "New account with high posting frequency",
      "score": 0.8
    }
  ],
  "propagationMetrics": {
    "totalPosts": 50,
    "uniqueAuthors": 15,
    "timeSpan": 24,
    "avgEngagement": 3.5,
    "platforms": ["reddit", "farcaster"],
    "burstActivity": true
  },
  "needsMediaForensics": false,
  "needsOtherAgents": []
}

Scoring guide:
- suspicionScore: 0-100 (0=completely organic, 100=highly suspicious coordination)
- confidence: 0-1 (how confident you are)
- flags: array of detected patterns (e.g., "bot_like_activity", "coordinated_campaign", "burst_activity", "low_engagement", "new_accounts", "duplicate_content", "single_platform_dominance")
- needsMediaForensics: true if you found media manipulation patterns (set to true if posts contain suspicious images/videos)
- needsOtherAgents: array of agent names if you need their analysis (e.g., ["logicAgent", "citationAgent"])

Be precise and objective. No preamble, just JSON.`;

    const verdictMessage = await llm.invoke([
        ...state.messages,
        new HumanMessage(verdictPrompt)
    ]);

    try {
        const content = typeof verdictMessage.content === 'string'
            ? verdictMessage.content
            : JSON.stringify(verdictMessage.content);

        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;

        const verdict = JSON.parse(jsonStr);

        return {
            suspicionScore: verdict.suspicionScore ?? 0.0,
            confidence: verdict.confidence ?? 0.5,
            flags: verdict.flags || [],
            summary: verdict.summary || "No summary provided",
            suspiciousAccounts: verdict.suspiciousAccounts || [],
            propagationMetrics: verdict.propagationMetrics || {
                totalPosts: 0,
                uniqueAuthors: 0,
                timeSpan: 0,
                avgEngagement: 0,
                platforms: [],
                burstActivity: false
            },
            needsMediaForensics: verdict.needsMediaForensics ?? false,
            needsOtherAgents: verdict.needsOtherAgents || []
        };
    } catch (error) {
        console.error("Failed to parse propagation verdict:", error);
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
    const lastMessage = state.messages.at(-1);

    if (!lastMessage) return END;

    if (hasToolCalls(lastMessage)) {
        return "processToolResults";
    }

    const hasToolResults = state.messages.some(msg => msg._getType() === 'tool');
    if (hasToolResults && !state.summary) {
        return "extractVerdict";
    }

    if (!hasToolResults && state.messages.length >= 2 && !state.summary) {
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