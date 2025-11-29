// mediaForensicsAgent.ts
import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatOpenAI } from '@langchain/openai';;
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as crypto from 'crypto';

const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY || '',
    model: "gpt-4o-mini",
    temperature: 0.2
});

const hiveDetectAIImage = tool(
    async ({ imageUrl, imageFile }: { imageUrl?: string; imageFile?: string }) => {
        try {
            const formData = new FormData();

            if (imageFile) {
                // Local file
                formData.append('media', fs.createReadStream(imageFile));
            } else if (imageUrl) {
                // URL
                formData.append('media_url', imageUrl);
            } else {
                throw new Error('Either imageUrl or imageFile must be provided');
            }

            const response = await axios.post(
                'https://api.thehive.ai/api/v2/task/sync',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Token ${env.HIVE_ACCESS_ID}:${env.HIVE_SECRET_KEY}`,
                        'Accept': 'application/json'
                    }
                }
            );

            const result = response.data;

            // Extract AI-generated detection results
            const aiGenerated = result.status?.[0]?.response?.output?.find(
                (output: any) => output.name === 'ai_generated_media'
            );

            return JSON.stringify({
                source: imageUrl || imageFile,
                aiGenerated: {
                    isAIGenerated: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score > 0.5 || false,
                    confidence: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score || 0,
                    classes: aiGenerated?.classes || []
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Hive AI Image Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Hive AI image detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "hiveDetectAIImage",
        description: "Detect if an image is AI-generated using Hive AI. Provides confidence scores for AI-generated vs real images.",
        schema: z.object({
            imageUrl: z.string().optional().describe("URL of the image to analyze"),
            imageFile: z.string().optional().describe("Local file path of the image")
        })
    }
);

const hiveDetectDeepfakeVideo = tool(
    async ({ videoUrl, videoFile }: { videoUrl?: string; videoFile?: string }) => {
        try {
            const formData = new FormData();

            if (videoFile) {
                formData.append('media', fs.createReadStream(videoFile));
            } else if (videoUrl) {
                formData.append('media_url', videoUrl);
            } else {
                throw new Error('Either videoUrl or videoFile must be provided');
            }

            const response = await axios.post(
                'https://api.thehive.ai/api/v2/task/sync',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Token ${env.HIVE_ACCESS_ID}:${env.HIVE_SECRET_KEY}`,
                        'Accept': 'application/json'
                    },
                    timeout: 60000 // Video processing takes longer
                }
            );

            const result = response.data;

            // Extract deepfake detection results
            const deepfake = result.status?.[0]?.response?.output?.find(
                (output: any) => output.name === 'deepfake'
            );

            const aiGenerated = result.status?.[0]?.response?.output?.find(
                (output: any) => output.name === 'ai_generated_media'
            );

            return JSON.stringify({
                source: videoUrl || videoFile,
                deepfake: {
                    isDeepfake: deepfake?.classes?.find((c: any) => c.class === 'yes')?.score > 0.5 || false,
                    confidence: deepfake?.classes?.find((c: any) => c.class === 'yes')?.score || 0,
                    classes: deepfake?.classes || []
                },
                aiGenerated: {
                    isAIGenerated: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score > 0.5 || false,
                    confidence: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score || 0,
                    classes: aiGenerated?.classes || []
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Hive Deepfake Video Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Hive deepfake video detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "hiveDetectDeepfakeVideo",
        description: "Detect if a video contains deepfakes or is AI-generated using Hive AI. Analyzes facial manipulation and synthetic video generation.",
        schema: z.object({
            videoUrl: z.string().optional().describe("URL of the video to analyze"),
            videoFile: z.string().optional().describe("Local file path of the video")
        })
    }
);

const hiveDetectAIAudio = tool(
    async ({ audioUrl, audioFile }: { audioUrl?: string; audioFile?: string }) => {
        try {
            const formData = new FormData();

            if (audioFile) {
                formData.append('media', fs.createReadStream(audioFile));
            } else if (audioUrl) {
                formData.append('media_url', audioUrl);
            } else {
                throw new Error('Either audioUrl or audioFile must be provided');
            }

            const response = await axios.post(
                'https://api.thehive.ai/api/v2/task/sync',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Token ${env.HIVE_ACCESS_ID}:${env.HIVE_SECRET_KEY}`,
                        'Accept': 'application/json'
                    },
                    timeout: 45000
                }
            );

            const result = response.data;

            // Extract AI audio detection results
            const aiGenerated = result.status?.[0]?.response?.output?.find(
                (output: any) => output.name === 'ai_generated_audio'
            );

            return JSON.stringify({
                source: audioUrl || audioFile,
                aiGenerated: {
                    isAIGenerated: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score > 0.5 || false,
                    confidence: aiGenerated?.classes?.find((c: any) => c.class === 'yes')?.score || 0,
                    classes: aiGenerated?.classes || []
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Hive AI Audio Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Hive AI audio detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "hiveDetectAIAudio",
        description: "Detect if audio is AI-generated or contains voice cloning using Hive AI. Useful for detecting fake audio clips and voice deepfakes.",
        schema: z.object({
            audioUrl: z.string().optional().describe("URL of the audio to analyze"),
            audioFile: z.string().optional().describe("Local file path of the audio")
        })
    }
);


const sightengineDetectAIImage = tool(
    async ({ imageUrl, imageFile }: { imageUrl?: string; imageFile?: string }) => {
        try {
            const formData = new FormData();
            formData.append('api_user', env.SIGHTENGINE_API_USER || '');
            formData.append('api_secret', env.SIGHTENGINE_API_SECRET || '');
            formData.append('models', 'genai');

            if (imageFile) {
                formData.append('media', fs.createReadStream(imageFile));
            } else if (imageUrl) {
                formData.append('url', imageUrl);
            } else {
                throw new Error('Either imageUrl or imageFile must be provided');
            }

            const endpoint = imageFile
                ? 'https://api.sightengine.com/1.0/check.json'
                : 'https://api.sightengine.com/1.0/check.json';

            const response = await axios.post(endpoint, formData, {
                headers: formData.getHeaders()
            });

            const result = response.data;

            return JSON.stringify({
                source: imageUrl || imageFile,
                aiGenerated: {
                    isAIGenerated: result.type?.ai_generated === 'ai' || false,
                    confidence: result.type?.ai_generated_prob || 0,
                    detectionType: result.type?.ai_generated || 'unknown',
                    rawScores: result.type
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Sightengine AI Image Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Sightengine AI image detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "sightengineDetectAIImage",
        description: "Detect if an image is AI-generated using Sightengine. Secondary option to Hive with different detection models.",
        schema: z.object({
            imageUrl: z.string().optional().describe("URL of the image to analyze"),
            imageFile: z.string().optional().describe("Local file path of the image")
        })
    }
);

const sightengineDetectAIVideo = tool(
    async ({ videoUrl }: { videoUrl: string }) => {
        try {
            const formData = new FormData();
            formData.append('api_user', env.SIGHTENGINE_API_USER || '');
            formData.append('api_secret', env.SIGHTENGINE_API_SECRET || '');
            formData.append('models', 'genai');
            formData.append('url', videoUrl);

            const response = await axios.post(
                'https://api.sightengine.com/1.0/video/check-sync.json',
                formData,
                {
                    headers: formData.getHeaders(),
                    timeout: 60000
                }
            );

            const result = response.data;

            // Aggregate frame results
            const frames = result.data?.frames || [];
            const aiGeneratedFrames = frames.filter((frame: any) =>
                frame.type?.ai_generated === 'ai'
            );

            const avgConfidence = aiGeneratedFrames.length > 0
                ? aiGeneratedFrames.reduce((sum: number, frame: any) =>
                    sum + (frame.type?.ai_generated_prob || 0), 0) / aiGeneratedFrames.length
                : 0;

            return JSON.stringify({
                source: videoUrl,
                aiGenerated: {
                    isAIGenerated: (aiGeneratedFrames.length / frames.length) > 0.5,
                    confidence: avgConfidence,
                    framesAnalyzed: frames.length,
                    aiGeneratedFrames: aiGeneratedFrames.length,
                    percentage: frames.length > 0 ? (aiGeneratedFrames.length / frames.length) * 100 : 0
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Sightengine AI Video Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Sightengine AI video detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "sightengineDetectAIVideo",
        description: "Detect if a video is AI-generated using Sightengine. Analyzes multiple frames for AI generation indicators.",
        schema: z.object({
            videoUrl: z.string().url().describe("URL of the video to analyze")
        })
    }
);

const sightengineDetectAIAudio = tool(
    async ({ audioUrl, audioFile }: { audioUrl?: string; audioFile?: string }) => {
        try {
            const formData = new FormData();
            formData.append('api_user', env.SIGHTENGINE_API_USER || '');
            formData.append('api_secret', env.SIGHTENGINE_API_SECRET || '');
            formData.append('models', 'genai');

            if (audioFile) {
                formData.append('media', fs.createReadStream(audioFile));
            } else if (audioUrl) {
                formData.append('url', audioUrl);
            } else {
                throw new Error('Either audioUrl or audioFile must be provided');
            }

            const response = await axios.post(
                'https://api.sightengine.com/1.0/audio/check.json',
                formData,
                {
                    headers: formData.getHeaders(),
                    timeout: 45000
                }
            );

            const result = response.data;

            return JSON.stringify({
                source: audioUrl || audioFile,
                aiGenerated: {
                    isAIGenerated: result.type?.ai_generated === 'ai' || false,
                    confidence: result.type?.ai_generated_prob || 0,
                    detectionType: result.type?.ai_generated || 'unknown'
                },
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('Sightengine AI Audio Detection error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Sightengine AI audio detection failed',
                message: error.response?.data?.message || error.message
            });
        }
    },
    {
        name: "sightengineDetectAIAudio",
        description: "Detect if audio is AI-generated using Sightengine. Secondary option for audio analysis.",
        schema: z.object({
            audioUrl: z.string().optional().describe("URL of the audio to analyze"),
            audioFile: z.string().optional().describe("Local file path of the audio")
        })
    }
);

//REVERSE IMAGE SEARCH (Detect Image Reuse)
const reverseImageSearch = tool(
    async ({ imageUrl }: { imageUrl: string }) => {
        try {
            // Using Google Images reverse search via SerpAPI
            const response = await axios.get('https://serpapi.com/search', {
                params: {
                    engine: 'google_reverse_image',
                    image_url: imageUrl,
                    api_key: env.SERP_API_KEY || '',
                }
            });

            const results = response.data;

            const matchingImages = results.image_results || [];
            const similarImages = results.inline_images || [];

            return JSON.stringify({
                imageUrl,
                hasMatches: matchingImages.length > 0,
                totalMatches: matchingImages.length,
                matchingImages: matchingImages.slice(0, 10).map((img: any) => ({
                    source: img.source,
                    link: img.link,
                    title: img.title,
                    thumbnail: img.thumbnail
                })),
                similarImages: similarImages.slice(0, 5).map((img: any) => ({
                    source: img.source,
                    link: img.link,
                    title: img.title
                })),
                analysis: matchingImages.length > 0
                    ? `Image found ${matchingImages.length} times online - may indicate reuse or misattribution`
                    : 'No significant matches found - image may be original'
            }, null, 2);

        } catch (error: any) {
            console.error('Reverse image search error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Reverse image search failed',
                message: error.response?.data?.message || error.message,
                imageUrl
            });
        }
    },
    {
        name: "reverseImageSearch",
        description: "Perform reverse image search to detect if an image has been reused, manipulated, or misattributed. Finds original sources and similar images online.",
        schema: z.object({
            imageUrl: z.string().url().describe("URL of the image to reverse search")
        })
    }
);

// ============================================
// GOOGLE VISION API (OPTIONAL - COMMENTED OUT)
// ============================================

// const googleVisionAnalyze = tool(
//     async ({ imageUrl, imageFile }: { imageUrl?: string; imageFile?: string }) => {
//         try {
//             const vision = require('@google-cloud/vision');
//             const client = new vision.ImageAnnotatorClient({
//                 keyFilename: env.GOOGLE_VISION_KEY_PATH
//             });

//             const [result] = imageUrl 
//                 ? await client.labelDetection(imageUrl)
//                 : await client.labelDetection(imageFile);

//             const labels = result.labelAnnotations;
//             const faces = result.faceAnnotations;
//             const webDetection = result.webDetection;

//             return JSON.stringify({
//                 labels: labels?.map((label: any) => ({
//                     description: label.description,
//                     score: label.score
//                 })),
//                 faces: faces?.length || 0,
//                 celebrities: webDetection?.webEntities?.filter((entity: any) => 
//                     entity.score > 0.8
//                 ),
//                 visuallySimilarImages: webDetection?.visuallySimilarImages || []
//             }, null, 2);
//         } catch (error: any) {
//             return JSON.stringify({
//                 error: 'Google Vision analysis failed',
//                 message: error.message
//             });
//         }
//     },
//     {
//         name: "googleVisionAnalyze",
//         description: "Analyze images using Google Vision API for label detection, face detection, and celebrity recognition.",
//         schema: z.object({
//             imageUrl: z.string().optional(),
//             imageFile: z.string().optional()
//         })
//     }
// );

const tools = [
    hiveDetectAIImage,
    hiveDetectDeepfakeVideo,
    hiveDetectAIAudio,
    sightengineDetectAIImage,
    sightengineDetectAIVideo,
    sightengineDetectAIAudio,
    reverseImageSearch
    // googleVisionAnalyze  // Optional
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);


const MediaForensicsState = Annotation.Root({
    ...MessagesAnnotation.spec,

    // Input
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    mediaUrls: Annotation<Array<{
        url: string;
        type: 'image' | 'video' | 'audio';
    }>>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),

    // Analysis outputs
    imageAnalysis: Annotation<Array<{
        url: string;
        isAIGenerated: boolean;
        confidence: number;
        provider: string;
        reverseSearchResults?: any;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    videoAnalysis: Annotation<Array<{
        url: string;
        isDeepfake: boolean;
        isAIGenerated: boolean;
        confidence: number;
        provider: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    audioAnalysis: Annotation<Array<{
        url: string;
        isAIGenerated: boolean;
        confidence: number;
        provider: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),

    // Verdict
    mediaAuthenticityScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    hasManipulation: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false
    }),
    manipulationTypes: Annotation<string[]>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    explanation: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    })
});

function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message &&
        Array.isArray((message as any).tool_calls) &&
        (message as any).tool_calls.length > 0;
}


async function analyzeMediaForensics(state: typeof MediaForensicsState.State) {
    const systemPrompt = `You are the Media Forensics Agent for VeriChain, a misinformation detection system.

Your mission: Analyze images, videos, and audio for AI generation, deepfakes, and manipulation.

You have access to these tools:

PRIMARY (Hive AI - use first):
1. hiveDetectAIImage: Detect AI-generated images
2. hiveDetectDeepfakeVideo: Detect deepfake and AI-generated videos
3. hiveDetectAIAudio: Detect AI-generated audio and voice cloning

SECONDARY (Sightengine - use if Hive fails or for confirmation):
4. sightengineDetectAIImage: Alternative AI image detection
5. sightengineDetectAIVideo: Alternative AI video detection
6. sightengineDetectAIAudio: Alternative AI audio detection

ADDITIONAL:
7. reverseImageSearch: Find if images are reused or misattributed

Analysis workflow:
1. For each media URL, identify its type (image/video/audio)
2. Run PRIMARY detection (Hive) first
3. If Hive fails or confidence is medium (0.4-0.7), run SECONDARY (Sightengine) for confirmation
4. For images, also run reverse image search to detect reuse
5. Aggregate results and identify manipulation patterns

Focus on:
- High-confidence detections (>0.7 is strong evidence)
- Cross-validation between multiple tools
- Context from reverse image search
- Identifying specific manipulation types (deepfake, AI generation, reuse)`;

    const mediaInfo = state.mediaUrls.length > 0
        ? `\n\nMedia to analyze:\n${state.mediaUrls.map((media, i) =>
            `${i + 1}. [${media.type.toUpperCase()}] ${media.url}`
        ).join('\n')}`
        : "\n\nNo media URLs provided.";

    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`Analyze media authenticity for this claim:\n\n"${state.claim}"${mediaInfo}\n\nUse Hive AI tools first (primary), then Sightengine if needed (secondary). For images, also perform reverse search to detect reuse.`)
        ])
    };
}

async function processToolResults(state: typeof MediaForensicsState.State) {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }

    const result: ToolMessage[] = [];
    const imageAnalysis: any[] = [];
    const videoAnalysis: any[] = [];
    const audioAnalysis: any[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await (tool as any).invoke(toolCall);
        result.push(observation);

        // Parse and categorize results
        try {
            const parsed = JSON.parse(observation.content as string);

            if (toolCall.name.includes('Image')) {
                imageAnalysis.push({
                    url: parsed.source,
                    isAIGenerated: parsed.aiGenerated?.isAIGenerated || false,
                    confidence: parsed.aiGenerated?.confidence || 0,
                    provider: toolCall.name.includes('hive') ? 'Hive' : 'Sightengine',
                    reverseSearchResults: parsed.matchingImages || null
                });
            } else if (toolCall.name.includes('Video')) {
                videoAnalysis.push({
                    url: parsed.source,
                    isDeepfake: parsed.deepfake?.isDeepfake || false,
                    isAIGenerated: parsed.aiGenerated?.isAIGenerated || false,
                    confidence: Math.max(
                        parsed.deepfake?.confidence || 0,
                        parsed.aiGenerated?.confidence || 0
                    ),
                    provider: toolCall.name.includes('hive') ? 'Hive' : 'Sightengine'
                });
            } else if (toolCall.name.includes('Audio')) {
                audioAnalysis.push({
                    url: parsed.source,
                    isAIGenerated: parsed.aiGenerated?.isAIGenerated || false,
                    confidence: parsed.aiGenerated?.confidence || 0,
                    provider: toolCall.name.includes('hive') ? 'Hive' : 'Sightengine'
                });
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }

    return {
        messages: result,
        imageAnalysis,
        videoAnalysis,
        audioAnalysis
    };
}

async function extractVerdict(state: typeof MediaForensicsState.State) {
    const verdictPrompt = `Based on all media forensics analysis, provide a final media authenticity verdict.

Return ONLY valid JSON in this EXACT format:
{
  "mediaAuthenticityScore": 0.65,
  "hasManipulation": true,
  "manipulationTypes": ["AI-generated image", "Deepfake video"],
  "confidence": 0.85,
  "imageAnalysis": [
    {
      "url": "https://example.com/image.jpg",
      "isAIGenerated": true,
      "confidence": 0.92,
      "provider": "Hive",
      "reverseSearchResults": null
    }
  ],
  "videoAnalysis": [
    {
      "url": "https://example.com/video.mp4",
      "isDeepfake": false,
      "isAIGenerated": false,
      "confidence": 0.15,
      "provider": "Hive"
    }
  ],
  "audioAnalysis": [],
  "explanation": "Summary of media authenticity findings and detected manipulations"
}

Scoring guide:
- mediaAuthenticityScore: 0-1 (0=heavily manipulated, 1=authentic)
- hasManipulation: true if ANY media shows manipulation
- confidence: 0-1 (how confident you are in the assessment)
- manipulationTypes: list specific types detected

Consider:
- High confidence (>0.7) from tools is strong evidence
- Cross-validation between Hive and Sightengine
- Reverse image search results (reuse = potential misattribution)
- Multiple detections increase confidence

Be precise and objective.`;

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
            mediaAuthenticityScore: verdict.mediaAuthenticityScore ?? 0.5,
            hasManipulation: verdict.hasManipulation ?? false,
            manipulationTypes: verdict.manipulationTypes || [],
            confidence: verdict.confidence ?? 0.5,
            imageAnalysis: verdict.imageAnalysis || state.imageAnalysis || [],
            videoAnalysis: verdict.videoAnalysis || state.videoAnalysis || [],
            audioAnalysis: verdict.audioAnalysis || state.audioAnalysis || [],
            explanation: verdict.explanation || "No explanation provided"
        };
    } catch (error) {
        console.error("Failed to parse media forensics verdict:", error);
        return {
            mediaAuthenticityScore: 0.5,
            hasManipulation: false,
            confidence: 0.3,
            explanation: "Error processing media forensics analysis"
        };
    }
}

async function shouldContinue(state: typeof MediaForensicsState.State) {
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

const mediaForensicsAgent = new StateGraph(MediaForensicsState)
    .addNode("analyzeMediaForensics", analyzeMediaForensics)
    .addNode("processToolResults", processToolResults)
    .addNode("extractVerdict", extractVerdict)
    .addEdge(START, "analyzeMediaForensics")
    .addConditionalEdges("analyzeMediaForensics", shouldContinue, {
        "processToolResults": "processToolResults",
        "extractVerdict": "extractVerdict",
        [END]: END
    })
    .addEdge("processToolResults", "analyzeMediaForensics")
    .addEdge("extractVerdict", END)
    .compile();

export { mediaForensicsAgent, MediaForensicsState };


//TESTING!!
async function testMediaForensicsAgent() {
    console.log("🔍 Testing Media Forensics Agent (MCP)\n");
    const testCases = [
        {
            name: "AI-Generated Image Claim",
            claim: "This satellite image shows a new military base in disputed territory",
            mediaUrls: [
                { url: "https://example.com/satellite-image.jpg", type: "image" as const }
            ]
        },
        {
            name: "Deepfake Video Claim",
            claim: "Video shows politician making controversial statement",
            mediaUrls: [
                { url: "https://example.com/politician-speech.mp4", type: "video" as const }
            ]
        },
        {
            name: "Voice Clone Audio",
            claim: "Audio recording of CEO announcing company bankruptcy",
            mediaUrls: [
                { url: "https://example.com/ceo-announcement.mp3", type: "audio" as const }
            ]
        },
        {
            name: "Mixed Media Claim",
            claim: "Breaking: Natural disaster footage and survivor testimonies",
            mediaUrls: [
                { url: "https://example.com/disaster-photo1.jpg", type: "image" as const },
                { url: "https://example.com/disaster-photo2.jpg", type: "image" as const },
                { url: "https://example.com/survivor-interview.mp4", type: "video" as const }
            ]
        },
        {
            name: "No Media Provided",
            claim: "Scientists discover new element with revolutionary properties",
            mediaUrls: []
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"`);
        console.log(`Media Count: ${testCase.mediaUrls.length}`);
        if (testCase.mediaUrls.length > 0) {
            testCase.mediaUrls.forEach((media, idx) => {
                console.log(`  ${idx + 1}. [${media.type.toUpperCase()}] ${media.url}`);
            });
        }
        console.log();

        try {
            const result = await mediaForensicsAgent.invoke({
                claim: testCase.claim,
                mediaUrls: testCase.mediaUrls,
                messages: []
            });

            console.log("\n📊 MEDIA FORENSICS ANALYSIS RESULTS:");
            console.log("━".repeat(70));

            console.log(`\n🎯 Media Authenticity Score: ${(result.mediaAuthenticityScore * 100).toFixed(1)}%`);
            console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
            console.log(`🚨 Has Manipulation: ${result.hasManipulation ? '❌ YES' : '✅ NO'}`);

            if (result.manipulationTypes.length > 0) {
                console.log(`\n⚠️  Manipulation Types Detected:`);
                result.manipulationTypes.forEach((type: string) => {
                    console.log(`   - ${type}`);
                });
            }

            if (result.imageAnalysis && result.imageAnalysis.length > 0) {
                console.log(`\n🖼️  Image Analysis (${result.imageAnalysis.length}):`);
                result.imageAnalysis.forEach((img: any, idx: number) => {
                    console.log(`\n   ${idx + 1}. ${img.url}`);
                    console.log(`      AI Generated: ${img.isAIGenerated ? '❌ YES' : '✅ NO'}`);
                    console.log(`      Confidence: ${(img.confidence * 100).toFixed(1)}%`);
                    console.log(`      Provider: ${img.provider}`);
                    if (img.reverseSearchResults) {
                        console.log(`      Reverse Search: Found ${img.reverseSearchResults.length} matches`);
                    }
                });
            }

            if (result.videoAnalysis && result.videoAnalysis.length > 0) {
                console.log(`\n🎥 Video Analysis (${result.videoAnalysis.length}):`);
                result.videoAnalysis.forEach((vid: any, idx: number) => {
                    console.log(`\n   ${idx + 1}. ${vid.url}`);
                    console.log(`      Deepfake: ${vid.isDeepfake ? '❌ YES' : '✅ NO'}`);
                    console.log(`      AI Generated: ${vid.isAIGenerated ? '❌ YES' : '✅ NO'}`);
                    console.log(`      Confidence: ${(vid.confidence * 100).toFixed(1)}%`);
                    console.log(`      Provider: ${vid.provider}`);
                });
            }

            if (result.audioAnalysis && result.audioAnalysis.length > 0) {
                console.log(`\n🔊 Audio Analysis (${result.audioAnalysis.length}):`);
                result.audioAnalysis.forEach((aud: any, idx: number) => {
                    console.log(`\n   ${idx + 1}. ${aud.url}`);
                    console.log(`      AI Generated: ${aud.isAIGenerated ? '❌ YES' : '✅ NO'}`);
                    console.log(`      Confidence: ${(aud.confidence * 100).toFixed(1)}%`);
                    console.log(`      Provider: ${aud.provider}`);
                });
            }

            console.log(`\n📝 Explanation:`);
            console.log(`   ${result.explanation}`);

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

        // Delay between tests
        if (testCase !== testCases[testCases.length - 1]) {
            console.log(`\n⏳ Waiting 5 seconds before next test...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`🎉 All tests completed!`);
    console.log(`${"=".repeat(70)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    testMediaForensicsAgent();
}