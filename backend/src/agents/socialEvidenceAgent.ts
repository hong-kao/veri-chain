import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatOpenAI } from '@langchain/openai';;
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';
import { scrapeWebsite } from '../utils/scraper.js';

const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY || '',
    model: "gpt-4o-mini",
    temperature: 0.2
});

// Scrape Reddit using web scraping instead of API
const scrapeReddit = tool(
    async ({ query, subreddit, limit = 25, timeFilter = 'week', sortBy = 'relevance' }: {
        query: string;
        subreddit?: string;
        limit?: number;
        timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
        sortBy?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
    }) => {
        try {
            // Build Reddit search URL
            const baseUrl = subreddit
                ? `https://www.reddit.com/r/${subreddit}/search`
                : 'https://www.reddit.com/search';

            const params = new URLSearchParams({
                q: query,
                sort: sortBy,
                t: timeFilter,
                ...(subreddit ? { restrict_sr: 'on' } : {})
            });

            const url = `${baseUrl}?${params.toString()}`;

            console.log(`Scraping Reddit: ${url}`);

            const result = await scrapeWebsite({
                url,
                extractType: 'full',
                timeout: 15000,
                waitForSelector: '[data-testid="post-container"], .Post',
                removeElements: ['script', 'style', 'nav', 'footer', 'ads', 'iframe']
            });

            if (!result.success) {
                return JSON.stringify({
                    error: 'Reddit scraping failed',
                    message: result.error || 'Failed to load Reddit page',
                    query,
                    subreddit
                });
            }

            // Simple parsing of scraped content - looking for post patterns
            const content = result.content || '';
            const posts = [];

            // This is a simplified parser - in production you'd want more robust parsing
            // Note: Reddit's HTML structure changes, so this is a basic example
            const postMatches = content.match(/points.*?comments/gi) || [];
            const limitedMatches = postMatches.slice(0, Math.min(limit, 25));

            for (let i = 0; i < limitedMatches.length; i++) {
                posts.push({
                    id: `scraped_${i}`,
                    title: `Post ${i + 1} from search results`,
                    snippet: limitedMatches[i].substring(0, 200),
                    url: url,
                    note: 'Scraped content - limited metadata available'
                });
            }

            return JSON.stringify({
                query,
                subreddit: subreddit || 'all',
                totalResults: posts.length,
                posts,
                source: 'web_scraping',
                note: 'Reddit API not available - using web scraping. Results are limited.'
            }, null, 2);

        } catch (error: any) {
            console.error('Reddit scraping error:', error.message);
            return JSON.stringify({
                error: 'Reddit scraping failed',
                message: error.message,
                query,
                note: 'Consider using Reddit API if available, or implement more robust scraping'
            });
        }
    },
    {
        name: "scrapeReddit",
        description: "Scrape Reddit for posts and discussions using web scraping (no API). Returns limited information from search results. Note: May be unreliable compared to official API.",
        schema: z.object({
            query: z.string().describe("Search query for Reddit posts"),
            subreddit: z.string().optional().describe("Specific subreddit to search in (e.g., 'news', 'science')"),
            limit: z.number().optional().default(25).describe("Number of posts to attempt to extract (max 25)"),
            timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('week'),
            sortBy: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().default('relevance')
        })
    }
);

