import { describe, it, expect } from 'vitest';
import { BODY_IDS, CROWN_IDS } from '../types.js';
import {
  BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, WING, INCOMPATIBLE, LEGAL_ROLES,
} from './grids.js';

describe('body grids', () => {
  it.each(BODY_IDS)('%s is rectangular and matches its declared size', (id) => {
    const body = BODIES[id];
    expect(body.rows).toHaveLength(body.h);
    for (const row of body.rows) {
      expect(row).toHaveLength(body.w);
    }
  });

  it.each(BODY_IDS)('%s uses only legal colour roles', (id) => {
    for (const row of BODIES[id].rows) {
      for (const ch of row) {
        expect(LEGAL_ROLES).toContain(ch);
      }
    }
  });

  it.each(BODY_IDS)('%s has eye anchors on 2x2 blocks of eye white', (id) => {
    const body = BODIES[id];
    expect(body.eyes).toHaveLength(2);
    for (const eye of body.eyes) {
      for (const dr of [0, 1]) {
        for (const dc of [0, 1]) {
          expect(body.rows[eye.r + dr]?.[eye.c + dc]).toBe('W');
        }
      }
    }
  });

  it.each(BODY_IDS)('%s has exactly one mouth row and at least one foot row', (id) => {
    const rows = BODIES[id].rows;
    expect(rows.filter((r) => r.includes('K'))).toHaveLength(1);
    expect(rows.some((r) => r.includes('D'))).toBe(true);
  });
});

describe('crowns', () => {
  it.each(CROWN_IDS)('%s stays in bounds and above row 0 on every body', (crownId) => {
    const crown = CROWNS[crownId];
    for (const bodyId of BODY_IDS) {
      const w = BODIES[bodyId].w;
      for (const [c, r] of crown.cells(w)) {
        expect(c, `${crownId} on ${bodyId}: column ${c}`).toBeGreaterThanOrEqual(0);
        expect(c, `${crownId} on ${bodyId}: column ${c}`).toBeLessThan(w);
        expect(r, `${crownId} on ${bodyId}: row ${r}`).toBeLessThan(0);
        expect(r, `${crownId} on ${bodyId}: row ${r}`).toBeGreaterThanOrEqual(-crown.h);
      }
    }
  });

  it('reports a height that matches the rows it actually draws', () => {
    for (const crownId of CROWN_IDS) {
      const crown = CROWNS[crownId];
      const cells = crown.cells(9);
      const highest = cells.length === 0 ? 0 : Math.min(...cells.map(([, r]) => r));
      expect(crown.h).toBe(cells.length === 0 ? 0 : -highest);
    }
  });
});

describe('flight undersides', () => {
  it.each(BODY_IDS)('%s has an underside matching its width', (id) => {
    const underside = FLIGHT_UNDERSIDE[id];
    expect(underside.length).toBeGreaterThan(0);
    for (const row of underside) {
      expect(row).toHaveLength(BODIES[id].w);
    }
  });

  it.each(BODY_IDS)('%s has a foot row for the underside to replace', (id) => {
    expect(BODIES[id].rows.findIndex((r) => r.includes('D'))).toBeGreaterThan(-1);
  });
});

describe('lanky postures', () => {
  it('are all as wide as lanky', () => {
    for (const posture of Object.values(POSTURES)) {
      for (const row of posture.rows) {
        expect(row).toHaveLength(BODIES.lanky.w);
      }
    }
  });

  it('marks exactly one posture as the motion state', () => {
    const motion = Object.entries(POSTURES).filter(([, p]) => p.kind === 'motion');
    expect(motion.map(([id]) => id)).toEqual(['trailing']);
  });
});

describe('wings', () => {
  it('is a rectangular grid', () => {
    const width = WING[0]!.length;
    for (const row of WING) expect(row).toHaveLength(width);
  });
});

describe('incompatible pairs', () => {
  it('never denies the `none` crown, so every body keeps a fallback', () => {
    expect(INCOMPATIBLE.some(([, crown]) => crown === 'none')).toBe(false);
  });

  it('leaves at least one legal crown for every body', () => {
    for (const bodyId of BODY_IDS) {
      const denied = INCOMPATIBLE.filter(([b]) => b === bodyId).length;
      expect(denied).toBeLessThan(CROWN_IDS.length);
    }
  });
});
