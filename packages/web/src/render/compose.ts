import {
  BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES,
  type CreatureAppearance, type EyeAnchor, type PostureId,
} from '@village/core';

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
  const crown = CROWNS[appearance.crown];
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

  // Crown rows sit above the body, drawn in the body role.
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

  const rows = [...crownRows, ...bodyRows].map((row) => pad(row, w));

  return {
    rows,
    w,
    h: rows.length,
    eyes: [
      { c: body.eyes[0].c, r: body.eyes[0].r + crown.h },
      { c: body.eyes[1].c, r: body.eyes[1].r + crown.h },
    ],
    crownRows: crown.h,
  };
}
