import { tool } from '@langchain/core/tools';
import { z } from "zod";
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from '../config/env.config';
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, ToolCall, type BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from "@langchain/langgraph";
import axios from 'axios';
import { scrapeWebsite } from '../utils/scraper';

const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY || '',
    model: "gemini-pro-latest",
    temperature: 0.2
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
                results: formattedResults
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
        description: "Search Google to find information about sources, authors, publications, and fact-checking reports. Use this to verify domain reputation and find third-party assessments.",
        schema: z.object({
            query: z.string().describe("Search query for finding source credibility info"),
            count: z.number().optional().default(5).describe("Number of results (1-10)")
        })
    }
);

const webScraper = tool(
    async({ url, extractType = "full" }: { url: string; extractType?: "full" | "title" | "summary" }) => {
        try {
            const result = await scrapeWebsite({
                url,
                extractType,
                timeout: 15000,
                waitForSelector: 'body',
                removeElements: ['script', 'style', 'nav', 'footer', 'ads', 'iframe']
            });

            if (!result.success) {
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

        } catch (error: any) {
            return JSON.stringify({
                url,
                success: false,
                error: error.message
            });
        }
    },
    {
        name: "webScraper",
        description: "Scrape full content from a URL to analyze source quality, check for author credentials, publication date, and editorial standards.",
        schema: z.object({
            url: z.string().url().describe("URL to scrape"),
            extractType: z.enum(["full", "title", "summary"]).optional().default("full")
        })
    }
);

const analyzeDomainReputation = tool(
    async ({ domain, urls }: { domain: string; urls: string[] }) => {
        const reputation = {
            domain,
            trustScore: 0.5,
            indicators: [] as string[],
            redFlags: [] as string[],
            analysis: ""
        };

        // Known credible domains (tier 1 - highest trust)
        const tier1Credible = [
            'reuters.com', 'apnews.com', 'bbc.com', 'nature.com', 'science.org',
            'nejm.org', 'thelancet.com', 'pnas.org', 'cell.com', 'nih.gov',
            'cdc.gov', 'who.int', 'nasa.gov', 'noaa.gov'
        ];

        // Credible mainstream sources (tier 2)
        const tier2Credible = [
            'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'wsj.com',
            'bloomberg.com', 'economist.com', 'ft.com', 'npr.org', 'pbs.org',
            'scientificamerican.com', 'newscientist.com'
        ];

        // Fact-checking organizations
        const factCheckSites = [
            'snopes.com', 'factcheck.org', 'politifact.com', 'fullfact.org',
            'apnews.com/APFactCheck', 'factcheckni.org'
        ];

        // Known unreliable/biased domains
        const unreliableDomains = [
            'infowars.com', 'naturalnews.com', 'breitbart.com', 'dailystormer',
            'beforeitsnews.com', 'yournewswire.com', 'collective-evolution.com',
            'thegatewaypundit.com', 'zerohedge.com', 'worldtruth.tv'
        ];

        // Suspicious patterns
        const suspiciousPatterns = [
            /\.blogspot\.com$/i,
            /\.wordpress\.com$/i,
            /\.medium\.com$/i,
            /\d{4,}\.com$/i, // random number domains
            /-(news|truth|real|exposed)\.com$/i,
            /^(real|true|truth|patriot|liberty|freedom)-/i
        ];

        const domainLower = domain.toLowerCase();

        // Check tier 1 credible
        if (tier1Credible.some(d => domainLower.includes(d))) {
            reputation.trustScore = 0.95;
            reputation.indicators.push("Highly reputable source (peer-reviewed or government)");
            reputation.analysis = "Top-tier credible source with strong editorial standards";
        }
        // Check tier 2 credible
        else if (tier2Credible.some(d => domainLower.includes(d))) {
            reputation.trustScore = 0.85;
            reputation.indicators.push("Mainstream credible news source");
            reputation.analysis = "Established news organization with professional journalism standards";
        }
        // Check fact-checking sites
        else if (factCheckSites.some(d => domainLower.includes(d))) {
            reputation.trustScore = 0.90;
            reputation.indicators.push("Professional fact-checking organization");
            reputation.analysis = "Dedicated fact-checking source with transparent methodology";
        }
        // Check known unreliable
        else if (unreliableDomains.some(d => domainLower.includes(d))) {
            reputation.trustScore = 0.15;
            reputation.redFlags.push("Domain known for misinformation");
            reputation.analysis = "Source has history of publishing unverified or misleading content";
        }
        // Check suspicious patterns
        else {
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(domainLower)) {
                    reputation.trustScore = 0.35;
                    reputation.redFlags.push(`Suspicious domain pattern: ${pattern.toString()}`);
                    reputation.analysis = "Domain shows patterns common in low-credibility sources";
                    break;
                }
            }
        }

        // Domain age analysis (heuristic)
        if (domainLower.match(/\d{4}/) && reputation.trustScore === 0.5) {
            reputation.trustScore = 0.40;
            reputation.redFlags.push("Domain contains year number (possible recent creation)");
        }

        // TLD analysis
        const tld = domain.split('.').pop()?.toLowerCase();
        if (['info', 'xyz', 'top', 'click', 'club'].includes(tld || '')) {
            reputation.trustScore *= 0.8;
            reputation.redFlags.push(`Low-trust TLD: .${tld}`);
        }

        // HTTPS check from URLs
        const hasHttps = urls.every(url => url.startsWith('https://'));
        if (!hasHttps) {
            reputation.trustScore *= 0.9;
            reputation.redFlags.push("Not using HTTPS");
        }

        return JSON.stringify(reputation, null, 2);
    },
    {
        name: "analyzeDomainReputation",
        description: "Analyze a domain's reputation based on known credible/unreliable sources, domain patterns, TLD, and security indicators. Returns trust score (0-1) and detailed analysis.",
        schema: z.object({
            domain: z.string().describe("Domain name to analyze (e.g., 'nytimes.com')"),
            urls: z.array(z.string()).describe("Full URLs from this domain to analyze patterns")
        })
    }
);

