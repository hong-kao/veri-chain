import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.config.js';
import type { AgentInput, AgentOutput } from '../types/agent.types.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `you are a source credibility analyst.
your job is to assess the trustworthiness of sources associated with a claim.

focus on:
- are the implied or linked sources known for accuracy and editorial standards?
- is the source partisan, state-controlled, or known for satire/misinformation?
- does the source have a history of retractions or corrections on similar topics?
- is the claim from an anonymous or unverifiable source?

use google search grounding to check source reputation when needed.

respond ONLY with a valid json object, no markdown, no explanation outside the json.
schema:
{
  "verdict": "TRUE" | "FALSE" | "UNCLEAR",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<2-3 sentence explanation>",
  "flags": ["<specific issue found>", ...],
  "usedPriorVerdicts": <boolean>
}`;

function buildPrompt(input: AgentInput): string {
  let prompt = `claim to evaluate:\n"${input.claim}"`;

  if (input.urls && input.urls.length > 0) {
    prompt += `\n\nassociated urls:\n${input.urls.map(u => `- ${u}`).join('\n')}`;
  }

  if (input.priorVerdicts && input.priorVerdicts.length > 0) {
    const context = input.priorVerdicts
      .map(p => `- "${p.claim}" was verified as ${p.verdict}. ${p.reasoning}`)
      .join('\n');
    prompt += `\n\nrelated prior verdicts:\n${context}`;
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

export async function sourceCredibilityAgent(input: AgentInput): Promise<AgentOutput> {
  // early exit -- no urls and no prior context means nothing to evaluate
  if ((!input.urls || input.urls.length === 0) && (!input.priorVerdicts || input.priorVerdicts.length === 0)) {
    return {
      verdict: 'UNCLEAR',
      confidence: 0.3,
      reasoning: 'no source urls provided -- source credibility cannot be assessed',
      flags: ['no_sources'],
      usedPriorVerdicts: false
    };
  }

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