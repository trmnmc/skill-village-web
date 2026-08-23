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
    // First tick: the timer arms (rand 0.5 → deadline ≈ now + 120·ln2 ≈ +83.2s);
    // nothing plays.
    const armed = direct(initialDirectorState(), { type: 'idle-tick', candidates: cand }, ctx({ now: 100 }));
    expect(armed.commands).toEqual([]);
    // Well past the armed deadline: the chirp fires.
    const fired = direct(armed.state, { type: 'idle-tick', candidates: cand }, ctx({ now: 200 }));
    expect(fired.commands.length).toBeGreaterThan(0);
    // A second creature arms with rand 0.9 → deadline ≈ +12.6s, which lands
    // *inside* the 25s village-wide gap that started at now=200 — so even an
    // elapsed timer stays quiet until the gap clears.
    const other = [{ id: 'skill:y', x: 1000, voice }];
    const armed2 = direct(fired.state, { type: 'idle-tick', candidates: other }, ctx({ now: 203, rand: () => 0.9 }));
    expect(armed2.commands).toEqual([]);
    const gagged = direct(armed2.state, { type: 'idle-tick', candidates: other }, ctx({ now: 216, rand: () => 0.9 }));
    expect(gagged.commands).toEqual([]);
  });

  it('offline is positionless: centred, full volume', () => {
    const { commands } = run({ type: 'offline' }, ctx({ camX: 99999 }));
    expect(commands[0]!.pan).toBe(0);
    expect(commands[0]!.patch).toBe('tone');
  });

  it('reconnected emits two tones, centred', () => {
    const { commands } = run({ type: 'reconnected' }, ctx({ camX: 99999 }));
    expect(commands).toHaveLength(2);
    expect(commands[0]!.patch).toBe('tone');
    expect(commands[0]!.pan).toBe(0);
    expect(commands[1]!.patch).toBe('tone');
    expect(commands[1]!.pan).toBe(0);
    expect(commands[1]!.at).toBeCloseTo(0.11, 5);
  });

  it('greeting is dropped at the voice cap', () => {
    // Build state with 8 active voices
    let state = initialDirectorState();
    for (let i = 0; i < 8; i++) {
      state = { ...state, voiceEnds: [...state.voiceEnds, ctx().now + 1] };
    }
    const { state: nextState, commands } = direct(state, { type: 'greeting', x: 1000, voice }, ctx());
    expect(commands).toEqual([]);
    expect(nextState.voiceEnds.length).toBe(8);
  });

  it('chat babble is never dropped at the voice cap, unlike greeting — spec §7', () => {
    // Build state with 8 active voices, same as the greeting-cap test above.
    let state = initialDirectorState();
    for (let i = 0; i < 8; i++) {
      state = { ...state, voiceEnds: [...state.voiceEnds, ctx().now + 1] };
    }
    const { commands } = direct(state, { type: 'speak', x: 1000, voice, textLength: 100, canned: false }, ctx());
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((c) => c.patch === 'syllable' && c.bus === 'voices')).toBe(true);
  });

  it('idle chirp is dropped (and rearmed) at the voice cap', () => {
    // Build state with 8 active voices and an armed candidate past deadline and gap
    let state = initialDirectorState();
    for (let i = 0; i < 8; i++) {
      state = { ...state, voiceEnds: [...state.voiceEnds, ctx().now + 1] };
    }
    // Arm the candidate with a deadline well in the past
    state = {
      ...state,
      idleNextAt: { 'skill:x': 50 }, // deadline at now=100 is past
      lastIdleAt: -Infinity, // no gap active
    };
    const cand = [{ id: 'skill:x', x: 1000, voice }];
    const { state: nextState, commands } = direct(state, { type: 'idle-tick', candidates: cand }, ctx());
    expect(commands).toEqual([]);
    // But the deadline should be rearmed
    expect(nextState.idleNextAt['skill:x']).toBeGreaterThan(100);
  });

  it('moved-in at the voice cap emits chime but no greeting syllables', () => {
    // Build state with 8 active voices
    let state = initialDirectorState();
    for (let i = 0; i < 8; i++) {
      state = { ...state, voiceEnds: [...state.voiceEnds, ctx().now + 1] };
    }
    const { state: nextState, commands } = direct(state, { type: 'moved-in', x: 1000, voice }, ctx());
    // Should have exactly 2 boxNote commands, no syllables
    expect(commands).toHaveLength(2);
    expect(commands[0]!.patch).toBe('boxNote');
    expect(commands[1]!.patch).toBe('boxNote');
    // voiceEnds should not change (no syllables tracked)
    expect(nextState.voiceEnds.length).toBe(8);
  });

  it('a chime backlog past 3s is dropped rather than queued — spec §4 amendment', () => {
    // 70 arrivals at the same instant: chimeDelay's cooldown pushes each
    // successive chime 0.6s later than the last, so only the first
    // ceil(3/0.6)+1 = 6 land inside the 3s horizon; the rest must emit []
    // and must not push the cooldown out any further than that horizon.
    let state = initialDirectorState();
    let chimeBearing = 0;
    for (let i = 0; i < 70; i++) {
      const result = direct(state, { type: 'moved-in', x: 1000, voice }, ctx());
      state = result.state;
      if (result.commands.length > 0) {
        chimeBearing++;
        expect(result.commands[0]!.patch).toBe('boxNote');
      } else {
        expect(result.commands).toEqual([]);
      }
    }
    expect(chimeBearing).toBe(6);
  });

  describe('event type sweep', () => {
    const events: Array<{
      type: string;
      ev: GameSoundEvent;
      expectedPatch: string;
      expectedBus: string;
    }> = [
      { type: 'takeoff', ev: { type: 'takeoff', x: 1000 }, expectedPatch: 'noiseBurst', expectedBus: 'sfx' },
      { type: 'touch-down', ev: { type: 'touch-down', x: 1000 }, expectedPatch: 'thump', expectedBus: 'sfx' },
      { type: 'sleep-start', ev: { type: 'sleep-start', x: 1000, voice }, expectedPatch: 'breathSwell', expectedBus: 'sfx' },
      { type: 'bubble-in', ev: { type: 'bubble-in', x: 1000 }, expectedPatch: 'blip', expectedBus: 'sfx' },
      { type: 'bubble-out', ev: { type: 'bubble-out', x: 1000 }, expectedPatch: 'blip', expectedBus: 'sfx' },
      { type: 'chat-open', ev: { type: 'chat-open' }, expectedPatch: 'thump', expectedBus: 'sfx' },
      { type: 'chat-close', ev: { type: 'chat-close' }, expectedPatch: 'thump', expectedBus: 'sfx' },
      { type: 'chat-send', ev: { type: 'chat-send' }, expectedPatch: 'noiseBurst', expectedBus: 'sfx' },
      { type: 'stage-up', ev: { type: 'stage-up', x: 1000 }, expectedPatch: 'boxNote', expectedBus: 'sfx' },
    ];

    for (const { type, ev, expectedPatch, expectedBus } of events) {
      it(`${type} emits ${expectedPatch}/${expectedBus}`, () => {
        const { commands } = run(ev);
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.every((c) => c.patch === expectedPatch && c.bus === expectedBus)).toBe(true);
      });
    }
  });
});
