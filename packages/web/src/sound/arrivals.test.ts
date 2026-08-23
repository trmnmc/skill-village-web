import { describe, it, expect } from 'vitest';
import { viewSoundEvents } from './arrivals.js';
import { voiceParamsFor } from './voice.js';

const voice = voiceParamsFor({ id: 'skill:x', kind: 'skill', appearance: { body: 'round' } });
const snap = (id: string, stage = 'adult') => ({ id, stage, x: 500, voice });

describe('viewSoundEvents', () => {
  it('the founding view is silent — a page load is not seventy arrivals', () => {
    expect(viewSoundEvents(null, [snap('a'), snap('b')])).toEqual([]);
  });

  it('a genuinely empty village hears its first villager move in', () => {
    expect(viewSoundEvents(new Map(), [snap('a')])).toEqual([
      { type: 'moved-in', x: 500, voice },
    ]);
  });

  it('a new id is an arrival; a stage change is a stage-up; the rest is silence', () => {
    const prev = new Map([['a', 'hatchling'], ['b', 'adult']]);
    expect(viewSoundEvents(prev, [snap('a', 'adult'), snap('b'), snap('c')])).toEqual([
      { type: 'stage-up', x: 500 },
      { type: 'moved-in', x: 500, voice },
    ]);
  });

  it('a departure makes no sound — release is not an event to score', () => {
    expect(viewSoundEvents(new Map([['a', 'adult']]), [])).toEqual([]);
  });
});
