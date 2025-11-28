// socialEvidenceAgent.ts
import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';

const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-pro-latest",
    temperature: 0.2
});

class RedditAuthManager {
    private accessToken: string | null = null;
    private accessTokenExpiry: number = 0;
    private refreshToken: string;
    private clientId: string;
    private clientSecret: string;

    constructor() {
        this.refreshToken = env.REDDIT_REFRESH_TOKEN || '';
        this.clientId = env.REDDIT_CLIENT_ID || '';
        this.clientSecret = env.REDDIT_CLIENT_SECRET || '';
    }

    async getAccessToken(): Promise<string> {
        // Check if current token is still valid (with 5 min buffer)
        if (this.accessToken && Date.now() < this.accessTokenExpiry - 5 * 60 * 1000) {
            return this.accessToken;
        }

        // Refresh the access token
        return await this.refreshAccessToken();
    }

    private async refreshAccessToken(): Promise<string> {
        try {
            const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

            const response = await axios.post(
                'https://www.reddit.com/api/v1/access_token',
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken
                }),
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'VeriChain/1.0 by VeriChainBot'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            // Reddit tokens expire in 1 hour (3600 seconds)
            this.accessTokenExpiry = Date.now() + (response.data.expires_in * 1000);

            // If a new refresh token is provided, update it
            if (response.data.refresh_token) {
                this.refreshToken = response.data.refresh_token;
                // In production, you'd want to persist this to your database
                console.log('⚠️ New refresh token received - should be persisted to DB');
            }

            return this.accessToken !== null ? this.accessToken : '';
        } catch (error: any) {
            console.error('Reddit token refresh failed:', error.response?.data || error.message);
            throw new Error(`Reddit authentication failed: ${error.message}`);
        }
    }
}

const redditAuth = new RedditAuthManager();


const searchReddit = tool(
    async ({ query, subreddit, limit = 25, timeFilter = 'week', sortBy = 'relevance' }: {
        query: string;
        subreddit?: string;
        limit?: number;
        timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
        sortBy?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
    }) => {
        try {
            const accessToken = await redditAuth.getAccessToken();

            const searchUrl = subreddit
                ? `https://oauth.reddit.com/r/${subreddit}/search`
                : 'https://oauth.reddit.com/search';

            const response = await axios.get(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'VeriChain/1.0 by VeriChainBot'
                },
                params: {
                    q: query,
                    limit: Math.min(limit, 100),
                    sort: sortBy,
                    t: timeFilter,
                    restrict_sr: subreddit ? 'true' : 'false',
                    type: 'link,self' // both links and text posts
                }
            });

            const posts = response.data.data.children.map((child: any) => {
                const post = child.data;
                return {
                    id: post.id,
                    title: post.title,
                    author: post.author,
                    subreddit: post.subreddit,
                    url: `https://reddit.com${post.permalink}`,
                    selftext: post.selftext?.substring(0, 500) || '', // limit text
                    score: post.score,
                    upvoteRatio: post.upvote_ratio,
                    numComments: post.num_comments,
                    created: new Date(post.created_utc * 1000).toISOString(),
                    flair: post.link_flair_text || null,
                    isVideo: post.is_video,
                    domain: post.domain
                };
            });

            return JSON.stringify({
                query,
                subreddit: subreddit || 'all',
                totalResults: posts.length,
                posts
            }, null, 2);

        } catch (error: any) {
            console.error('Reddit search error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Reddit search failed',
                message: error.response?.data?.message || error.message,
                query
            });
        }
    },
    {
        name: "searchReddit",
        description: "Search Reddit for posts and discussions related to a claim. Can search across all Reddit or within specific subreddits. Returns post titles, content, scores, and engagement metrics.",
        schema: z.object({
            query: z.string().describe("Search query for Reddit posts"),
            subreddit: z.string().optional().describe("Specific subreddit to search in (e.g., 'news', 'science')"),
            limit: z.number().optional().default(25).describe("Number of posts to return (max 100)"),
            timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('week'),
            sortBy: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().default('relevance')
        })
    }
);

const getRedditComments = tool(
    async ({ postId, sort = 'top', limit = 50 }: {
        postId: string;
        sort?: 'confidence' | 'top' | 'new' | 'controversial' | 'old' | 'qa';
        limit?: number;
    }) => {
        try {
            const accessToken = await redditAuth.getAccessToken();

            // Get post details and comments
            const response = await axios.get(
                `https://oauth.reddit.com/comments/${postId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'User-Agent': 'VeriChain/1.0 by VeriChainBot'
                    },
                    params: {
                        sort,
                        limit,
                        depth: 3, // how deep to traverse comment tree
                        showmore: true
                    }
                }
            );

            const postData = response.data[0].data.children[0].data;
            const commentsData = response.data[1].data.children;

            const comments = commentsData
                .filter((child: any) => child.kind === 't1') // t1 = comment
                .map((child: any) => {
                    const comment = child.data;
                    return {
                        id: comment.id,
                        author: comment.author,
                        body: comment.body?.substring(0, 1000) || '', // limit
                        score: comment.score,
                        created: new Date(comment.created_utc * 1000).toISOString(),
                        isSubmitter: comment.is_submitter,
                        stickied: comment.stickied,
                        depth: comment.depth,
                        controversiality: comment.controversiality
                    };
                });

            return JSON.stringify({
                post: {
                    id: postData.id,
                    title: postData.title,
                    author: postData.author,
                    score: postData.score,
                    numComments: postData.num_comments
                },
                totalComments: comments.length,
                comments
            }, null, 2);

        } catch (error: any) {
            console.error('Reddit comments error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Failed to fetch Reddit comments',
                message: error.message,
                postId
            });
        }
    },
    {
        name: "getRedditComments",
        description: "Fetch comments and discussion from a specific Reddit post. Useful for analyzing community sentiment and detailed reactions to claims.",
        schema: z.object({
            postId: z.string().describe("Reddit post ID (e.g., '15zkd6o')"),
            sort: z.enum(['confidence', 'top', 'new', 'controversial', 'old', 'qa']).optional().default('top'),
            limit: z.number().optional().default(50).describe("Max comments to return")
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
    searchReddit,
    getRedditComments,
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
                1. searchReddit: Search Reddit for posts and discussions
                2. getRedditComments: Get detailed comments from specific Reddit posts
                3. searchFarcaster: Search Farcaster (decentralized social) for relevant casts
                4. getFarcasterUserInfo: Get credibility info about Farcaster users
                5. scrapeTwitter: Scrape Twitter for tweets (requires setup)
                6. analyzeSocialSentiment: Analyze sentiment across collected posts

                Analysis workflow:
                1. Search Reddit for discussions (try relevant subreddits first)
                2. Search Farcaster for related casts
                3. If Twitter scraper is available, search Twitter
                4. For high-engagement posts, fetch comments/replies for deeper analysis
                5. Use sentiment analysis on collected posts
                6. Identify: consensus vs. debate, coordinated messaging, expert voices

                Focus on:
                - Quality over quantity (high-engagement, credible users)
                - Distinguishing genuine discussion from manipulation
                - Identifying expert/authoritative voices
                - Detecting coordinated campaigns or bot behavior`;

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