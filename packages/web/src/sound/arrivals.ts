import type { GameSoundEvent } from './types.js';
import type { VoiceParams } from './voice.js';

/**
 * What village.ts hands this on each view: just the fields the diff reads,
 * with x already resolved from the layout and the voice already derived.
 */
export interface CreatureSnapshot {
  id: string;
  stage: string;
  x: number;
  voice: VoiceParams;
}

/**
 * Diff two views into sound events. `prevStages` is null before any view has
 * been seen: the founding view — a page load — must be silent, or every
 * reload greets the player with seventy arrival chimes. An *empty* map is a
 * real (empty) village, so its first villager genuinely moves in.
 */
export function viewSoundEvents(
  prevStages: Map<string, string> | null,
  next: CreatureSnapshot[],
): GameSoundEvent[] {
  if (prevStages === null) return [];
  const out: GameSoundEvent[] = [];
  for (const c of next) {
    const before = prevStages.get(c.id);
    if (before === undefined) {
      out.push({ type: 'moved-in', x: c.x, voice: c.voice });
    } else if (before !== c.stage) {
      out.push({ type: 'stage-up', x: c.x });
    }
  }
  return out;
}
