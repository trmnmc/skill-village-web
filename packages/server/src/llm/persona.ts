import { personalityCardPrompt, type CreatureKind, type PersonalityCard } from '@village/core';
import type { LlmService } from './service.js';

export interface Persona {
  nickname: string;
  card: PersonalityCard;
  cannedLines: string[];
}

const MAX_POOL = 24;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Parse the model's card reply. Models fence JSON in markdown even when told
 * not to, so the fence is stripped before parsing; everything else is strict —
 * a card with a missing field is a card the game refuses, because a half
 * personality would haunt a creature for the rest of its life.
 */
export function parsePersona(text: string): Persona | null {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p.nickname !== 'string' || p.nickname.trim() === '') return null;
  if (typeof p.temperament !== 'string' || typeof p.voice !== 'string') return null;
  if (!isStringArray(p.quirks) || !isStringArray(p.likes) || !isStringArray(p.dislikes)) return null;
  if (!isStringArray(p.lines) || p.lines.length === 0) return null;

  return {
    nickname: p.nickname.trim(),
    card: {
      temperament: p.temperament,
      voice: p.voice,
      quirks: p.quirks,
      likes: p.likes,
      dislikes: p.dislikes,
    },
    cannedLines: p.lines.slice(0, MAX_POOL),
  };
}

/**
 * One model call for card + nickname + canned pool, with one retry on a
 * malformed reply. Null on failure: the creature simply stays card-less until
 * the next interaction tries again. Cards are `chatter` work — spec routes
 * personality cards to haiku.
 */
export async function generatePersona(
  service: LlmService,
  input: { kind: CreatureKind; name: string; description: string; body: string },
): Promise<Persona | null> {
  const prompt = personalityCardPrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await service.request({ kind: 'chatter', budget: 'interactive', prompt });
    if (!reply.ok) return null;
    const persona = parsePersona(reply.text);
    if (persona) return persona;
  }
  return null;
}
