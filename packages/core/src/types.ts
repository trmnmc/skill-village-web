/** A creature is either a skill (grounded) or an agent (winged). */
export type CreatureKind = 'skill' | 'agent';

export const BODY_IDS = ['pip', 'round', 'lanky', 'bean', 'mound', 'boxy'] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const CROWN_IDS = ['none', 'ears', 'crest', 'tuft', 'horns'] as const;
export type CrownId = (typeof CROWN_IDS)[number];

/** Resting postures are part of identity; `trailing` is a motion state, not an identity. */
export const REST_POSTURE_IDS = ['stubs', 'splayed', 'floating'] as const;
export type RestPostureId = (typeof REST_POSTURE_IDS)[number];
export type PostureId = RestPostureId | 'trailing';

export type Stage = 'egg' | 'hatchling' | 'adult' | 'elder';

export interface Palette {
  /** Body colour. Always one of the curated HUES. */
  hue: string;
  /** Wings and `A` accent pixels. */
  lite: string;
  /** Currently drawn nowhere; reserved for shading and night variants. */
  dark: string;
}

export interface CreatureAppearance {
  body: BodyId;
  crown: CrownId;
  palette: Palette;
  /** Agents only: wings, and a tapered underside in place of feet. */
  winged: boolean;
  /** Only set for winged `lanky` creatures; null for everything else. */
  restPosture: RestPostureId | null;
}

export interface Stats {
  /** 0-100. Drifts down toward STAT_FLOOR while the player is away. */
  mood: number;
  /** 0-100. Same drift. */
  energy: number;
  /** 0-100. Only ever rises. */
  bond: number;
  /** Only ever rises. */
  xp: number;
}

export interface PersonalityCard {
  temperament: string;
  voice: string;
  quirks: string[];
  likes: string[];
  dislikes: string[];
}

export interface Creature {
  /** Stable id: `${kind}:${name}`. */
  id: string;
  kind: CreatureKind;
  /** The on-disk name: a skill's directory or an agent's filename stem. */
  name: string;
  /** A given name, distinct from `name`. Empty until the LLM writes one. */
  nickname: string;
  appearance: CreatureAppearance;
  stats: Stats;
  stage: Stage;
  /** Null until the personality card has been generated. */
  personality: PersonalityCard | null;
  /** Absolute path to the SKILL.md or agent .md this creature represents. */
  sourcePath: string;
  /** Other creature ids to affinity, 0-100. */
  friendships: Record<string, number>;
  /** Epoch millis, supplied by the caller. Core never reads the clock. */
  lastSeenAt: number;
}
