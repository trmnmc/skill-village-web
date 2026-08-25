import { describe, it, expect } from 'vitest';
import { emptyGallery, type DreamSketch, type GalleryState } from './types.js';
import { applyVerdict, MAX_REJECTS, SURVIVALS_TO_KEEP } from './ladder.js';

const DAY = '2026-08-22';

function sketch(id: string, survivals = 0): DreamSketch {
  return {
    id, rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'],
    crown: 'none', hue: '#e58c68', title: id, createdDay: DAY, survivals,
  };
}

function galleryWithCase(sketches: DreamSketch[], over: Partial<GalleryState> = {}): GalleryState {
  return { ...emptyGallery(), case: { day: DAY, sketches, judged: false }, ...over };
}

describe('applyVerdict', () => {
  it('sends the culled sketch to the rejects and credits every survivor', () => {
    const before = galleryWithCase([sketch('a'), sketch('b'), sketch('c')]);
    const result = applyVerdict(before, 'b', DAY)!;

    expect(result.culled.id).toBe('b');
    expect(result.gallery.rejects.map((s) => s.id)).toEqual(['b']);
    expect(result.gallery.case!.sketches.map((s) => [s.id, s.survivals])).toEqual([
      ['a', 1], ['c', 1],
    ]);
    expect(result.gallery.case!.judged).toBe(true);
  });

  it('records the verdict as evidence against one sketch, naming the survivors', () => {
    const result = applyVerdict(galleryWithCase([sketch('a'), sketch('b')]), 'a', DAY)!;
    expect(result.gallery.verdicts).toEqual([{ day: DAY, culledId: 'a', survivorIds: ['b'] }]);
  });

  it(`moves a sketch into the stock at ${SURVIVALS_TO_KEEP} survivals and out of the case`, () => {
    const nearly = sketch('veteran', SURVIVALS_TO_KEEP - 1);
    const result = applyVerdict(galleryWithCase([nearly, sketch('fresh')]), 'fresh', DAY)!;

    expect(result.kept.map((s) => s.id)).toEqual(['veteran']);
    expect(result.gallery.stock.map((s) => s.id)).toEqual(['veteran']);
    expect(result.gallery.case!.sketches.map((s) => s.id)).toEqual([]);
  });

  it('can keep more than one sketch with a single verdict', () => {
    const before = galleryWithCase([
      sketch('x', SURVIVALS_TO_KEEP - 1), sketch('y', SURVIVALS_TO_KEEP - 1), sketch('z'),
    ]);
    const result = applyVerdict(before, 'z', DAY)!;
    expect(result.kept.map((s) => s.id)).toEqual(['x', 'y']);
  });

  it('keeps the rejects newest-first and capped, so old taste ages out', () => {
    let gallery = emptyGallery();
    for (let i = 0; i < MAX_REJECTS + 5; i++) {
      gallery = { ...gallery, case: { day: DAY, sketches: [sketch(`c${i}`), sketch('keep')], judged: false } };
      gallery = applyVerdict(gallery, `c${i}`, DAY)!.gallery;
    }
    expect(gallery.rejects).toHaveLength(MAX_REJECTS);
    expect(gallery.rejects[0]!.id).toBe(`c${MAX_REJECTS + 4}`);
  });

  it('never mutates the gallery it was given', () => {
    const before = galleryWithCase([sketch('a'), sketch('b')]);
    const snapshot = JSON.stringify(before);
    applyVerdict(before, 'a', DAY);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('refuses rather than throwing when there is nothing to judge', () => {
    expect(applyVerdict(emptyGallery(), 'a', DAY)).toBeNull();
  });

  it('refuses a verdict for another day — the midnight race is a no-op', () => {
    expect(applyVerdict(galleryWithCase([sketch('a'), sketch('b')]), 'a', '2026-08-23')).toBeNull();
  });

  it('refuses a second verdict on an already-judged case', () => {
    const judged = galleryWithCase([sketch('a'), sketch('b')], {
      case: { day: DAY, sketches: [sketch('a'), sketch('b')], judged: true },
    });
    expect(applyVerdict(judged, 'a', DAY)).toBeNull();
  });

  it('refuses an id that is not in the case', () => {
    expect(applyVerdict(galleryWithCase([sketch('a')]), 'ghost', DAY)).toBeNull();
  });
});
