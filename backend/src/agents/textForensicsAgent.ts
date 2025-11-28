import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';
import { scrapeWebsite } from '../utils/scraper';

//Choice of LLM
const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-pro-latest"
});

const serpApiSearch = tool(
    async ({ query, count = 5 }: { query: string; count?: number }) => {
        try {
            const response = await axios.get('https://serpapi.com/search', {
                params: {
                    q: query,
                    api_key: env.SERP_API_KEY || '',
                    num: count,
                    engine: 'google'
                }
            });

            const organicResults = response.data.organic_results || [];
            
            const formattedResults = organicResults.slice(0, count).map((result: any, index: number) => ({
                position: index + 1,
                title: result.title,
                url: result.link,
                description: result.snippet,
                displayedLink: result.displayed_link,
                date: result.date
            }));

            return JSON.stringify({
                query,
                totalResults: formattedResults.length,
                results: formattedResults,
                relatedQuestions: response.data.related_questions?.slice(0, 3) || []
            }, null, 2);
        } catch (error: any) {
            console.error('SerpAPI Search Error:', error.response?.data || error.message);
            return JSON.stringify({
                error: 'SerpAPI Search failed',
                message: error.response?.data?.error || error.message,
                query
            });
        }
    },
    {
        name: "serpApiSearch",
        description: "Search Google using SerpAPI to find recent articles, fact-checks, and news about a claim. Returns titles, URLs, descriptions, and related questions. Use this when you need external context to verify temporal claims or find contradicting evidence.",
        schema: z.object({
            query: z.string().describe("The search query. Be specific and include key terms from the claim."),
            count: z.number().optional().default(5).describe("Number of results to return (1-10, default 5)")
        })
    }
);

// const braveSearch = tool(
//     async ({ query, count = 5 }: { query: string; count?: number }) => {
//         try {
//             const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
//                 params: {
//                     q: query,
//                     count: count,
//                     text_decorations: false,
//                     search_lang: 'en'
//                 },
//                 headers: {
//                     'Accept': 'application/json',
//                     'Accept-Encoding': 'gzip',
//                     'X-Subscription-Token': env.BRAVE_API_KEY || ''
//                 }
//             });

//             const results = response.data.web?.results || [];
            
//             const formattedResults = results.map((result: any, index: number) => ({
//                 position: index + 1,
//                 title: result.title,
//                 url: result.url,
//                 description: result.description,
//                 age: result.age,
//                 extra_snippets: result.extra_snippets || []
//             }));

//             return JSON.stringify({
//                 query,
//                 totalResults: results.length,
//                 results: formattedResults
//             }, null, 2);
//         } catch (error: any) {
//             console.error('Brave Search Error:', error.response?.data || error.message);
//             return JSON.stringify({
//                 error: 'Brave Search failed',
//                 message: error.response?.data?.message || error.message,
//                 query
//             });
//         }
//     },
//     {
//         name: "braveSearch",
//         description: "Search the web using Brave Search API to find recent articles, fact-checks, and news about a claim. Returns titles, URLs, and descriptions. Use this when you need external context to verify temporal claims or find contradicting evidence.",
//         schema: z.object({
//             query: z.string().describe("The search query. Be specific and include key terms from the claim."),
//             count: z.number().optional().default(5).describe("Number of results to return (1-20, default 5)")
//         })
//     }
// );

const webScraper = tool(
    async({ url, extractType = "full" }: { url: string; extractType?: "full" | "title" | "summary" })=>{
        try{
            const result = await scrapeWebsite({
                url,
                extractType,
                timeout: 15000,
                waitForSelector: 'body',
                removeElements: ['script', 'style', 'nav', 'footer', 'ads', 'iframe']
            });

            if(!result.success){
                return JSON.stringify({
                    url,
                    success: false,
                    error: result.error || 'Scraping failed'
                });
            }

            return JSON.stringify({
                url,
                success: true,
                data: {
                    title: result.title,
                    content: result.content,
                    author: result.author,
                    publishDate: result.publishDate,
                    wordCount: result.wordCount,
                    mainImage: result.mainImage
                }
            }, null, 2);

        }catch(error: any){
            return JSON.stringify({
                url,
                success: false,
                error: error.message
            });
        }
    },
    {
        name: "webScraper",
        description: "Scrape full content from a URL using Playwright. Returns title, full text content, author, publish date, and metadata. Handles JavaScript-heavy sites and bypasses basic bot detection.",
        schema: z.object({
            url: z.string().url().describe("The URL to scrape"),
            extractType: z.enum(["full", "title", "summary"]).optional().default("full").describe("What to extract: 'full' for complete content, 'title' for just the title, 'summary' for first 3 paragraphs")
        })
    }
);