const searchFarcaster = tool(
    async ({ query, limit = 25, priority = 'relevance' }: {
        query: string;
        limit?: number;
        priority?: 'relevance' | 'likes' | 'recasts' | 'replies';
    }) => {
        try {
            const response = await axios.get(
                'https://api.neynar.com/v2/farcaster/cast/search',
                {
                    headers: {
                        'x-api-key': env.NEYNAR_API_KEY || '',
                        'Content-Type': 'application/json'
                    },
                    params: {
                        q: query,
                        limit: Math.min(limit, 100),
                        priority_mode: priority === 'relevance' ? false : true
                    }
                }
            );

            const casts = response.data.result.casts.map((cast: any) => ({
                hash: cast.hash,
                text: cast.text,
                author: {
                    fid: cast.author.fid,
                    username: cast.author.username,
                    displayName: cast.author.display_name,
                    followerCount: cast.author.follower_count,
                    verifications: cast.author.verifications || []
                },
                timestamp: cast.timestamp,
                reactions: {
                    likes: cast.reactions?.likes_count || 0,
                    recasts: cast.reactions?.recasts_count || 0,
                    replies: cast.replies?.count || 0
                },
                channel: cast.channel ? {
                    id: cast.channel.id,
                    name: cast.channel.name,
                    url: cast.channel.url
                } : null,
                embeds: cast.embeds || [],
                mentionedProfiles: cast.mentioned_profiles || []
            }));

            return JSON.stringify({
                query,
                totalResults: casts.length,
                casts
            }, null, 2);

        } catch (error: any) {
            console.error('Farcaster search error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Farcaster search failed',
                message: error.response?.data?.message || error.message,
                query
            });
        }
    },
    {
        name: "searchFarcaster",
        description: "Search Farcaster (via Neynar) for casts (posts) related to a claim. Returns cast content, author info, engagement metrics, and channel context.",
        schema: z.object({
            query: z.string().describe("Search query for Farcaster casts"),
            limit: z.number().optional().default(25).describe("Number of casts to return (max 100)"),
            priority: z.enum(['relevance', 'likes', 'recasts', 'replies']).optional().default('relevance')
        })
    }
);

const getFarcasterUserInfo = tool(
    async ({ username, fid }: { username?: string; fid?: number }) => {
        try {
            if (!username && !fid) {
                throw new Error('Either username or fid must be provided');
            }

            const endpoint = fid
                ? `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`
                : `https://api.neynar.com/v2/farcaster/user/search?q=${username}&limit=1`;

            const response = await axios.get(endpoint, {
                headers: {
                    'x-api-key': env.NEYNAR_API_KEY || '',
                    'Content-Type': 'application/json'
                }
            });

            const user = fid
                ? response.data.users[0]
                : response.data.result.users[0];

            if (!user) {
                return JSON.stringify({ error: 'User not found' });
            }

            return JSON.stringify({
                fid: user.fid,
                username: user.username,
                displayName: user.display_name,
                bio: user.profile?.bio?.text || '',
                followerCount: user.follower_count,
                followingCount: user.following_count,
                verifications: user.verifications || [],
                verifiedAddresses: user.verified_addresses || {},
                powerBadge: user.power_badge || false,
                activeStatus: user.active_status || 'inactive'
            }, null, 2);

        } catch (error: any) {
            console.error('Farcaster user info error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Failed to fetch Farcaster user info',
                message: error.message
            });
        }
    },
    {
        name: "getFarcasterUserInfo",
        description: "Get detailed information about a Farcaster user by username or FID. Returns profile details, follower counts, verifications, and credibility indicators.",
        schema: z.object({
            username: z.string().optional().describe("Farcaster username (e.g., 'dwr')"),
            fid: z.number().optional().describe("Farcaster ID (FID)")
        })
    }
);

