import type { Creature } from '@village/core/visual';

export interface Behaviour {
  /** Skills only: bounces on a 2.6s cycle. */
  hopper: boolean;
  /** Dozing: eyes lidded, z glyphs, no other motion. */
  asleep: boolean;
  /** Agents only: crossing the village, or holding station. */
  fly: 'roam' | 'hover' | null;
  /** Visibly unkempt. Cosmetic only — nothing is ever lost to neglect. */
  scruffy: boolean;
}

const SLEEP_BELOW = 25;
const HAPPY_ABOVE = 75;
const RESTED_ABOVE = 70;
const SCRUFFY_BELOW = 35;
const ROAM_ENERGY = 60;

/**
 * Turn a creature's stats into the flags the renderer reads. Spec §4.2:
 * behaviours are data, not code paths — the renderer never sees a stat.
 */
export function behaviourFor(creature: Creature): Behaviour {
  const { mood, energy } = creature.stats;
  const flyer = creature.appearance.winged;
  const asleep = energy < SLEEP_BELOW;
  const scruffy = mood < SCRUFFY_BELOW;

  if (asleep) {
    return { hopper: false, asleep: true, fly: null, scruffy };
  }

  return {
    hopper: !flyer && mood > HAPPY_ABOVE && energy > RESTED_ABOVE,
    asleep: false,
    fly: flyer ? (energy >= ROAM_ENERGY ? 'roam' : 'hover') : null,
    scruffy,
  };
}
