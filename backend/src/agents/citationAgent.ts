import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatOpenAI } from '@langchain/openai';;
import { env } from '../config/env.config.js';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';

const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY || '',
    model: "gpt-4o-mini"
});

const serpApiSearch = tool(
    async ({ query, count = 10 }: { query: string; count?: number }) => {
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
        description: "Search Google for fact-checks, news articles, academic papers, and credible sources related to the claim. Use multiple searches with different keyword combinations to find both supporting and contradicting evidence. Returns titles, URLs, descriptions, and publication dates.",
        schema: z.object({
            query: z.string().describe("Search query - be specific and include key terms from the claim"),
            count: z.number().optional().default(10).describe("Number of results (1-10, default 10)")
        })
    }
);

//Add the webscraper logic here!
// const webScraper = tool()

const searchFactCheckSites = tool(
    async ({ claim }: { claim: string }) => {
        // Combine fact-check domains into a SINGLE query to reduce API calls
        const factCheckDomains = [
            'snopes.com',
            'factcheck.org',
            'politifact.com',
            'reuters.com/fact-check',
            'apnews.com/ap-fact-check',
            'fullfact.org'
        ];

        try {
            // Use OR operator to search all fact-check sites in ONE API call
            const siteQuery = factCheckDomains.slice(0, 4).map(d => `site:${d}`).join(' OR ');
            const searchQuery = `(${siteQuery}) ${claim.slice(0, 100)}`;

            console.log('✓ Searching fact-check sites (combined query)...');

            const response = await axios.get('https://serpapi.com/search', {
                params: {
                    q: searchQuery,
                    api_key: env.SERP_API_KEY || '',
                    num: 10,
                    engine: 'google'
                }
            });

            const organicResults = response.data.organic_results || [];

            // Also extract knowledge graph if available (often has fact-check info)
            const knowledgeGraph = response.data.knowledge_graph || null;

            // Extract related questions (useful context)
            const relatedQuestions = response.data.related_questions || [];

            const results = organicResults.map((result: any) => {
                // Detect the source domain
                const url = result.link || '';
                const sourceDomain = factCheckDomains.find(d => url.includes(d)) || 'other';

                // Try to extract verdict from snippet (common patterns in fact-check titles)
                let detectedVerdict = 'unknown';
                const snippetLower = (result.snippet || '').toLowerCase();
                const titleLower = (result.title || '').toLowerCase();

                if (snippetLower.includes('false') || titleLower.includes('false') ||
                    snippetLower.includes('pants on fire') || snippetLower.includes('fake')) {
                    detectedVerdict = 'FALSE';
                } else if (snippetLower.includes('true') || titleLower.includes('true') ||
                    snippetLower.includes('correct') || snippetLower.includes('accurate')) {
                    detectedVerdict = 'TRUE';
                } else if (snippetLower.includes('mostly') || snippetLower.includes('half') ||
                    snippetLower.includes('mixture') || snippetLower.includes('mixed')) {
                    detectedVerdict = 'MIXED';
                } else if (snippetLower.includes('unproven') || snippetLower.includes('unverified')) {
                    detectedVerdict = 'UNPROVEN';
                }

                return {
                    title: result.title,
                    url: result.link,
                    snippet: result.snippet,
                    date: result.date,
                    source: sourceDomain,
                    detectedVerdict,
                    isFactCheckSite: factCheckDomains.some(d => url.includes(d))
                };
            });

            // Filter to only fact-check site results
            const factCheckResults = results.filter((r: any) => r.isFactCheckSite);

            return JSON.stringify({
                claim,
                factCheckResults,
                totalFound: factCheckResults.length,
                allResults: results.length,
                // Include knowledge graph and related questions for better context
                knowledgeGraph: knowledgeGraph ? {
                    title: knowledgeGraph.title,
                    description: knowledgeGraph.description,
                    source: knowledgeGraph.source?.name
                } : null,
                relatedQuestions: relatedQuestions.slice(0, 3).map((q: any) => ({
                    question: q.question,
                    snippet: q.snippet
                })),
                apiCallsUsed: 1 // Down from 3!
            }, null, 2);
        } catch (error: any) {
            console.error('Fact-check search failed:', error.message);
            return JSON.stringify({
                error: 'Fact-check site search failed',
                message: error.message,
                claim
            });
        }
    },
    {
        name: "searchFactCheckSites",
        description: "Search major fact-checking websites (Snopes, PolitiFact, FactCheck.org, Reuters Fact Check, AP Fact Check) for existing fact-checks of the claim using a SINGLE optimized query. Returns titles, URLs, detected verdicts, and related context.",
        schema: z.object({
            claim: z.string().describe("The claim to search for across fact-checking sites")
        })
    }
);


