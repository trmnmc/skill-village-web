import type { BodyId, CrownId, PostureId } from '../types.js';

/**
 * Colour roles, one character per pixel:
 *   X body (hue)   D feet   W eye white   K mouth   A light accent   . transparent
 *
 * `D` is a semantic role, not a colour. It marks which pixels are feet so a walk
 * cycle can find them; it renders in the body hue for skills, and is replaced
 * entirely by the flight underside for agents.
 */
export const LEGAL_ROLES = ['X', 'D', 'W', 'K', 'A', '.'] as const;

export interface EyeAnchor {
  /** Column of the top-left cell of a 2x2 block of `W`. */
  c: number;
  /** Row of that cell. */
  r: number;
}

export interface Body {
  note: string;
  rows: string[];
  eyes: [EyeAnchor, EyeAnchor];
  w: number;
  h: number;
}

export const BODIES: Record<BodyId, Body> = {
  pip: {
    note: 'tiny and round',
    rows: ['..XXX..', '.XXXXX.', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', '.XXXXX.', '..DDD..'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 7,
  },
  round: {
    note: 'the classic',
    rows: ['.XXXXXXX.', 'XXXXXXXXX', 'XXWWXWWXX', 'XXWWXWWXX', 'XXXXKXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..DD.DD..'],
    eyes: [{ c: 2, r: 2 }, { c: 5, r: 2 }], w: 9, h: 8,
  },
  lanky: {
    note: 'stilt legs — the only body with real legs, so the only one that can dangle',
    rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '..X.X..', '..X.X..', '..X.X..', '.DD.DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 12,
  },
  bean: {
    note: 'upright oval',
    rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.DD.DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 9,
  },
  mound: {
    note: 'wide and low',
    rows: ['...XXXXXX...', '.XXXXXXXXXX.', 'XXWWXXXXWWXX', 'XXWWXXXXWWXX', 'XXXXXKKXXXXX', 'XXXXXXXXXXXX', '.DD......DD.'],
    eyes: [{ c: 2, r: 2 }, { c: 8, r: 2 }], w: 12, h: 7,
  },
  boxy: {
    note: 'angular',
    rows: ['.XXXXXX.', 'XXXXXXXX', 'XWWXXWWX', 'XWWXXWWX', 'XXXKKXXX', 'XXXXXXXX', '.DD..DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 5, r: 2 }], w: 8, h: 7,
  },
};

/**
 * For an agent, the foot row and everything after it is replaced by these, so the
 * body ends on a deliberate curve rather than a flat cut. `lanky` uses POSTURES.
 */
export const FLIGHT_UNDERSIDE: Record<BodyId, string[]> = {
  pip: ['..XXX..'],
  round: ['..XXXXX..'],
  lanky: ['..X.X..'],
  bean: ['..XXX..'],
  mound: ['..XXXXXXXX..'],
  boxy: ['.XXXXXX.'],
};

export interface Posture {
  kind: 'rest' | 'motion';
  rows: string[];
}

/**
 * `lanky` flight legs — everything below the hips. The three resting postures are
 * assigned per creature by DNA, so two lanky agents hang differently and each
 * always hangs the same way. `trailing` is a motion state: a lanky agent sweeps
 * into it while roaming and settles back into its own resting posture on stopping.
 */
export const POSTURES: Record<PostureId, Posture> = {
  stubs: { kind: 'rest', rows: ['..X.X..'] },
  splayed: { kind: 'rest', rows: ['..X.X..', '.X...X.'] },
  floating: { kind: 'rest', rows: ['..X.X..', '.......', '.X...X.'] },
  trailing: { kind: 'motion', rows: ['..X.X..', '.......', '...X.X.', '....X.X'] },
};

export interface Crown {
  /** How many rows above the body this crown occupies. */
  h: number;
  /** Returns [column, row] pairs; rows are negative, measured up from the body. */
  cells: (bodyWidth: number) => Array<[number, number]>;
}

/**
 * Crowns are parametric in the body's width rather than fixed columns, which is
 * why one definition sits correctly on a 7-wide `pip` and a 12-wide `mound`.
 */
export const CROWNS: Record<CrownId, Crown> = {
  none: { h: 0, cells: () => [] },
  ears: {
    h: 3,
    cells: (w) => {
      const L = 1, R = w - 2;
      return [[L, -3], [R, -3], [L, -2], [R, -2], [L, -1], [L + 1, -1], [R - 1, -1], [R, -1]];
    },
  },
  crest: {
    h: 3,
    cells: (w) => {
      const c = Math.floor((w - 1) / 2);
      return [[c, -3], [c - 1, -2], [c, -2], [c + 1, -2],
              [c - 2, -1], [c - 1, -1], [c, -1], [c + 1, -1], [c + 2, -1]];
    },
  },
  tuft: {
    h: 1,
    cells: (w) => {
      const c = Math.floor((w - 1) / 2);
      return [[c - 1, -1], [c + 1, -1]];
    },
  },
  horns: {
    h: 2,
    cells: (w) => {
      const L = 1, R = w - 2;
      return [[L, -2], [R, -2], [L, -1], [L + 1, -1], [R - 1, -1], [R, -1]];
    },
  },
};

/** Agents only: mounted at both sides in `lite`, mirrored, flapping. */
export const WING = ['XXX.', 'XXXX', '.XX.'];

/**
 * Body+crown pairs the generator must never emit — individually fine, ugly
 * together. Populated by the golden-set review (Task 14). `none` must never
 * appear here, so every body always keeps a legal fallback.
 */
export const INCOMPATIBLE: ReadonlyArray<[BodyId, CrownId]> = [];

/** Shared by every creature, never varied. */
export const INK = { eyeWhite: '#FFF9EE', pupil: '#33241C', mouth: '#33241C' } as const;
