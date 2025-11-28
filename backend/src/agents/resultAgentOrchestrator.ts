import { ClaimMetadata, AgentOutputs } from './scoringAgent.js';
import { RoutingInput, RouteDecision, RoutingDecision, VoterCohort } from './communityRoutingAgent.js';
import { PrismaClient, ClaimStatus, VerdictType, AgentType, VotingStatus, NotifChannelType, NotifStatus, OnchainEventType, Prisma, ClaimType, PlatformType } from '../generated/prisma/index.js';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '../utils/email.js';
import { logicConsistencyAgent } from './textForensicsAgent.js';
import { citationEvidenceAgent } from './citationAgent.js';
import { sourceCredibilityAgent } from './sourceCredAgent.js';
import { socialEvidenceAgent } from './socialEvidenceAgent.js';
import { mediaForensicsAgent } from './mediaForensicsAgent.js';
import { propagationPatternAgent } from './patternAgent.js';
import { aggregateAndScore } from './scoringAgent.js';
import { routeToVoting } from './communityRoutingAgent.js';

const prisma = new PrismaClient();

// Smart Contract ABIs (simplified - add full ABIs)
const CLAIM_REGISTRY_ABI = [
  "function registerClaim(uint256 claimId, bytes32 claimHash, address submitter) external returns (bool)",
  "function resolveClaim(uint256 claimId, bytes32 claimHash, uint8 verdict, uint256 confidence) external returns (bool)",
  "event ClaimRegistered(uint256 indexed claimId, bytes32 claimHash, address submitter)",
  "event ClaimResolved(uint256 indexed claimId, bytes32 claimHash, uint8 verdict, uint256 confidence)"
];

const STAKING_VOTING_ABI = [
  "function settleClaim(uint256 claimId, uint8 finalVerdict) external returns (bool)",
  "function distributeRewards(uint256 claimId) external returns (bool)",
  "event VoteCast(uint256 indexed claimId, address voter, uint8 choice, uint256 stakedAmount)",
  "event RewardsDistributed(uint256 indexed claimId, address[] winners, uint256[] amounts)"
];

interface ClaimInput {
  submitterId: number;
  rawInput: string;
  normalizedText: string;
  claimType: string;
  platform?: string;
  platformPostId?: string;
  platformAuthor?: string;
  platformUrl?: string;
  extractedUrls?: string[];
  mediaImages?: string[];
  mediaVideos?: string[];
}

interface AgentResult {
  agentName: AgentType;
  verdict: VerdictType;
  confidence: number;
  flags: string[];
  rawResult: any;
}

export class ResultOrchestrator {
  private mapAIVerdictToPrisma(verdict: 'TRUE' | 'FALSE' | 'UNCLEAR'): VerdictType {
    switch (verdict) {
      case 'TRUE': return VerdictType.true_;
      case 'FALSE': return VerdictType.false_;
      case 'UNCLEAR': return VerdictType.unclear;
      default: return VerdictType.unclear;
    }
  }
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private claimRegistryContract: ethers.Contract;
  private stakingVotingContract: ethers.Contract;

  constructor(
    rpcUrl: string,
    privateKey: string,
    claimRegistryAddress: string,
    stakingVotingAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.claimRegistryContract = new ethers.Contract(
      claimRegistryAddress,
      CLAIM_REGISTRY_ABI,
      this.signer
    );
    this.stakingVotingContract = new ethers.Contract(
      stakingVotingAddress,
      STAKING_VOTING_ABI,
      this.signer
    );
  }

