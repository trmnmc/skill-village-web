import {
  BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, deriveSketchEyes, validateSketchGrid,
  type CreatureAppearance, type CrownId, type EyeAnchor, type PostureId,
} from '@village/core/visual';

export type { EyeAnchor };

export interface ComposedGrid {
  /** One string per row, one role character per pixel. All rows are `w` long. */
  rows: string[];
  w: number;
  h: number;
  /** Eye anchors, already shifted for the crown. */
  eyes: [EyeAnchor, EyeAnchor];
  /** How many rows the crown added above the body. */
  crownRows: number;
}

function pad(row: string, w: number): string {
  return row.length >= w ? row.slice(0, w) : row + '.'.repeat(w - row.length);
}

/**
 * Stack a crown above a body and pad the result square. Crowns are parametric
 * in width, which is the whole reason one definition sits correctly on a
 * 7-wide villager and a 12-wide dream-sketch alike.
 */
function stackCrown(bodyRows: string[], w: number, crownId: CrownId): { rows: string[]; crownRows: number } {
  const crown = CROWNS[crownId];
  const crownRows: string[] = [];

  if (crown.h > 0) {
    const cells = crown.cells(w);
    for (let r = -crown.h; r < 0; r++) {
      const chars = Array.from({ length: w }, () => '.');
      for (const [col, row] of cells) {
        if (row === r && col >= 0 && col < w) chars[col] = 'X';
      }
      crownRows.push(chars.join(''));
    }
  }

  return {
    rows: [...crownRows, ...bodyRows].map((row) => pad(row, w)),
    crownRows: crown.h,
  };
}

/**
 * Where the body's own base begins — the first row containing a foot pixel, or
 * for `lanky`, the first row of its legs. Everything from here down is replaced
 * when the creature flies.
 */
function baseIndex(rows: string[]): number {
  const footRow = rows.findIndex((row) => row.includes('D'));
  return footRow === -1 ? rows.length : footRow;
}

/**
 * Resolve a creature's appearance into one rectangular character grid.
 *
 * `posture` overrides a dangling creature's legs for the duration of a motion
 * state; omit it and the creature hangs in its own resting posture.
 */
export function composeGrid(
  appearance: CreatureAppearance,
  posture?: PostureId,
): ComposedGrid {
  const body = BODIES[appearance.body];
  const w = body.w;

  let bodyRows = [...body.rows];

  if (appearance.winged) {
    if (appearance.body === 'lanky') {
      // Lanky has real legs, so it dangles rather than tapering. Everything from
      // the first leg row down is replaced: find the foot row, then walk back
      // over every row identical to the one just above the feet — those are the
      // legs. Any future legged body inherits this rule unchanged.
      const feet = bodyRows.findIndex((row) => row.includes('D'));
      let start = feet === -1 ? bodyRows.length : feet;
      const legRow = start > 0 ? bodyRows[start - 1] : null;
      while (legRow !== null && start > 0 && bodyRows[start - 1] === legRow) start--;

      const chosen: PostureId = posture ?? appearance.restPosture ?? 'stubs';
      bodyRows = [...bodyRows.slice(0, start), ...POSTURES[chosen].rows];
    } else {
      bodyRows = [...bodyRows.slice(0, baseIndex(bodyRows)), ...FLIGHT_UNDERSIDE[appearance.body]];
    }
  }

  const stacked = stackCrown(bodyRows, w, appearance.crown);

  return {
    rows: stacked.rows,
    w,
    h: stacked.rows.length,
    eyes: [
      { c: body.eyes[0].c, r: body.eyes[0].r + stacked.crownRows },
      { c: body.eyes[1].c, r: body.eyes[1].r + stacked.crownRows },
    ],
    crownRows: stacked.crownRows,
  };
}

/**
 * Compose a dream-sketch, which brings its own rows instead of a body id.
 * Returns null for anything the validator refuses: a sketch the server somehow
 * let through must vanish quietly rather than draw as a broken smear.
 */
export function composeSketchGrid(sketch: { rows: string[]; crown: CrownId }): ComposedGrid | null {
  const validation = validateSketchGrid(sketch.rows);
  if (!validation.ok) return null;

  const w = sketch.rows[0]!.length;
  const stacked = stackCrown([...sketch.rows], w, sketch.crown);
  const eyes = deriveSketchEyes(sketch.rows)!;

  return {
    rows: stacked.rows,
    w,
    h: stacked.rows.length,
    eyes: [
      { c: eyes[0].c, r: eyes[0].r + stacked.crownRows },
      { c: eyes[1].c, r: eyes[1].r + stacked.crownRows },
    ],
    crownRows: stacked.crownRows,
  };
}
