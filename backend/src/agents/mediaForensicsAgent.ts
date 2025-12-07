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
            // Use multiple detection models for comprehensive analysis
            // genai = AI image generation detection
            // deepfake = Face manipulation detection  
            // scam = Scam image detection (catches edited screenshots)
            formData.append('models', 'genai,deepfake,scam');

            if (imageFile) {
                // Check if file exists
                if (!fs.existsSync(imageFile)) {
                    console.error(`[Sightengine] File not found: ${imageFile}`);
                    throw new Error(`Image file not found: ${imageFile}`);
                }
                console.log(`[Sightengine] Uploading local file: ${imageFile}`);
                formData.append('media', fs.createReadStream(imageFile));
            } else if (imageUrl) {
                console.log(`[Sightengine] Analyzing URL: ${imageUrl}`);
                formData.append('url', imageUrl);
            } else {
                throw new Error('Either imageUrl or imageFile must be provided');
            }

            const endpoint = 'https://api.sightengine.com/1.0/check.json';

            const response = await axios.post(endpoint, formData, {
                headers: formData.getHeaders(),
                timeout: 30000
            });

            const result = response.data;

            // LOG RAW API RESPONSE for debugging
            console.log('[Sightengine] Raw API Response:', JSON.stringify(result, null, 2));

            // Parse Sightengine genai response
            // Response format: { type: { ai_generated: 0.99, deepfake: 0.5 } }
            const aiScore = result.type?.ai_generated ?? 0;
            const deepfakeScore = result.type?.deepfake ?? 0;
            const scamScore = result.scam?.prob ?? 0;

            // Use the MAXIMUM of all detection scores
            // Any high score indicates potential manipulation
            const maxScore = Math.max(aiScore, deepfakeScore, scamScore);

            // More lenient threshold - 0.3 or higher is suspicious
            const isAIGenerated = maxScore > 0.3;

            console.log(`[Sightengine] Detection Scores:`);
            console.log(`  → AI Generated: ${(aiScore * 100).toFixed(1)}%`);
            console.log(`  → Deepfake:     ${(deepfakeScore * 100).toFixed(1)}%`);
            console.log(`  → Scam:         ${(scamScore * 100).toFixed(1)}%`);
            console.log(`  → MAX Score:    ${(maxScore * 100).toFixed(1)}% → isAIGenerated: ${isAIGenerated}`);

            // Determine interpretation based on scores
            let interpretation = 'Likely authentic';
            let detectionType = 'none';
            if (aiScore > 0.5) {
                interpretation = 'Likely AI-generated image';
                detectionType = 'ai_generated';
            } else if (deepfakeScore > 0.5) {
                interpretation = 'Possible deepfake/face manipulation';
                detectionType = 'deepfake';
            } else if (scamScore > 0.5) {
                interpretation = 'Possible scam/manipulated screenshot';
                detectionType = 'scam';
            } else if (maxScore > 0.3) {
                interpretation = 'Uncertain - some manipulation indicators';
                detectionType = 'suspicious';
            }

            return JSON.stringify({
                source: imageUrl || imageFile,
                isAIGenerated,
                confidence: maxScore, // Use max score as confidence
                score: aiScore, // Original AI score for backwards compat
                detectionScores: {
                    aiGenerated: aiScore,
                    deepfake: deepfakeScore,
                    scam: scamScore
                },
                detectionType,
                interpretation,
                rawResponse: result
            }, null, 2);

        } catch (error: any) {
            console.error('[Sightengine] AI Image Detection ERROR:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'Sightengine AI image detection failed',
                message: error.response?.data?.message || error.message,
                source: imageUrl || imageFile,
                isAIGenerated: false,
                confidence: 0
            });
        }
    },
    {
        name: "sightengineDetectAIImage",
        description: "Detect if an image is AI-generated, deepfaked, or manipulated using Sightengine's genai, deepfake, and scam detection models. Returns score 0-1 where >0.5 = likely manipulated, 0.3-0.5 = uncertain, <0.3 = likely real.",
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
    // DIRECTLY CALL TOOLS - Using Sightengine only

    const imageAnalysis: any[] = [];
    const videoAnalysis: any[] = [];
    const audioAnalysis: any[] = [];

    // If no media URLs, return early
    if (state.mediaUrls.length === 0) {
        return {
            messages: [
                new HumanMessage("No media URLs provided for analysis.")
            ]
        };
    }

    // Analyze each media file
    for (const media of state.mediaUrls.slice(0, 2)) { // Limit to 2 for cost
        console.log(`✓ Analyzing ${media.type}: ${media.url.substring(0, 60)}...`);

        if (media.type === 'image') {
            // Check if this is a local file (localhost URL)
            const isLocalFile = media.url.includes('localhost') || media.url.startsWith('file://');

            // For local files, extract the file path for direct file upload
            let localFilePath: string | undefined;
            if (isLocalFile) {
                // Extract path from URL like http://localhost:3000/uploads/filename
                const pathMatch = media.url.match(/\/uploads\/(.+)$/);
                if (pathMatch) {
                    localFilePath = `uploads/${pathMatch[1]}`;
                    console.log(`  → Detected local file: ${localFilePath}`);
                }
            }

            // Sightengine AI Image Detection (genai model)
            try {
                console.log('  → Running Sightengine AI detection...');

                // Use file upload for local files, URL for remote
                const aiResultRaw = await sightengineDetectAIImage.invoke(
                    localFilePath
                        ? { imageFile: localFilePath }
                        : { imageUrl: media.url }
                );

                const aiResult = JSON.parse(aiResultRaw);

                // Log detailed results
                console.log(`  → AI Detection Results:`);
                console.log(`    isAIGenerated: ${aiResult.isAIGenerated}`);
                console.log(`    Confidence: ${(aiResult.confidence * 100).toFixed(1)}%`);
                console.log(`    Interpretation: ${aiResult.interpretation}`);
                if (aiResult.detectionScores) {
                    console.log(`    Breakdown: AI=${(aiResult.detectionScores.aiGenerated * 100).toFixed(1)}%, ` +
                        `Deepfake=${(aiResult.detectionScores.deepfake * 100).toFixed(1)}%, ` +
                        `Scam=${(aiResult.detectionScores.scam * 100).toFixed(1)}%`);
                }

                imageAnalysis.push({
                    url: media.url,
                    isAIGenerated: aiResult.isAIGenerated || false,
                    confidence: aiResult.confidence || aiResult.score || 0,
                    provider: 'Sightengine',
                    interpretation: aiResult.interpretation || 'Unknown',
                    detectionScores: aiResult.detectionScores,
                    detectionType: aiResult.detectionType
                });
            } catch (error: any) {
                console.log(`  ✗ Sightengine AI detection failed: ${error.message}`);
                imageAnalysis.push({
                    url: media.url,
                    isAIGenerated: false,
                    confidence: 0,
                    provider: 'Sightengine',
                    error: error.message
                });
            }

            // Try reverse image search
            try {
                console.log('  → Running reverse image search...');
                const reverseResultRaw = await reverseImageSearch.invoke({
                    imageUrl: media.url
                });

                const reverseResult = JSON.parse(reverseResultRaw);
                if (imageAnalysis.length > 0) {
                    imageAnalysis[imageAnalysis.length - 1].reverseSearchResults = reverseResult.matchingImages || [];
                }
            } catch (error: any) {
                console.log(`  ✗ Reverse search failed: ${error.message}`);
            }
        } else if (media.type === 'video') {
            // Video detection with Sightengine
            try {
                console.log('  → Running Sightengine video detection...');
                const videoResultRaw = await sightengineDetectAIVideo.invoke({
                    videoUrl: media.url
                });

                const videoResult = JSON.parse(videoResultRaw);
                videoAnalysis.push({
                    url: media.url,
                    isAIGenerated: videoResult.aiGenerated?.isAIGenerated || false,
                    confidence: videoResult.aiGenerated?.confidence || 0,
                    provider: 'Sightengine'
                });
            } catch (error: any) {
                console.log(`  ✗ Video detection failed: ${error.message}`);
            }
        } else if (media.type === 'audio') {
            // Audio detection with Sightengine
            try {
                console.log('  → Running Sightengine audio detection...');
                const audioResultRaw = await sightengineDetectAIAudio.invoke({
                    audioUrl: media.url
                });

                const audioResult = JSON.parse(audioResultRaw);
                audioAnalysis.push({
                    url: media.url,
                    isAIGenerated: audioResult.aiGenerated?.isAIGenerated || false,
                    confidence: audioResult.aiGenerated?.confidence || 0,
                    provider: 'Sightengine'
                });
            } catch (error: any) {
                console.log(`  ✗ Audio detection failed: ${error.message}`);
            }
        }
    }

    return {
        messages: [
            new HumanMessage(`Media forensics analysis complete. Now synthesize the results.`)
        ],
        imageAnalysis,
        videoAnalysis,
        audioAnalysis
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
    // Calculate scores based on actual detection results
    const allMedia = [
        ...state.imageAnalysis,
        ...state.videoAnalysis,
        ...state.audioAnalysis
    ];

    if (allMedia.length === 0) {
        return {
            mediaAuthenticityScore: 0.5,
            hasManipulation: false,
            confidence: 0.3,
            isCredible: true, // No media to analyze = treat as credible (neutral)
            explanation: "No media was analyzed"
        };
    }

    // Calculate authenticity score (inverse of AI generation)
    // High score = authentic, Low score = likely manipulated/AI
    const avgAIConfidence = allMedia.reduce((sum, item) =>
        sum + (item.isAIGenerated ? item.confidence : 0), 0) / allMedia.length;

    const authenticityScore = 1 - avgAIConfidence;

    // Determine if manipulation detected - use a lower threshold to catch AI images
    // If ANY media item is AI-generated with confidence > 0.3, flag it
    const hasManipulation = allMedia.some(item => item.isAIGenerated && item.confidence > 0.3);
    const highConfidenceManipulation = allMedia.some(item => item.isAIGenerated && item.confidence > 0.5);

    // Calculate overall confidence (use the MAX confidence from AI detection for clearer signal)
    const maxAIConfidence = Math.max(...allMedia.map(item => item.isAIGenerated ? item.confidence : 0), 0);
    const avgConfidence = allMedia.reduce((sum, item) =>
        sum + item.confidence, 0) / allMedia.length;

    // Use max AI confidence when manipulation detected, otherwise avg
    const overallConfidence = hasManipulation ? Math.max(maxAIConfidence, avgConfidence) : avgConfidence;

    // Identify manipulation types
    const manipulationTypes: string[] = [];
    if (state.imageAnalysis.some(img => img.isAIGenerated && img.confidence > 0.3)) {
        manipulationTypes.push("AI-generated image");
    }
    if (state.videoAnalysis.some(vid => vid.isAIGenerated && vid.confidence > 0.3)) {
        manipulationTypes.push("AI-generated video");
    }
    if (state.videoAnalysis.some(vid => (vid as any).isDeepfake && (vid as any).confidence > 0.3)) {
        manipulationTypes.push("Deepfake video");
    }
    if (state.audioAnalysis.some(aud => aud.isAIGenerated && aud.confidence > 0.3)) {
        manipulationTypes.push("AI-generated audio");
    }

    // Generate explanation
    const aiItems = allMedia.filter(item => item.isAIGenerated);
    const realItems = allMedia.filter(item => !item.isAIGenerated);

    let explanation = "";
    if (hasManipulation) {
        explanation = `Analysis detected ${aiItems.length} AI-generated/manipulated media out of ${allMedia.length} total. `;
        if (manipulationTypes.length > 0) {
            explanation += `Detected: ${manipulationTypes.join(", ")}. `;
        }
        explanation += `Max AI confidence: ${(maxAIConfidence * 100).toFixed(0)}%.`;
    } else {
        explanation = `All ${allMedia.length} media items appear to be authentic with low AI-generation scores. `;
        explanation += `Average authenticity confidence: ${(authenticityScore * 100).toFixed(0)}%.`;
    }

    // CRITICAL: isCredible = true means media is authentic (claim is supported)
    // isCredible = false means media is AI-generated/fake (claim is NOT credible)
    // If manipulation detected, the media does not support the claim's authenticity
    const isCredible = !hasManipulation;

    return {
        mediaAuthenticityScore: authenticityScore,
        hasManipulation,
        manipulationTypes,
        confidence: overallConfidence, // HIGH confidence when manipulation detected
        isCredible, // FALSE when AI-generated/manipulated media found
        imageAnalysis: state.imageAnalysis,
        videoAnalysis: state.videoAnalysis,
        audioAnalysis: state.audioAnalysis,
        explanation,
        flaggedIssues: manipulationTypes // For compatibility with orchestrator
    };
}


async function shouldContinue(state: typeof MediaForensicsState.State) {
    // Since we call tools directly, just go straight to verdict
    if (!state.explanation) {
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
    console.log("🔍 Testing Media Forensics Agent\n");

    const testCases = [
        {
            name: "AI-Generated Image 1 (Landscape)",
            claim: "This is a real photograph from a news event",
            mediaUrls: [
                { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4", type: "image" as const }
            ]
        },
        {
            name: "AI-Generated Image 2 (Portrait)",
            claim: "This is an authentic photograph of a person",
            mediaUrls: [
                { url: "https://thispersondoesnotexist.com", type: "image" as const }
            ]
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