const analyzeSourceQuality = tool(
    async ({ url, content, publishDate }: { url: string; content: string; publishDate?: string }) => {
        const analysis = {
            url,
            sourceType: "unknown" as string,
            credibilityScore: 0.5,
            factors: [] as string[],
            warnings: [] as string[],
            isFactCheckSite: false,
            hasAuthor: false,
            hasCitations: false,
            publishDate: publishDate || "unknown"
        };

        const urlLower = url.toLowerCase();
        const contentLower = content.toLowerCase();

        // Fact-check sites
        if (urlLower.match(/snopes|factcheck\.org|politifact|reuters.*fact-check|apnews.*fact-check|fullfact|africacheck/)) {
            analysis.sourceType = "fact-check";
            analysis.isFactCheckSite = true;
            analysis.credibilityScore = 0.9;
            analysis.factors.push("Professional fact-checking organization");
        }
        // News outlets
        else if (urlLower.match(/nytimes|washingtonpost|bbc|reuters|apnews|theguardian|cnn|npr/)) {
            analysis.sourceType = "mainstream-news";
            analysis.credibilityScore = 0.8;
            analysis.factors.push("Established news organization");
        }
        // Academic/Gov
        else if (urlLower.match(/\.edu|\.gov|nature\.com|science\.org|arxiv\.org/)) {
            analysis.sourceType = "academic-gov";
            analysis.credibilityScore = 0.85;
            analysis.factors.push("Academic or government source");
        }
        // Questionable
        else if (urlLower.match(/wordpress|blogspot|medium\.com|substack/)) {
            analysis.sourceType = "personal-blog";
            analysis.credibilityScore = 0.4;
            analysis.warnings.push("Personal blog - verify claims independently");
        }
        // Social media
        else if (urlLower.match(/twitter|facebook|instagram|tiktok/)) {
            analysis.sourceType = "social-media";
            analysis.credibilityScore = 0.3;
            analysis.warnings.push("Social media post - not a primary source");
        }

        // Check for author
        if (contentLower.match(/by [a-z]+ [a-z]+|author:|written by/)) {
            analysis.hasAuthor = true;
            analysis.credibilityScore += 0.05;
        } else {
            analysis.warnings.push("No clear author attribution");
        }

        // Check for citations
        const citationCount = (content.match(/https?:\/\/|doi:|according to|study published/gi) || []).length;
        if (citationCount >= 3) {
            analysis.hasCitations = true;
            analysis.credibilityScore += 0.1;
            analysis.factors.push(`Contains ${citationCount} citations/references`);
        } else {
            analysis.warnings.push("Few or no citations to external sources");
        }

        // Check freshness
        if (publishDate) {
            const date = new Date(publishDate);
            const now = new Date();
            const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

            if (daysDiff < 30) {
                analysis.factors.push("Recently published");
            } else if (daysDiff > 730) {
                analysis.warnings.push("Published over 2 years ago - may be outdated");
                analysis.credibilityScore -= 0.1;
            }
        }

        analysis.credibilityScore = Math.max(0, Math.min(1, analysis.credibilityScore));

        return JSON.stringify(analysis, null, 2);
    },
    {
        name: "analyzeSourceQuality",
        description: "Analyze the credibility and quality of a source/article. Checks if it's from a fact-checking site, news outlet, academic source, or questionable blog. Evaluates author attribution, citations, and publication date. Returns credibility score (0-1) and quality factors.",
        schema: z.object({
            url: z.string().url().describe("URL of the source to analyze"),
            content: z.string().describe("Article content to analyze"),
            publishDate: z.string().optional().describe("Publication date if available (ISO format)")
        })
    }
);

