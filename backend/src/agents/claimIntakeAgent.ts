import { z } from "zod";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";

const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-pro-latest",
    temperature: 0.1,
});

//State Def
const ClaimIntakeState = Annotation.Root({
    ...MessagesAnnotation.spec,
    //Input
    rawInput: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    // Normalized outputs
    claimText: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    claimType: Annotation<"text" | "image" | "video" | "link" | "mixed">({
        reducer: (x, y) => y ?? x,
        default: () => "text"
    }),
    extractedUrls: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    platformMetadata: Annotation<{
        platform?: string;
        author?: string;
        timestamp?: string;
        engagement?: {
            likes?: number;
            retweets?: number;
            comments?: number;
        };
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({})
    }),
    mediaUrls: Annotation<{
        images: string[];
        videos: string[];
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({ images: [], videos: [] })
    }),
    normalizedClaim: Annotation<{
        text: string;
        urls: string[];
        media: { images: string[]; videos: string[] };
        platform: string;
        metadata: Record<string, any>;
    } | null>({
        reducer: (x, y) => y ?? x,
        default: () => null
    }),
    error: Annotation<string | null>({
        reducer: (x, y) => y ?? x,
        default: () => null
    })
});

async function parseInput(state: typeof ClaimIntakeState.State) {
    const systemPrompt = `You are a Claim Intake Agent for VeriChain.
                Your job is to parse and normalize raw social media (reddit/twitter etc) posts, news claims, links, or claims into structured data.

                Extract the following from the input:
                1. The main claim text (clean, without metadata noise)
                2. All URLs found in the text
                3. Image URLs (look for .jpg, .png, .gif, .webp, or image hosting services)
                4. Video URLs (look for .mp4, youtube.com, vimeo.com, etc.)
                5. Platform metadata (Twitter/X, Reddit, Farcaster, etc.)
                6. Author information if present
                7. Engagement metrics (likes, retweets, comments) if present
                8. Timestamp if present

                Return ONLY valid JSON in this format:
                {
                "claimText": "The actual claim without URLs or metadata",
                "claimType": "text|image|video|link|mixed",
                "extractedUrls": ["url1", "url2"],
                "platformMetadata": {
                    "platform": "Twitter",
                    "author": "@username",
                    "timestamp": "2024-01-15T10:30:00Z",
                    "engagement": {
                    "likes": 1234,
                    "retweets": 567,
                    "comments": 89
                    }
                },
                "mediaUrls": {
                    "images": ["image_url1", "image_url2"],
                    "videos": ["video_url1"]
                }
                }

                If any field is not found, use empty string, empty array, or empty object as appropriate.`;

    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Parse and normalize this input:\n\n${state.rawInput}`)
    ]);

    return {
        messages: [response]
    };
}

async function extractStructuredData(state: typeof ClaimIntakeState.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage) {
        return {
            error: "No response from parsing step",
            normalizedClaim: null
        };
    }

    try {
        const content = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);

        //Extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;

        const parsed = JSON.parse(jsonStr);

        //Validate and structure the output
        const normalizedClaim = {
            text: parsed.claimText || state.rawInput,
            urls: parsed.extractedUrls || [],
            media: {
                images: parsed.mediaUrls?.images || [],
                videos: parsed.mediaUrls?.videos || []
            },
            platform: parsed.platformMetadata?.platform || "unknown",
            metadata: {
                author: parsed.platformMetadata?.author || null,
                timestamp: parsed.platformMetadata?.timestamp || null,
                engagement: parsed.platformMetadata?.engagement || {}
            }
        };

        return {
            claimText: parsed.claimText || state.rawInput,
            claimType: parsed.claimType || "text",
            extractedUrls: parsed.extractedUrls || [],
            platformMetadata: parsed.platformMetadata || {},
            mediaUrls: parsed.mediaUrls || { images: [], videos: [] },
            normalizedClaim,
            error: null
        };
    } catch (err) {
        console.error("Failed to parse claim intake response:", err);

        //Fallback: Basic extraction
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = state.rawInput.match(urlRegex) || [];

        const normalizedClaim = {
            text: state.rawInput.replace(urlRegex, '').trim(),
            urls,
            media: { images: [], videos: [] },
            platform: "unknown",
            metadata: {}
        };

        return {
            claimText: normalizedClaim.text,
            claimType: "text" as const,
            extractedUrls: urls,
            platformMetadata: {},
            mediaUrls: { images: [], videos: [] },
            normalizedClaim,
            error: "Fallback parsing used - LLM response parsing failed"
        };
    }
}

async function shouldContinue(state: typeof ClaimIntakeState.State) {
    const lastMessage = state.messages.at(-1);

    //if we still have a message but no normalized claim yet, then extract data
    if (lastMessage && !state.normalizedClaim) {
        return "extractStructuredData";
    }

    return END;
}

//make the agent graph
const claimIntakeAgent = new StateGraph(ClaimIntakeState)
    .addNode("parseInput", parseInput)
    .addNode("extractStructuredData", extractStructuredData)
    .addEdge(START, "parseInput")
    .addConditionalEdges("parseInput", shouldContinue, {
        "extractStructuredData": "extractStructuredData",
        [END]: END
    })
    .addEdge("extractStructuredData", END)
    .compile();

export { claimIntakeAgent, ClaimIntakeState };


//testing code:
async function testClaimIntakeAgent() {
    console.log("🔍 Testing Claim Intake Agent\n");

    const testCases = [
        {
            name: "Twitter Post",
            input: `@elonmusk: Tesla will release FSD v12 next week. It's going to be revolutionary! 🚗⚡
            
            Posted on Twitter/X
            1.2K likes, 345 retweets, 89 comments
            Jan 15, 2024 10:30 AM
            https://twitter.com/elonmusk/status/123456789`
        },
        {
            name: "Reddit Post with Image",
            input: `Title: Look at this weird cloud formation!
            
            Body: Spotted this in Phoenix yesterday. Climate change is fake btw.
            Image: https://i.reddit.com/abc123.jpg
            
            r/conspiracy • Posted by u/truthseeker99 • 2 hours ago
            456 upvotes, 123 comments`
        },
        {
            name: "Simple Text Claim",
            input: "The moon landing was faked in 1969 by Stanley Kubrick."
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(60)}\n`);
        console.log(`Input:\n${testCase.input}\n`);

        const result = await claimIntakeAgent.invoke({
            rawInput: testCase.input,
            messages: []
        });

        console.log("📊 Normalized Output:");
        console.log(JSON.stringify(result.normalizedClaim, null, 2));

        if (result.error) {
            console.log(`\n⚠️  Warning: ${result.error}`);
        }
    }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testClaimIntakeAgent();
}

