// src/utils/socialFetcher.ts
import axios from 'axios';
import { env } from '../config/env.config.js';

export interface SocialPost {
    id: string;
    platform: 'reddit' | 'farcaster';
    author: string;
    authorId: string;
    content: string;
    createdAt: Date;
    engagement: {
        likes: number;
        comments: number;
        shares: number;
    };
    metadata: {
        followers?: number;
        accountAge?: number; // days
        verified?: boolean;
        parentPostId?: string; // for replies
        isRepost?: boolean;
    };
    url: string;
}

export interface SocialGraphNode {
    postId: string;
    author: string;
    timestamp: Date;
    children: SocialGraphNode[]; // replies/reposts
    depth: number;
}

export interface RedditSearchResult {
    posts: SocialPost[];
    totalCount: number;
    subreddits: string[];
}

export interface FarcasterSearchResult {
    posts: SocialPost[];
    totalCount: number;
    channels: string[];
}

//REDDIT UTILITIES 

let redditAccessToken: string | null = null;
let redditTokenExpiry: number = 0;

async function getRedditAccessToken(): Promise<string> {
    if (redditAccessToken && Date.now() < redditTokenExpiry) {
        return redditAccessToken;
    }

    try {
        const auth = Buffer.from(
            `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`
        ).toString('base64');

        const response = await axios.post(
            'https://www.reddit.com/api/v1/access_token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: env.REDDIT_REFRESH_TOKEN || ''
            }),
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'VeriChain/1.0'
                }
            }
        );

        redditAccessToken = response.data.access_token;
        redditTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer

        return redditAccessToken !== null ? redditAccessToken : '';
    } catch (error: any) {
        console.error('Reddit auth error:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Reddit');
    }
}

export async function searchRedditPosts(query: string, limit: number = 25): Promise<RedditSearchResult> {
    try {
        const token = await getRedditAccessToken();

        const response = await axios.get('https://oauth.reddit.com/search', {
            params: {
                q: query,
                limit: limit,
                sort: 'new',
                type: 'link,sr'
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'VeriChain/1.0'
            }
        });

        const posts: SocialPost[] = [];
        const subreddits = new Set<string>();

        for (const child of response.data.data.children || []) {
            const post = child.data;

            subreddits.add(post.subreddit);

            posts.push({
                id: post.id,
                platform: 'reddit',
                author: post.author,
                authorId: post.author,
                content: `${post.title}\n\n${post.selftext || ''}`.trim(),
                createdAt: new Date(post.created_utc * 1000),
                engagement: {
                    likes: post.ups || 0,
                    comments: post.num_comments || 0,
                    shares: post.num_crossposts || 0
                },
                metadata: {
                    verified: false,
                    isRepost: post.num_crossposts > 0
                },
                url: `https://reddit.com${post.permalink}`
            });
        }

        return {
            posts,
            totalCount: posts.length,
            subreddits: Array.from(subreddits)
        };
    } catch (error: any) {
        console.error('Reddit search error:', error.response?.data || error.message);
        return {
            posts: [],
            totalCount: 0,
            subreddits: []
        };
    }
}

