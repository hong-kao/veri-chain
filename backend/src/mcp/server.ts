// verichain mcp server
// exposes 3 tools for external agents/llms to interact with verichain:
//   - check_prior_verdicts  : look up previously verified claims from the db
//   - submit_to_verichain   : submit a new claim for ai verification pipeline
//   - get_claim_status      : poll the status of an in-progress or completed claim

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import prisma from '../config/db.config.js';

const server = new McpServer({
  name: 'verichain-mcp',
  version: '1.0.0',
});

// tool 1: check_prior_verdicts
// returns previously verified claims similar to the query (ilike on raw_input / normalized_text).
server.tool(
  'check_prior_verdicts',
  'search verichain db for previously verified claims similar to a given text. returns verdict, confidence, and on-chain proof link if available.',
  {
    query: z.string().min(3).describe('the claim text or keywords to search for'),
    limit: z.number().int().min(1).max(10).default(5).describe('max number of results to return'),
  },
  async ({ query, limit }) => {
    try {
      const claims = await prisma.claim.findMany({
        where: {
          AND: [
            { status: { not: 'pending_ai' } },
            {
              OR: [
                { raw_input: { contains: query, mode: 'insensitive' } },
                { normalized_text: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          raw_input: true,
          status: true,
          ai_verdict: true,
          ai_confidence: true,
          ai_explanation: true,
          onchain_events: {
            select: { tx_hash: true },
            take: 1,
            orderBy: { created_at: 'desc' },
          },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
      });

      if (claims.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ found: false, results: [] }) }],
        };
      }

      const results = claims.map(c => ({
        claimId: c.id,
        claimText: c.raw_input,
        verdict: c.ai_verdict,
        confidence: c.ai_confidence,
        explanation: c.ai_explanation,
        onchainProof: c.onchain_events[0]?.tx_hash
          ? `https://sepolia.basescan.org/tx/${c.onchain_events[0].tx_hash}`
          : null,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ found: true, count: results.length, results }) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'db query failed', message: err.message }) }],
        isError: true,
      };
    }
  }
);

// tool 2: submit_to_verichain
// creates a new claim and triggers the agent pipeline async.
// submitter_id is required in the schema -- use wallet-based upsert if wallet provided,
// else fall back to a default anonymous system user (id=0 would fail FK, so we require wallet).
server.tool(
  'submit_to_verichain',
  'submit a new claim to verichain for ai fact-checking. requires a submitter wallet address. returns a claimId to track progress with get_claim_status.',
  {
    claim: z.string().min(10).describe('the claim text to verify (min 10 chars)'),
    submitterWallet: z.string().describe('wallet address of the submitter (required for db relation)'),
    sourceUrls: z.array(z.string().url()).optional().describe('source urls related to the claim (stored as json)'),
    mediaImageUrls: z.array(z.string().url()).optional().describe('image urls to check for manipulation (stored as json)'),
  },
  async ({ claim, submitterWallet, sourceUrls, mediaImageUrls }) => {
    try {
      // upsert user by wallet
      const user = await prisma.user.upsert({
        where: { wallet_address: submitterWallet.toLowerCase() },
        update: {},
        create: { wallet_address: submitterWallet.toLowerCase(), reputation_score: 0 },
      });

      // create claim
      const newClaim = await prisma.claim.create({
        data: {
          raw_input: claim,
          normalized_text: claim.toLowerCase().trim(),
          status: 'pending_ai',
          submitter_id: user.id,
          extracted_urls: sourceUrls ? JSON.stringify(sourceUrls) : null,
          media_images: mediaImageUrls ? JSON.stringify(mediaImageUrls) : null,
        },
      });

      // fire-and-forget: trigger the pipeline via the backend api
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      fetch(`${backendUrl}/api/claims/${newClaim.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => console.error('pipeline trigger failed:', err.message));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            claimId: newClaim.id,
            status: 'pending_ai',
            message: 'claim submitted. use get_claim_status to poll for results.',
          }),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'submission failed', message: err.message }) }],
        isError: true,
      };
    }
  }
);

// tool 3: get_claim_status
// returns full status + agent breakdown for a given claim id.
server.tool(
  'get_claim_status',
  'get the current status and ai verdict for a verichain claim by its numeric id.',
  {
    claimId: z.number().int().positive().describe('the numeric claim id returned by submit_to_verichain'),
  },
  async ({ claimId }) => {
    try {
      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        select: {
          id: true,
          raw_input: true,
          status: true,
          ai_verdict: true,
          ai_confidence: true,
          ai_explanation: true,
          created_at: true,
          updated_at: true,
          agent_results: {
            select: {
              agent_name: true,
              verdict: true,
              confidence: true,
              reasoning: true,
              flags: true,
            },
          },
          onchain_events: {
            select: { tx_hash: true, event_type: true },
            take: 1,
            orderBy: { created_at: 'desc' },
          },
        },
      });

      if (!claim) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ found: false, message: `claim ${claimId} not found` }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            found: true,
            claimId: claim.id,
            claimText: claim.raw_input,
            status: claim.status,
            verdict: claim.ai_verdict,
            confidence: claim.ai_confidence,
            explanation: claim.ai_explanation,
            agentBreakdown: claim.agent_results.map(ar => ({
              agent: ar.agent_name,
              verdict: ar.verdict,
              confidence: ar.confidence,
              reasoning: ar.reasoning,
              flags: ar.flags ? JSON.parse(ar.flags) : [],
            })),
            onchainProof: claim.onchain_events[0]?.tx_hash
              ? `https://sepolia.basescan.org/tx/${claim.onchain_events[0].tx_hash}`
              : null,
            submittedAt: claim.created_at,
            updatedAt: claim.updated_at,
          }),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'status lookup failed', message: err.message }) }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('verichain mcp server running on stdio');
}

main().catch(err => {
  console.error('mcp server failed to start:', err);
  process.exit(1);
});
