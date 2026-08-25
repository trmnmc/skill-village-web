import { describe, it, expect } from 'vitest';
import { emptyGallery, type GalleryState } from '@village/core';
import type { LlmReply, LlmService } from '../llm/service.js';
import { createSketchArtist } from './artist.js';

const DAY = '2026-08-22';
const GOOD_ROWS = ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'];

const sketchJson = (title: string) =>
  JSON.stringify({ rows: GOOD_ROWS, crown: 'tuft', hue: '#e58c68', title });

/** Replays scripted replies and remembers every prompt it was asked. */
function stubLlm(replies: LlmReply[]): LlmService & { prompts: string[] } {
  const queue = [...replies];
  const prompts: string[] = [];
  return {
    prompts,
    probe: async () => 'full',
    mode: () => 'full',
    request: async (req) => {
      prompts.push(req.prompt);
      return queue.shift() ?? { ok: false, why: 'failed' };
    },
  };
}

const request = (count: number, gallery: GalleryState = emptyGallery()) => ({ count, gallery, day: DAY });

describe('draw', () => {
  it('turns replies into sketches with minted ids and today’s date', async () => {
    const llm = stubLlm([{ ok: true, text: sketchJson('First Light') }]);
    const result = await createSketchArtist({ llm }).draw(request(1));

    expect(result.sketches).toHaveLength(1);
    expect(result.sketches[0]).toMatchObject({
      id: 'sketch-000001', title: 'First Light', crown: 'tuft', createdDay: DAY, survivals: 0,
    });
    expect(result.nextNumber).toBe(2);
  });

  it('mints ids from the gallery counter, never from a clock or a die', async () => {
    const llm = stubLlm([
      { ok: true, text: sketchJson('A') }, { ok: true, text: sketchJson('B') },
    ]);
    const gallery = { ...emptyGallery(), nextSketchNumber: 41 };
    const result = await createSketchArtist({ llm }).draw(request(2, gallery));

    expect(result.sketches.map((s) => s.id)).toEqual(['sketch-000041', 'sketch-000042']);
    expect(result.nextNumber).toBe(43);
  });

  it('reads JSON out of a fenced reply, because models like fences', async () => {
    const llm = stubLlm([{ ok: true, text: '```json\n' + sketchJson('Fenced') + '\n```' }]);
    const result = await createSketchArtist({ llm }).draw(request(1));
    expect(result.sketches[0]!.title).toBe('Fenced');
  });

  it('repairs an invalid grid exactly once, quoting the complaints back', async () => {
    const broken = JSON.stringify({ rows: ['XX', 'XX'], crown: 'tuft', hue: '#e58c68', title: 'Broken' });
    const llm = stubLlm([
      { ok: true, text: broken }, { ok: true, text: sketchJson('Repaired') },
    ]);
    const result = await createSketchArtist({ llm }).draw(request(1));

    expect(result.sketches.map((s) => s.title)).toEqual(['Repaired']);
    expect(llm.prompts).toHaveLength(2);
    expect(llm.prompts[1]).toContain('cannot be drawn');
    expect(llm.prompts[1]).toContain('height');
  });

  it('gives up on a slot after one failed repair, leaving the case shorter', async () => {
    const broken = JSON.stringify({ rows: ['XX', 'XX'], crown: 'tuft', hue: '#e58c68', title: 'Broken' });
    const llm = stubLlm([
      { ok: true, text: broken }, { ok: true, text: broken }, { ok: true, text: sketchJson('Second') },
    ]);
    const result = await createSketchArtist({ llm }).draw(request(2));

    expect(result.sketches.map((s) => s.title)).toEqual(['Second']);
    expect(result.nextNumber).toBe(2);
  });

  it('stops the whole round when the repair call itself fails', async () => {
    const broken = JSON.stringify({ rows: ['XX', 'XX'], crown: 'tuft', hue: '#e58c68', title: 'Broken' });
    const llm = stubLlm([
      { ok: true, text: broken }, { ok: false, why: 'budget' },
    ]);
    const result = await createSketchArtist({ llm }).draw(request(3));

    expect(result.sketches).toEqual([]);
    expect(result.nextNumber).toBe(1);
    expect(llm.prompts).toHaveLength(2);
  });

  it('stops asking the moment the budget is gone', async () => {
    const llm = stubLlm([{ ok: true, text: sketchJson('One') }, { ok: false, why: 'budget' }]);
    const result = await createSketchArtist({ llm }).draw(request(5));

    expect(result.sketches).toHaveLength(1);
    expect(llm.prompts).toHaveLength(2);
  });

  it('returns nothing at all in silent mode', async () => {
    const llm = stubLlm([{ ok: false, why: 'silent' }]);
    const result = await createSketchArtist({ llm }).draw(request(5));

    expect(result.sketches).toEqual([]);
    expect(result.nextNumber).toBe(1);
    expect(llm.prompts).toHaveLength(1);
  });

  it('carries the galleries into the prompt, so culls actually steer it', async () => {
    const gallery: GalleryState = {
      ...emptyGallery(),
      stock: [{ id: 'k', rows: GOOD_ROWS, crown: 'none', hue: '#e58c68', title: 'Kept One', createdDay: DAY, survivals: 3 }],
      rejects: [{ id: 'c', rows: GOOD_ROWS, crown: 'none', hue: '#e58c68', title: 'Culled One', createdDay: DAY, survivals: 0 }],
    };
    const llm = stubLlm([{ ok: true, text: sketchJson('New') }]);
    await createSketchArtist({ llm }).draw(request(1, gallery));

    expect(llm.prompts[0]).toContain('Kept One');
    expect(llm.prompts[0]).toContain('Culled One');
  });
});

describe('distil', () => {
  it('returns the guide text when the model answers', async () => {
    const llm = stubLlm([{ ok: true, text: '  Wide low bodies keep losing.  ' }]);
    expect(await createSketchArtist({ llm }).distil(emptyGallery())).toBe('Wide low bodies keep losing.');
  });

  it('returns null when the model cannot answer, leaving the old guide standing', async () => {
    const llm = stubLlm([{ ok: false, why: 'budget' }]);
    expect(await createSketchArtist({ llm }).distil(emptyGallery())).toBeNull();
  });

  it('returns null for an empty reply rather than blanking the guide', async () => {
    const llm = stubLlm([{ ok: true, text: '   ' }]);
    expect(await createSketchArtist({ llm }).distil(emptyGallery())).toBeNull();
  });
});
