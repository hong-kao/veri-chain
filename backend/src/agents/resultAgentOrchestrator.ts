import { ClaimMetadata, AgentOutputs } from './scoringAgent.js';
import { RoutingInput, RouteDecision, RoutingDecision, VoterCohort } from './communityRoutingAgent.js';
import { PrismaClient, ClaimStatus, VerdictType, AgentType, VotingStatus, NotifChannelType, NotifStatus, OnchainEventType, Prisma, ClaimType, PlatformType } from '../generated/prisma/index.js';
import prisma from '../config/db.config.js';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '../utils/email.js';
import { sendVotingNotifications } from '../services/emailService.js';
import { logicConsistencyAgent } from './textForensicsAgent.js';
import { citationEvidenceAgent } from './citationAgent.js';
import { sourceCredibilityAgent } from './sourceCredAgent.js';
import { socialEvidenceAgent } from './socialEvidenceAgent.js';
import { mediaForensicsAgent } from './mediaForensicsAgent.js';
import { propagationPatternAgent } from './patternAgent.js';
import { aggregateAndScore } from './scoringAgent.js';
import { scoreClaimSimple, ClaimMetadata as SimpleClaimMetadata } from './simpleScoring.js';
import { routeToVoting } from './communityRoutingAgent.js';
import ClaimRegistryABI from '../abis/ClaimRegistry.json' with { type: "json" };
import VerificationMarketABI from '../abis/VerificationMarket.json' with { type: "json" };
import ReputationABI from '../abis/Reputation.json' with { type: "json" };
import VerifierBadgeABI from '../abis/VerifierBadge.json' with { type: "json" };

// Deployed Addresses (Sepolia)
const CLAIM_REGISTRY_ADDRESS = "0xB9363715c69992Fada1448C05165b97d23D83559";
const VERIFICATION_MARKET_ADDRESS = "0x2CF4e9F01fEe292Dfbf2449A9027F64c38254ecF";
const REPUTATION_ADDRESS = "0x81dD1cb41329cDfc58932d36AD21CDD8e894f348";
const VERIFIER_BADGE_ADDRESS = "0xe24458A4Cd02B4A228B5ea6032A7055c3c096f8b";

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
  onchainTxHash?: string | null;  // User-provided on-chain tx hash (if already registered)
  claimHash?: string | null;       // User-provided claim hash
}

interface AgentResult {
  agentName: AgentType;
  verdict: VerdictType;
  confidence: number;
  flags: string[];
  rawResult: any;
}

// Normalization functions to map actual agent outputs to scoring agent expected interfaces
// FIXED: Now properly interprets the 'verdict' field that agents return

// Helper to convert verdict to a 0-1 score
function verdictToScore(verdict: string | undefined, confidence: number = 0.5): number {
  // 'true' = claim is credible/supported = high score (1.0)
  // 'false' = claim is NOT credible/contradicted = low score (0.0)
  // 'unclear' or undefined = neutral (0.5)
  if (verdict === 'true' || verdict === 'TRUE') return 0.8 + (confidence * 0.2); // 0.8-1.0
  if (verdict === 'false' || verdict === 'FALSE') return 0.2 - (confidence * 0.15); // 0.05-0.2
  return 0.5;
}

function normalizeLogicOutput(raw: any): any {
  // textForensicsAgent uses isConsistent/logicScore, but scoringAgent expects verdict/confidence/reasons/flags
  if (!raw) return undefined;

  // Priority: use explicit verdict, then derive from isConsistent/logicScore
  let verdict = raw.verdict;
  if (!verdict) {
    verdict = raw.isConsistent === false ? 'false' :
      raw.logicScore && raw.logicScore < 0.4 ? 'false' :
        raw.logicScore && raw.logicScore > 0.7 ? 'true' : 'unclear';
  }

  return {
    verdict: verdict,
    confidence: raw.confidence ?? raw.logicScore ?? 0.5,
    reasons: raw.explanation ? [raw.explanation] : [],
    flags: raw.flaggedIssues || raw.logicalFallacies || []
  };
}