const checkAuthorCredibility = tool(
    async ({ authorName, domain, content }: { authorName: string; domain: string; content: string }) => {
        const credibility = {
            authorName,
            credibilityScore: 0.5,
            indicators: [] as string[],
            concerns: [] as string[],
            needsVerification: false,
            analysis: ""
        };

        if (!authorName || authorName.trim().length === 0) {
            credibility.credibilityScore = 0.4;
            credibility.concerns.push("No author attribution");
            credibility.needsVerification = true;
            credibility.analysis = "Anonymous content - author attribution missing";
            return JSON.stringify(credibility, null, 2);
        }

        const authorLower = authorName.toLowerCase();

        // Red flags in author names
        const suspiciousPatterns = [
            /admin/i,
            /user\d+/i,
            /guest/i,
            /anonymous/i,
            /staff/i,
            /editor/i, // generic
            /^[a-z]{1,3}\d+$/i // like "abc123"
        ];

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(authorLower)) {
                credibility.credibilityScore = 0.35;
                credibility.concerns.push(`Generic/suspicious author name pattern: ${pattern}`);
                credibility.needsVerification = true;
                break;
            }
        }

        // Check for credentials in author name
        const credentials = ['dr.', 'phd', 'md', 'professor', 'prof.'];
        const hasCredentials = credentials.some(cred => authorLower.includes(cred));
        
        if (hasCredentials) {
            credibility.credibilityScore += 0.15;
            credibility.indicators.push("Author has academic/professional credentials");
        }

        // Check content for author bio or expertise claims
        const contentLower = content.toLowerCase();
        const expertiseKeywords = ['expert', 'researcher', 'professor', 'journalist', 'correspondent', 'specialist'];
        const hasExpertiseMention = expertiseKeywords.some(kw => contentLower.includes(kw));

        if (hasExpertiseMention) {
            credibility.credibilityScore += 0.1;
            credibility.indicators.push("Content mentions author expertise");
        }

        // Check for citations/sources in content
        const hasCitations = content.match(/\[[\d,\s]+\]/) || 
                           content.match(/\(\d{4}\)/) || // year citations
                           content.match(/according to/i) ||
                           content.match(/study|research|paper/i);

        if (hasCitations) {
            credibility.credibilityScore += 0.1;
            credibility.indicators.push("Content includes citations or references");
        }

        // If author seems credible but we want external verification
        if (credibility.credibilityScore >= 0.6 && !authorLower.includes('admin')) {
            credibility.needsVerification = true;
            credibility.analysis = `Author "${authorName}" appears credible but needs external verification`;
        } else if (credibility.credibilityScore < 0.5) {
            credibility.needsVerification = true;
            credibility.analysis = `Author "${authorName}" has credibility concerns`;
        } else {
            credibility.analysis = `Author "${authorName}" shows mixed indicators`;
        }

        credibility.credibilityScore = Math.max(0.1, Math.min(1.0, credibility.credibilityScore));

        return JSON.stringify(credibility, null, 2);
    },
    {
        name: "checkAuthorCredibility",
        description: "Analyze author credibility based on name patterns, credentials, expertise claims, and citation practices. Returns credibility score and recommendations for verification.",
        schema: z.object({
            authorName: z.string().describe("Author's name or username"),
            domain: z.string().describe("Domain where content is published"),
            content: z.string().describe("Article/post content to analyze for author expertise indicators")
        })
    }
);

