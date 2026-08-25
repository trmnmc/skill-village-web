import { describe, it, expect } from 'vitest';
import {
  CASE_SIZE, SURVIVALS_TO_KEEP, VERDICTS_PER_GUIDE, emptyGallery,
  type DreamSketch, type GalleryState,
} from '@village/core';
import type { DrawRequest, DrawResult, SketchArtist } from './artist.js';
import { createGalleryRuntime } from './runtime.js';

const TODAY = '2026-08-22';
const YESTERDAY = '2026-08-21';
const ROWS = ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'];

function sketch(id: string, survivals = 0): DreamSketch {
  return { id, rows: ROWS, crown: 'none', hue: '#e58c68', title: id, createdDay: YESTERDAY, survivals };
}

/** Draws exactly what it is told to, and counts what it was asked for. */
function fakeArtist(over: Partial<SketchArtist> = {}) {
  const asked: DrawRequest[] = [];
  const artist: SketchArtist & { asked: DrawRequest[] } = {
    asked,
    async draw(request): Promise<DrawResult> {
      asked.push(request);
      const sketches = Array.from({ length: request.count }, (_, i) =>
        ({ ...sketch(`new-${i}`), createdDay: request.day }));
      return { sketches, nextNumber: request.gallery.nextSketchNumber + sketches.length };
    },
    async distil() { return 'the distilled guide'; },
    ...over,
  };
  return artist;
}

describe('refillIfDue', () => {
  it('opens a full case on the first day', async () => {
    const artist = fakeArtist();
    const next = await createGalleryRuntime({ artist }).refillIfDue(emptyGallery(), TODAY);

    expect(next!.case!.day).toBe(TODAY);
    expect(next!.case!.sketches).toHaveLength(CASE_SIZE);
    expect(next!.case!.judged).toBe(false);
    expect(next!.nextSketchNumber).toBe(1 + CASE_SIZE);
  });

  it('does nothing at all when today’s case already exists', async () => {
    const artist = fakeArtist();
    const gallery: GalleryState = {
      ...emptyGallery(), case: { day: TODAY, sketches: [sketch('a'), sketch('b')], judged: false },
    };
    expect(await createGalleryRuntime({ artist }).refillIfDue(gallery, TODAY)).toBeNull();
    expect(artist.asked).toHaveLength(0);
  });

  it('tops up only the slots a judged case emptied', async () => {
    const artist = fakeArtist();
    const gallery: GalleryState = {
      ...emptyGallery(), case: { day: YESTERDAY, sketches: [sketch('a'), sketch('b')], judged: true },
    };
    const next = await createGalleryRuntime({ artist }).refillIfDue(gallery, TODAY);

    expect(artist.asked[0]!.count).toBe(CASE_SIZE - 2);
    expect(next!.case!.sketches.map((s) => s.id).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('carries an unjudged case forward without asking the artist for anything', async () => {
    const artist = fakeArtist();
    const sketches = Array.from({ length: CASE_SIZE }, (_, i) => sketch(`s${i}`));
    const gallery: GalleryState = { ...emptyGallery(), case: { day: YESTERDAY, sketches, judged: false } };
    const next = await createGalleryRuntime({ artist }).refillIfDue(gallery, TODAY);

    expect(artist.asked).toHaveLength(0);
    expect(next!.case!.day).toBe(TODAY);
    expect(next!.case!.sketches).toHaveLength(CASE_SIZE);
  });

  it('leaves no case at all when the artist drew nothing — no peddler today', async () => {
    const artist = fakeArtist({ async draw(request) { return { sketches: [], nextNumber: request.gallery.nextSketchNumber }; } });
    expect(await createGalleryRuntime({ artist }).refillIfDue(emptyGallery(), TODAY)).toBeNull();
  });

  it('leaves no case when only one sketch survived — you cannot judge a case of one', async () => {
    const artist = fakeArtist({
      async draw(request) {
        return { sketches: [{ ...sketch('only'), createdDay: request.day }], nextNumber: request.gallery.nextSketchNumber + 1 };
      },
    });
    expect(await createGalleryRuntime({ artist }).refillIfDue(emptyGallery(), TODAY)).toBeNull();
  });
});

describe('cull', () => {
  const caseOf = (sketches: DreamSketch[]): GalleryState => ({
    ...emptyGallery(), case: { day: TODAY, sketches, judged: false },
  });

  it('applies the verdict and marks the case judged', async () => {
    const next = await createGalleryRuntime({ artist: fakeArtist() })
      .cull(caseOf([sketch('a'), sketch('b')]), 'a', TODAY);

    expect(next!.rejects.map((s) => s.id)).toEqual(['a']);
    expect(next!.case!.judged).toBe(true);
  });

  it('refuses a cull the ladder will not accept', async () => {
    const runtime = createGalleryRuntime({ artist: fakeArtist() });
    expect(await runtime.cull(emptyGallery(), 'ghost', TODAY)).toBeNull();
    expect(await runtime.cull(caseOf([sketch('a'), sketch('b')]), 'a', YESTERDAY)).toBeNull();
  });

  it('writes a fresh style guide when enough verdicts have piled up', async () => {
    const verdicts = Array.from({ length: VERDICTS_PER_GUIDE - 1 }, () =>
      ({ day: YESTERDAY, culledId: 'x', survivorIds: [] }));
    const gallery: GalleryState = { ...caseOf([sketch('a'), sketch('b')]), verdicts };
    const next = await createGalleryRuntime({ artist: fakeArtist() }).cull(gallery, 'a', TODAY);

    expect(next!.styleGuide).toBe('the distilled guide');
    expect(next!.verdictsAtLastGuide).toBe(VERDICTS_PER_GUIDE);
  });

  it('does not distil before the cadence is up', async () => {
    const next = await createGalleryRuntime({ artist: fakeArtist() })
      .cull(caseOf([sketch('a'), sketch('b')]), 'a', TODAY);
    expect(next!.styleGuide).toBeNull();
  });

  it('keeps the old guide when distillation fails, rather than blanking it', async () => {
    const verdicts = Array.from({ length: VERDICTS_PER_GUIDE - 1 }, () =>
      ({ day: YESTERDAY, culledId: 'x', survivorIds: [] }));
    const gallery: GalleryState = {
      ...caseOf([sketch('a'), sketch('b')]), verdicts, styleGuide: 'the old guide',
    };
    const artist = fakeArtist({ async distil() { return null; } });
    const next = await createGalleryRuntime({ artist }).cull(gallery, 'a', TODAY);

    expect(next!.styleGuide).toBe('the old guide');
    expect(next!.verdictsAtLastGuide).toBe(0);
  });

  it('promotes a veteran into the stock at the threshold', async () => {
    const gallery = caseOf([sketch('veteran', SURVIVALS_TO_KEEP - 1), sketch('fresh')]);
    const next = await createGalleryRuntime({ artist: fakeArtist() }).cull(gallery, 'fresh', TODAY);

    expect(next!.stock.map((s) => s.id)).toEqual(['veteran']);
  });
});