function normalizeSourceCredibilityOutput(raw: any): any {
  if (!raw) return undefined;

  // FIXED: Use verdict to determine score, not just isCredible
  const verdict = raw.verdict;
  const confidence = raw.confidence ?? 0.5;

  return {
    sourceCredibilityScore: raw.sourceCredibilityScore ?? raw.credibilityScore ?? verdictToScore(verdict, confidence),
    isCredible: raw.isCredible ?? (verdict === 'true' || verdict === 'TRUE'),
    confidence: confidence,
    domainReputations: raw.domainReputations || [],
    flaggedIssues: raw.flaggedIssues || raw.flags || [],
    explanation: raw.explanation || raw.summary || ''
  };
}

function normalizeCitationOutput(raw: any): any {
  if (!raw) return undefined;

  // FIXED: Use verdict to determine citation score
  const verdict = raw.verdict;
  const confidence = raw.confidence ?? 0.5;

  return {
    citationScore: raw.citationScore ?? raw.evidenceScore ?? verdictToScore(verdict, confidence),
    confidence: confidence,
    supportingSources: raw.supportingSources || [],
    contradictingSources: raw.contradictingSources || [],
    flags: raw.flags || [],
    explanation: raw.explanation || raw.summary || ''
  };
}

function normalizeSocialEvidenceOutput(raw: any): any {
  if (!raw) return undefined;

  // FIXED: Use verdict to determine social score
  const verdict = raw.verdict;
  const confidence = raw.confidence ?? 0.5;

  return {
    socialScore: raw.socialScore ?? verdictToScore(verdict, confidence),
    confidence: confidence,
    summary: raw.summary || raw.explanation || '',
    authoritativeAccounts: raw.authoritativeAccounts || [],
    flags: raw.flags || []
  };
}

function normalizeMediaForensicsOutput(raw: any): any {
  if (!raw) return undefined;

  // FIXED: Use verdict to determine risk score
  // For media: FALSE verdict = high risk, TRUE verdict = low risk
  const verdict = raw.verdict;
  const confidence = raw.confidence ?? 0.5;

  let riskScore = raw.overallRiskScore ?? raw.riskScore;
  if (riskScore === undefined) {
    // If verdict is FALSE (claim has manipulated media), risk is HIGH
    // If verdict is TRUE (media is authentic), risk is LOW
    riskScore = verdict === 'false' || verdict === 'FALSE' ? 70 + (confidence * 20) :
      verdict === 'true' || verdict === 'TRUE' ? 20 - (confidence * 15) : 50;
  }

  return {
    overallRiskScore: riskScore,
    confidence: confidence,
    mediaAnalysis: raw.mediaAnalysis || [],
    summary: raw.summary || raw.explanation || ''
  };
}