//Logical Analysis?
const checkTemporalConsistency = tool(
    async ({ claim, dates, needsVerification }: { claim: string; dates: string[]; needsVerification: boolean }) => {
        const analysis = {
            hasDates: dates.length > 0,
            datesFound: dates,
            inconsistencies: [] as string[],
            consistent: true,
            needsExternalVerification: needsVerification,
            recommendation: ""
        };
        
        if (dates.length === 0) {
            analysis.recommendation = "No temporal claims detected";
            return JSON.stringify(analysis);
        }

        //parse and sort dates
        const parsedDates = dates.map(d => {
            try {
                return { original: d, parsed: new Date(d) };
            } catch {
                return { original: d, parsed: null };
            }
        }).filter(d => d.parsed !== null);

        //check for timeline inconsistencies
        for (let i = 0; i < parsedDates.length - 1; i++) {
            const current = parsedDates[i].parsed!;
            const next = parsedDates[i + 1].parsed!;
            
            if (current > next) {
                analysis.inconsistencies.push(
                    `Timeline conflict: "${parsedDates[i].original}" occurs after "${parsedDates[i + 1].original}"`
                );
                analysis.consistent = false;
            }
        }

        //check for future dates
        const now = new Date();
        for (const dateObj of parsedDates) {
            if (dateObj.parsed! > now) {
                analysis.inconsistencies.push(
                    `Future date detected: "${dateObj.original}" is in the future`
                );
                analysis.consistent = false;
            }
        }

        if (needsVerification) {
            analysis.recommendation = "Use serpApiSearch to verify these dates against news sources";
        } else {
            analysis.recommendation = analysis.consistent 
                ? "Dates are internally consistent" 
                : "Found temporal inconsistencies - claim may be false";
        }

        return JSON.stringify(analysis);
    },
    {
        name: "checkTemporalConsistency",
        description: "Analyzes dates and times in a claim for logical consistency. Detects timeline conflicts, future dates, and impossible sequences. Set needsVerification=true if dates need external fact-checking.",
        schema: z.object({
            claim: z.string().describe("The full claim text"),
            dates: z.array(z.string()).describe("Array of date/time strings extracted from the claim (e.g., ['Jan 15 2024', 'March 2024'])"),
            needsVerification: z.boolean().describe("Whether these dates need external verification via web search")
        })
    }
);