const scrapeTwitter = tool(
    async ({ query, mode = 'top', limit = 20 }: {
        query: string;
        mode?: 'top' | 'latest' | 'people' | 'photos' | 'videos';
        limit?: number;
    }) => {
        try {
            // Using a simple scraper approach - in production you'd use a proper Twitter scraper library
            // like 'twitter-scraper' or 'agent-twitter-client' or similar

            // For now, returning mock structure - you'll need to implement actual scraping
            // Options: 
            // 1. Use Apify Twitter scraper
            // 2. Use unofficial Twitter API wrappers
            // 3. Use headless browser (Puppeteer/Playwright)

            console.warn('Twitter scraping not fully implemented - requires scraper setup');

            return JSON.stringify({
                query,
                mode,
                message: 'Twitter scraping requires additional setup. Please implement using Apify, Puppeteer, or similar scraper.',
                tweets: [],
                note: 'Consider using: twitter-scraper npm package, Apify Twitter scraper, or Puppeteer-based solution'
            });

        } catch (error: any) {
            console.error('Twitter scraping error:', error.message);
            return JSON.stringify({
                error: 'Twitter scraping failed',
                message: error.message,
                query
            });
        }
    },
    {
        name: "scrapeTwitter",
        description: "Scrape Twitter for tweets related to a claim. Note: Requires scraper implementation (Apify/Puppeteer). Returns tweet content, engagement, and author info.",
        schema: z.object({
            query: z.string().describe("Search query for Twitter"),
            mode: z.enum(['top', 'latest', 'people', 'photos', 'videos']).optional().default('top'),
            limit: z.number().optional().default(20).describe("Max tweets to scrape")
        })
    }
);


const analyzeSocialSentiment = tool(
    async ({ posts }: { posts: Array<{ text: string; score?: number; engagement?: any }> }) => {
        try {
            // Simple sentiment analysis
            const sentiments = posts.map(post => {
                const text = post.text.toLowerCase();

                // Positive keywords
                const positiveWords = ['true', 'accurate', 'correct', 'confirmed', 'verified', 'agree', 'support', 'evidence'];
                const positiveCount = positiveWords.filter(word => text.includes(word)).length;

                // Negative keywords
                const negativeWords = ['false', 'fake', 'misinformation', 'debunked', 'wrong', 'lie', 'misleading', 'hoax'];
                const negativeCount = negativeWords.filter(word => text.includes(word)).length;

                // Skeptical keywords
                const skepticalWords = ['doubt', 'questionable', 'unclear', 'unverified', 'suspicious', 'allegedly'];
                const skepticalCount = skepticalWords.filter(word => text.includes(word)).length;

                let sentiment: 'supportive' | 'skeptical' | 'opposing' | 'neutral';

                if (positiveCount > negativeCount + skepticalCount) {
                    sentiment = 'supportive';
                } else if (negativeCount > positiveCount) {
                    sentiment = 'opposing';
                } else if (skepticalCount > 0) {
                    sentiment = 'skeptical';
                } else {
                    sentiment = 'neutral';
                }

                return {
                    text: post.text.substring(0, 200),
                    sentiment,
                    indicators: {
                        positive: positiveCount,
                        negative: negativeCount,
                        skeptical: skepticalCount
                    },
                    score: post.score || 0,
                    engagement: post.engagement
                };
            });

            const summary = {
                totalAnalyzed: sentiments.length,
                breakdown: {
                    supportive: sentiments.filter(s => s.sentiment === 'supportive').length,
                    opposing: sentiments.filter(s => s.sentiment === 'opposing').length,
                    skeptical: sentiments.filter(s => s.sentiment === 'skeptical').length,
                    neutral: sentiments.filter(s => s.sentiment === 'neutral').length
                },
                overallSentiment: 'mixed' as 'supportive' | 'opposing' | 'skeptical' | 'mixed',
                highEngagementPosts: sentiments
                    .sort((a, b) => (b.score || 0) - (a.score || 0))
                    .slice(0, 5)
            };

            // Determine overall sentiment
            const { supportive, opposing, skeptical, neutral } = summary.breakdown;
            if (supportive > opposing && supportive > skeptical) {
                summary.overallSentiment = 'supportive';
            } else if (opposing > supportive) {
                summary.overallSentiment = 'opposing';
            } else if (skeptical > supportive / 2) {
                summary.overallSentiment = 'skeptical';
            }

            return JSON.stringify({ summary, sentiments }, null, 2);

        } catch (error: any) {
            console.error('Sentiment analysis error:', error.message);
            return JSON.stringify({
                error: 'Sentiment analysis failed',
                message: error.message
            });
        }
    },
    {
        name: "analyzeSocialSentiment",
        description: "Analyze sentiment and stance towards a claim across social media posts. Categorizes posts as supportive, opposing, skeptical, or neutral.",
        schema: z.object({
            posts: z.array(z.object({
                text: z.string(),
                score: z.number().optional(),
                engagement: z.any().optional()
            })).describe("Array of social media posts to analyze")
        })
    }
);

