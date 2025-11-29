import { logicConsistencyAgent } from './textForensicsAgent.js';
import { citationEvidenceAgent } from './citationAgent.js';
import { sourceCredibilityAgent } from './sourceCredAgent.js';
import { socialEvidenceAgent } from './socialEvidenceAgent.js';
import { mediaForensicsAgent } from './mediaForensicsAgent.js';
import { propagationPatternAgent } from './patternAgent.js';
import { aggregateAndScore } from './scoringAgent.js';
import { routeToVoting } from './communityRoutingAgent.js';

console.log("🧪 VeriChain Agent Test Suite\n");
console.log("=".repeat(80));

// Test Cases
const testCases = {
    temporal: {
        claim: "Biden announced his resignation on January 15, 2024, but then he was still giving speeches as president in March 2024.",
        expectedIssues: ["temporal_inconsistency"]
    },
    fallacy: {
        claim: "Everyone knows that vaccines cause autism. Scientists who disagree are just paid shills from Big Pharma.",
        expectedIssues: ["ad_hominem", "bandwagon", "appeal_to_authority"]
    },
    contradiction: {
        claim: "The election was completely fair and free of fraud, but also millions of votes were stolen and the results cannot be trusted.",
        expectedIssues: ["internal_contradiction"]
    },
    factual: {
        claim: "Elon Musk bought Twitter for $44 billion in October 2022 and immediately laid off 50% of staff.",
        expectedIssues: [],
        needsVerification: true
    },
    citation: {
        claim: "According to a study published in Nature, climate change is accelerating faster than predicted.",
        urls: ["https://www.nature.com/articles/example"],
        expectedIssues: []
    },
    media: {
        claim: "This image proves election fraud",
        images: [
            "https://www.google.com/imgres?q=ai%20generated%20images&imgurl=https%3A%2F%2Fendertech.com%2F_next%2Fimage%3Furl%3Dhttps%253A%252F%252Fimages.ctfassets.net%252Ffswbkokbwqb5%252F4vBAsCbQ9ITwI7Ym0MtXgY%252F96c4ec25d505f1b702f46a5a3d9dbe77%252FAI-Article-00.png%26w%3D3840%26q%3D75",
            "data:image/jpeg;base64,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"
        ],
        expectedAnomalies: ["ai_generated", "metadata_inconsistency"]
    }
};

async function runAgentTests() {
    console.log("\n1️⃣  Testing Text Forensics Agent (Logic & Consistency)\n");

    try {
        const logicResult = await logicConsistencyAgent.invoke({
            claim: testCases.temporal.claim,
            messages: []
        });

        console.log("✅ Text Forensics Agent Results:");
        console.log(`   Logic Score: ${logicResult.logicScore?.toFixed(2) || 'N/A'}`);
        console.log(`   Confidence: ${logicResult.confidence?.toFixed(2) || 'N/A'}`);
        console.log(`   Is Consistent: ${logicResult.isConsistent ? '✅' : '❌'}`);
        console.log(`   External Sources: ${logicResult.externalContext?.searchResults?.length || 0}`);
        console.log(`   Explanation: ${logicResult.explanation}\n`);
    } catch (error: any) {
        if (error.status === 429) {
            console.log("⚠️  Gemini quota exceeded - wait for reset to complete tests\n");
            console.log("   To continue testing later, run: tsx src/agents/_testAllAgents.ts\n");
            return;
        }
        console.error("❌ Text Forensics test failed:", error.message);
    }

    // ... Add tests for other agents
    console.log("=".repeat(80));
    console.log("\n🎯 To test manually, import and invoke each agent with test claims");
    console.log("   See test cases object above for more examples\n");
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAgentTests();
}

export { testCases, runAgentTests };