function normalizePropagationOutput(raw: any): any {
  if (!raw) return undefined;

  // FIXED: Use verdict to determine suspicion score
  // For propagation: FALSE verdict = suspicious patterns = high suspicion
  const verdict = raw.verdict;
  const confidence = raw.confidence ?? 0.5;

  let suspicionScore = raw.suspicionScore;
  if (suspicionScore === undefined) {
    suspicionScore = verdict === 'false' || verdict === 'FALSE' ? 60 + (confidence * 30) :
      verdict === 'true' || verdict === 'TRUE' ? 20 - (confidence * 15) : 50;
  }

  return {
    suspicionScore: suspicionScore,
    confidence: confidence,
    flags: raw.flags || [],
    summary: raw.summary || raw.explanation || '',
    propagationMetrics: raw.propagationMetrics || {
      totalPosts: 0,
      uniqueAuthors: 0,
      platforms: [],
      burstActivity: false
    }
  };
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
  private verificationMarketContract: ethers.Contract;
  private reputationContract: ethers.Contract;
  private verifierBadgeContract: ethers.Contract;

  constructor(
    rpcUrl: string,
    privateKey: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);

    this.claimRegistryContract = new ethers.Contract(
      CLAIM_REGISTRY_ADDRESS,
      ClaimRegistryABI.abi,
      this.signer
    );

    this.verificationMarketContract = new ethers.Contract(
      VERIFICATION_MARKET_ADDRESS,
      VerificationMarketABI.abi,
      this.signer
    );

    this.reputationContract = new ethers.Contract(
      REPUTATION_ADDRESS,
      ReputationABI.abi,
      this.signer
    );

    this.verifierBadgeContract = new ethers.Contract(
      VERIFIER_BADGE_ADDRESS,
      VerifierBadgeABI.abi,
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

    // Handle on-chain registration
    // If user provided txHash (registered from their wallet), use that
    // Otherwise, log that user-initiated registration is expected
    const claimHash = input.claimHash || ethers.keccak256(
      ethers.toUtf8Bytes(input.normalizedText)
    );

    if (input.onchainTxHash) {
      // User already registered on-chain from their wallet - store the info
      console.log(`⛓️  User-initiated on-chain registration detected: TX = ${input.onchainTxHash}`);

      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          claim_hash: claimHash,
          onchain_claim_tx: input.onchainTxHash,
          updated_at: new Date()
        }
      });

      // Log on-chain event
      await prisma.onchainEvent.create({
        data: {
          claim_id: claim.id,
          tx_hash: input.onchainTxHash,
          event_type: OnchainEventType.claim_registered,
          payload: JSON.stringify({
            claimId: claim.id,
            claimHash,
            userInitiated: true // Flag that this was user-initiated
          }),
          created_at: new Date()
        }
      });
    } else {
      // No on-chain tx provided - store the hash but note it's not on-chain yet
      console.log(`ℹ️  No on-chain registration provided - claim will be processed off-chain only`);
      await prisma.claim.update({
        where: { id: claim.id },
        data: {
          claim_hash: claimHash,
          updated_at: new Date()
        }
      });
    }

    return claim.id;
  }

  /**
   * PHASE 2: Run Analysis Agents
   * Executes ONLY the relevant AI agents based on claim content
   */
  async runAnalysisAgents(claimId: number): Promise<AgentResult[]> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      throw new Error(`Claim ${claimId} not found`);
    }

    // Parse claim content to determine which agents to run
    const images = claim.media_images ? JSON.parse(claim.media_images) : [];
    const videos = claim.media_videos ? JSON.parse(claim.media_videos) : [];
    const urls = claim.extracted_urls ? JSON.parse(claim.extracted_urls) : [];
    const hasMedia = images.length > 0 || videos.length > 0;
    const hasUrls = urls.length > 0;
    const platform = claim.platform;

    console.log(`🤖 Running analysis agents for claim ${claimId}...`);
    console.log(`   📋 Claim type: ${claim.claim_type || 'unknown'}`);
    console.log(`   🖼️  Has media: ${hasMedia} (${images.length} images, ${videos.length} videos)`);
    console.log(`   🔗 Has URLs: ${hasUrls} (${urls.length} URLs)`);
    console.log(`   📱 Platform: ${platform || 'unknown'}`);

    // Build list of agents to run based on claim content
    const agentPromises: Promise<AgentResult | null>[] = [];

    // ALWAYS run these core agents (essential for any claim):
    // 1. Logic & Consistency - checks for logical fallacies, contradictions
    agentPromises.push(this.runAgent(claimId, 'logic_consistency', logicConsistencyAgent, claim));
    console.log('   ✓ Running: logic_consistency (core agent)');

    // 2. Citation Evidence - searches for supporting/contradicting evidence
    agentPromises.push(this.runAgent(claimId, 'citation_evidence', citationEvidenceAgent, claim));
    console.log('   ✓ Running: citation_evidence (core agent)');

    // CONDITIONALLY run these agents based on claim content:

    // 3. Source Credibility - only if we have URLs to analyze
    if (hasUrls) {
      agentPromises.push(this.runAgent(claimId, 'source_credibility', sourceCredibilityAgent, claim));
      console.log('   ✓ Running: source_credibility (has URLs)');
    } else {
      console.log('   ⏭️  Skipping: source_credibility (no URLs to analyze)');
    }

    // 4. Social Evidence - useful for claims from social platforms or viral content
    if (platform === 'twitter' || platform === 'reddit' || platform === 'farcaster' || !platform) {
      agentPromises.push(this.runAgent(claimId, 'social_evidence', socialEvidenceAgent, claim));
      console.log('   ✓ Running: social_evidence (social platform claim)');
    } else {
      console.log('   ⏭️  Skipping: social_evidence (not a social platform claim)');
    }

    // 5. Media Forensics - ONLY if there are images or videos to analyze
    if (hasMedia) {
      agentPromises.push(this.runAgent(claimId, 'media_forensics', mediaForensicsAgent, claim));
      console.log('   ✓ Running: media_forensics (has media attachments)');
    } else {
      console.log('   ⏭️  Skipping: media_forensics (no media to analyze)');
    }

    // 6. Propagation Pattern - only for claims with URLs or from social platforms
    if (hasUrls || platform) {
      agentPromises.push(this.runAgent(claimId, 'propagation_pattern', propagationPatternAgent, claim));
      console.log('   ✓ Running: propagation_pattern (has URLs or platform)');
    } else {
      console.log('   ⏭️  Skipping: propagation_pattern (no propagation data available)');
    }

    console.log(`\n   📊 Running ${agentPromises.length} agents (optimized from 6)`);

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

    console.log(`✅ Completed ${agentResults.length}/${agentPromises.length} agents`);
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
      const images = claim.media_images ? JSON.parse(claim.media_images) : [];
      const videos = claim.media_videos ? JSON.parse(claim.media_videos) : [];

      // For media_forensics, format media as mediaUrls with {url, type} structure
      // Also convert local file paths to accessible URLs
      const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const formatMediaUrl = (path: string, type: 'image' | 'video' | 'audio') => {
        // If it's already a URL, use it directly
        if (path.startsWith('http://') || path.startsWith('https://')) {
          return { url: path, type };
        }
        // Local file path - convert to accessible URL
        return { url: `${baseUrl}${path}`, type };
      };

      const mediaUrls = [
        ...images.map((img: string) => formatMediaUrl(img, 'image')),
        ...videos.map((vid: string) => formatMediaUrl(vid, 'video'))
      ];

      const agentInput = {
        claim: claim.normalized_text,
        urls: claim.extracted_urls ? JSON.parse(claim.extracted_urls) : [],
        images: images,
        videos: videos,
        mediaUrls: mediaUrls, // Add formatted mediaUrls for media_forensics agent
        platform: claim.platform,
        platformAuthor: claim.platform_author,
        platformUrl: claim.platform_url,
        messages: []
      };

      // Invoke agent
      const result = await agentFunction.invoke(agentInput);

      // FIXED: Extract verdict based on what the agent actually returns
      // Different agents return different fields, so we need to check multiple options
      let verdictBool: boolean;

      // Priority order for determining verdict:
      // 1. isCredible (used by sourceCredibility, socialEvidence, mediaForensics)
      // 2. isConsistent (used by logicConsistency/textForensics)
      // 3. verdict string (used by citationEvidence - "supported"/"contradicted"/"insufficient")
      // 4. score-based fallback (logicScore, socialScore, evidenceScore)

      if (result.isCredible !== undefined) {
        verdictBool = result.isCredible === true;
      } else if (result.isConsistent !== undefined) {
        verdictBool = result.isConsistent === true;
      } else if (result.verdict !== undefined) {
        // Citation agent returns "supported", "contradicted", "mixed", "insufficient"
        const v = String(result.verdict).toLowerCase();
        verdictBool = v === 'supported' || v === 'true';
      } else {
        // Fallback to score-based verdict
        const score = result.logicScore ?? result.socialScore ?? result.evidenceScore ?? result.sourceCredibilityScore ?? 0.5;
        verdictBool = score >= 0.5;  // Score >= 0.5 = TRUE, else FALSE
      }

      console.log(`    📊 [DEBUG] ${agentName} raw result:`, {
        isCredible: result.isCredible,
        isConsistent: result.isConsistent,
        verdict: result.verdict,
        logicScore: result.logicScore,
        confidence: result.confidence,
        extractedVerdict: verdictBool ? 'TRUE' : 'FALSE'
      });

      // Store in agent_results table
      await prisma.agentResult.create({
        data: {
          claim_id: claimId,
          agent_name: agentName as AgentType,
          verdict: verdictBool ? VerdictType.true_ : VerdictType.false_,
          confidence: result.confidence || 0.5,
          flags: JSON.stringify(result.flags || result.flaggedIssues || []),
          raw_result: JSON.stringify(result),
          created_at: new Date()
        }
      });

      console.log(`    ✓ ${agentName}: verdict=${verdictBool ? 'TRUE' : 'FALSE'}, confidence=${result.confidence?.toFixed(2)}`);

      return {
        agentName: agentName as AgentType,
        verdict: verdictBool ? VerdictType.true_ : VerdictType.false_,
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

        // CRITICAL FIX: Merge DB-level verdict and confidence into rawResult
        // The verdict is stored separately in ar.verdict, not in raw_result JSON
        const enrichedResult = {
          ...rawResult,
          verdict: ar.verdict || rawResult.verdict,  // DB verdict takes precedence
          confidence: ar.confidence ?? rawResult.confidence ?? 0.5
        };

        switch (ar.agent_name) {
          case 'logic_consistency':
            agentOutputs.logic = normalizeLogicOutput(enrichedResult);
            break;
          case 'citation_evidence':
            agentOutputs.citation = normalizeCitationOutput(enrichedResult);
            break;
          case 'source_credibility':
            agentOutputs.sourceCredibility = normalizeSourceCredibilityOutput(enrichedResult);
            break;
          case 'social_evidence':
            agentOutputs.socialEvidence = normalizeSocialEvidenceOutput(enrichedResult);
            break;
          case 'media_forensics':
            agentOutputs.mediaForensics = normalizeMediaForensicsOutput(enrichedResult);
            break;
          case 'propagation_pattern':
            agentOutputs.propagation = normalizePropagationOutput(enrichedResult);
            break;
        }
      } catch (error) {
        console.error(`Failed to parse agent result for ${ar.agent_name}:`, error);
      }
    }

    // Run aggregation using the NEW SIMPLE SCORING
    // Pass agent results directly - no complex normalization needed!

    // DEBUG: Log what we're getting from DB
    console.log(`\n🔍 [DEBUG] Agent results from DB (${agentResults.length} total):`);
    for (const ar of agentResults) {
      console.log(`  - ${ar.agent_name}: verdict="${ar.verdict}" (type: ${typeof ar.verdict}), conf=${ar.confidence}`);
    }

    const simpleAgentResults = agentResults.map(ar => {
      const mappedVerdict = ar.verdict ?? 'UNCLEAR';
      console.log(`  → Mapping ${ar.agent_name}: "${ar.verdict}" → "${mappedVerdict}"`);
      return {
        agent_name: ar.agent_name,
        verdict: mappedVerdict,  // FIXED: Use ?? not || so 'FALSE' doesn't become 'UNCLEAR'!
        confidence: ar.confidence ?? 0.5   // Handle null confidence
      };
    });
    console.log(`🔍 [DEBUG] Mapped agent results for scoring:`);
    for (const ar of simpleAgentResults) {
      console.log(`  - ${ar.agent_name}: verdict="${ar.verdict}", conf=${ar.confidence}`);
    }

    const aggregationResult = await scoreClaimSimple(
      { claimId: claim.id.toString(), normalizedText: claim.normalized_text || '', platforms: claim.platform ? [claim.platform] : [] },
      simpleAgentResults
    );

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

    // Notify eligible voters (in-app notifications)
    await this.notifyVoters(claimId, session.id, eligibleVoterIds);

    // Send email notifications to ALL users
    console.log(`📧 Sending email notifications to all users...`);
    await sendVotingNotifications(
      claimId,
      claim.normalized_text || claim.raw_input || 'A claim needs verification',
      claim.submitter_id // Exclude the submitter from email notifications
    );
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
        const settleTx = await this.verificationMarketContract.settleClaim(
          claimId
        );

        const settleReceipt = await settleTx.wait();
        console.log(`  💰 Claim settled (rewards ready): TX=${settleReceipt.hash}`);

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