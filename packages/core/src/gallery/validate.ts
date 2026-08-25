import { CROWN_IDS, type CrownId } from '../types.js';
import { HUES } from '../appearance/palette.js';
import { LEGAL_ROLES, type EyeAnchor } from '../appearance/grids.js';

/**
 * Grid bounds, inclusive. The hand-authored bodies span 7x7 to 12x12, so this
 * gives the model real room without letting it draw a mural the village would
 * have to scroll past.
 */
export const SKETCH_MIN = 5;
export const SKETCH_MAX = 14;
export const MAX_TITLE_CHARS = 40;

const ROLE_SET: ReadonlySet<string> = new Set(LEGAL_ROLES);
const CROWN_SET: ReadonlySet<string> = new Set(CROWN_IDS);
const HUE_SET: ReadonlySet<string> = new Set(HUES);

export type SketchValidation =
  | { ok: true; eyes: [EyeAnchor, EyeAnchor] }
  | { ok: false; complaints: string[] };

export interface SketchDraft {
  rows: string[];
  crown: CrownId;
  hue: string;
  title: string;
}

export type DraftValidation =
  | { ok: true; draft: SketchDraft; eyes: [EyeAnchor, EyeAnchor] }
  | { ok: false; complaints: string[] };

/**
 * Eye anchors are always *derived*, never taken from the model. Two 2x2 blocks
 * of `W` on the same adjacent rows, separated by at least one column, and no
 * `W` anywhere else — that is what makes blinking and gaze work mechanically if
 * a sketch is ever canonized into a villager.
 */
export function deriveSketchEyes(rows: string[]): [EyeAnchor, EyeAnchor] | null {
  const cells: Array<[number, number]> = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === 'W') cells.push([r, c]);
  });
  if (cells.length !== 8) return null;

  const used = [...new Set(cells.map(([r]) => r))].sort((a, b) => a - b);
  if (used.length !== 2 || used[1]! !== used[0]! + 1) return null;

  const top = used[0]!;
  const colsOn = (row: number) =>
    cells.filter(([r]) => r === row).map(([, c]) => c).sort((a, b) => a - b);
  const upper = colsOn(top);
  if (upper.join() !== colsOn(top + 1).join()) return null;

  const [a1, a2, b1, b2] = upper as [number, number, number, number];
  if (a2 !== a1 + 1 || b2 !== b1 + 1 || b1 < a2 + 2) return null;
  return [{ c: a1, r: top }, { c: b1, r: top }];
}

/** Every drawn pixel must touch the rest edge-on. 4-connectivity, one component. */
function isConnected(rows: string[]): boolean {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const solid = (r: number, c: number) =>
    r >= 0 && r < h && c >= 0 && c < w && (rows[r]![c] ?? '.') !== '.';

  let start: [number, number] | null = null;
  let total = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!solid(r, c)) continue;
      total++;
      start ??= [r, c];
    }
  }
  if (!start) return false;

  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  const stack: Array<[number, number]> = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (solid(nr, nc) && !seen.has(key)) {
        seen.add(key);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === total;
}

/**
 * Structural problems make every later check meaningless — you cannot look for
 * eyes in a ragged grid — so these return alone rather than joining a pile.
 */
function structuralComplaints(rows: string[]): string[] {
  const complaints: string[] = [];
  if (rows.length < SKETCH_MIN || rows.length > SKETCH_MAX) {
    complaints.push(`height: expected ${SKETCH_MIN}-${SKETCH_MAX} rows, got ${rows.length}`);
  }
  if (rows.length === 0) return complaints;

  const w = rows[0]!.length;
  if (!rows.every((row) => row.length === w)) {
    complaints.push('shape: every row must be the same length, so the grid is a rectangle');
  }
  if (w < SKETCH_MIN || w > SKETCH_MAX) {
    complaints.push(`width: expected ${SKETCH_MIN}-${SKETCH_MAX} columns, got ${w}`);
  }
  const strays = [...new Set([...rows.join('')].filter((ch) => !ROLE_SET.has(ch)))];
  if (strays.length) {
    complaints.push(`roles: only ${LEGAL_ROLES.join(' ')} are legal; found ${strays.join(' ')}`);
  }
  return complaints;
}

export function validateSketchGrid(rows: string[]): SketchValidation {
  const structural = structuralComplaints(rows);
  if (structural.length) return { ok: false, complaints: structural };

  const complaints: string[] = [];
  const eyes = deriveSketchEyes(rows);
  if (!eyes) {
    complaints.push(
      "eyes: expected exactly two 2x2 blocks of 'W', on the same two adjacent rows, " +
        'with at least one column between them and no other W anywhere',
    );
  }

  const bottom = rows[rows.length - 1]!;
  if ([...bottom].some((ch) => ch !== 'D' && ch !== '.')) {
    complaints.push("feet: the bottom row may hold only 'D' and '.'");
  }
  const feet = [...bottom].filter((ch) => ch === 'D').length;
  if (feet < 2) {
    complaints.push(`feet: the bottom row needs at least two 'D' pixels, found ${feet}`);
  }
  if (rows.slice(0, -1).some((row) => row.includes('D'))) {
    complaints.push("feet: 'D' belongs only in the bottom row — nothing stands on air");
  }

  if (eyes) {
    // Eye blocks occupy rows `top` and `top + 1`, so a mouth must be below both.
    if (!rows.some((row, r) => r > eyes[0].r + 1 && row.includes('K'))) {
      complaints.push("mouth: expected at least one 'K' pixel below the eyes");
    }
  } else if (!rows.some((row) => row.includes('K'))) {
    complaints.push("mouth: expected at least one 'K' pixel");
  }

  if (!isConnected(rows)) {
    complaints.push('shape: every drawn pixel must touch the body edge-on — no floating islands');
  }

  return complaints.length ? { ok: false, complaints } : { ok: true, eyes: eyes! };
}

/**
 * The single gate a model reply passes through. Field problems and grid
 * problems are reported together so one repair attempt can fix everything.
 */
export function validateSketchDraft(value: unknown): DraftValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, complaints: ['reply: expected a JSON object'] };
  }
  const v = value as Record<string, unknown>;
  const complaints: string[] = [];

  const rows =
    Array.isArray(v.rows) && v.rows.every((row) => typeof row === 'string')
      ? (v.rows as string[])
      : null;
  if (!rows) complaints.push('rows: expected an array of strings');

  const crown =
    typeof v.crown === 'string' && CROWN_SET.has(v.crown) ? (v.crown as CrownId) : null;
  if (!crown) complaints.push(`crown: expected one of ${CROWN_IDS.join(', ')}`);

  const hue = typeof v.hue === 'string' && HUE_SET.has(v.hue) ? v.hue : null;
  if (!hue) complaints.push(`hue: expected one of ${HUES.join(', ')}`);

  const title = typeof v.title === 'string' ? v.title.trim() : '';
  if (!title) complaints.push('title: expected a non-empty string');
  else if (title.length > MAX_TITLE_CHARS) {
    complaints.push(`title: at most ${MAX_TITLE_CHARS} characters, got ${title.length}`);
  }

  const grid = rows ? validateSketchGrid(rows) : null;
  if (grid && !grid.ok) complaints.push(...grid.complaints);

  if (!rows || !crown || !hue || !grid?.ok || complaints.length) {
    return { ok: false, complaints };
  }
  return { ok: true, draft: { rows, crown, hue, title }, eyes: grid.eyes };
}