const extractCitedSources = tool(
    async ({ content }: { content: string }) => {
        const sources = {
            urls: [] as string[],
            quotedSources: [] as string[],
            studies: [] as string[],
            authorities: [] as string[]
        };

        // Extract URLs
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
        const urls = content.match(urlRegex) || [];
        sources.urls = [...new Set(urls)];

        // Extract "according to X" patterns
        const accordingToRegex = /according to ([^,.]+)/gi;
        const accordingMatches = content.matchAll(accordingToRegex);
        for (const match of accordingMatches) {
            sources.quotedSources.push(match[1].trim());
        }

        // Extract study references
        const studyRegex = /(study|research|paper|report) (?:published in|from|by) ([^,.]+)/gi;
        const studyMatches = content.matchAll(studyRegex);
        for (const match of studyMatches) {
            sources.studies.push(match[2].trim());
        }

        // Extract authorities/experts
        const expertRegex = /(Dr\.|Professor|expert) ([A-Z][a-z]+ [A-Z][a-z]+)/g;
        const expertMatches = content.matchAll(expertRegex);
        for (const match of expertMatches) {
            sources.authorities.push(`${match[1]} ${match[2]}`);
        }

        return JSON.stringify({
            totalUrls: sources.urls.length,
            totalSources: sources.quotedSources.length + sources.studies.length + sources.authorities.length,
            sources
        }, null, 2);
    },
    {
        name: "extractCitedSources",
        description: "Extract all citations, sources, and references from article content. Finds URLs, 'according to' statements, study references, and expert attributions. Use this to identify the evidence chain in fact-checks and news articles.",
        schema: z.object({
            content: z.string().describe("Article or fact-check content to extract citations from")
        })
    }
);

