import { describe, it, expect } from 'vitest';
import { BODIES } from '../appearance/grids.js';
import { HUES } from '../appearance/palette.js';
import { toCaseView } from './types.js';
import {
  deriveSketchEyes, validateSketchDraft, validateSketchGrid,
} from './validate.js';

/** A minimal legal sketch, used as the base every evil grid deviates from. */
const GOOD = ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'];

describe('the six hand-authored bodies are the validator’s golden set', () => {
  it('accepts every one of them', () => {
    for (const [id, body] of Object.entries(BODIES)) {
      const result = validateSketchGrid(body.rows);
      expect(result.ok ? '' : `${id}: ${result.complaints.join('; ')}`).toBe('');
    }
  });

  it('derives exactly the eye anchors they declare by hand', () => {
    for (const [id, body] of Object.entries(BODIES)) {
      expect(deriveSketchEyes(body.rows), id).toEqual(body.eyes);
    }
  });
});

describe('validateSketchGrid — the bestiary', () => {
  const complaintsFor = (rows: string[]): string => {
    const result = validateSketchGrid(rows);
    expect(result.ok).toBe(false);
    return result.ok ? '' : result.complaints.join(' | ');
  };

  it('accepts the baseline, so every rejection below is about the mutation', () => {
    expect(validateSketchGrid(GOOD).ok).toBe(true);
  });

  it('rejects an unknown role character', () => {
    expect(complaintsFor([...GOOD.slice(0, 5), 'XXXQXXX', GOOD[6]!])).toContain('Q');
  });

  it('rejects ragged rows', () => {
    expect(complaintsFor([GOOD[0]!, 'XXXXXX', ...GOOD.slice(2)])).toContain('same length');
  });

  it('rejects a grid below the size floor', () => {
    expect(complaintsFor(['XWWX', 'XWWX', 'XKXX', 'XXXX'])).toContain('height');
  });

  it('rejects a grid above the size ceiling', () => {
    const tall = [GOOD[0]!, ...Array.from({ length: 14 }, () => 'XXXXXXX'), GOOD[6]!];
    expect(complaintsFor(tall)).toContain('height');
  });

  it('rejects one eye', () => {
    expect(complaintsFor([
      '.XXXXX.', 'XXXXXXX', 'XWWXXXX', 'XWWXXXX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.',
    ])).toContain('eyes');
  });

  it('rejects three eyes', () => {
    expect(complaintsFor([
      '.XXXXXXXX.', 'XXXXXXXXXX', 'XWWXWWXWWX', 'XWWXWWXWWX',
      'XXXXKXXXXX', 'XXXXXXXXXX', '.DD....DD.',
    ])).toContain('eyes');
  });

  it('rejects a merged eye strip — eight W in one 2x4 block is not two eyes', () => {
    expect(complaintsFor([
      '.XXXXX.', 'XXXXXXX', 'XWWWWXX', 'XWWWWXX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.',
    ])).toContain('eyes');
  });

  it('rejects eyes split across non-adjacent rows', () => {
    expect(complaintsFor([
      '.XXXXX.', 'XWWXWWX', 'XXXXXXX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.',
    ])).toContain('eyes');
  });

  it('rejects a mouthless face', () => {
    expect(complaintsFor([
      '.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXXXXX', 'XXXXXXX', '.DD.DD.',
    ])).toContain('mouth');
  });

  it('rejects a mouth above the eyes', () => {
    expect(complaintsFor([
      '.XXKXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXXXXX', 'XXXXXXX', '.DD.DD.',
    ])).toContain('mouth');
  });

  it('rejects feet in mid-air', () => {
    expect(complaintsFor([...GOOD.slice(0, 5), 'XXDXXXX', GOOD[6]!])).toContain('feet');
  });

  it('rejects body pixels in the foot row', () => {
    expect(complaintsFor([...GOOD.slice(0, 6), '.DDXDD.'])).toContain('feet');
  });

  it('rejects a one-legged landing', () => {
    expect(complaintsFor([...GOOD.slice(0, 6), '...D...'])).toContain('feet');
  });

  it('rejects a floating island', () => {
    expect(complaintsFor([
      '.XXXXX..A', 'XXXXXXX..', 'XWWXWWX..', 'XWWXWWX..',
      'XXXKXXX..', 'XXXXXXX..', '.DD.DD...',
    ])).toContain('floating');
  });
});

describe('toCaseView — what the browser is allowed to know', () => {
  it('keeps only what the overlay draws, and withholds the ladder', () => {
    const open = {
      day: '2026-08-22',
      judged: false,
      sketches: [{
        id: 'sketch-000001', rows: GOOD, crown: 'none' as const, hue: HUES[0]!,
        title: 'Small Hope', createdDay: '2026-08-22', survivals: 2,
      }],
    };
    const payload = JSON.stringify(toCaseView(open));

    expect(payload).toContain('Small Hope');
    expect(payload).not.toContain('survivals');
    expect(payload).not.toContain('createdDay');
    expect(payload).not.toContain('judged');
  });
});

describe('validateSketchDraft — the model-reply gate', () => {
  const draft = (over: Record<string, unknown> = {}) =>
    validateSketchDraft({ rows: GOOD, crown: 'tuft', hue: HUES[0], title: 'Small Hope', ...over });

  it('accepts a well-formed draft and hands back the eyes', () => {
    const result = draft();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.title).toBe('Small Hope');
      expect(result.eyes).toEqual([{ c: 1, r: 2 }, { c: 4, r: 2 }]);
    }
  });

  it('refuses anything that is not an object', () => {
    const result = validateSketchDraft('sorry, here is a poem');
    expect(result.ok).toBe(false);
  });

  it('refuses a crown outside the curated five', () => {
    const result = draft({ crown: 'antlers' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.complaints.join(' ')).toContain('crown');
  });

  it('refuses arbitrary hex — the palette rule is load-bearing', () => {
    const result = draft({ hue: '#ff00ff' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.complaints.join(' ')).toContain('hue');
  });

  it('refuses an empty or overlong title', () => {
    expect(draft({ title: '   ' }).ok).toBe(false);
    expect(draft({ title: 'x'.repeat(41) }).ok).toBe(false);
  });

  it('reports grid complaints alongside field complaints, so one repair can fix both', () => {
    const result = validateSketchDraft({ rows: ['XX', 'XX'], crown: 'nope', hue: HUES[0], title: 'T' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.complaints.join(' ')).toContain('crown');
      expect(result.complaints.length).toBeGreaterThan(1);
    }
  });
});