const detectLogicalFallacies = tool(
    async ({ claim, claimType }: { claim: string; claimType: string }) => {
        const fallacies = {
            detected: [] as { type: string; explanation: string; severity: 'low' | 'medium' | 'high' }[],
            hasFallacies: false,
            overallScore: 1.0
        };

        // Ad Hominem
        if (/\b(idiot|stupid|moron|dumb|fool|liar)\b/i.test(claim)) {
            fallacies.detected.push({
                type: "Ad Hominem",
                explanation: "Attacks the person instead of addressing the argument",
                severity: 'medium'
            });
        }

        // Appeal to Authority (without evidence)
        if (/\b(experts? say|scientists? (say|agree|confirm)|studies show|research proves)\b/i.test(claim) && 
            !claim.match(/https?:\/\//)) {
            fallacies.detected.push({
                type: "Appeal to Authority",
                explanation: "Claims expert agreement without providing sources",
                severity: 'medium'
            });
        }

        // Strawman
        if (/\b(nobody (is )?saying|everyone knows|they (all )?want)\b/i.test(claim)) {
            fallacies.detected.push({
                type: "Strawman",
                explanation: "Misrepresents opposing position with extreme generalizations",
                severity: 'high'
            });
        }

        // False Equivalence
        if (/\b(just like|same as|no different than|equally)\b/i.test(claim)) {
            fallacies.detected.push({
                type: "False Equivalence",
                explanation: "Compares two things that aren't actually comparable",
                severity: 'medium'
            });
        }

        // Slippery Slope
        if (/\bif .+ then .+ (will|would|must).+/i.test(claim) && 
            claim.split(' ').length > 20) {
            fallacies.detected.push({
                type: "Slippery Slope",
                explanation: "Suggests one action will inevitably lead to extreme consequences",
                severity: 'low'
            });
        }

        // Bandwagon
        if (/\b(everyone|most people|majority of|popular opinion)\b/i.test(claim)) {
            fallacies.detected.push({
                type: "Bandwagon",
                explanation: "Appeals to popularity rather than facts",
                severity: 'low'
            });
        }

        // Calculate score
        fallacies.hasFallacies = fallacies.detected.length > 0;
        const severityPenalty = { low: 0.05, medium: 0.15, high: 0.3 };
        fallacies.detected.forEach(f => {
            fallacies.overallScore -= severityPenalty[f.severity];
        });
        fallacies.overallScore = Math.max(0, Math.min(1, fallacies.overallScore));

        return JSON.stringify(fallacies);
    },
    {
        name: "detectLogicalFallacies",
        description: "Scans claim text for common logical fallacies like ad hominem, strawman arguments, false equivalence, slippery slope, appeals to authority, and bandwagon fallacies. Returns detected fallacies with severity ratings.",
        schema: z.object({
            claim: z.string().describe("The claim text to analyze"),
            claimType: z.string().describe("Type of claim (political, scientific, health, etc.) to adjust detection sensitivity")
        })
    }
);

const checkInternalContradictions = tool(
    async ({ claim, statements }: { claim: string; statements: string[] }) => {
        const contradictions = {
            found: [] as { contradiction: string; confidence: number }[],
            hasContradictions: false,
            needsContextVerification: false
        };

        const claimLower = claim.toLowerCase();

        // Negation pairs
        const negationPairs = [
            ['is true', 'is false'],
            ['is real', 'is fake'],
            ['happened', 'never happened'],
            ['did', 'did not'],
            ['will', 'will not'],
            ['can', 'cannot'],
            ['has', 'has not'],
            ['was', 'was not']
        ];

        for (const [positive, negative] of negationPairs) {
            if (claimLower.includes(positive) && claimLower.includes(negative)) {
                contradictions.found.push({
                    contradiction: `Contains both "${positive}" and "${negative}"`,
                    confidence: 0.8
                });
            }
        }

        // Conflicting quantities
        const numbers = claim.match(/\d+/g);
        if (numbers && numbers.length > 1) {
            const uniqueNums = [...new Set(numbers)];
            if (uniqueNums.length > 1 && claim.match(/\b(exactly|precisely|only)\b/i)) {
                contradictions.found.push({
                    contradiction: "Multiple specific quantities mentioned with absolute terms",
                    confidence: 0.6
                });
            }
        }

        // Temporal contradictions
        if (statements.length >= 2) {
            for (let i = 0; i < statements.length - 1; i++) {
                for (let j = i + 1; j < statements.length; j++) {
                    const s1 = statements[i].toLowerCase();
                    const s2 = statements[j].toLowerCase();
                    
                    // Check for direct negation between statements
                    if (s1.includes('not') !== s2.includes('not') && 
                        s1.replace(/not /g, '') === s2.replace(/not /g, '')) {
                        contradictions.found.push({
                            contradiction: `Contradictory statements: "${statements[i]}" vs "${statements[j]}"`,
                            confidence: 0.9
                        });
                    }
                }
            }
        }

        contradictions.hasContradictions = contradictions.found.length > 0;
        contradictions.needsContextVerification = contradictions.hasContradictions && 
                                                  contradictions.found.some(c => c.confidence < 0.8);

        return JSON.stringify(contradictions);
    },
    {
        name: "checkInternalContradictions",
        description: "Analyzes the claim for internal contradictions - statements that directly conflict with each other within the same claim. Checks for negation conflicts, conflicting quantities, and contradictory statements.",
        schema: z.object({
            claim: z.string().describe("The full claim text"),
            statements: z.array(z.string()).describe("Individual statements or sentences extracted from the claim")
        })
    }
);

const tools = [
    serpApiSearch, 
    // braveSearch,
    webScraper,
    checkTemporalConsistency,
    detectLogicalFallacies,
    checkInternalContradictions
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

//state
const LogicConsistencyState = Annotation.Root({
    ...MessagesAnnotation.spec,
    //input
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),

    // Analysis outputs
    logicScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    temporalConsistency: Annotation<{
        consistent: boolean;
        issues: string[];
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({ consistent: true, issues: [] })
    }),
    logicalFallacies: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    contradictions: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    externalContext: Annotation<{
        searchResults: any[];
        scrapedContent: any[];
    }>({
        reducer: (x, y) => ({ 
            searchResults: [...(x.searchResults || []), ...(y.searchResults || [])],
            scrapedContent: [...(x.scrapedContent || []), ...(y.scrapedContent || [])]
        }),
        default: () => ({ searchResults: [], scrapedContent: [] })
    }),
    flaggedIssues: Annotation<string[]>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    isConsistent: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => true
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    explanation: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    needsExternalVerification: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => false
    })
});