export async function getRedditPostContext(postId: string): Promise<{
    post: SocialPost | null;
    comments: SocialPost[];
    crossposts: SocialPost[];
}> {
    try {
        const token = await getRedditAccessToken();

        // Get post details
        const postResponse = await axios.get(`https://oauth.reddit.com/api/info`, {
            params: { id: `t3_${postId}` },
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'VeriChain/1.0'
            }
        });

        const postData = postResponse.data.data.children[0]?.data;
        if (!postData) {
            return { post: null, comments: [], crossposts: [] };
        }

        const post: SocialPost = {
            id: postData.id,
            platform: 'reddit',
            author: postData.author,
            authorId: postData.author,
            content: `${postData.title}\n\n${postData.selftext || ''}`.trim(),
            createdAt: new Date(postData.created_utc * 1000),
            engagement: {
                likes: postData.ups || 0,
                comments: postData.num_comments || 0,
                shares: postData.num_crossposts || 0
            },
            metadata: {},
            url: `https://reddit.com${postData.permalink}`
        };

        // Get comments (top level only)
        const commentsResponse = await axios.get(
            `https://oauth.reddit.com${postData.permalink}`,
            {
                params: { limit: 50, depth: 1 },
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'VeriChain/1.0'
                }
            }
        );

        const comments: SocialPost[] = [];
        const commentListing = commentsResponse.data[1]?.data?.children || [];

        for (const child of commentListing) {
            if (child.kind === 't1') {
                const comment = child.data;
                comments.push({
                    id: comment.id,
                    platform: 'reddit',
                    author: comment.author,
                    authorId: comment.author,
                    content: comment.body || '',
                    createdAt: new Date(comment.created_utc * 1000),
                    engagement: {
                        likes: comment.ups || 0,
                        comments: 0,
                        shares: 0
                    },
                    metadata: {
                        parentPostId: postData.id
                    },
                    url: `https://reddit.com${postData.permalink}${comment.id}`
                });
            }
        }

        // Get crossposts
        const crossposts: SocialPost[] = [];
        if (postData.num_crossposts > 0) {
            try {
                const crosspostResponse = await axios.get(
                    `https://oauth.reddit.com/api/info`,
                    {
                        params: { id: postData.crosspost_parent_list?.map((p: any) => `t3_${p.id}`).join(',') },
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': 'VeriChain/1.0'
                        }
                    }
                );

                for (const child of crosspostResponse.data.data.children || []) {
                    const cp = child.data;
                    crossposts.push({
                        id: cp.id,
                        platform: 'reddit',
                        author: cp.author,
                        authorId: cp.author,
                        content: `${cp.title}\n\n${cp.selftext || ''}`.trim(),
                        createdAt: new Date(cp.created_utc * 1000),
                        engagement: {
                            likes: cp.ups || 0,
                            comments: cp.num_comments || 0,
                            shares: cp.num_crossposts || 0
                        },
                        metadata: {
                            isRepost: true,
                            parentPostId: postData.id
                        },
                        url: `https://reddit.com${cp.permalink}`
                    });
                }
            } catch (e) {
                console.error('Failed to fetch crossposts:', e);
            }
        }

        return { post, comments, crossposts };
    } catch (error: any) {
        console.error('Reddit post context error:', error.response?.data || error.message);
        return { post: null, comments: [], crossposts: [] };
    }
}

export async function getRedditUserInfo(username: string): Promise<{
    username: string;
    accountAge: number; // days
    karma: number;
    isVerified: boolean;
    isSuspended: boolean;
} | null> {
    try {
        const token = await getRedditAccessToken();

        const response = await axios.get(`https://oauth.reddit.com/user/${username}/about`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'VeriChain/1.0'
            }
        });

        const user = response.data.data;
        const accountAge = Math.floor((Date.now() - user.created_utc * 1000) / (1000 * 60 * 60 * 24));

        return {
            username: user.name,
            accountAge,
            karma: (user.link_karma || 0) + (user.comment_karma || 0),
            isVerified: user.verified || false,
            isSuspended: user.is_suspended || false
        };
    } catch (error: any) {
        console.error('Reddit user info error:', error.response?.data || error.message);
        return null;
    }
}

//FARCASTER UTILITIES

export async function searchFarcasterCasts(query: string, limit: number = 25): Promise<FarcasterSearchResult> {
    try {
        const response = await axios.get('https://api.neynar.com/v2/farcaster/cast/search', {
            params: {
                q: query,
                limit: limit,
                priority_mode: false
            },
            headers: {
                'api_key': env.NEYNAR_API_KEY || '',
                'Content-Type': 'application/json'
            }
        });

        const posts: SocialPost[] = [];
        const channels = new Set<string>();

        for (const cast of response.data.casts || []) {
            if (cast.channel?.id) {
                channels.add(cast.channel.id);
            }

            posts.push({
                id: cast.hash,
                platform: 'farcaster',
                author: cast.author.username || cast.author.display_name,
                authorId: cast.author.fid.toString(),
                content: cast.text || '',
                createdAt: new Date(cast.timestamp),
                engagement: {
                    likes: cast.reactions?.likes_count || 0,
                    comments: cast.replies?.count || 0,
                    shares: cast.reactions?.recasts_count || 0
                },
                metadata: {
                    followers: cast.author.follower_count || 0,
                    verified: cast.author.power_badge || false,
                    isRepost: cast.parent_hash ? true : false,
                    parentPostId: cast.parent_hash || undefined
                },
                url: `https://warpcast.com/${cast.author.username}/${cast.hash.slice(0, 10)}`
            });
        }

        return {
            posts,
            totalCount: posts.length,
            channels: Array.from(channels)
        };
    } catch (error: any) {
        console.error('Farcaster search error:', error.response?.data || error.message);
        return {
            posts: [],
            totalCount: 0,
            channels: []
        };
    }
}

