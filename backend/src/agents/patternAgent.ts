import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.config.js';
import type { AgentInput, AgentOutput } from '../types/agent.types.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `you are a misinformation pattern analyst.
your job is to identify whether a claim matches known patterns of misinformation or propaganda.

focus on:
- does this claim match known misinformation templates (e.g. "scientists say", "they don't want you to know")?
- does it use emotional manipulation, fear, outrage, or urgency as primary persuasion tools?
- is this a recurring false narrative that resurfaces periodically?
- does it exploit a real event to push a false conclusion?
- does it target a specific group or exploit existing social tensions?

use google search grounding to check if this exact or similar claim has appeared before.

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
  let prompt = `claim to analyze for misinformation patterns:\n"${input.claim}"`;

  if (input.priorVerdicts && input.priorVerdicts.length > 0) {
    const context = input.priorVerdicts
      .map(p => `- "${p.claim}" was verified as ${p.verdict}. ${p.reasoning}`)
      .join('\n');
    prompt += `\n\nrelated prior verdicts (check for recurring narrative patterns):\n${context}`;
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

export async function propagationPatternAgent(input: AgentInput): Promise<AgentOutput> {
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