const checkFactCheckingStatus = tool(
    async ({ claim, sources }: { claim: string; sources: string[] }) => {
        const status = {
            hasFactChecks: false,
            factCheckResults: [] as Array<{
                source: string;
                verdict: string;
                url: string;
                rating?: string;
                claimReview?: string;
            }>,
            consensus: "unknown" as "true" | "false" | "mixed" | "unknown",
            needsWebSearch: false,
            claimBusterScore: null as number | null,
            analysis: ""
        };

        try {
            // 1. Check ClaimBuster API for claim check-worthiness
            try {
                const claimBusterResponse = await axios.post(
                    'https://idir.uta.edu/claimbuster/api/v2/score/text/',
                    { input_text: claim },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': env.CLAIMBUSTER_API_KEY || ''
                        }
                    }
                );

                if (claimBusterResponse.data?.results?.[0]) {
                    status.claimBusterScore = claimBusterResponse.data.results[0].score;
                    
                    if (status.claimBusterScore !== null) {
                        if (status.claimBusterScore > 0.5) {
                            status.analysis += `ClaimBuster score: ${status.claimBusterScore.toFixed(3)} (check-worthy claim). `;
                        } else {
                            status.analysis += `ClaimBuster score: ${status.claimBusterScore.toFixed(3)} (low check-worthiness). `;
                        }
                    }
                }
            } catch (cbError: any) {
                console.error('ClaimBuster API error:', cbError.response?.data || cbError.message);
                status.analysis += "ClaimBuster check failed. ";
            }

            // 2. Check Google Fact Check API
            try {
                const factCheckResponse = await axios.get(
                    'https://factchecktools.googleapis.com/v1alpha1/claims:search',
                    {
                        params: {
                            query: claim,
                            key: env.GOOGLE_FACTCHECK_API_KEY || '',
                            languageCode: 'en'
                        }
                    }
                );

                if (factCheckResponse.data?.claims && factCheckResponse.data.claims.length > 0) {
                    status.hasFactChecks = true;
                    
                    const claims = factCheckResponse.data.claims.slice(0, 5); // Top 5 results
                    
                    for (const claimData of claims) {
                        if (claimData.claimReview && claimData.claimReview.length > 0) {
                            for (const review of claimData.claimReview) {
                                status.factCheckResults.push({
                                    source: review.publisher?.name || 'Unknown',
                                    verdict: review.textualRating || 'No rating',
                                    url: review.url || '',
                                    rating: review.textualRating,
                                    claimReview: claimData.text || claim
                                });
                            }
                        }
                    }

                    // Determine consensus based on verdicts
                    if (status.factCheckResults.length > 0) {
                        const verdictLower = status.factCheckResults.map(r => 
                            r.verdict.toLowerCase()
                        );
                        
                        const falseCount = verdictLower.filter(v => 
                            v.includes('false') || v.includes('fake') || v.includes('pants on fire')
                        ).length;
                        
                        const trueCount = verdictLower.filter(v => 
                            v.includes('true') || v.includes('correct') || v.includes('accurate')
                        ).length;
                        
                        const mixedCount = verdictLower.filter(v => 
                            v.includes('mixed') || v.includes('mostly') || v.includes('half')
                        ).length;

                        if (falseCount > trueCount && falseCount > mixedCount) {
                            status.consensus = "false";
                        } else if (trueCount > falseCount && trueCount > mixedCount) {
                            status.consensus = "true";
                        } else if (mixedCount > 0 || (falseCount > 0 && trueCount > 0)) {
                            status.consensus = "mixed";
                        }

                        status.analysis += `Found ${status.factCheckResults.length} fact-check(s). Consensus: ${status.consensus}. `;
                    }
                } else {
                    status.analysis += "No fact-checks found in Google Fact Check API. ";
                }
            } catch (fcError: any) {
                console.error('Google Fact Check API error:', fcError.response?.data || fcError.message);
                status.analysis += "Google Fact Check API failed. ";
            }

            // 3. Check provided sources for fact-checking domains
            const factCheckDomains = [
                'snopes.com',
                'factcheck.org',
                'politifact.com',
                'fullfact.org',
                'apnews.com/APFactCheck',
                'factcheckni.org',
                'reuters.com/fact-check',
                'usatoday.com/news/factcheck'
            ];

            const foundFactCheckSources = sources.filter(url => 
                factCheckDomains.some(domain => url.toLowerCase().includes(domain))
            );

            if (foundFactCheckSources.length > 0) {
                status.hasFactChecks = true;
                status.analysis += `Found ${foundFactCheckSources.length} fact-checking source(s) in provided URLs. `;
                
                for (const url of foundFactCheckSources) {
                    const domain = factCheckDomains.find(d => url.toLowerCase().includes(d));
                    if (domain && !status.factCheckResults.some(r => r.url === url)) {
                        status.factCheckResults.push({
                            source: domain,
                            verdict: 'Requires scraping for verdict',
                            url: url
                        });
                    }
                }
            }

            // 4. Determine if web search is needed
            if (!status.hasFactChecks || status.factCheckResults.length === 0) {
                status.needsWebSearch = true;
                status.analysis += "Recommend web search with query: 'fact check [claim]' to find additional fact-checks.";
            } else {
                status.needsWebSearch = false;
            }

            // // 5. WordLift API (commented out for now)
            // try {
            //     const wordliftResponse = await axios.post(
            //         'https://api.wordlift.io/fact-checking/v1/check',
            //         { text: claim },
            //         {
            //             headers: {
            //                 'Authorization': `Key ${env.WORDLIFT_API_KEY}`,
            //                 'Content-Type': 'application/json'
            //             }
            //         }
            //     );
            //     // Process WordLift response
            // } catch (wlError) {
            //     console.error('WordLift API error:', wlError);
            // }

        } catch (error: any) {
            console.error('Fact-checking status error:', error.message);
            status.analysis = `Error during fact-checking: ${error.message}`;
        }

        return JSON.stringify(status, null, 2);
    },
    {
        name: "checkFactCheckingStatus",
        description: "Check if a claim has been fact-checked by professional organizations using Google Fact Check API, ClaimBuster API, and provided sources. Returns detailed fact-check results with verdicts and consensus.",
        schema: z.object({
            claim: z.string().describe("The claim to check for fact-checking coverage"),
            sources: z.array(z.string()).describe("URLs already found related to this claim")
        })
    }
);

