import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.config.js';
import type { AgentInput, AgentOutput } from '../types/agent.types.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `you are a citation and evidence analyst specializing in fact-checking.
your job is to assess whether a claim is supported or refuted by credible, verifiable sources.

focus on:
- does credible evidence exist that directly supports or contradicts this claim?
- are the implied or stated sources reputable (peer-reviewed, major news, official bodies)?
- are there contradicting authoritative sources?
- is the claim making verifiable assertions or unfalsifiable ones?

use google search grounding to find real evidence before responding.

respond ONLY with a valid json object, no markdown, no explanation outside the json.
schema:
{
  "verdict": "TRUE" | "FALSE" | "UNCLEAR",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<2-3 sentence explanation citing specific evidence found>",
  "flags": ["<specific issue found>", ...],
  "usedPriorVerdicts": <boolean>
}`;

function buildPrompt(input: AgentInput): string {
  let prompt = `claim to fact-check:\n"${input.claim}"`;

  if (input.priorVerdicts && input.priorVerdicts.length > 0) {
    const context = input.priorVerdicts
      .map(p => `- "${p.claim}" was previously verified as ${p.verdict} (confidence: ${p.confidence}). ${p.reasoning}`)
      .join('\n');
    prompt += `\n\nrelated claims already verified:\n${context}\n\nuse these as additional context when searching for evidence.`;
  }

  return prompt;
}

function parseResponse(raw: string): AgentOutput {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      verdict: parsed.verdict ?? 'UNCLEAR',
      confidence: parsed.confidence ?? 0.5,
      reasoning: parsed.reasoning ?? 'no reasoning provided',
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      usedPriorVerdicts: parsed.usedPriorVerdicts ?? false
    };
  } catch {
    return {
      verdict: 'UNCLEAR',
      confidence: 0.3,
      reasoning: 'failed to parse agent response',
      flags: ['parse_error'],
      usedPriorVerdicts: false
    };
  }
}

export async function citationEvidenceAgent(input: AgentInput): Promise<AgentOutput> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 0.2
    }
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseResponse(raw);
}