const tools = [
    scrapeReddit,
    searchFarcaster,
    getFarcasterUserInfo,
    scrapeTwitter,
    analyzeSocialSentiment
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);


const SocialEvidenceState = Annotation.Root({
    ...MessagesAnnotation.spec,

    // Input
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),

    // Analysis outputs
    redditEvidence: Annotation<Array<{
        post: any;
        relevance: string;
        sentiment: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    farcasterEvidence: Annotation<Array<{
        cast: any;
        relevance: string;
        sentiment: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    twitterEvidence: Annotation<Array<{
        tweet: any;
        relevance: string;
        sentiment: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    overallSentiment: Annotation<{
        consensus: 'supportive' | 'opposing' | 'skeptical' | 'mixed';
        confidence: number;
        distribution: any;
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({ consensus: 'mixed', confidence: 0.5, distribution: {} })
    }),
    keyDiscussions: Annotation<string[]>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    socialScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    explanation: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    })
});

function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message &&
        Array.isArray((message as any).tool_calls) &&
        (message as any).tool_calls.length > 0;
}

async function analyzeSocialEvidence(state: typeof SocialEvidenceState.State) {
    const systemPrompt = `You are the Social Evidence Agent for VeriChain, a misinformation detection system.

                Your mission: Gather and analyze social media discussions around claims to understand public sentiment, identify key debates, and detect coordinated narratives.

                You have access to these tools:
                1. scrapeReddit: Scrape Reddit for posts (using web scraping - no API)
                2. searchFarcaster: Search Farcaster (decentralized social) for relevant casts
                3. getFarcasterUserInfo: Get credibility info about Farcaster users
                4. scrapeTwitter: Scrape Twitter for tweets (requires setup)
                5. analyzeSocialSentiment: Analyze sentiment across collected posts

                Analysis workflow:
                1. Try scraping Reddit for discussions (note: scraping has limitations)
                2. Search Farcaster for related casts (this uses proper API)
                3. If Twitter scraper is available, search Twitter
                4. Use sentiment analysis on collected posts
                5. Identify: consensus vs. debate, coordinated messaging, expert voices

                Focus on:
                - Quality over quantity (high-engagement, credible users)
                - Distinguishing genuine discussion from manipulation
                - Identifying expert/authoritative voices
                - Detecting coordinated campaigns or bot behavior

                IMPORTANT: Reddit scraping is limited - prioritize Farcaster which uses a proper API.`;

    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`Analyze social media evidence for this claim:\n\n"${state.claim}"\n\nSearch across Reddit and Farcaster. Prioritize credible discussions and high-engagement content. Look for: expert consensus, public sentiment, key debates, and any coordinated narratives.`)
        ])
    };
}

async function processToolResults(state: typeof SocialEvidenceState.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }

    const result: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await (tool as any).invoke(toolCall);
        result.push(observation);
    }

    return { messages: result };
}