const tools = [
    serpApiSearch,
    // webScraper,
    searchFactCheckSites,
    analyzeSourceQuality,
    extractCitedSources
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

const CitationEvidenceState = Annotation.Root({
    ...MessagesAnnotation.spec,
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    supportingEvidence: Annotation<Array<{
        url: string;
        title: string;
        snippet: string;
        credibilityScore: number;
        sourceType: string;
        publishDate?: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    contradictingEvidence: Annotation<Array<{
        url: string;
        title: string;
        snippet: string;
        credibilityScore: number;
        sourceType: string;
        publishDate?: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    factCheckResults: Annotation<Array<{
        url: string;
        title: string;
        verdict: string;
        source: string;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    citedSources: Annotation<{
        urls: string[];
        quotedSources: string[];
        studies: string[];
        authorities: string[];
    }>({
        reducer: (x, y) => ({
            urls: [...x.urls, ...y.urls],
            quotedSources: [...x.quotedSources, ...y.quotedSources],
            studies: [...x.studies, ...y.studies],
            authorities: [...x.authorities, ...y.authorities]
        }),
        default: () => ({ urls: [], quotedSources: [], studies: [], authorities: [] })
    }),
    evidenceScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    verdict: Annotation<"supported" | "contradicted" | "mixed" | "insufficient">({
        reducer: (x, y) => y ?? x,
        default: () => "insufficient"
    }),
    explanation: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    topSources: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    })
});

function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message &&
        Array.isArray((message as any).tool_calls) &&
        (message as any).tool_calls.length > 0;
}

async function searchEvidence(state: typeof CitationEvidenceState.State) {
    // DIRECTLY CALL TOOLS - don't rely on LLM to call them

    // 1. Search fact-check sites first
    console.log('✓ Searching fact-check sites...');
    const factCheckResult = await searchFactCheckSites.invoke({
        claim: state.claim
    });

    // 2. Do a general search for VERIFICATION (not just fact-checks)
    // Extract key terms from claim for targeted search
    console.log('✓ Searching Google for verification...');
    const searchResult = await serpApiSearch.invoke({
        query: state.claim.substring(0, 100),
        count: 10
    });

    // 3. Search for SUPPORTING evidence (new!)
    // Look for credible sources that might confirm the claim
    console.log('✓ Searching for supporting evidence...');
    const supportResult = await serpApiSearch.invoke({
        query: `${state.claim.substring(0, 80)} official confirmed`,
        count: 5
    });

    // 4. Search for contradicting evidence
    console.log('✓ Searching for contradicting evidence...');
    const debunkResult = await serpApiSearch.invoke({
        query: `${state.claim.substring(0, 80)} debunked false`,
        count: 5
    });

    return {
        messages: [
            new HumanMessage(`Evidence gathered:

Fact-Check Sites: ${factCheckResult}

General Search (Verification): ${searchResult}

Supporting Evidence Search: ${supportResult}

Debunking Search: ${debunkResult}

Now synthesize these findings and determine if the claim is TRUE, FALSE, or UNCLEAR.`)
        ]
    };
}

async function processToolResults(state: typeof CitationEvidenceState.State) {
    // Not needed since we call tools directly
    return { messages: [] };
}

async function synthesizeEvidence(state: typeof CitationEvidenceState.State) {
    const synthesisPrompt = `Based on all the evidence you've gathered, synthesize your findings to determine if the claim is TRUE or FALSE.

            IMPORTANT VERDICT LOGIC:
            - If fact-checkers (Snopes, PolitiFact, etc.) say FALSE → verdict = "contradicted"
            - If credible sources (official sites, news) CONFIRM the claim → verdict = "supported"
            - If search results contain information that SUPPORTS the claim facts → verdict = "supported"
            - If no clear evidence either way → verdict = "insufficient" (NOT "contradicted"!)
            - Only use "contradicted" if there is ACTUAL EVIDENCE the claim is false

            Analyze:
            1. Fact-check results (if any) - these are the MOST important
            2. Supporting evidence - credible sources that confirm the claim (official websites, news)
            3. Contradicting evidence - credible sources that actually refute the claim
            4. Source quality - weight evidence by credibility scores

            Return ONLY valid JSON in this EXACT format:
            {
            "supportingEvidence": [
                {
                "url": "https://...",
                "title": "Article title",
                "snippet": "Key excerpt showing claim is true",
                "credibilityScore": 0.85,
                "sourceType": "official" | "mainstream-news" | "fact-check",
                "publishDate": "2024-01-15"
                }
            ],
            "contradictingEvidence": [
                {
                "url": "https://...",
                "title": "Article title",
                "snippet": "Key excerpt showing claim is false",
                "credibilityScore": 0.80,
                "sourceType": "fact-check",
                "publishDate": "2024-02-10"
                }
            ],
            "factCheckResults": [
                {
                "url": "https://snopes.com/...",
                "title": "Fact-check title",
                "verdict": "True" | "False" | "Mixed",
                "source": "Snopes"
                }
            ],
            "citedSources": {
                "urls": ["https://..."],
                "quotedSources": ["Source name"],
                "studies": ["Study reference"],
                "authorities": ["Dr. Name"]
            },
            "evidenceScore": 0.75,
            "confidence": 0.85,
            "verdict": "supported" | "contradicted" | "mixed" | "insufficient",
            "explanation": "Brief summary of evidence analysis",
            "topSources": ["URL1", "URL2", "URL3"]
            }

            Scoring guide:
            - evidenceScore: 0-1 (0=strongly contradicted, 0.5=mixed/unclear, 1=strongly supported)
            - confidence: 0-1 (how confident you are based on source quality and quantity)
            - verdict: 
              * "supported" = credible sources confirm the claim is TRUE
              * "contradicted" = fact-checkers or credible sources say claim is FALSE
              * "mixed" = some sources support, some contradict
              * "insufficient" = not enough evidence to determine (DEFAULT if unsure)

            CRITICAL: If search results show information that CONFIRMS the claim (e.g., official standings, news reports with matching facts), the verdict should be "supported", NOT "contradicted".

            No preamble, just JSON.`;

    const synthesisMessage = await llm.invoke([
        ...state.messages,
        new HumanMessage(synthesisPrompt)
    ]);

    try {
        const content = typeof synthesisMessage.content === 'string'
            ? synthesisMessage.content
            : JSON.stringify(synthesisMessage.content);

        console.log('\n📝 [CITATION_AGENT] LLM Response (first 500 chars):');
        console.log(content.substring(0, 500));

        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;

        const synthesis = JSON.parse(jsonStr);

        console.log('\n🔍 [CITATION_AGENT] Parsed synthesis:');
        console.log(`   verdict: "${synthesis.verdict}"`);
        console.log(`   evidenceScore: ${synthesis.evidenceScore}`);
        console.log(`   confidence: ${synthesis.confidence}`);
        console.log(`   supportingEvidence: ${synthesis.supportingEvidence?.length || 0} items`);
        console.log(`   contradictingEvidence: ${synthesis.contradictingEvidence?.length || 0} items`);
        console.log(`   explanation: ${synthesis.explanation?.substring(0, 100)}...`);

        const result = {
            supportingEvidence: synthesis.supportingEvidence || [],
            contradictingEvidence: synthesis.contradictingEvidence || [],
            factCheckResults: synthesis.factCheckResults || [],
            citedSources: synthesis.citedSources || { urls: [], quotedSources: [], studies: [], authorities: [] },
            evidenceScore: synthesis.evidenceScore ?? 0.5,
            confidence: synthesis.confidence ?? 0.5,
            verdict: synthesis.verdict || "insufficient",
            explanation: synthesis.explanation || "No explanation provided",
            topSources: synthesis.topSources || [],
            // Add isCredible for orchestrator compatibility
            isCredible: synthesis.verdict === 'supported' || synthesis.evidenceScore >= 0.6
        };

        console.log(`\n✅ [CITATION_AGENT] Final verdict: "${result.verdict}", isCredible: ${result.isCredible}`);

        return result;
    } catch (error) {
        console.error("❌ [CITATION_AGENT] Failed to parse synthesis:", error);
        return {
            evidenceScore: 0.5,
            confidence: 0.3,
            verdict: "insufficient" as const,
            explanation: "Error processing evidence synthesis",
            isCredible: true  // Default to true (unclear), not false
        };
    }
}

async function shouldContinue(state: typeof CitationEvidenceState.State) {
    // Since we call tools directly, just go to synthesis
    if (!state.explanation) {
        return "synthesizeEvidence";
    }
    return END;
}

const citationEvidenceAgent = new StateGraph(CitationEvidenceState)
    .addNode("searchEvidence", searchEvidence)
    .addNode("processToolResults", processToolResults)
    .addNode("synthesizeEvidence", synthesizeEvidence)
    .addEdge(START, "searchEvidence")
    .addConditionalEdges("searchEvidence", shouldContinue, {
        "processToolResults": "processToolResults",
        "synthesizeEvidence": "synthesizeEvidence",
        [END]: END
    })
    .addEdge("processToolResults", "searchEvidence")
    .addEdge("synthesizeEvidence", END)
    .compile();

export { citationEvidenceAgent, CitationEvidenceState };

//Testing
async function testCitationEvidenceAgent() {
    console.log("🔍 Testing Citation & Evidence Agent\n");

    const testClaims = [
        {
            name: "Well-Known Fact-Checked Claim",
            claim: "COVID-19 vaccines contain microchips for tracking"
        },
        {
            name: "Political Claim",
            claim: "Donald Trump won the 2020 presidential election"
        },
        {
            name: "Scientific Claim",
            claim: "Climate change is primarily caused by human activities"
        },
        {
            name: "Recent News Event",
            claim: "Elon Musk bought Twitter for $44 billion and renamed it to X"
        }
    ];

    for (const testCase of testClaims) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"\n`);

        const result = await citationEvidenceAgent.invoke({
            claim: testCase.claim,
            messages: []
        });

        console.log("📊 Evidence Analysis Results:");
        console.log(`  Evidence Score: ${result.evidenceScore.toFixed(2)}`);
        console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`  Verdict: ${result.verdict}`);
        console.log(`  Supporting Sources: ${result.supportingEvidence.length}`);
        console.log(`  Contradicting Sources: ${result.contradictingEvidence.length}`);
        console.log(`  Fact-Checks Found: ${result.factCheckResults.length}`);
        console.log(`\n  Explanation: ${result.explanation}`);

        if (result.factCheckResults.length > 0) {
            console.log(`\n  🔍 Fact-Check Results:`);
            result.factCheckResults.forEach((fc, i) => {
                console.log(`    ${i + 1}. [${fc.source}] ${fc.verdict}: ${fc.title}`);
                console.log(`       ${fc.url}`);
            });
        }

        if (result.topSources.length > 0) {
            console.log(`\n  📄 Top Sources:`);
            result.topSources.slice(0, 3).forEach((source, i) => {
                console.log(`    ${i + 1}. ${source}`);
            });
        }

        console.log(`\n  📚 Cited Sources Summary:`);
        console.log(`    URLs: ${result.citedSources.urls.length}`);
        console.log(`    Quoted Sources: ${result.citedSources.quotedSources.length}`);
        console.log(`    Studies: ${result.citedSources.studies.length}`);
        console.log(`    Authorities: ${result.citedSources.authorities.length}`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    testCitationEvidenceAgent();
}