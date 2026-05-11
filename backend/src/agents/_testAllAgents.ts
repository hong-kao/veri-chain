// dev test harness for the new gemini agents
// run with: tsx src/agents/_testAllAgents.ts
import { textForensicsAgent } from './textForensicsAgent.js';
import { citationEvidenceAgent } from './citationAgent.js';
import { sourceCredibilityAgent } from './sourceCredAgent.js';
import { socialEvidenceAgent } from './socialEvidenceAgent.js';
import { mediaForensicsAgent } from './mediaForensicsAgent.js';
import { propagationPatternAgent } from './patternAgent.js';
import type { AgentInput } from '../types/agent.types.js';

const testClaim: AgentInput = {
  claim: 'The Eiffel Tower was built in 1887 and inaugurated in 1889 for the World Fair.',
};

async function run() {
  console.log('testing agents with claim:', testClaim.claim);
  console.log('---');

  const agents = [
    { name: 'textForensics',     fn: textForensicsAgent },
    { name: 'citationEvidence',  fn: citationEvidenceAgent },
    { name: 'sourceCredibility', fn: sourceCredibilityAgent },
    { name: 'socialEvidence',    fn: socialEvidenceAgent },
    { name: 'mediaForensics',    fn: mediaForensicsAgent },
    { name: 'propagationPattern', fn: propagationPatternAgent },
  ];

  for (const agent of agents) {
    try {
      const result = await agent.fn(testClaim);
      console.log(`[${agent.name}] verdict=${result.verdict} confidence=${result.confidence.toFixed(2)}`);
      console.log(`  reasoning: ${result.reasoning}`);
      if (result.flags.length) console.log(`  flags: ${result.flags.join(', ')}`);
    } catch (err: any) {
      console.error(`[${agent.name}] error: ${err.message}`);
    }
    console.log('---');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
