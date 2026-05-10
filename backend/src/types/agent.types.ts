// canonical types shared across all 6 agents, the orchestrator, scoring, and mcp layers.
// every agent's invoke() must return AgentResult (minus agentId and executionMs, added by the orchestrator wrapper).

export type Verdict = 'TRUE' | 'FALSE' | 'UNCLEAR' | 'SKIPPED';

export interface AgentResult {
  agentId: string;       // matches AgentType enum in schema: logic_consistency, citation_evidence, etc.
  verdict: Verdict;
  confidence: number;    // 0.0 to 1.0
  reasoning: string;     // 2-3 sentence explanation
  flags: string[];       // specific issues found
  executionMs: number;
  usedPriorVerdicts: boolean;
  error?: string;        // only present when verdict is SKIPPED
}

// a resolved claim from the verichain db, injected into agent prompts as prior context
export interface PriorVerdict {
  claim: string;
  verdict: 'TRUE' | 'FALSE' | 'UNCLEAR';
  confidence: number;
  reasoning: string;
  onchainProof?: string; // etherscan tx link if the verdict was recorded on-chain
}

// raw output shape that each agent's invoke() returns (before orchestrator wraps it)
export interface AgentOutput {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  flags: string[];
  usedPriorVerdicts: boolean;
}

// common input shape passed to every agent
export interface AgentInput {
  claim: string;
  priorVerdicts?: PriorVerdict[];
  urls?: string[];
  mediaUrls?: string[];
}
