import { decayStats, levelForXp, nextStage, role, workStats, type Creature } from '@village/core';
import type { VillageEvent } from '../state/events.js';
import type { VillageState } from '../state/schema.js';

export const MS_PER_HOUR = 3_600_000;

export interface TickResult {
  state: VillageState;
  events: VillageEvent[];
}

/**
 * Advance the whole village to `now`.
 *
 * Each creature decays by the time since it was last touched, which means a
 * server that was switched off for three days produces exactly the same result
 * as one that ticked steadily throughout — core's decay is exponential, and
 * exponential decay composes. The server being off *is* the player being away.
 */
export function applyTick(state: VillageState, now: number): TickResult {
  const events: VillageEvent[] = [];
  const creatures: Record<string, Creature> = {};

  for (const [id, creature] of Object.entries(state.creatures)) {
    const elapsedMs = now - creature.lastSeenAt;
    // A clock that jumped backwards (NTP correction, timezone change) must never
    // hand a creature free mood, so treat it as no time passing at all.
    const hoursAway = elapsedMs > 0 ? elapsedMs / MS_PER_HOUR : 0;

    // Projects: only real work heals (remap spec §5). Mood and energy are a
    // pure function of the work signal, recomputed every tick — the stored
    // values are a cache of the curve, so retuning it needs no migration.
    // Bond and xp still only ever rise, same as everyone else's.
    const stats =
      role(creature.kind) === 'project' && creature.lastWorkedAt !== undefined
        ? { ...creature.stats, ...workStats(now - creature.lastWorkedAt) }
        : hoursAway > 0
          ? decayStats(creature.stats, hoursAway)
          : creature.stats;
    const stage = nextStage(creature.stage, levelForXp(stats.xp), true);

    if (stage !== creature.stage) {
      events.push({
        at: now,
        type: 'stage-changed',
        creatureId: id,
        detail: `${creature.stage} → ${stage}`,
      });
    }

    creatures[id] = { ...creature, stats, stage, lastSeenAt: Math.max(creature.lastSeenAt, now) };
  }

  return { state: { ...state, creatures, updatedAt: now }, events };
}