async function extractVerdict(state: typeof SocialEvidenceState.State) {
    const verdictPrompt = `Based on all social media evidence you've gathered, provide a final social evidence verdict.

            Return ONLY valid JSON in this EXACT format:
            {
            "socialScore": 0.65,
            "confidence": 0.75,
            "overallSentiment": {
                "consensus": "skeptical",
                "confidence": 0.7,
                "distribution": {
                "supportive": 20,
                "opposing": 35,
                "skeptical": 30,
                "neutral": 15
                }
            },
            "redditEvidence": [
                {
                "post": {"title": "...", "score": 100, "url": "..."},
                "relevance": "high",
                "sentiment": "opposing"
                }
            ],
            "farcasterEvidence": [
                {
                "cast": {"text": "...", "author": "...", "reactions": {...}},
                "relevance": "medium",
                "sentiment": "skeptical"
                }
            ],
            "twitterEvidence": [],
            "keyDiscussions": [
                "Main debate point 1",
                "Main debate point 2"
            ],
            "explanation": "Brief summary of social media sentiment and key findings"
            }

            Scoring guide:
            - socialScore: 0-1 (0=claim widely rejected, 1=widely accepted)
            - consensus: "supportive" | "opposing" | "skeptical" | "mixed"
            - confidence: 0-1 (how confident you are in the assessment)

            Be objective. Consider both quantity and quality of engagement.`;

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
            socialScore: verdict.socialScore ?? 0.5,
            confidence: verdict.confidence ?? 0.5,
            overallSentiment: verdict.overallSentiment || { consensus: 'mixed', confidence: 0.5, distribution: {} },
            redditEvidence: verdict.redditEvidence || [],
            farcasterEvidence: verdict.farcasterEvidence || [],
            twitterEvidence: verdict.twitterEvidence || [],
            keyDiscussions: verdict.keyDiscussions || [],
            explanation: verdict.explanation || "No explanation provided"
        };
    } catch (error) {
        console.error("Failed to parse social evidence verdict:", error);
        return {
            socialScore: 0.5,
            confidence: 0.3,
            overallSentiment: { consensus: 'mixed', confidence: 0.3, distribution: {} },
            explanation: "Error processing social evidence analysis"
        };
    }
}

async function shouldContinue(state: typeof SocialEvidenceState.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage) return END;

    if (hasToolCalls(lastMessage)) {
        return "processToolResults";
    }

    const hasToolResults = state.messages.some(msg => msg._getType() === 'tool');
    if (hasToolResults && !state.explanation) {
        return "extractVerdict";
    }

    if (!hasToolResults && state.messages.length >= 2 && !state.explanation) {
        return "extractVerdict";
    }

    return END;
}

const socialEvidenceAgent = new StateGraph(SocialEvidenceState)
    .addNode("analyzeSocialEvidence", analyzeSocialEvidence)
    .addNode("processToolResults", processToolResults)
    .addNode("extractVerdict", extractVerdict)
    .addEdge(START, "analyzeSocialEvidence")
    .addConditionalEdges("analyzeSocialEvidence", shouldContinue, {
        "processToolResults": "processToolResults",
        "extractVerdict": "extractVerdict",
        [END]: END
    })
    .addEdge("processToolResults", "analyzeSocialEvidence")
    .addEdge("extractVerdict", END)
    .compile();

export { socialEvidenceAgent, SocialEvidenceState };

