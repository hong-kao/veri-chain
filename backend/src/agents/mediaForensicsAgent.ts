import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.config.js';
import type { AgentInput, AgentOutput } from '../types/agent.types.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `you are a media forensics analyst specializing in detecting manipulated or out-of-context media.
your job is to assess whether images or videos associated with a claim are authentic.

focus on:
- is the media likely to be AI-generated, deepfaked, or digitally altered?
- is the media being used out of its original context?
- do known reverse-image-search or metadata patterns suggest manipulation?
- does the media actually depict what the claim asserts?

use google search grounding to search for known instances of the media when needed.

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

  if (input.mediaUrls && input.mediaUrls.length > 0) {
    prompt += `\n\nassociated media urls:\n${input.mediaUrls.map(u => `- ${u}`).join('\n')}`;
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

export async function mediaForensicsAgent(input: AgentInput): Promise<AgentOutput> {
  // early exit -- no media means nothing for this agent to do
  if (!input.mediaUrls || input.mediaUrls.length === 0) {
    return {
      verdict: 'UNCLEAR',
      confidence: 0.3,
      reasoning: 'no media urls provided -- media forensics cannot be performed',
      flags: ['no_media'],
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