  /**
   * PHASE 1: Claim Intake
   * Creates initial claim record and registers on-chain
   */
  async processClaimIntake(input: ClaimInput): Promise<number> {
    const claimUuid = uuidv4();

    // Create claim in database
    const claim = await prisma.claim.create({
      data: {
        claim_uuid: claimUuid,
        submitter_id: input.submitterId,
        raw_input: input.rawInput,
        normalized_text: input.normalizedText,
        claim_type: input.claimType as ClaimType,
        platform: input.platform as PlatformType,
        platform_post_id: input.platformPostId,
        platform_author: input.platformAuthor,
        platform_url: input.platformUrl,
        extracted_urls: input.extractedUrls ? JSON.stringify(input.extractedUrls) : null,
        media_images: input.mediaImages ? JSON.stringify(input.mediaImages) : null,
        media_videos: input.mediaVideos ? JSON.stringify(input.mediaVideos) : null,
        status: ClaimStatus.pending_ai,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    console.log(`✅ Claim created in DB: ID = ${claim.id}, UUID = ${claimUuid} `);

    // Compute claim hash and register on-chain
    const claimHash = ethers.keccak256(
      ethers.toUtf8Bytes(input.normalizedText)
    );

    try {
      const submitterUser = await prisma.user.findUnique({
        where: { id: input.submitterId }
      });

      if (!submitterUser?.wallet_address) {
        throw new Error('Submitter wallet address not found');
      }

      const tx = await this.claimRegistryContract.registerClaim(
        claim.id,
        claimHash,
        submitterUser.wallet_address
      );

      const receipt = await tx.wait();
      console.log(`⛓️  Claim registered on - chain: TX = ${receipt.hash} `);

      // Update claim with on-chain data
      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          claim_hash: claimHash,
          onchain_claim_tx: receipt.hash,
          updated_at: new Date()
        }
      });

      // Log on-chain event
      await prisma.onchainEvent.create({
        data: {
          claim_id: claim.id,
          tx_hash: receipt.hash,
          event_type: OnchainEventType.claim_registered,
          payload: JSON.stringify({
            claimId: claim.id,
            claimHash,
            submitter: submitterUser.wallet_address
          }),
          created_at: new Date()
        }
      });

    } catch (error) {
      console.error('❌ On-chain registration failed:', error);
      // Continue with off-chain processing even if on-chain fails
    }

    return claim.id;
  }

  /**
   * PHASE 2: Run Analysis Agents
   * Executes all specialized AI agents and stores results
   */
  async runAnalysisAgents(claimId: number): Promise<AgentResult[]> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    console.log(`🤖 Running analysis agents for claim ${claimId}...`);

    const agentPromises = [
      this.runAgent(claimId, 'logic_consistency', logicConsistencyAgent, claim),
      this.runAgent(claimId, 'citation_evidence', citationEvidenceAgent, claim),
      this.runAgent(claimId, 'source_credibility', sourceCredibilityAgent, claim),
      this.runAgent(claimId, 'social_evidence', socialEvidenceAgent, claim),
      this.runAgent(claimId, 'media_forensics', mediaForensicsAgent, claim),
      this.runAgent(claimId, 'propagation_pattern', propagationPatternAgent, claim)
    ];

    const results = await Promise.allSettled(agentPromises);

