// verichain result orchestrator
// phase 1 -> phase 2 -> phase 3 -> phase 4 pipeline:
//   1. register claim in db
//   2. run gemini agents in parallel
//   3. score + aggregate results
//   4. route to ai-only resolve or community vote

import { ClaimStatus, VerdictType, AgentType, VotingStatus, OnchainEventType, Prisma } from '../generated/prisma/index.js';
import prisma from '../config/db.config.js';
import { ethers } from 'ethers';
import { sendVotingNotifications } from '../services/emailService.js';
import { textForensicsAgent } from './textForensicsAgent.js';
import { citationEvidenceAgent } from './citationAgent.js';
import { sourceCredibilityAgent } from './sourceCredAgent.js';
import { socialEvidenceAgent } from './socialEvidenceAgent.js';
import { mediaForensicsAgent } from './mediaForensicsAgent.js';
import { propagationPatternAgent } from './patternAgent.js';
import { scoreClaimSimple } from './simpleScoring.js';
import { routeToVoting } from './communityRoutingAgent.js';
import type { AgentInput, AgentOutput } from '../types/agent.types.js';
import ClaimRegistryABI from '../abis/ClaimRegistry.json' with { type: 'json' };
import VerificationMarketABI from '../abis/VerificationMarket.json' with { type: 'json' };

// deployed addresses (base sepolia -- 2026-05-11)
const CLAIM_REGISTRY_ADDRESS = '0xeD67F63B90Af9c436B36A37f048f259568F05ac5';
const VERIFICATION_MARKET_ADDRESS = '0xCa8f98130a054F7Ec42cf36416af9E4B892B0A28';

interface ClaimInput {
  submitterId: number;
  rawInput: string;
  normalizedText: string;
  claimType?: string;
  platform?: string;
  platformPostId?: string;
  platformAuthor?: string;
  platformUrl?: string;
  extractedUrls?: string[];
  mediaImages?: string[];
  mediaVideos?: string[];
  onchainTxHash?: string | null;
  claimHash?: string | null;
}

// map our verdict strings to prisma enum
function toPrismaVerdict(v: string): VerdictType {
  const upper = v.toUpperCase();
  if (upper === 'TRUE') return VerdictType.true_;
  if (upper === 'FALSE') return VerdictType.false_;
  return VerdictType.unclear;
}

// map ai verdict strings to prisma enum
function mapAIVerdictToPrisma(v: 'TRUE' | 'FALSE' | 'UNCLEAR'): VerdictType {
  if (v === 'TRUE') return VerdictType.true_;
  if (v === 'FALSE') return VerdictType.false_;
  return VerdictType.unclear;
}

function getProvider(): ethers.JsonRpcProvider | null {
  const rpc = process.env.RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const key = process.env.PRIVATE_KEY;
  if (!key) return null;
  return new ethers.JsonRpcProvider(rpc);
}

function getWallet(): ethers.Wallet | null {
  const key = process.env.PRIVATE_KEY;
  if (!key) return null;
  const provider = getProvider();
  if (!provider) return null;
  return new ethers.Wallet(key, provider);
}

export class VeriChainOrchestrator {

  // phase 1: register claim in db
  async registerClaim(input: ClaimInput): Promise<number> {
    const claimHash = input.claimHash || ethers.keccak256(ethers.toUtf8Bytes(input.normalizedText));

    const claim = await prisma.claim.create({
      data: {
        submitter_id: input.submitterId,
        raw_input: input.rawInput,
        normalized_text: input.normalizedText,
        claim_type: input.claimType as any || null,
        platform: input.platform as any || null,
        platform_post_id: input.platformPostId || null,
        platform_author: input.platformAuthor || null,
        platform_url: input.platformUrl || null,
        extracted_urls: input.extractedUrls ? JSON.stringify(input.extractedUrls) : null,
        media_images: input.mediaImages ? JSON.stringify(input.mediaImages) : null,
        media_videos: input.mediaVideos ? JSON.stringify(input.mediaVideos) : null,
        claim_hash: claimHash,
        onchain_claim_tx: input.onchainTxHash || null,
        status: ClaimStatus.pending_ai,
      }
    });

    return claim.id;
  }

