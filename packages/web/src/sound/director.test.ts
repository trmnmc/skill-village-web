import { describe, it, expect } from 'vitest';
import { direct, initialDirectorState, panFor, type DirectorCtx } from './director.js';
import { voiceParamsFor } from './voice.js';
import type { GameSoundEvent } from './types.js';

const voice = voiceParamsFor({ id: 'skill:x', kind: 'skill', appearance: { body: 'round' } });
const ctx = (over: Partial<DirectorCtx> = {}): DirectorCtx => ({
  now: 100, camX: 1000, viewW: 1280, unlocked: true, rand: () => 0.5, ...over,
});
const run = (ev: GameSoundEvent, c = ctx()) => direct(initialDirectorState(), ev, c);

describe('panFor', () => {
  it('centre is centred; off-screen leans hard into one ear', () => {
    expect(panFor(1000, 1000, 1280).pan).toBe(0);
    expect(panFor(0, 1000, 1280).pan).toBe(-1);
    expect(panFor(3000, 1000, 1280).pan).toBe(1);
  });

  it('attenuates to silence beyond ~1.4 screen-widths — spec §4', () => {
    expect(panFor(1000, 1000, 1280).attenuation).toBe(1);
    expect(panFor(1000 + 1280 * 1.4, 1000, 1280).attenuation).toBe(0);
    const half = panFor(1000 + 1280 * 0.7, 1000, 1280).attenuation;
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });
});

describe('direct', () => {
  it('before the first gesture, everything is dropped — never queued', () => {
    const { commands } = run({ type: 'hop-landed', x: 1000 }, ctx({ unlocked: false }));
    expect(commands).toEqual([]);
  });

  it('a landing is the §10 thump plus the grass brush 120ms later', () => {
    const { commands } = run({ type: 'hop-landed', x: 1000 });
    expect(commands).toEqual([
      { patch: 'thump', bus: 'sfx', at: 0, pan: 0, gain: 0.22, from: 120, to: 52, dur: 0.12 },
      { patch: 'noiseBurst', bus: 'sfx', at: 0.12, pan: 0, gain: 0.06, filter: 'bandpass', freq: 420, q: 0.8, dur: 0.09 },
    ]);
  });

  it('a landing nobody could hear emits nothing at all', () => {
    const { commands } = run({ type: 'hop-landed', x: 1000 + 1280 * 2 });
    expect(commands).toEqual([]);
  });

  it('speak babbles for the text length, quieter when canned', () => {
    const llm = run({ type: 'speak', x: 1000, voice, textLength: 100, canned: false });
    const canned = run({ type: 'speak', x: 1000, voice, textLength: 100, canned: true });
    expect(llm.commands.length).toBe(Math.floor(Math.min(100 * 0.028, 2.2) * voice.syllableRate));
    expect(llm.commands.every((c) => c.patch === 'syllable' && c.bus === 'voices')).toBe(true);
    expect(canned.commands[0]!.gain).toBeLessThan(llm.commands[0]!.gain);
  });

  it('two arrivals in the same instant chime 600ms apart, not on top of each other', () => {
    const first = direct(initialDirectorState(), { type: 'moved-in', x: 1000, voice }, ctx());
    const second = direct(first.state, { type: 'moved-in', x: 1000, voice }, ctx());
    expect(first.commands[0]!.at).toBe(0);
    expect(second.commands[0]!.at).toBeCloseTo(0.6, 5);
  });

  it('thinking is one soft double-blip in the creature\'s own register', () => {
    const { commands } = run({ type: 'thinking', x: 1000, voice });
    expect(commands.length).toBe(2);
    expect(commands[0]!.patch).toBe('syllable');
    expect((commands[0] as { freq: number }).freq).toBeCloseTo(voice.basePitch * 0.5, 5);
    expect(commands[1]!.at).toBeCloseTo(0.07, 5);
  });

  it('idle chirps wait out their Poisson timer and respect the village-wide gap', () => {
    const cand = [{ id: 'skill:x', x: 1000, voice }];
    // First tick: the timer arms (rand 0.5 → deadline ≈ now + 45·ln2 ≈ +31.2s);
    // nothing plays.
    const armed = direct(initialDirectorState(), { type: 'idle-tick', candidates: cand }, ctx({ now: 100 }));
    expect(armed.commands).toEqual([]);
    // Well past the armed deadline: the chirp fires.
    const fired = direct(armed.state, { type: 'idle-tick', candidates: cand }, ctx({ now: 200 }));
    expect(fired.commands.length).toBeGreaterThan(0);
    // A second creature arms with rand 0.9 → deadline ≈ +4.7s, which lands
    // *inside* the 8s village-wide gap that started at now=200 — so even an
    // elapsed timer stays quiet until the gap clears.
    const other = [{ id: 'skill:y', x: 1000, voice }];
    const armed2 = direct(fired.state, { type: 'idle-tick', candidates: other }, ctx({ now: 203, rand: () => 0.9 }));
    expect(armed2.commands).toEqual([]);
    const gagged = direct(armed2.state, { type: 'idle-tick', candidates: other }, ctx({ now: 207.8, rand: () => 0.9 }));
    expect(gagged.commands).toEqual([]);
  });

  it('offline and reconnected are positionless: centred, full volume', () => {
    const { commands } = run({ type: 'offline' }, ctx({ camX: 99999 }));
    expect(commands[0]!.pan).toBe(0);
    expect(commands[0]!.patch).toBe('tone');
  });
});