const analyzePublicationQuality = tool(
    async ({ url, content, metadata }: { 
        url: string; 
        content: string; 
        metadata: { author?: string; publishDate?: string; wordCount: number } 
    }) => {
        const quality = {
            url,
            qualityScore: 0.5,
            indicators: [] as string[],
            concerns: [] as string[],
            analysis: ""
        };

        // Word count analysis
        if (metadata.wordCount < 200) {
            quality.qualityScore -= 0.15;
            quality.concerns.push("Very short content (< 200 words) - may lack depth");
        } else if (metadata.wordCount > 500) {
            quality.qualityScore += 0.1;
            quality.indicators.push("Substantial content length suggests detailed reporting");
        }

        // Date analysis
        if (metadata.publishDate) {
            quality.qualityScore += 0.05;
            quality.indicators.push("Has publication date");
            
            try {
                const pubDate = new Date(metadata.publishDate);
                const daysSincePublish = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
                
                if (daysSincePublish < 7) {
                    quality.indicators.push("Recent publication (< 7 days old)");
                } else if (daysSincePublish > 365 * 3) {
                    quality.concerns.push("Content is over 3 years old - may be outdated");
                    quality.qualityScore -= 0.05;
                }
            } catch (e) {
                // Invalid date format
            }
        } else {
            quality.concerns.push("No publication date found");
            quality.qualityScore -= 0.05;
        }

        // Author attribution
        if (metadata.author && metadata.author.length > 0) {
            quality.qualityScore += 0.1;
            quality.indicators.push("Has author attribution");
        } else {
            quality.concerns.push("No author attribution");
            quality.qualityScore -= 0.1;
        }

        // Content quality heuristics
        const contentLower = content.toLowerCase();
        
        // Check for sources/citations
        const sourceIndicators = [
            /according to/gi,
            /study/gi,
            /research/gi,
            /reported/gi,
            /\b(said|stated|confirmed)\b/gi
        ];
        const citationCount = sourceIndicators.reduce((sum, pattern) => 
            sum + (content.match(pattern)?.length || 0), 0
        );

        if (citationCount > 5) {
            quality.qualityScore += 0.15;
            quality.indicators.push(`Well-sourced content (${citationCount} source references)`);
        } else if (citationCount === 0) {
            quality.concerns.push("No source citations found");
            quality.qualityScore -= 0.1;
        }

        // Check for sensationalism
        const sensationalWords = [
            'shocking', 'unbelievable', 'amazing', 'you won\'t believe',
            'jaw-dropping', 'mind-blowing', 'stunning', 'outrageous'
        ];
        const sensationalCount = sensationalWords.filter(word => 
            contentLower.includes(word)
        ).length;

        if (sensationalCount > 3) {
            quality.qualityScore -= 0.15;
            quality.concerns.push("Sensationalist language detected");
        }

        // Check for balanced reporting (presence of multiple perspectives)
        const balanceIndicators = ['however', 'although', 'but', 'on the other hand', 'critics', 'opponents'];
        const hasBalance = balanceIndicators.some(ind => contentLower.includes(ind));

        if (hasBalance) {
            quality.qualityScore += 0.1;
            quality.indicators.push("Content shows multiple perspectives");
        }

        quality.qualityScore = Math.max(0.0, Math.min(1.0, quality.qualityScore));
        
        quality.analysis = quality.qualityScore >= 0.7 
            ? "High-quality publication with strong journalistic standards"
            : quality.qualityScore >= 0.5
            ? "Moderate quality - some concerns but generally acceptable"
            : "Low quality - significant credibility concerns";

        return JSON.stringify(quality, null, 2);
    },
    {
        name: "analyzePublicationQuality",
        description: "Analyze the quality of a publication based on content depth, citations, author attribution, date, and editorial standards. Returns quality score and detailed indicators.",
        schema: z.object({
            url: z.string().url().describe("URL of the publication"),
            content: z.string().describe("Full text content of the article"),
            metadata: z.object({
                author: z.string().optional().describe("Author name if available"),
                publishDate: z.string().optional().describe("Publication date if available"),
                wordCount: z.number().describe("Word count of the content")
            }).describe("Article metadata")
        })
    }
);