// ============================================
// TESTING
// ============================================
async function testSocialEvidenceAgent() {
    console.log("🔍 Testing Social Evidence Agent (MCP)\n");

    const testCases = [
        {
            name: "Scientific Claim",
            claim: "New study shows Mediterranean diet reduces heart disease risk by 30%"
        },
        {
            name: "Political Claim",
            claim: "Senate passes new climate legislation with bipartisan support"
        },
        {
            name: "Tech Claim",
            claim: "Apple announces revolutionary foldable iPhone launching next month"
        },
        {
            name: "Conspiracy Theory",
            claim: "5G towers are causing COVID-19 symptoms in nearby residents"
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"\n`);

        try {
            const result = await socialEvidenceAgent.invoke({
                claim: testCase.claim,
                messages: []
            });

            console.log("\n📊 SOCIAL EVIDENCE ANALYSIS RESULTS:");
            console.log("━".repeat(70));

            console.log(`\n🎯 Social Score: ${(result.socialScore * 100).toFixed(1)}%`);
            console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);

            console.log(`\n📈 Overall Sentiment:`);
            console.log(`   Consensus: ${result.overallSentiment.consensus.toUpperCase()}`);
            console.log(`   Confidence: ${(result.overallSentiment.confidence * 100).toFixed(1)}%`);

            if (result.overallSentiment.distribution) {
                console.log(`\n   Distribution:`);
                const dist = result.overallSentiment.distribution;
                console.log(`   - Supportive: ${dist.supportive || 0}%`);
                console.log(`   - Opposing: ${dist.opposing || 0}%`);
                console.log(`   - Skeptical: ${dist.skeptical || 0}%`);
                console.log(`   - Neutral: ${dist.neutral || 0}%`);
            }

            console.log(`\n🔍 Evidence Collected:`);
            console.log(`   Reddit Posts: ${result.redditEvidence?.length || 0}`);
            console.log(`   Farcaster Casts: ${result.farcasterEvidence?.length || 0}`);
            console.log(`   Twitter Posts: ${result.twitterEvidence?.length || 0}`);

            if (result.redditEvidence && result.redditEvidence.length > 0) {
                console.log(`\n📱 Top Reddit Evidence:`);
                result.redditEvidence.slice(0, 3).forEach((evidence: any, idx: number) => {
                    console.log(`\n   ${idx + 1}. ${evidence.post.title || 'Untitled'}`);
                    console.log(`      Score: ${evidence.post.score || 0} | Sentiment: ${evidence.sentiment}`);
                    console.log(`      Relevance: ${evidence.relevance}`);
                    if (evidence.post.url) {
                        console.log(`      URL: ${evidence.post.url}`);
                    }
                });
            }

            if (result.farcasterEvidence && result.farcasterEvidence.length > 0) {
                console.log(`\n🎭 Top Farcaster Evidence:`);
                result.farcasterEvidence.slice(0, 3).forEach((evidence: any, idx: number) => {
                    console.log(`\n   ${idx + 1}. ${evidence.cast.text?.substring(0, 100) || 'No text'}...`);
                    console.log(`      Author: ${evidence.cast.author || 'Unknown'}`);
                    console.log(`      Sentiment: ${evidence.sentiment} | Relevance: ${evidence.relevance}`);
                    if (evidence.cast.reactions) {
                        console.log(`      Engagement: ${evidence.cast.reactions.likes || 0} likes, ${evidence.cast.reactions.recasts || 0} recasts`);
                    }
                });
            }

            if (result.keyDiscussions && result.keyDiscussions.length > 0) {
                console.log(`\n💬 Key Discussions:`);
                result.keyDiscussions.forEach((discussion: string, idx: number) => {
                    console.log(`   ${idx + 1}. ${discussion}`);
                });
            }

            console.log(`\n📝 Explanation:`);
            console.log(`   ${result.explanation || 'No explanation provided'}`);

            console.log(`\n🔧 Debug - Tool Calls Made:`);
            const toolMessages = result.messages.filter((m: BaseMessage) =>
                m._getType() === 'ai' && hasToolCalls(m)
            );
            if (toolMessages.length > 0) {
                toolMessages.forEach((msg: BaseMessage, idx: number) => {
                    if (hasToolCalls(msg)) {
                        console.log(`   ${idx + 1}. ${msg.tool_calls.map((tc: ToolCall) => tc.name).join(', ')}`);
                    }
                });
            } else {
                console.log(`   No tool calls made`);
            }

            console.log(`\n✅ Test completed successfully`);

        } catch (error: any) {
            console.error(`\n❌ Test failed:`, error.message);
            if (error.response?.data) {
                console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
            }
        }

        // Add delay between tests to respect API rate limits
        if (testCase !== testCases[testCases.length - 1]) {
            console.log(`\n⏳ Waiting 3 seconds before next test...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`🎉 All tests completed!`);
    console.log(`${"=".repeat(70)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    testSocialEvidenceAgent();
}