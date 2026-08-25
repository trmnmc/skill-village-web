import { describe, it, expect } from 'vitest';
import { CROWN_IDS } from '../types.js';
import { HUES } from '../appearance/palette.js';
import { emptyGallery, type DreamSketch, type GalleryState } from './types.js';
import {
  EXEMPLAR_SAMPLE, GUIDE_MAX_WORDS, REJECT_SAMPLE, VERDICTS_PER_GUIDE,
  guideIsDue, repairPrompt, sketchPrompt, styleGuidePrompt,
} from './prompt.js';

function sketch(id: string): DreamSketch {
  return {
    id, rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'],
    crown: 'none', hue: '#e58c68', title: `title-${id}`, createdDay: '2026-08-22', survivals: 0,
  };
}

/**
 * Ids are zero-padded so no title is a substring of another — without that,
 * counting with `includes` silently overcounts (`title-k2` matches inside
 * `title-k24`) and the sampling tests pass for the wrong reason.
 */
const many = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => sketch(`${prefix}${String(i).padStart(3, '0')}`));

describe('sketchPrompt', () => {
  it('teaches the legend and the drawing rules', () => {
    const prompt = sketchPrompt(emptyGallery());
    for (const role of ['X', 'D', 'W', 'K', 'A']) expect(prompt).toContain(role);
    expect(prompt).toContain('two 2x2');
    expect(prompt).toContain('bottom row');
  });

  it('offers a style primer even with no verdicts, so the first case looks like the village', () => {
    const prompt = sketchPrompt(emptyGallery());
    expect(prompt).toContain('XWWXWWX');
  });

  it('names the exact JSON contract and the closed lists', () => {
    const prompt = sketchPrompt(emptyGallery());
    for (const field of ['"rows"', '"crown"', '"hue"', '"title"']) expect(prompt).toContain(field);
    for (const crown of CROWN_IDS) expect(prompt).toContain(crown);
    expect(prompt).toContain(HUES[0]);
  });

  it(`samples at most ${EXEMPLAR_SAMPLE} exemplars and ${REJECT_SAMPLE} rejects`, () => {
    const gallery: GalleryState = {
      ...emptyGallery(), stock: many('k', 30), rejects: many('c', 30),
    };
    const prompt = sketchPrompt(gallery);
    const kept = many('k', 30).filter((s) => prompt.includes(s.title)).length;
    const culled = many('c', 30).filter((s) => prompt.includes(s.title)).length;
    expect(kept).toBe(EXEMPLAR_SAMPLE);
    expect(culled).toBe(REJECT_SAMPLE);
  });

  it('takes the most recent exemplars, because taste moves', () => {
    const gallery: GalleryState = { ...emptyGallery(), stock: many('k', 30) };
    const prompt = sketchPrompt(gallery);
    expect(prompt).toContain('title-k029');
    expect(prompt).not.toContain('title-k000');
  });

  it('folds in the style guide once it exists, and says nothing about it before', () => {
    expect(sketchPrompt(emptyGallery())).not.toContain('Art direction');
    const guided: GalleryState = { ...emptyGallery(), styleGuide: 'Wide low bodies keep losing.' };
    expect(sketchPrompt(guided)).toContain('Wide low bodies keep losing.');
  });
});

describe('guideIsDue', () => {
  it(`is due every ${VERDICTS_PER_GUIDE} verdicts and not between them`, () => {
    const at = (verdicts: number, last: number): GalleryState => ({
      ...emptyGallery(),
      verdicts: Array.from({ length: verdicts }, () => ({ day: 'd', culledId: 'x', survivorIds: [] })),
      verdictsAtLastGuide: last,
    });
    expect(guideIsDue(at(VERDICTS_PER_GUIDE - 1, 0))).toBe(false);
    expect(guideIsDue(at(VERDICTS_PER_GUIDE, 0))).toBe(true);
    expect(guideIsDue(at(VERDICTS_PER_GUIDE, VERDICTS_PER_GUIDE))).toBe(false);
    expect(guideIsDue(at(VERDICTS_PER_GUIDE * 2, VERDICTS_PER_GUIDE))).toBe(true);
  });
});

describe('styleGuidePrompt', () => {
  it('samples kept and culled evenly, so the guide does not learn that all is beautiful', () => {
    const gallery: GalleryState = { ...emptyGallery(), stock: many('k', 60), rejects: many('c', 20) };
    const prompt = styleGuidePrompt(gallery);
    const kept = many('k', 60).filter((s) => prompt.includes(s.title)).length;
    const culled = many('c', 20).filter((s) => prompt.includes(s.title)).length;
    expect(kept).toBe(20);
    expect(culled).toBe(20);
  });

  it('labels each sample with its fate', () => {
    const gallery: GalleryState = { ...emptyGallery(), stock: [sketch('k')], rejects: [sketch('c')] };
    const prompt = styleGuidePrompt(gallery);
    expect(prompt).toContain('kept');
    expect(prompt).toContain('thrown out');
  });

  it(`caps the guide at ${GUIDE_MAX_WORDS} words and asks for prose, not JSON`, () => {
    const prompt = styleGuidePrompt({ ...emptyGallery(), stock: [sketch('k')] });
    expect(prompt).toContain(String(GUIDE_MAX_WORDS));
    expect(prompt).not.toContain('"rows"');
  });
});

describe('repairPrompt', () => {
  it('quotes the reply back with the specific complaints', () => {
    const prompt = repairPrompt('{"rows":[]}', ['eyes: expected exactly two 2x2 blocks']);
    expect(prompt).toContain('{"rows":[]}');
    expect(prompt).toContain('eyes: expected exactly two 2x2 blocks');
  });
});
