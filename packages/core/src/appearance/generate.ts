import {
  BODY_IDS, CROWN_IDS, REST_POSTURE_IDS,
  type CreatureAppearance, type CreatureKind, type CrownId,
} from '../types.js';
import { INCOMPATIBLE } from './grids.js';
import { HUES, derivePalette, hueForAgentColor } from './palette.js';
import { DNA_OFFSET, dnaSeed, pickFrom, pickIndex } from './dna.js';

export interface AppearanceInput {
  kind: CreatureKind;
  /** The on-disk name: a skill's directory or an agent's filename stem. */
  name: string;
  /** An agent's `color` frontmatter, if it has one. Ignored for skills. */
  agentColor?: string;
}

function isDenied(body: string, crown: CrownId): boolean {
  return INCOMPATIBLE.some(([b, c]) => b === body && c === crown);
}

/**
 * Deterministically derive a creature's whole appearance from its identity.
 * Pure: same input, same output, on any machine and at any time.
 */
export function generateAppearance(input: AppearanceInput): CreatureAppearance {
  const seed = dnaSeed(input.kind, input.name);
  const body = pickFrom(seed, DNA_OFFSET.body, BODY_IDS);

  // Pick a crown, then step forward through the list until the pair is allowed.
  // `none` is never deniable (enforced by the grids test), so this always halts.
  let crownIndex = pickIndex(seed, DNA_OFFSET.crown, CROWN_IDS.length);
  for (let step = 0; step < CROWN_IDS.length; step++) {
    const candidate = CROWN_IDS[(crownIndex + step) % CROWN_IDS.length]!;
    if (!isDenied(body, candidate)) {
      crownIndex = (crownIndex + step) % CROWN_IDS.length;
      break;
    }
  }
  const crown = CROWN_IDS[crownIndex]!;

  const hue = (input.kind === 'agent' ? hueForAgentColor(input.agentColor) : null)
    ?? pickFrom(seed, DNA_OFFSET.hue, HUES);

  const winged = input.kind === 'agent';
  const restPosture = winged && body === 'lanky'
    ? pickFrom(seed, DNA_OFFSET.posture, REST_POSTURE_IDS)
    : null;

  return { body, crown, palette: derivePalette(hue), winged, restPosture };
}
