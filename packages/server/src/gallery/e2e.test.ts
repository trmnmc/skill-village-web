import { describe, it, expect, afterEach } from 'vitest';
import { CASE_SIZE, SURVIVALS_TO_KEEP } from '@village/core';
import { createApp } from '../api/app.js';
import { createVillage, type Village } from '../village.js';
import { makeSandbox, type Sandbox } from '../testing/sandbox.js';
import type { SketchArtist } from './artist.js';

const ROWS = ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'];
const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 7, 22, 12, 0, 0);

/** Draws on demand, so the loop is deterministic and spends nothing. */
const artist: SketchArtist = {
  async draw({ count, gallery, day }) {
    return {
      sketches: Array.from({ length: count }, (_, i) => ({
        id: `sketch-${String(gallery.nextSketchNumber + i).padStart(6, '0')}`,
        rows: ROWS, crown: 'none' as const, hue: '#e58c68',
        title: `Study ${gallery.nextSketchNumber + i}`, createdDay: day, survivals: 0,
      })),
      nextNumber: gallery.nextSketchNumber + count,
    };
  },
  async distil() { return 'a distilled note'; },
};

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

describe('the peddler, end to end', () => {
  it('visits, is judged, and quietly builds a design stock', async () => {
    sandbox = await makeSandbox();
    let clock = START;
    village = await createVillage({ paths: sandbox.paths, now: () => clock, artist });
    const app = await createApp(village);

    // Day one: the visitor arrives with a full case.
    await village.tick();
    await village.settleGallery();

    const first = await app.inject({ method: 'GET', url: '/api/state' });
    expect(first.json().peddler).toBe(true);
    expect(first.json().peddlerCase.sketches).toHaveLength(CASE_SIZE);

    // The secret never crosses the wire.
    for (const secret of [
      'styleGuide', 'stock', 'rejects', 'verdicts', 'nextSketchNumber',
      'survivals', 'createdDay',
    ]) {
      expect(first.body).not.toContain(secret);
    }

    // Throw out the ugliest.
    const doomed = first.json().peddlerCase.sketches[0].id;
    const culled = await app.inject({
      method: 'POST', url: '/api/gallery/cull', payload: { sketchId: doomed },
    });
    expect(culled.statusCode).toBe(200);
    expect(culled.json().peddler).toBe(false);
    expect(village.getState().gallery.rejects.map((s) => s.id)).toEqual([doomed]);

    // A second cull the same day is refused, and says so without drama.
    const again = await app.inject({
      method: 'POST', url: '/api/gallery/cull',
      payload: { sketchId: first.json().peddlerCase.sketches[1].id },
    });
    expect(again.statusCode).toBe(409);

    // Survive three judgings and a sketch is spoken for.
    for (let day = 1; day <= SURVIVALS_TO_KEEP - 1; day++) {
      clock = START + day * DAY_MS;
      await village.tick();
      await village.settleGallery();
      const today = await app.inject({ method: 'GET', url: '/api/state' });
      await app.inject({
        method: 'POST', url: '/api/gallery/cull',
        payload: { sketchId: today.json().peddlerCase.sketches.at(-1).id },
      });
    }

    const stock = village.getState().gallery.stock;
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.every((s) => s.survivals >= SURVIVALS_TO_KEEP)).toBe(true);

    // The case is always refilled to full for the next visit.
    clock = START + SURVIVALS_TO_KEEP * DAY_MS;
    await village.tick();
    await village.settleGallery();
    expect(village.getState().gallery.case!.sketches).toHaveLength(CASE_SIZE);

    await app.close();
  });

  it('sends no peddler at all when there is no artist', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: () => START });
    const app = await createApp(village);

    await village.tick();
    await village.settleGallery();

    const state = await app.inject({ method: 'GET', url: '/api/state' });
    expect(state.json().peddler).toBe(false);
    expect(state.json().peddlerCase).toBeNull();

    await app.close();
  });
});