export async function getFarcasterCastContext(castHash: string): Promise<{
    cast: SocialPost | null;
    replies: SocialPost[];
    recasts: SocialPost[];
}> {
    try {
        // Get cast details
        const castResponse = await axios.get(`https://api.neynar.com/v2/farcaster/cast`, {
            params: {
                identifier: castHash,
                type: 'hash'
            },
            headers: {
                'api_key': env.NEYNAR_API_KEY || '',
                'Content-Type': 'application/json'
            }
        });

        const castData = castResponse.data.cast;
        if (!castData) {
            return { cast: null, replies: [], recasts: [] };
        }

        const cast: SocialPost = {
            id: castData.hash,
            platform: 'farcaster',
            author: castData.author.username || castData.author.display_name,
            authorId: castData.author.fid.toString(),
            content: castData.text || '',
            createdAt: new Date(castData.timestamp),
            engagement: {
                likes: castData.reactions?.likes_count || 0,
                comments: castData.replies?.count || 0,
                shares: castData.reactions?.recasts_count || 0
            },
            metadata: {
                followers: castData.author.follower_count || 0,
                verified: castData.author.power_badge || false
            },
            url: `https://warpcast.com/${castData.author.username}/${castData.hash.slice(0, 10)}`
        };

        // Get replies (conversation)
        const replies: SocialPost[] = [];
        try {
            const conversationResponse = await axios.get(
                `https://api.neynar.com/v2/farcaster/cast/conversation`,
                {
                    params: {
                        identifier: castHash,
                        type: 'hash',
                        reply_depth: 2,
                        include_chronological_parent_casts: false
                    },
                    headers: {
                        'api_key': env.NEYNAR_API_KEY || '',
                        'Content-Type': 'application/json'
                    }
                }
            );

            const conversation = conversationResponse.data.conversation;
            if (conversation?.cast?.direct_replies) {
                for (const reply of conversation.cast.direct_replies) {
                    replies.push({
                        id: reply.hash,
                        platform: 'farcaster',
                        author: reply.author.username || reply.author.display_name,
                        authorId: reply.author.fid.toString(),
                        content: reply.text || '',
                        createdAt: new Date(reply.timestamp),
                        engagement: {
                            likes: reply.reactions?.likes_count || 0,
                            comments: reply.replies?.count || 0,
                            shares: reply.reactions?.recasts_count || 0
                        },
                        metadata: {
                            followers: reply.author.follower_count || 0,
                            verified: reply.author.power_badge || false,
                            parentPostId: castHash
                        },
                        url: `https://warpcast.com/${reply.author.username}/${reply.hash.slice(0, 10)}`
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch replies:', e);
        }

        // Note: Neynar doesn't provide a direct "recasts" endpoint, 
        // but we can infer from the recasts_count
        const recasts: SocialPost[] = [];

        return { cast, replies, recasts };
    } catch (error: any) {
        console.error('Farcaster cast context error:', error.response?.data || error.message);
        return { cast: null, replies: [], recasts: [] };
    }
}

export async function getFarcasterUserInfo(fid: number): Promise<{
    fid: number;
    username: string;
    displayName: string;
    followers: number;
    following: number;
    isVerified: boolean;
    accountAge: number; // days since registration
} | null> {
    try {
        const response = await axios.get('https://api.neynar.com/v2/farcaster/user/bulk', {
            params: {
                fids: fid.toString()
            },
            headers: {
                'api_key': env.NEYNAR_API_KEY || '',
                'Content-Type': 'application/json'
            }
        });

        const user = response.data.users?.[0];
        if (!user) return null;

        // Estimate account age from FID (lower FID = older account)
        // This is a rough heuristic since we don't have exact registration dates
        const accountAge = Math.max(1, Math.floor((100000 - fid) / 100));

        return {
            fid: user.fid,
            username: user.username || '',
            displayName: user.display_name || '',
            followers: user.follower_count || 0,
            following: user.following_count || 0,
            isVerified: user.power_badge || false,
            accountAge
        };
    } catch (error: any) {
        console.error('Farcaster user info error:', error.response?.data || error.message);
        return null;
    }
}

//CROSS-PLATFORM UTILITIES 

export async function searchAllPlatforms(query: string, limit: number = 25): Promise<{
    allPosts: SocialPost[];
    byPlatform: {
        reddit: SocialPost[];
        farcaster: SocialPost[];
    };
}> {
    const [redditResults, farcasterResults] = await Promise.all([
        searchRedditPosts(query, limit),
        searchFarcasterCasts(query, limit)
    ]);

    return {
        allPosts: [...redditResults.posts, ...farcasterResults.posts],
        byPlatform: {
            reddit: redditResults.posts,
            farcaster: farcasterResults.posts
        }
    };
}

export function buildSocialGraph(posts: SocialPost[]): SocialGraphNode[] {
    const nodeMap = new Map<string, SocialGraphNode>();
    const rootNodes: SocialGraphNode[] = [];

    // First pass: create all nodes
    for (const post of posts) {
        const node: SocialGraphNode = {
            postId: post.id,
            author: post.author,
            timestamp: post.createdAt,
            children: [],
            depth: 0
        };
        nodeMap.set(post.id, node);
    }

    // Second pass: build parent-child relationships
    for (const post of posts) {
        const node = nodeMap.get(post.id);
        if (!node) continue;

        if (post.metadata.parentPostId) {
            const parent = nodeMap.get(post.metadata.parentPostId);
            if (parent) {
                parent.children.push(node);
                node.depth = parent.depth + 1;
            } else {
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    }

    return rootNodes;
}

export function calculatePropagationMetrics(posts: SocialPost[]): {
    totalPosts: number;
    uniqueAuthors: number;
    platforms: string[];
    timeSpan: number; // hours
    avgEngagement: number;
    postFrequency: { [key: string]: number }; // posts per hour
    authorFrequency: { [author: string]: number }; // posts per author
    suspiciousPatterns: string[];
} {
    if (posts.length === 0) {
        return {
            totalPosts: 0,
            uniqueAuthors: 0,
            platforms: [],
            timeSpan: 0,
            avgEngagement: 0,
            postFrequency: {},
            authorFrequency: {},
            suspiciousPatterns: []
        };
    }

    const authors = new Set(posts.map(p => p.author));
    const platforms = Array.from(new Set(posts.map(p => p.platform)));

    const timestamps = posts.map(p => p.createdAt.getTime()).sort((a, b) => a - b);
    const timeSpan = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60); // hours

    const totalEngagement = posts.reduce((sum, p) =>
        sum + p.engagement.likes + p.engagement.comments + p.engagement.shares, 0
    );
    const avgEngagement = totalEngagement / posts.length;

    // Calculate posts per hour
    const postFrequency: { [key: string]: number } = {};
    for (const post of posts) {
        const hour = new Date(post.createdAt).toISOString().slice(0, 13); // YYYY-MM-DDTHH
        postFrequency[hour] = (postFrequency[hour] || 0) + 1;
    }

    // Calculate posts per author
    const authorFrequency: { [author: string]: number } = {};
    for (const post of posts) {
        authorFrequency[post.author] = (authorFrequency[post.author] || 0) + 1;
    }

    // Detect suspicious patterns
    const suspiciousPatterns: string[] = [];

    // Check for burst activity (> 10 posts in one hour)
    const maxPostsPerHour = Math.max(...Object.values(postFrequency));
    if (maxPostsPerHour > 10) {
        suspiciousPatterns.push(`burst_activity: ${maxPostsPerHour} posts in one hour`);
    }

    // Check for single author posting multiple times
    const maxPostsPerAuthor = Math.max(...Object.values(authorFrequency));
    if (maxPostsPerAuthor > 5) {
        const spammer = Object.entries(authorFrequency).find(([_, count]) => count === maxPostsPerAuthor)?.[0];
        suspiciousPatterns.push(`repeated_posting: ${spammer} posted ${maxPostsPerAuthor} times`);
    }

    // Check for low engagement (possible bot activity)
    if (avgEngagement < 2 && posts.length > 10) {
        suspiciousPatterns.push('low_engagement: avg < 2 interactions per post');
    }

    // Check for very new accounts
    const newAccounts = posts.filter(p =>
        p.metadata.accountAge !== undefined && p.metadata.accountAge < 30
    ).length;
    if (newAccounts > posts.length * 0.5) {
        suspiciousPatterns.push(`new_accounts: ${newAccounts}/${posts.length} accounts < 30 days old`);
    }

    return {
        totalPosts: posts.length,
        uniqueAuthors: authors.size,
        platforms,
        timeSpan,
        avgEngagement,
        postFrequency,
        authorFrequency,
        suspiciousPatterns
    };
}