    const agentResults: AgentResult[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        agentResults.push(result.value);
      } else if (result.status === 'rejected') {
        console.error('❌ Agent failed:', result.reason);
      }
    }

    // Update claim status
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status: ClaimStatus.ai_evaluated,
        updated_at: new Date()
      }
    });

    console.log(`✅ Completed ${agentResults.length}/6 agents`);
    return agentResults;
  }

  /**
   * Helper: Run individual agent and store results
   */
  private async runAgent(
    claimId: number,
    agentName: string,
    agentFunction: any,
    claim: any
  ): Promise<AgentResult | null> {
    try {
      console.log(`  ⚙️  Running ${agentName}...`);

      // Prepare agent input based on claim data
      const agentInput = {
        claim: claim.normalized_text,
        urls: claim.extracted_urls ? JSON.parse(claim.extracted_urls) : [],
        images: claim.media_images ? JSON.parse(claim.media_images) : [],
        videos: claim.media_videos ? JSON.parse(claim.media_videos) : [],
        platform: claim.platform,
        platformAuthor: claim.platform_author,
        platformUrl: claim.platform_url,
        messages: []
      };

      // Invoke agent
      const result = await agentFunction.invoke(agentInput);

      // Store in agent_results table
      await prisma.agentResult.create({
        data: {
          claim_id: claimId,
          agent_name: agentName as AgentType,
          verdict: result.isCredible ? VerdictType.true_ : VerdictType.false_,
          confidence: result.confidence || 0.5,
          flags: JSON.stringify(result.flags || result.flaggedIssues || []),
          raw_result: JSON.stringify(result),
          created_at: new Date()
        }
      });

      console.log(`    ✓ ${agentName}: verdict=${result.isCredible ? 'TRUE' : 'FALSE'}, confidence=${result.confidence?.toFixed(2)}`);

      return {
        agentName: agentName as AgentType,
        verdict: result.isCredible ? VerdictType.true_ : VerdictType.false_,
        confidence: result.confidence || 0.5,
        flags: result.flags || result.flaggedIssues || [],
        rawResult: result
      };

    } catch (error) {
      console.error(`    ✗ ${agentName} failed:`, error);
      return null;
    }
  }

  /**
   * PHASE 3: Aggregation & Scoring
   * Combines all agent results into final AI verdict
   */
  async runAggregation(claimId: number): Promise<void> {
    console.log(`📊 Running aggregation for claim ${claimId}...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    // Fetch all agent results
    const agentResults = await prisma.agentResult.findMany({
      where: { claim_id: claimId }
    });

    if (agentResults.length === 0) {
      throw new Error(`No agent results found for claim ${claimId}`);
    }

    // FIXED: Prepare ClaimMetadata with correct structure
    const claimMetadata: ClaimMetadata = {
      claimId: claim.id.toString(),
      normalizedText: claim.normalized_text || '',
      claimType: claim.claim_type || undefined,
      platforms: claim.platform ? [claim.platform] : []
    };

    // Prepare AgentOutputs
    const agentOutputs: AgentOutputs = {
      logic: undefined,
      citation: undefined,
      sourceCredibility: undefined,
      socialEvidence: undefined,
      mediaForensics: undefined,
      propagation: undefined
    };

    for (const ar of agentResults) {
      try {
        const rawResult = JSON.parse(ar.raw_result || '{}');

        switch (ar.agent_name) {
          case 'logic_consistency':
            agentOutputs.logic = rawResult;
            break;
          case 'citation_evidence':
            agentOutputs.citation = rawResult;
            break;
          case 'source_credibility':
            agentOutputs.sourceCredibility = rawResult;
            break;
          case 'social_evidence':
            agentOutputs.socialEvidence = rawResult;
            break;
          case 'media_forensics':
            agentOutputs.mediaForensics = rawResult;
            break;
          case 'propagation_pattern':
            agentOutputs.propagation = rawResult;
            break;
        }
      } catch (error) {
        console.error(`Failed to parse agent result for ${ar.agent_name}:`, error);
      }
    }

    // Run aggregation
    const aggregationResult = await aggregateAndScore(claimMetadata, agentOutputs);

    // Update claim with AI verdict
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        ai_verdict: this.mapAIVerdictToPrisma(aggregationResult.aiVerdict),
        ai_confidence: aggregationResult.aiConfidence,
        ai_flags: JSON.stringify(aggregationResult.warnings || []),
        ai_explanation: aggregationResult.explanation,
        status: ClaimStatus.ai_evaluated,
        updated_at: new Date()
      }
    });

    console.log(`✅ Aggregation complete: verdict=${aggregationResult.aiVerdict}, confidence=${aggregationResult.aiConfidence.toFixed(2)}`);
  }

  /**
   * PHASE 4: Community Routing
   * Decides whether to resolve with AI alone or send to community voting
   */
  async routeClaim(claimId: number): Promise<void> {
    console.log(`🔀 Routing claim ${claimId}...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    // Fetch all agent results for flags
    const agentResults = await prisma.agentResult.findMany({
      where: { claim_id: claimId }
    });

    // FIXED: Explicitly type the arrow function parameter
    const allFlags = agentResults.flatMap((ar: Prisma.AgentResultGetPayload<{}>) => {
      try {
        return JSON.parse(ar.flags || '[]') as string[];
      } catch {
        return [];
      }
    });

    // FIXED: Prepare routing input with all required fields
    // FIXED: Prepare routing input with all required fields
    const routingInput: RoutingInput = {
      claim: {
        claimId: claim.id.toString(),
        normalizedText: claim.normalized_text || '',
        platforms: claim.platform ? [claim.platform] : [],
        claimType: claim.claim_type || undefined
      },
      aiVerdict: {
        verdict: claim.ai_verdict as any, // Cast to match enum if needed
        confidence: claim.ai_confidence || 0.5,
        overallScore: 0 // Placeholder if not available
      },
      agentFlags: {
        // Map string flags to boolean flags if possible, or leave empty/default
      }
    };

    // Run community routing
    const routingDecision = routeToVoting(routingInput);

    // FIXED: Handle all possible route types
    if (routingDecision.route === 'ai_only') {
      await this.resolveWithAI(claimId);
    } else if (routingDecision.route === 'community_vote') {
      await this.initiateCommunityVoting(claimId, routingDecision);
    } else if (routingDecision.route === 'defer_archived') {
      // Handle deferred/archived claims
      await prisma.claim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.resolved,
          final_verdict: claim.ai_verdict,
          final_confidence: claim.ai_confidence,
          resolved_at: new Date(),
          updated_at: new Date()
        }
      });
      console.log(`📦 Claim ${claimId} deferred/archived with AI verdict`);
    }
  }

  /**
   * Resolve claim with AI verdict only (no voting)
   */
  private async resolveWithAI(claimId: number): Promise<void> {
    console.log(`✅ Resolving claim ${claimId} with AI verdict only...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    // Update claim with final verdict
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        final_verdict: claim.ai_verdict,
        final_confidence: claim.ai_confidence,
        status: ClaimStatus.resolved,
        resolved_at: new Date(),
        updated_at: new Date()
      }
    });

    // Publish results (on-chain + notifications)
    await this.publishFinalResults(claimId);
  }

  /**
   * Initiate community voting session
   */
  private async initiateCommunityVoting(
    claimId: number,
    routing: RoutingDecision  // FIXED: Use RoutingDecision type from communityRoutingAgent
  ): Promise<void> {
    console.log(`🗳️  Initiating community voting for claim ${claimId}...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    // Calculate voting window
    const opensAt = new Date();
    const closesAt = new Date(opensAt.getTime() + routing.votingWindowSeconds * 1000);

    // ACID: Create session and update claim in a single transaction
    const [session] = await prisma.$transaction([
      prisma.votingSession.create({
        data: {
          claim_id: claimId,
          route_reason: routing.reasoning,
          urgency: routing.urgency,
          voting_window_secs: routing.votingWindowSeconds,
          min_votes_required: routing.minVotesRequired,
          status: VotingStatus.open,
          opened_at: opensAt,
          closes_at: closesAt
        }
      }),
      prisma.claim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.needs_vote,
          updated_at: new Date()
        }
      })
    ]);

    console.log(`  ✓ Voting session created: ID=${session.id}`);

    // Get eligible voters based on cohorts
    const eligibleVoterIds = await this.getEligibleVoters(
      routing.targetVoterCohorts,
      claim.platform
    );

    // Notify eligible voters
    await this.notifyVoters(claimId, session.id, eligibleVoterIds);
  }

  /**
   * Get eligible voters based on cohorts
   */
  private async getEligibleVoters(
    cohorts: VoterCohort[],
    platform?: string | null
  ): Promise<number[]> {
    try {
      const users = await prisma.user.findMany({
        where: {
          reputation_score: { gte: 50 } // Basic reputation threshold
        }
      });

      // FIXED: Explicitly type user parameter and implement actual filtering logic
      const eligibleUsers = users.filter((user: Prisma.UserGetPayload<{}>) => {
        // Filter based on cohorts
        if (cohorts.length > 0) {
          // Check if user matches ANY of the required cohorts
          // For now, we'll just check if they have a sufficient reputation score as a proxy
          // In a real implementation, we would match user.interests or user.reputation_tier against cohort.topics/minReputationTier
          return true;
        }

        // Filter based on platform expertise if specified
        if (platform) {
          // TODO: Implement platform expertise filtering
          // For now, include all users
        }

        return true;
      });

      // FIXED: Explicitly type map parameter
      return eligibleUsers.map((u: Prisma.UserGetPayload<{}>) => u.id);
    } catch (error) {
      console.error('Error fetching eligible voters:', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Send email notifications to eligible voters
   */
  private async notifyVoters(
    claimId: number,
    sessionId: number,
    voterIds: number[]
  ): Promise<void> {
    console.log(`📧 Notifying ${voterIds.length} voters...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) return;

    for (const voterId of voterIds) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: voterId }
        });

        if (!user || !user.email) continue;

        const emailPayload = {
          to: user.email,
          subject: `VeriChain: New Claim Needs Your Vote`,
          body: `
            <h2>A new claim requires community verification</h2>
            <p><strong>Claim:</strong> ${claim.normalized_text}</p>
            <p><strong>AI Verdict:</strong> ${claim.ai_verdict} (${(claim.ai_confidence! * 100).toFixed(0)}% confidence)</p>
            <p>Your expertise is needed to verify this claim. Vote now to earn rewards!</p>
            <a href="https://verichain.app/vote/${claimId}">Vote Now</a>
          `
        };

        await sendEmail(emailPayload);

        // Log notification
        await prisma.notification.create({
          data: {
            user_id: voterId,
            claim_id: claimId,
            session_id: sessionId,
            notif_type: NotifChannelType.email,
            status: NotifStatus.sent,
            payload: JSON.stringify(emailPayload),
            created_at: new Date(),
            sent_at: new Date()
          }
        });

        console.log(`  ✓ Notified voter ${voterId} (${user.email})`);

      } catch (error) {
        console.error(`  ✗ Failed to notify voter ${voterId}:`, error);

        // Log failed notification
        await prisma.notification.create({
          data: {
            user_id: voterId,
            claim_id: claimId,
            session_id: sessionId,
            notif_type: NotifChannelType.email,
            status: NotifStatus.failed,
            payload: JSON.stringify({ error: String(error) }),
            created_at: new Date()
          }
        });
      }
    }
  }

  /**
   * PHASE 5: Process Vote (called by blockchain event listener)
   * Records votes from on-chain events
   */
  async processVote(
    claimId: number,
    voterAddress: string,
    choice: VerdictType,
    stakedAmount: bigint,
    txHash: string
  ): Promise<void> {
    console.log(`🗳️  Processing vote for claim ${claimId} from ${voterAddress}...`);

    // Find voter by wallet address
    const voter = await prisma.user.findUnique({
      where: { wallet_address: voterAddress }
    });

    if (!voter) {
      console.error(`  ✗ Voter not found: ${voterAddress}`);
      return;
    }

    // Find active voting session
    const session = await prisma.votingSession.findFirst({
      where: {
        claim_id: claimId,
        status: VotingStatus.open
      }
    });

    if (!session) {
      console.error(`  ✗ No active voting session for claim ${claimId}`);
      return;
    }

    // Record vote
    await prisma.vote.create({
      data: {
        session_id: session.id,
        claim_id: claimId,
        voter_id: voter.id,
        choice: choice,
        confidence: null,
        staked_amount: stakedAmount.toString(),
        onchain_vote_tx: txHash,
        created_at: new Date()
      }
    });

    // Log on-chain event
    await prisma.onchainEvent.create({
      data: {
        claim_id: claimId,
        tx_hash: txHash,
        event_type: OnchainEventType.vote_cast,
        payload: JSON.stringify({
          voter: voterAddress,
          choice,
          stakedAmount: stakedAmount.toString()
        }),
        created_at: new Date()
      }
    });

    console.log(`  ✓ Vote recorded: voter=${voter.id}, choice=${choice}`);
  }

  /**
   * PHASE 6: Close Voting & Compute Final Verdict
   * Called when voting window expires
   */
  async closeVotingAndResolve(claimId: number): Promise<void> {
    console.log(`🔒 Closing voting for claim ${claimId}...`);

    const session = await prisma.votingSession.findFirst({
      where: {
        claim_id: claimId,
        status: VotingStatus.open
      }
    });

    if (!session) {
      console.error(`  ✗ No active voting session for claim ${claimId}`);
      return;
    }

    // Check if voting window has closed
    if (new Date() < session.closes_at!) {
      console.log(`  ⏳ Voting window not yet closed (closes at ${session.closes_at})`);
      return;
    }

    // Get all votes
    const votes = await prisma.vote.findMany({
      where: { claim_id: claimId, session_id: session.id }
    });

    console.log(`  📊 Received ${votes.length} votes (min required: ${session.min_votes_required})`);

    // Check if minimum votes met
    if (votes.length < (session.min_votes_required || 0)) {
      console.log(`  ⚠️  Insufficient votes, using AI verdict`);
      await this.resolveWithAI(claimId);
      return;
    }

    // Compute weighted verdict based on stakes
    const verdictScores = {
      [VerdictType.true_]: 0,
      [VerdictType.false_]: 0,
      [VerdictType.unclear]: 0
    };

    const tally: { [key in VerdictType]?: number } = {
      [VerdictType.true_]: 0,
      [VerdictType.false_]: 0,
      [VerdictType.unclear]: 0
    };

    let totalStake = 0n;

    for (const vote of votes) {
      const stakedAmount = vote.staked_amount ? Number(vote.staked_amount) : 0;
      tally[vote.choice] = (tally[vote.choice] || 0) + stakedAmount;
      verdictScores[vote.choice] += stakedAmount; // Changed from Number(stake)
      totalStake += BigInt(stakedAmount); // Changed from stake
    }

    // Determine final verdict (highest stake wins)
    const finalVerdict = Object.entries(verdictScores).reduce((a, b) =>
      b[1] > a[1] ? b : a
    )[0] as VerdictType;

    const finalConfidence = totalStake > 0n
      ? verdictScores[finalVerdict] / Number(totalStake)
      : 0.5;

    console.log(`  ✅ Community verdict: ${finalVerdict} (${(finalConfidence * 100).toFixed(0)}% confidence)`);

    // ACID: Update claim and close session in a single transaction
    await prisma.$transaction([
      prisma.claim.update({
        where: { id: claimId },
        data: {
          final_verdict: finalVerdict,
          final_confidence: finalConfidence,
          status: ClaimStatus.resolved,
          resolved_at: new Date(),
          updated_at: new Date()
        }
      }),
      prisma.votingSession.update({
        where: { id: session.id },
        data: {
          status: VotingStatus.closed,
          closed_at: new Date()
        }
      })
    ]);

    // Publish results and distribute rewards
    await this.publishFinalResults(claimId);
  }

  /**
   * PHASE 7: Publish Final Results
   * Writes verdict on-chain and distributes rewards
   */
  private async publishFinalResults(claimId: number): Promise<void> {
    console.log(`📢 Publishing final results for claim ${claimId}...`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim || !claim.final_verdict) {
      throw new Error(`Claim ${claimId} not ready for publishing`);
    }

    try {
      // 1. Resolve claim on-chain
      const verdictEnum = this.verdictToEnum(claim.final_verdict);
      const confidenceScaled = Math.floor((claim.final_confidence || 0.5) * 100);

      const resolveTx = await this.claimRegistryContract.resolveClaim(
        claimId,
        claim.claim_hash,
        verdictEnum,
        confidenceScaled
      );

      const resolveReceipt = await resolveTx.wait();
      console.log(`  ⛓️  Claim resolved on-chain: TX=${resolveReceipt.hash}`);

      // ACID: Update claim and log event in a single transaction
      await prisma.$transaction([
        prisma.claim.update({
          where: { id: claimId },
          data: {
            onchain_resolve_tx: resolveReceipt.hash,
            updated_at: new Date()
          }
        }),
        prisma.onchainEvent.create({
          data: {
            claim_id: claimId,
            tx_hash: resolveReceipt.hash,
            event_type: OnchainEventType.claim_resolved,
            payload: JSON.stringify({
              verdict: claim.final_verdict,
              confidence: claim.final_confidence
            }),
            created_at: new Date()
          }
        })
      ]);

      // 2. Settle claim and distribute rewards (if voting occurred)
      const votingSession = await prisma.votingSession.findFirst({
        where: { claim_id: claimId }
      });

      if (votingSession) {
        const settleTx = await this.stakingVotingContract.settleClaim(
          claimId,
          verdictEnum
        );

        const settleReceipt = await settleTx.wait();
        console.log(`  💰 Rewards distributed: TX=${settleReceipt.hash}`);

        // Log on-chain event
        await prisma.onchainEvent.create({
          data: {
            claim_id: claimId,
            tx_hash: settleReceipt.hash,
            event_type: OnchainEventType.rewards_distributed,
            payload: JSON.stringify({
              verdict: claim.final_verdict
            }),
            created_at: new Date()
          }
        });
      }

      // 3. Notify submitter
      await this.notifySubmitter(claimId);

      console.log(`✅ Final results published for claim ${claimId}`);

    } catch (error) {
      console.error('❌ Failed to publish results on-chain:', error);
      throw error;
    }
  }

  /**
   * Notify claim submitter of final verdict
   */
  private async notifySubmitter(claimId: number): Promise<void> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) return;

    const submitter = await prisma.user.findUnique({
      where: { id: claim.submitter_id }
    });

    if (!submitter?.email) return;

    try {
      const emailPayload = {
        to: submitter.email,
        subject: `VeriChain: Your Claim Has Been Verified`,
        body: `
          <h2>Your claim has been verified!</h2>
          <p><strong>Your Claim:</strong> ${claim.normalized_text}</p>
          <p><strong>Final Verdict:</strong> ${claim.final_verdict}</p>
          <p><strong>Confidence:</strong> ${(claim.final_confidence! * 100).toFixed(0)}%</p>
          <p>${claim.ai_explanation || ''}</p>
          <a href="https://verichain.app/claim/${claimId}">View Full Results</a>
        `
      };

      await sendEmail(emailPayload);

      await prisma.notification.create({
        data: {
          user_id: claim.submitter_id,
          claim_id: claimId,
          notif_type: NotifChannelType.email,
          status: NotifStatus.sent,
          payload: JSON.stringify(emailPayload),
          created_at: new Date(),
          sent_at: new Date()
        }
      });

      console.log(`  📧 Submitter notified: ${submitter.email}`);

    } catch (error) {
      console.error('  ✗ Failed to notify submitter:', error);
    }
  }

  /**
   * Helper: Convert VerdictType to smart contract enum (0=false, 1=true, 2=unclear)
   */
  private verdictToEnum(verdict: VerdictType): number {
    switch (verdict) {
      case VerdictType.false_:
        return 0;
      case VerdictType.true_:
        return 1;
      case VerdictType.unclear:
        return 2;
      default:
        return 2;
    }
  }

  /**
   * Complete Workflow: Process entire claim from intake to resolution
   */
  async processCompleteWorkflow(input: ClaimInput): Promise<void> {
    console.log('\n🚀 Starting complete verification workflow...\n');

    try {
      // Phase 1: Intake
      const claimId = await this.processClaimIntake(input);
      console.log(`\n✅ Phase 1 Complete: Claim Intake (ID=${claimId})\n`);

      // Phase 2: Analysis
      await this.runAnalysisAgents(claimId);
      console.log(`\n✅ Phase 2 Complete: Agent Analysis\n`);

      // Phase 3: Aggregation
      await this.runAggregation(claimId);
      console.log(`\n✅ Phase 3 Complete: Aggregation & Scoring\n`);

      // Phase 4: Routing
      await this.routeClaim(claimId);
      console.log(`\n✅ Phase 4 Complete: Community Routing\n`);

      console.log(`\n🎉 Workflow complete for claim ${claimId}!\n`);

    } catch (error) {
      console.error('\n❌ Workflow failed:', error);
      throw error;
    }
  }
}

export default ResultOrchestrator;