const tools = [
    serpApiSearch,
    webScraper,
    analyzeDomainReputation,
    checkAuthorCredibility,
    checkFactCheckingStatus,
    analyzePublicationQuality
];

const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);

const SourceCredibilityState = Annotation.Root({
    ...MessagesAnnotation.spec,
    
    // Input
    claim: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => ""
    }),
    urls: Annotation<string[]>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    
    // Analysis outputs
    sourceCredibilityScore: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0.5
    }),
    domainReputations: Annotation<Array<{
        domain: string;
        trustScore: number;
        analysis: string;
    }>>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    authorCredibility: Annotation<Array<{
        author: string;
        score: number;
        concerns: string[];
    }>>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    publicationQuality: Annotation<Array<{
        url: string;
        qualityScore: number;
        indicators: string[];
    }>>({
        reducer: (x, y) => y ?? x,
        default: () => []
    }),
    factCheckStatus: Annotation<{
        hasFactChecks: boolean;
        results: Array<{ source: string; verdict: string; url: string }>;
        consensus: string;
    }>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({ hasFactChecks: false, results: [], consensus: "unknown" })
    }),
    scrapedContent: Annotation<Array<{
        url: string;
        content: string;
        metadata: any;
    }>>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    searchResults: Annotation<any[]>({
        reducer: (x, y) => [...x, ...y],
        default: () => []
    }),
    flaggedIssues: Annotation<string[]>({
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
    }),
    isCredible: Annotation<boolean>({
        reducer: (x, y) => y ?? x,
        default: () => true
    })
});

function hasToolCalls(message: BaseMessage): message is BaseMessage & { tool_calls: ToolCall[] } {
    return 'tool_calls' in message && 
           Array.isArray((message as any).tool_calls) && 
           (message as any).tool_calls.length > 0;
}

function extractDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

