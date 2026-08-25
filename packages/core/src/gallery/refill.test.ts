import { describe, it, expect } from 'vitest';
import { emptyGallery, type DreamSketch, type GalleryState } from './types.js';
import { CASE_SIZE, MIN_JUDGEABLE_CASE, openCase, peddlerIsVisiting, planRefill } from './refill.js';

const TODAY = '2026-08-22';
const YESTERDAY = '2026-08-21';

function sketch(id: string): DreamSketch {
  return {
    id, rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'],
    crown: 'none', hue: '#e58c68', title: id, createdDay: YESTERDAY, survivals: 0,
  };
}

const withCase = (over: Partial<GalleryState>): GalleryState => ({ ...emptyGallery(), ...over });

describe('planRefill', () => {
  it('asks for a full case on the very first day', () => {
    expect(planRefill(emptyGallery(), TODAY)).toEqual({
      carried: [], freshNeeded: CASE_SIZE, ready: false,
    });
  });

  it('is already ready when today’s case exists, so a restart spends nothing', () => {
    const gallery = withCase({ case: { day: TODAY, sketches: [sketch('a')], judged: false } });
    const plan = planRefill(gallery, TODAY);
    expect(plan.ready).toBe(true);
    expect(plan.freshNeeded).toBe(0);
  });

  it('is still ready when today’s case has already been judged', () => {
    const gallery = withCase({ case: { day: TODAY, sketches: [sketch('a')], judged: true } });
    expect(planRefill(gallery, TODAY).ready).toBe(true);
  });

  it('carries an unjudged case forward whole, asking for nothing', () => {
    const sketches = [sketch('a'), sketch('b'), sketch('c'), sketch('d'), sketch('e')];
    const gallery = withCase({ case: { day: YESTERDAY, sketches, judged: false } });
    const plan = planRefill(gallery, TODAY);
    expect(plan.freshNeeded).toBe(0);
    expect(plan.carried.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('refills the gaps a judged case left behind', () => {
    const gallery = withCase({
      case: { day: YESTERDAY, sketches: [sketch('a'), sketch('b')], judged: true },
    });
    const plan = planRefill(gallery, TODAY);
    expect(plan.carried.map((s) => s.id)).toEqual(['a', 'b']);
    expect(plan.freshNeeded).toBe(CASE_SIZE - 2);
  });
});

describe('openCase', () => {
  it('fills the case with the veterans first, then the fresh sketches', () => {
    const built = openCase([sketch('old')], [sketch('new')], TODAY)!;
    expect(built.sketches.map((s) => s.id)).toEqual(['old', 'new']);
    expect(built.day).toBe(TODAY);
    expect(built.judged).toBe(false);
  });

  it('never overfills, however much the artist produced', () => {
    const fresh = Array.from({ length: 9 }, (_, i) => sketch(`f${i}`));
    expect(openCase([sketch('old')], fresh, TODAY)!.sketches).toHaveLength(CASE_SIZE);
  });

  it('opens a short case when the artist only managed some of them', () => {
    expect(openCase([], [sketch('a'), sketch('b')], TODAY)!.sketches).toHaveLength(2);
  });

  it(`refuses a case of fewer than ${MIN_JUDGEABLE_CASE} — you cannot pick the ugliest of one`, () => {
    expect(openCase([], [sketch('lonely')], TODAY)).toBeNull();
    expect(openCase([], [], TODAY)).toBeNull();
  });
});

describe('peddlerIsVisiting', () => {
  it('is true only for an unjudged case dated today', () => {
    const sketches = [sketch('a'), sketch('b')];
    expect(peddlerIsVisiting(withCase({ case: { day: TODAY, sketches, judged: false } }), TODAY)).toBe(true);
    expect(peddlerIsVisiting(withCase({ case: { day: TODAY, sketches, judged: true } }), TODAY)).toBe(false);
    expect(peddlerIsVisiting(withCase({ case: { day: YESTERDAY, sketches, judged: false } }), TODAY)).toBe(false);
    expect(peddlerIsVisiting(emptyGallery(), TODAY)).toBe(false);
  });
});