  // phase 2: run all relevant agents in parallel
  async runAnalysisAgents(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new Error(`claim ${claimId} not found`);

    const images: string[]   = claim.media_images   ? JSON.parse(claim.media_images)   : [];
    const urls: string[]     = claim.extracted_urls  ? JSON.parse(claim.extracted_urls) : [];
    const hasMedia = images.length > 0;
    const hasUrls  = urls.length > 0;
    const platform = claim.platform;

    const baseInput: AgentInput = {
      claim: claim.normalized_text || claim.raw_input,
      urls:  hasUrls ? urls : undefined,
      mediaUrls: hasMedia ? images : undefined,
    };

    // core agents always run
    const tasks: Array<{ agentName: AgentType; fn: (i: AgentInput) => Promise<AgentOutput> }> = [
      { agentName: AgentType.logic_consistency, fn: textForensicsAgent },
      { agentName: AgentType.citation_evidence,  fn: citationEvidenceAgent },
    ];

    // conditional agents
    if (hasUrls) tasks.push({ agentName: AgentType.source_credibility, fn: sourceCredibilityAgent });
    if (!platform || ['twitter','reddit','farcaster'].includes(platform)) {
      tasks.push({ agentName: AgentType.social_evidence, fn: socialEvidenceAgent });
    }
    if (hasMedia) tasks.push({ agentName: AgentType.media_forensics, fn: mediaForensicsAgent });
    if (hasUrls || platform) tasks.push({ agentName: AgentType.propagation_pattern, fn: propagationPatternAgent });

    // run all in parallel, capture failures gracefully
    const settled = await Promise.allSettled(
      tasks.map(async ({ agentName, fn }) => {
        const start = Date.now();
        const output = await fn(baseInput);
        const ms = Date.now() - start;

        await prisma.agentResult.create({
          data: {
            claim_id:   claimId,
            agent_name: agentName,
            verdict:    toPrismaVerdict(output.verdict),
            confidence: output.confidence,
            reasoning:  output.reasoning,
            flags:      JSON.stringify(output.flags),
            raw_result: JSON.stringify(output),
          }
        });

        return { agentName, verdict: output.verdict, confidence: output.confidence, ms };
      })
    );

    let passed = 0;
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        const { agentName, verdict, confidence, ms } = r.value;
        console.log(`agent ${agentName}: ${verdict} (${(confidence * 100).toFixed(0)}%) in ${ms}ms`);
        passed++;
      } else {
        console.error('agent failed:', r.reason);
      }
    }

    await prisma.claim.update({
      where: { id: claimId },
      data: { status: ClaimStatus.ai_evaluated, updated_at: new Date() }
    });

    console.log(`agents done: ${passed}/${tasks.length} succeeded`);
  }

  // phase 3: aggregate scores into final ai verdict
  async runAggregation(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new Error(`claim ${claimId} not found`);

    const agentResults = await prisma.agentResult.findMany({ where: { claim_id: claimId } });
    if (agentResults.length === 0) throw new Error(`no agent results for claim ${claimId}`);

    const simpleInputs = agentResults.map(ar => ({
      agent_name: ar.agent_name as string,
      verdict:    ar.verdict ?? 'UNCLEAR',
      confidence: ar.confidence ?? 0.5,
    }));

    const scoring = await scoreClaimSimple(
      { claimId: claim.id.toString(), normalizedText: claim.normalized_text || '', platforms: claim.platform ? [claim.platform] : [] },
      simpleInputs
    );

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        ai_verdict:     mapAIVerdictToPrisma(scoring.aiVerdict),
        ai_confidence:  scoring.aiConfidence,
        ai_flags:       JSON.stringify(scoring.warnings || []),
        ai_explanation: scoring.explanation,
        status:         ClaimStatus.ai_evaluated,
        updated_at:     new Date(),
      }
    });

    console.log(`aggregation: ${scoring.aiVerdict} (${(scoring.aiConfidence * 100).toFixed(0)}%)`);
  }

  // phase 4: route to ai-resolve or community vote
  async routeClaim(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new Error(`claim ${claimId} not found`);

    const agentResults = await prisma.agentResult.findMany({ where: { claim_id: claimId } });
    const allFlags = agentResults.flatMap((ar: any) => {
      try { return JSON.parse(ar.flags || '[]') as string[]; }
      catch { return []; }
    });

    const routingInput = {
      claim: {
        claimId: claim.id.toString(),
        normalizedText: claim.normalized_text || '',
        platforms: claim.platform ? [claim.platform] : [],
        claimType: claim.claim_type || undefined,
      },
      aiVerdict: {
        verdict: claim.ai_verdict as any,
        confidence: claim.ai_confidence || 0.5,
        overallScore: 0,
      },
      agentFlags: {},
    };

    const decision = routeToVoting(routingInput);

    if (decision.route === 'ai_only') {
      await this.resolveWithAI(claimId);
    } else if (decision.route === 'community_vote') {
      await this.initiateCommunityVoting(claimId, decision);
    } else {
      // defer_archived
      await prisma.claim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.resolved,
          final_verdict: claim.ai_verdict,
          final_confidence: claim.ai_confidence,
          resolved_at: new Date(),
          updated_at: new Date(),
        }
      });
    }
  }

  // full pipeline shortcut
  async processClaim(claimId: number): Promise<void> {
    console.log(`processing claim ${claimId}`);
    await this.runAnalysisAgents(claimId);
    await this.runAggregation(claimId);
    await this.routeClaim(claimId);
    console.log(`claim ${claimId} pipeline complete`);
  }

  private async resolveWithAI(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) return;

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        final_verdict:    claim.ai_verdict,
        final_confidence: claim.ai_confidence,
        status:           ClaimStatus.resolved,
        resolved_at:      new Date(),
        updated_at:       new Date(),
      }
    });

    await this.publishFinalResults(claimId);
  }

  private async initiateCommunityVoting(claimId: number, routing: any): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) return;

    const opensAt  = new Date();
    const closesAt = new Date(opensAt.getTime() + (routing.votingWindowSeconds || 86400) * 1000);

    await prisma.$transaction([
      prisma.votingSession.create({
        data: {
          claim_id:          claimId,
          route_reason:      routing.reasoning || 'ai confidence below threshold',
          urgency:           routing.urgency || 'standard',
          voting_window_secs: routing.votingWindowSeconds || 86400,
          min_votes_required: routing.minVotesRequired || 5,
          status:            VotingStatus.open,
          opened_at:         opensAt,
          closes_at:         closesAt,
        }
      }),
      prisma.claim.update({
        where: { id: claimId },
        data: { status: ClaimStatus.needs_vote, updated_at: new Date() }
      })
    ]);

    await sendVotingNotifications(
      claimId,
      claim.normalized_text || claim.raw_input || 'a claim needs verification',
      claim.submitter_id
    );
  }

  private async publishFinalResults(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim || !claim.final_verdict) return;

    const wallet = getWallet();
    if (!wallet) {
      console.log('no private key -- skipping on-chain resolution');
      return;
    }

    try {
      const registry = new ethers.Contract(CLAIM_REGISTRY_ADDRESS, ClaimRegistryABI.abi, wallet);

      const verdictEnum = claim.final_verdict === VerdictType.true_
        ? 1
        : claim.final_verdict === VerdictType.false_
        ? 2
        : 3;

      const confidencePct = Math.round((claim.final_confidence || 0.5) * 100);

      if (!claim.onchain_claim_tx) {
        console.log('claim not registered on-chain -- skipping resolution tx');
        return;
      }

      // find the on-chain claim id from registered event
      const onchainEvent = await prisma.onchainEvent.findFirst({
        where: { claim_id: claimId, event_type: OnchainEventType.claim_registered }
      });

      if (!onchainEvent) {
        console.log('no onchain claim registration event -- skipping resolution');
        return;
      }

      const tx = await registry.resolveClaim(onchainEvent.id, verdictEnum, confidencePct);
      const receipt = await tx.wait();

      await prisma.onchainEvent.create({
        data: {
          claim_id:   claimId,
          tx_hash:    receipt.hash,
          event_type: OnchainEventType.claim_resolved,
        }
      });

      await prisma.claim.update({
        where: { id: claimId },
        data: { onchain_resolve_tx: receipt.hash, updated_at: new Date() }
      });

      console.log(`claim ${claimId} resolved on-chain: ${receipt.hash}`);
    } catch (err: any) {
      console.error('on-chain resolution failed:', err.message);
    }
  }
}

// singleton export
export const orchestrator = new VeriChainOrchestrator();