async function analyzeSourceCredibility(state: typeof SourceCredibilityState.State) {
    const systemPrompt = `You are the Source Credibility Agent for VeriChain, a misinformation detection system.

            Your mission: Assess the credibility and reliability of sources making claims.

            You have access to these tools:
            1. analyzeDomainReputation: Check domain trustworthiness against known credible/unreliable sources
            2. serpApiSearch: Search for information about sources, authors, or fact-checks
            3. webScraper: Scrape full content from URLs to analyze quality and author credentials
            4. checkAuthorCredibility: Analyze author credibility based on name, credentials, and content
            5. checkFactCheckingStatus: Check if the claim has been fact-checked
            6. analyzePublicationQuality: Assess publication quality based on editorial standards

            Analysis workflow:
            1. Start by analyzing domain reputation for all provided URLs
            2. If URLs are provided, scrape 1-2 key sources to get full content
            3. Check author credibility from scraped content
            4. Analyze publication quality metrics
            5. Search for fact-checks if needed
            6. If you need more context about a source, use serpApiSearch

            Be thorough but efficient. Prioritize analyzing primary sources over searching.
            Focus on objective indicators of credibility.`;

    const urlsInfo = state.urls.length > 0 
        ? `\n\nURLs to analyze:\n${state.urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`
        : "\n\nNo URLs provided - you may need to search for sources.";

    return {
        messages: await llmWithTools.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`Analyze source credibility for this claim:\n\n"${state.claim}"${urlsInfo}\n\nUse your tools to assess these sources. Start with domain reputation, then scrape promising sources for deeper analysis.`)
        ])
    };
}

