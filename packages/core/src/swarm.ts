import { generateAppearance } from './appearance/generate.js';
import type { CreatureAppearance } from './types.js';

/**
 * Stable identity for a swarm-built resident: `swarm:<slug>`. This string is
 * both the showroom resident's id and its DNA name — S4's delivery reproduces
 * the creature in a buyer's village from the slug alone, so NEVER change it.
 */
export function swarmResidentId(slug: string): string {
  return `swarm:${slug}`;
}

/**
 * A swarm resident's look. Kind is 'skill' (grounded, never winged); the DNA
 * seed is therefore sha256 of `skill:swarm:<slug>` — the namespace keeps swarm
 * residents from colliding with a player's real skill of the same name.
 */
export function swarmAppearance(slug: string): CreatureAppearance {
  return generateAppearance({ kind: 'skill', name: swarmResidentId(slug) });
}