//type safe check
function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message && 
           Array.isArray((message as any).tool_calls) && 
           (message as any).tool_calls.length > 0;
}

//nodes
async function analyzeLogic(state: typeof LogicConsistencyState.State) {
    const systemPrompt = `You are the Logic & Consistency Agent for VeriChain, a misinformation detection system.

                        Your mission: Analyze claims for logical consistency, temporal coherence, and internal contradictions.

                        You have access to these tools:
                        1. checkTemporalConsistency: Analyze dates/times for timeline conflicts
                        2. detectLogicalFallacies: Scan for common logical fallacies
                        3. checkInternalContradictions: Find conflicting statements within the claim
                        4. serpApiSearch: Search Google when you need external context to verify facts or dates
                        5. webScraper: Scrape full article content from URLs (use AFTER serpApiSearch)

                        Analysis workflow:
                        1. First, use the logic analysis tools (temporal, fallacies, contradictions)
                        2. If you find dates or facts that need verification, use serpApiSearch
                        3. If search results look promising, use webScraper to get full article content
                        4. Synthesize all findings into a final verdict

                        Be thorough but efficient. Don't over-search - only use web tools when truly needed.
                        Focus on finding REAL logical issues, not being pedantic.`;

    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`Analyze this claim for logical consistency:\n\n"${state.claim}"\n\nUse your tools strategically. Start with logic checks, then use web search only if you need external verification.`)
        ])
    };
}

async function processToolResults(state: typeof LogicConsistencyState.State) {
    const lastMessage = state.messages.at(-1);
    
    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }
    
    const result: ToolMessage[] = [];
    const searchResults: any[] = [];
    const scrapedContent: any[] = [];
    
    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await (tool as any).invoke(toolCall);  //A QUICK FIX -> as any for tool -> Sit and fix later!
        result.push(observation);
        
        // Track search and scrape results
        try {
            const parsed = JSON.parse(observation.content as string);
            if (toolCall.name === 'serpApiSearch' && parsed.results) {
                searchResults.push(...parsed.results);
            } else if (toolCall.name === 'webScraper' && parsed.data) {
                scrapedContent.push(parsed.data);
            }
        } catch (e) {
            // Ignore parsing errors for tracking
        }
    }
    
    return { 
        messages: result,
        externalContext: {
            searchResults,
            scrapedContent
        }
    };
}

async function extractVerdict(state: typeof LogicConsistencyState.State) {
    const verdictPrompt = `Based on all your analysis and tool results, provide a final verdict.

                        Return ONLY valid JSON in this EXACT format:
                        {
                        "logicScore": 0.75,
                        "isConsistent": true,
                        "confidence": 0.85,
                        "flaggedIssues": ["issue1", "issue2"],
                        "temporalConsistency": {
                            "consistent": true,
                            "issues": []
                        },
                        "logicalFallacies": ["fallacy1"],
                        "contradictions": ["contradiction1"],
                        "explanation": "Brief summary of why this claim is/isn't logically consistent",
                        "needsExternalVerification": false
                        }

                        Scoring guide:
                        - logicScore: 0-1 (0=completely illogical, 1=perfectly logical)
                        - confidence: 0-1 (how confident you are in this assessment)
                        - isConsistent: true/false (overall verdict)

                        Be precise. No preamble, just JSON.`;

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
            logicScore: verdict.logicScore ?? 0.5,
            isConsistent: verdict.isConsistent ?? true,
            confidence: verdict.confidence ?? 0.5,
            flaggedIssues: verdict.flaggedIssues || [],
            temporalConsistency: verdict.temporalConsistency || { consistent: true, issues: [] },
            logicalFallacies: verdict.logicalFallacies || [],
            contradictions: verdict.contradictions || [],
            explanation: verdict.explanation || "No explanation provided",
            needsExternalVerification: verdict.needsExternalVerification ?? false
        };
    } catch (error) {
        console.error("Failed to parse verdict:", error);
        return {
            logicScore: 0.5,
            isConsistent: false,
            confidence: 0.3,
            flaggedIssues: ["Failed to parse verdict"],
            explanation: "Error processing analysis results"
        };
    }
}

