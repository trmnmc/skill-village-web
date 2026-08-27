/**
 * A creature is a skill (grounded) or an agent (winged) — together the helper
 * role — or a project, the villager role. The role layer is derived, never
 * stored (remap spec §1).
 */
export type CreatureKind = 'skill' | 'agent' | 'project';

export type Role = 'project' | 'helper';

export function role(kind: CreatureKind): Role {
  return kind === 'project' ? 'project' : 'helper';
}

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
  /**
   * ~20 short things this creature might say, written by the model alongside
   * its personality card. These power procedural chatter and every fallback
   * mode: budget exhausted or CLI unavailable, the creature still talks.
   * Absent until the persona has been generated (M4).
   */
  cannedLines?: string[];
  /**
   * Absolute path to the SKILL.md or agent .md this creature represents; for
   * a project, its real folder (from transcript `cwd`), `''` if unknown. The
   * game never writes to a project's folder in M5/M6.
   */
  sourcePath: string;
  /** Other creature ids to affinity, 0-100. */
  friendships: Record<string, number>;
  /** Epoch millis, supplied by the caller. Core never reads the clock. */
  lastSeenAt: number;
  /**
   * Projects only: the newest transcript mtime across the project's sessions,
   * worktrees folded in. The raw work signal — health derives from it at tick
   * time and is never persisted as truth (remap spec §1).
   */
  lastWorkedAt?: number;
  /** Projects only: resolved helper creature ids. Sorted, deduped. */
  helperIds?: string[];
  /**
   * Projects only: helper mentions that matched no creature on disk —
   * plugin-prefixed skills, built-in agent types. The "powers beyond the
   * village" tally (remap spec §3). Sorted, deduped.
   */
  unresolvedMentions?: string[];
  /**
   * Projects only (M6): released by the player. Discovery must never
   * resurrect a retired project; re-adopt clears the flag (remap spec §2).
   */
  retired?: boolean;
}