async function processToolResults(state: typeof SourceCredibilityState.State) {
    const lastMessage = state.messages.at(-1);
    
    if (!lastMessage || !hasToolCalls(lastMessage)) {
        return { messages: [] };
    }
    
    const result: ToolMessage[] = [];
    const searchResults: any[] = [];
    const scrapedContent: any[] = [];
    
    for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await (tool as any).invoke(toolCall);
        result.push(observation);
        
        // Track results
        try {
            const parsed = JSON.parse(observation.content as string);
            if (toolCall.name === 'serpApiSearch' && parsed.results) {
                searchResults.push(...parsed.results);
            } else if (toolCall.name === 'webScraper' && parsed.data) {
                scrapedContent.push({
                    url: parsed.url,
                    content: parsed.data.content,
                    metadata: parsed.data
                });
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }
    
    return { 
        messages: result,
        searchResults,
        scrapedContent
    };
}

async function extractVerdict(state: typeof SourceCredibilityState.State) {
    const verdictPrompt = `Based on all your analysis and tool results, provide a final source credibility verdict.

Return ONLY valid JSON in this EXACT format:
{
  "sourceCredibilityScore": 0.75,
  "isCredible": true,
  "confidence": 0.85,
  "domainReputations": [
    {
      "domain": "example.com",
      "trustScore": 0.8,
      "analysis": "Brief analysis"
    }
  ],
  "authorCredibility": [
    {
      "author": "John Doe",
      "score": 0.7,
      "concerns": ["concern1"]
    }
  ],
  "publicationQuality": [
    {
      "url": "https://example.com/article",
      "qualityScore": 0.8,
      "indicators": ["indicator1", "indicator2"]
    }
  ],
  "factCheckStatus": {
    "hasFactChecks": false,
    "results": [],
    "consensus": "unknown"
  },
  "flaggedIssues": ["issue1", "issue2"],
  "explanation": "Brief summary of source credibility assessment"
}

Scoring guide:
- sourceCredibilityScore: 0-1 (0=completely unreliable, 1=highly credible)
- confidence: 0-1 (how confident you are)
- isCredible: true/false (overall verdict: true if score >= 0.6)

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
            sourceCredibilityScore: verdict.sourceCredibilityScore ?? 0.5,
            isCredible: verdict.isCredible ?? true,
            confidence: verdict.confidence ?? 0.5,
            domainReputations: verdict.domainReputations || [],
            authorCredibility: verdict.authorCredibility || [],
            publicationQuality: verdict.publicationQuality || [],
            factCheckStatus: verdict.factCheckStatus || { hasFactChecks: false, results: [], consensus: "unknown" },
            flaggedIssues: verdict.flaggedIssues || [],
            explanation: verdict.explanation || "No explanation provided"
        };
    } catch (error) {
        console.error("Failed to parse source credibility verdict:", error);
        return {
            sourceCredibilityScore: 0.5,
            isCredible: false,
            confidence: 0.3,
            flaggedIssues: ["Failed to parse verdict"],
            explanation: "Error processing source credibility analysis"
        };
    }
}

async function shouldContinue(state: typeof SourceCredibilityState.State) {
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

const sourceCredibilityAgent = new StateGraph(SourceCredibilityState)
    .addNode("analyzeSourceCredibility", analyzeSourceCredibility)
    .addNode("processToolResults", processToolResults)
    .addNode("extractVerdict", extractVerdict)
    .addEdge(START, "analyzeSourceCredibility")
    .addConditionalEdges("analyzeSourceCredibility", shouldContinue, {
        "processToolResults": "processToolResults",
        "extractVerdict": "extractVerdict",
        [END]: END
    })
    .addEdge("processToolResults", "analyzeSourceCredibility")
    .addEdge("extractVerdict", END)
    .compile();

export { sourceCredibilityAgent, SourceCredibilityState };



//TESTING!
async function testSourceCredibilityAgent() {
    console.log("🔍 Testing Source Credibility Agent (MCP)\n");
    
    const testCases = [
        {
            name: "Credible News Source",
            claim: "Scientists at MIT have developed a new quantum computing breakthrough",
            urls: [
                "https://www.nature.com/articles/s41586-023-12345-6",
                "https://news.mit.edu/2024/quantum-breakthrough-0115"
            ]
        },
        {
            name: "Suspicious Blog Source",
            claim: "Bill Gates admits vaccines contain microchips for population control",
            urls: [
                "https://naturalnews.com/fake-article-123",
                "https://truthseeker2024.blogspot.com/vaccines-exposed"
            ]
        },
        {
            name: "Mixed Sources",
            claim: "New climate report shows unprecedented warming trends",
            urls: [
                "https://www.reuters.com/climate-report",
                "https://climate-hoax-exposed.com/fake-warming"
            ]
        },
        {
            name: "No URLs Provided",
            claim: "The moon landing was faked by Stanley Kubrick",
            urls: []
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Test: ${testCase.name}`);
        console.log(`${"=".repeat(70)}`);
        console.log(`Claim: "${testCase.claim}"`);
        console.log(`URLs: ${testCase.urls.length > 0 ? testCase.urls.join('\n      ') : 'None'}\n`);
        
        const result = await sourceCredibilityAgent.invoke({
            claim: testCase.claim,
            urls: testCase.urls,
            messages: []
        });
        
        console.log("📊 Source Credibility Analysis:");
        console.log(`  Overall Score: ${result.sourceCredibilityScore.toFixed(2)}`);
        console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`  Is Credible: ${result.isCredible ? '✅' : '❌'}`);
        
        if (result.domainReputations.length > 0) {
            console.log(`\n  📍 Domain Reputations:`);
            result.domainReputations.forEach(dr => {
                console.log(`    - ${dr.domain}: ${dr.trustScore.toFixed(2)} - ${dr.analysis}`);
            });
        }
        
        if (result.authorCredibility.length > 0) {
            console.log(`\n  ✍️  Author Credibility:`);
            result.authorCredibility.forEach(ac => {
                console.log(`    - ${ac.author}: ${ac.score.toFixed(2)}`);
                if (ac.concerns.length > 0) {
                    console.log(`      Concerns: ${ac.concerns.join(', ')}`);
                }
            });
        }
        
        if (result.publicationQuality.length > 0) {
            console.log(`\n  📄 Publication Quality:`);
            result.publicationQuality.forEach(pq => {
                console.log(`    - ${pq.url}: ${pq.qualityScore.toFixed(2)}`);
                console.log(`      Indicators: ${pq.indicators.join(', ')}`);
            });
        }
        
        if (result.factCheckStatus.hasFactChecks) {
            console.log(`\n  ✓ Fact-Check Status: ${result.factCheckStatus.consensus}`);
            result.factCheckStatus.results.forEach(fc => {
                console.log(`    - ${fc.source}: ${fc.verdict} (${fc.url})`);
            });
        }
        
        if (result.flaggedIssues.length > 0) {
            console.log(`\n  ⚠️  Flagged Issues: ${result.flaggedIssues.join(', ')}`);
        }
        
        console.log(`\n  💡 Explanation: ${result.explanation}`);
        
        if (result.scrapedContent.length > 0) {
            console.log(`\n  🔍 Scraped ${result.scrapedContent.length} source(s) for analysis`);
        }
    }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testSourceCredibilityAgent();
}