async function shouldContinue(state: typeof LogicConsistencyState.State) {
    const lastMessage = state.messages.at(-1);
    
    if (!lastMessage) return END;
    
    if (hasToolCalls(lastMessage)) {
        return "processToolResults";
    }
    
    //check if we've processed tools and need verdict
    const hasToolResults = state.messages.some(msg => msg._getType() === 'tool');
    if (hasToolResults && !state.explanation) {
        return "extractVerdict";
    }
    
    //if no tools were called at all, extract verdict
    if (!hasToolResults && state.messages.length >= 2 && !state.explanation) {
        return "extractVerdict";
    }
    
    return END;
}

//build agent graph
const logicConsistencyAgent = new StateGraph(LogicConsistencyState)
    .addNode("analyzeLogic", analyzeLogic)
    .addNode("processToolResults", processToolResults)
    .addNode("extractVerdict", extractVerdict)
    .addEdge(START, "analyzeLogic")
    .addConditionalEdges("analyzeLogic", shouldContinue, {
        "processToolResults": "processToolResults",
        "extractVerdict": "extractVerdict",
        [END]: END
    })
    .addEdge("processToolResults", "analyzeLogic")
    .addEdge("extractVerdict", END)
    .compile();

export { logicConsistencyAgent, LogicConsistencyState };


//testing
async function testLogicConsistencyAgent() {
    console.log("🔍 Testing Logic & Consistency Agent with SerpAPI\n");
    
    const testClaims = [
        {
            name: "Temporal Inconsistency",
            claim: "Biden announced his resignation on January 15, 2024, but then he was still giving speeches as president in March 2024."
        },
        {
            name: "Logical Fallacy",
            claim: "Everyone knows that vaccines cause autism. Scientists who disagree are just paid shills from Big Pharma."
        },
        {
            name: "Internal Contradiction",
            claim: "The election was completely fair and free of fraud, but also millions of votes were stolen and the results cannot be trusted."
        },
        {
            name: "Needs External Verification",
            claim: "Elon Musk bought Twitter for $44 billion in October 2022 and immediately laid off 50% of staff."
        }
    ];

    for (const testCase of testClaims) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"\n`);
        
        const result = await logicConsistencyAgent.invoke({
            claim: testCase.claim,
            messages: []
        });
        
        console.log("📊 Analysis Results:");
        console.log(`  Logic Score: ${result.logicScore.toFixed(2)}`);
        console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`  Is Consistent: ${result.isConsistent ? '✅' : '❌'}`);
        console.log(`  Temporal Issues: ${result.temporalConsistency.issues.join(', ') || 'None'}`);
        console.log(`  Logical Fallacies: ${result.logicalFallacies.join(', ') || 'None'}`);
        console.log(`  Contradictions: ${result.contradictions.join(', ') || 'None'}`);
        console.log(`  Flagged Issues: ${result.flaggedIssues.join(', ') || 'None'}`);
        console.log(`\n  Explanation: ${result.explanation}`);
        
        if (result.externalContext.searchResults.length > 0) {
            console.log(`\n  🔍 External Sources Found: ${result.externalContext.searchResults.length}`);
        }
        if (result.externalContext.scrapedContent.length > 0) {
            console.log(`  📄 Articles Scraped: ${result.externalContext.scrapedContent.length}`);
        }
    }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testLogicConsistencyAgent();
}