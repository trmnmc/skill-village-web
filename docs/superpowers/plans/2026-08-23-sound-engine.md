# Sound Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the village its full procedural soundscape — DNA-hashed chip voices, naturalistic body/UI/event sounds, clock-aware ambience, and day-seeded lo-fi music — with zero audio files and zero new dependencies.

**Architecture:** A new `packages/web/src/sound/` directory under the house rule: everything that decides is a pure function; only the last inch rings. Pure modules (`voice`, `soundscape`, `music`, `director`, `arrivals`, `settings`) compute plain `SoundCommand` objects and ambience mixes; one thin `player.ts` owns the `AudioContext` and executes them. The scene emits `GameSoundEvent`s at the exact sites that already fire visual effects (the puff's landing guard, `setCreature`'s behaviour re-derivation, `showBubble`).

**Tech Stack:** Raw Web Audio API (no Tone.js), TypeScript, vitest. KAPLAY is not involved — sound bypasses it entirely.

**Spec:** `docs/superpowers/specs/2026-08-23-sound-engine-design.md` — argue from it; §10 holds the exact synthesis constants and is copied into `player.ts`'s patch functions verbatim.

## Global Constraints

- **No new dependencies.** `package.json` files are not touched. Raw Web Audio only.
- **No audio files.** Nothing lands in `assets/sfx/`; every sound is synthesized.
- **`AudioContext` appears in exactly one file:** `packages/web/src/sound/player.ts`. Enforced by a boundaries test (Task 7).
- **`localStorage` appears in exactly one file:** `packages/web/src/sound/settings.ts` (same test).
- **Only `@village/core/visual`** may be imported from core (existing boundaries test; `BodyId` and `Creature` types come from there).
- **Tests are DOM-free.** Pure modules never reference `window`, `document`, `AudioContext`, or timers.
- **Run tests from the repo root:** `npx vitest run <path>` (or `npm test` for the whole suite). Typecheck: `npm run typecheck`.
- **Commit style:** short imperative subject, house voice (see `git log --oneline`), each ending with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Comment style:** comments explain *why*, in full sentences, matching the density of neighboring files like `packages/web/src/motion/motion.ts`.

---

### Task 1: Voice — `VoiceParams`, signature phrases, babble

**Files:**
- Create: `packages/web/src/sound/types.ts`
- Create: `packages/web/src/sound/voice.ts`
- Test: `packages/web/src/sound/voice.test.ts`

**Interfaces:**
- Consumes: `BodyId`, `CreatureKind` types from `@village/core/visual`.
- Produces (everything later tasks import):
  - `types.ts`: `BusName`, `SoundCommand` (discriminated union on `patch`), `GameSoundEvent` (discriminated union on `type`).
  - `voice.ts`: `VoiceParams`, `Syllable {at,freq,gain}`, `mulberry(seed:number): () => number`, `fnv(s:string): number`, `voiceParamsFor(c:{id:string; kind:CreatureKind; appearance:{body:BodyId}}): VoiceParams`, `signaturePhrase(vp): Syllable[]`, `babble(vp, textLength:number, rand:()=>number): Syllable[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/voice.test.ts
import { describe, it, expect } from 'vitest';
import { babble, mulberry, signaturePhrase, voiceParamsFor } from './voice.js';

const skill = (id: string, body = 'round' as const) => ({
  id, kind: 'skill' as const, appearance: { body },
});

describe('voiceParamsFor', () => {
  it('is deterministic: same creature, same voice, any machine', () => {
    expect(voiceParamsFor(skill('skill:brainstorming'))).toEqual(
      voiceParamsFor(skill('skill:brainstorming')),
    );
  });

  it('keeps every param inside its spec §3 range, for arbitrary ids', () => {
    const rand = mulberry(1234);
    for (let i = 0; i < 200; i++) {
      const id = `skill:${Math.floor(rand() * 1e9).toString(36)}`;
      const vp = voiceParamsFor(skill(id));
      // basePitch: 380–950 spec range times the widest body shift (pip 1.25).
      expect(vp.basePitch).toBeGreaterThanOrEqual(380 * 0.8);
      expect(vp.basePitch).toBeLessThanOrEqual(950 * 1.25);
      expect(['rise', 'fall', 'arch']).toContain(vp.contour);
      expect(vp.syllableRate).toBeGreaterThanOrEqual(7);
      expect(vp.syllableRate).toBeLessThanOrEqual(11);
      expect(vp.jitter).toBeGreaterThanOrEqual(0);
      expect(vp.jitter).toBeLessThanOrEqual(0.2);
      expect(vp.vibrato).toBeGreaterThanOrEqual(0);
      expect(vp.vibrato).toBeLessThanOrEqual(9);
      expect(vp.phraseLen === 2 || vp.phraseLen === 3 || vp.phraseLen === 4).toBe(true);
    }
  });

  it('shifts the register by body: a pip sits above the same voice in a mound', () => {
    const high = voiceParamsFor(skill('skill:x', 'pip'));
    const low = voiceParamsFor(skill('skill:x', 'mound'));
    expect(high.basePitch).toBeGreaterThan(low.basePitch);
  });

  it('lifts agents ~15% above the identical skill voice', () => {
    const ground = voiceParamsFor(skill('agent:x'));
    const air = voiceParamsFor({ id: 'agent:x', kind: 'agent', appearance: { body: 'round' } });
    expect(air.basePitch / ground.basePitch).toBeCloseTo(1.15, 5);
    expect(air.breathy).toBe(true);
    expect(ground.breathy).toBe(false);
  });

  it('differs from phaseFor: two creatures can share a phase without sharing a voice', () => {
    // Not a strict guarantee for every pair — just that the hash stream is
    // its own: two nearby ids must not produce identical params.
    expect(voiceParamsFor(skill('skill:a'))).not.toEqual(voiceParamsFor(skill('skill:b')));
  });
});

describe('signaturePhrase', () => {
  it('is the same notes every time — it is the creature\'s name', () => {
    const vp = voiceParamsFor(skill('skill:code-review'));
    expect(signaturePhrase(vp)).toEqual(signaturePhrase(vp));
  });

  it('has phraseLen syllables, spaced at the voice\'s own rate', () => {
    const vp = voiceParamsFor(skill('skill:code-review'));
    const notes = signaturePhrase(vp).filter((s) => s.gain > 0.1); // main syllables, not the sparkle
    expect(notes.length).toBe(vp.phraseLen);
    if (notes.length >= 2) {
      expect(notes[1]!.at - notes[0]!.at).toBeCloseTo(1 / vp.syllableRate, 5);
    }
  });
});

describe('babble', () => {
  it('runs min(len × 28ms, 2.2s) at the voice\'s syllable rate', () => {
    const vp = voiceParamsFor(skill('skill:x'));
    const short = babble(vp, 20, mulberry(1));
    const long = babble(vp, 500, mulberry(1));
    expect(short.length).toBe(Math.floor(20 * 0.028 * vp.syllableRate));
    expect(long.length).toBe(Math.floor(2.2 * vp.syllableRate));
  });

  it('wanders around basePitch without leaving the voice\'s neighbourhood', () => {
    const vp = voiceParamsFor(skill('skill:x'));
    for (const s of babble(vp, 300, mulberry(7))) {
      expect(s.freq).toBeGreaterThan(vp.basePitch * 0.6);
      expect(s.freq).toBeLessThan(vp.basePitch * 1.4);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/voice.test.ts`
Expected: FAIL — cannot resolve `./voice.js`.

- [ ] **Step 3: Write `types.ts` and `voice.ts`**

```ts
// packages/web/src/sound/types.ts
import type { VoiceParams } from './voice.js';

export type BusName = 'voices' | 'sfx' | 'ambience' | 'music';

/**
 * One fully-decided sound. The director computes these; the player only
 * rings them — the same relationship a baked grid has to the canvas.
 * `at` is seconds after "now"; `pan` is -1 left … 1 right.
 */
export type SoundCommand =
  | { patch: 'syllable'; bus: 'voices'; at: number; pan: number; gain: number;
      freq: number; vibrato: number; sineMix: number; breathy: boolean }
  | { patch: 'thump'; bus: 'sfx'; at: number; pan: number; gain: number;
      from: number; to: number; dur: number }
  | { patch: 'noiseBurst'; bus: 'sfx'; at: number; pan: number; gain: number;
      filter: 'bandpass' | 'highpass'; freq: number; q: number; dur: number }
  | { patch: 'breathSwell'; bus: 'sfx'; at: number; pan: number; gain: number; freq: number }
  | { patch: 'boxNote'; bus: 'sfx' | 'music'; at: number; pan: number; gain: number; freq: number }
  | { patch: 'blip'; bus: 'sfx'; at: number; pan: number; gain: number;
      from: number; to: number; dur: number }
  | { patch: 'tone'; bus: 'sfx'; at: number; pan: number; gain: number;
      freq: number; attack: number; decay: number };

/**
 * What the game tells the sound system. Position-bearing events carry a
 * world x so the director can pan and attenuate; voice-bearing events carry
 * the speaker's VoiceParams so the director needs no creature registry.
 */
export type GameSoundEvent =
  | { type: 'hop-landed'; x: number }
  | { type: 'takeoff'; x: number }
  | { type: 'touch-down'; x: number }
  | { type: 'sleep-start'; x: number; voice: VoiceParams }
  | { type: 'speak'; x: number; voice: VoiceParams; textLength: number; canned: boolean }
  | { type: 'greeting'; x: number; voice: VoiceParams }
  | { type: 'thinking'; x: number; voice: VoiceParams }
  | { type: 'bubble-in'; x: number }
  | { type: 'bubble-out'; x: number }
  | { type: 'chat-open' }
  | { type: 'chat-close' }
  | { type: 'chat-send' }
  | { type: 'moved-in'; x: number; voice: VoiceParams }
  | { type: 'stage-up'; x: number }
  | { type: 'offline' }
  | { type: 'reconnected' }
  | { type: 'idle-tick'; candidates: { id: string; x: number; voice: VoiceParams }[] };
```

```ts
// packages/web/src/sound/voice.ts
import type { BodyId, CreatureKind } from '@village/core/visual';

/**
 * A creature's voice: eight numbers hashed from its id, deterministic on any
 * machine — the audio half of DNA. Spec §3. `seed` rides along so phrase
 * generation can reopen the same random stream.
 */
export interface VoiceParams {
  basePitch: number;
  contour: 'rise' | 'fall' | 'arch';
  syllableRate: number;
  jitter: number;
  vibrato: number;
  sineMix: number;
  phraseLen: number;
  sparkle: number;
  breathy: boolean;
  seed: number;
}

/** One chirp syllable, relative to phrase start. The director turns these into commands. */
export interface Syllable {
  at: number;
  freq: number;
  gain: number;
}

/** Deterministic 32-bit PRNG. Small, seedable, good enough for chirps. */
export function mulberry(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a, the same construction as motion.ts's phaseFor. The 'voice:' prefix
 * gives sound its own hash stream: a creature's voice and its phase offset
 * are independent draws from its identity.
 */
export function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small bodies chirp high, heavy bodies low — the voice matches the silhouette. */
const BODY_REGISTER: Record<BodyId, number> = {
  pip: 1.25, round: 1.1, bean: 1.05, lanky: 1.0, boxy: 0.85, mound: 0.8,
};

export function voiceParamsFor(c: {
  id: string;
  kind: CreatureKind;
  appearance: { body: BodyId };
}): VoiceParams {
  const seed = fnv(`voice:${c.id}`);
  const r = mulberry(seed);
  const agent = c.kind === 'agent';
  return {
    // Draw the raw register first so the body shift is a modifier, not a
    // reroll — the same creature imagined in a different body keeps its voice.
    basePitch: (380 + r() * 570) * BODY_REGISTER[c.appearance.body] * (agent ? 1.15 : 1),
    contour: (['rise', 'fall', 'arch'] as const)[Math.floor(r() * 3)]!,
    syllableRate: 7 + r() * 4,
    jitter: r() * 0.2,
    vibrato: r() * 9,
    sineMix: r() * 0.5,
    phraseLen: 2 + Math.floor(r() * 3),
    sparkle: r(),
    breathy: agent,
    seed,
  };
}

/** The phrase covers ±30% of the base pitch; jitter roughens each note. */
const CONTOUR_SPAN = 0.3;

function contourBend(vp: VoiceParams, i: number, n: number, r: () => number): number {
  const q = n < 2 ? 0 : i / (n - 1);
  const shape =
    vp.contour === 'rise' ? q * CONTOUR_SPAN
    : vp.contour === 'fall' ? -q * CONTOUR_SPAN
    : Math.sin(q * Math.PI) * CONTOUR_SPAN;
  return shape + (r() - 0.5) * 2 * vp.jitter;
}

/**
 * The creature's signature: always the same notes, because the random stream
 * reopens from the same derived seed. Spec §3 — its audible "name". The
 * optional sparkle grace note rides at lower gain so callers can tell main
 * syllables from decoration.
 */
export function signaturePhrase(vp: VoiceParams): Syllable[] {
  const r = mulberry((vp.seed * 31 + 5) | 0);
  const gap = 1 / vp.syllableRate;
  const out: Syllable[] = [];
  for (let i = 0; i < vp.phraseLen; i++) {
    const freq = vp.basePitch * (1 + contourBend(vp, i, vp.phraseLen, r));
    out.push({ at: i * gap, freq, gain: 0.16 });
    if (i === vp.phraseLen - 1 && vp.sparkle > 0.6) {
      out.push({ at: i * gap + gap * 0.55, freq: freq * 2, gain: 0.05 });
    }
  }
  return out;
}

/**
 * Chat babble, spec §3: a syllable train for min(text.length × 28ms, 2.2s).
 * A random walk, not the signature — talking is improvisation; the name is
 * fixed. `rand` is injected so the director's tests can pin the walk.
 */
export function babble(vp: VoiceParams, textLength: number, rand: () => number): Syllable[] {
  const dur = Math.min(textLength * 0.028, 2.2);
  const gap = 1 / vp.syllableRate;
  const n = Math.floor(dur * vp.syllableRate);
  const out: Syllable[] = [];
  for (let i = 0; i < n; i++) {
    const bend = (rand() - 0.5) * 2 * (0.12 + vp.jitter);
    out.push({ at: i * gap, freq: vp.basePitch * (1 + bend), gain: 0.11 });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/voice.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected clean.

```bash
git add packages/web/src/sound/types.ts packages/web/src/sound/voice.ts packages/web/src/sound/voice.test.ts
git commit -m "feat(web): every creature gets a deterministic voice

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Soundscape — the clock decides the mix

**Files:**
- Create: `packages/web/src/sound/soundscape.ts`
- Test: `packages/web/src/sound/soundscape.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `AmbienceMix { windFreq; windGain; birdRate; cricketGain; musicLevel; musicWarmth }` (all `number`), `mixAt(date: Date): AmbienceMix`, `minuteOfDay(date: Date): number`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/soundscape.test.ts
import { describe, it, expect } from 'vitest';
import { mixAt, type AmbienceMix } from './soundscape.js';

/** Local-clock date helper: hours/minutes on an arbitrary fixed day. */
const at = (h: number, m = 0) => new Date(2026, 7, 24, h, m, 0);

const fields: (keyof AmbienceMix)[] = [
  'windFreq', 'windGain', 'birdRate', 'cricketGain', 'musicLevel', 'musicWarmth',
];

describe('mixAt', () => {
  it('deep night is crickets and low wind — no birds, no music', () => {
    const night = mixAt(at(3, 0));
    expect(night.birdRate).toBe(0);
    expect(night.musicLevel).toBe(0);
    expect(night.cricketGain).toBeGreaterThan(0.02);
    expect(night.windFreq).toBeLessThan(400);
  });

  it('the dawn chorus peaks at 06:45 — denser than either shoulder', () => {
    const peak = mixAt(at(6, 45)).birdRate;
    expect(peak).toBeGreaterThan(mixAt(at(6, 10)).birdRate);
    expect(peak).toBeGreaterThan(mixAt(at(7, 20)).birdRate);
  });

  it('the day plateau holds: 10:00 and 14:00 are identical', () => {
    expect(mixAt(at(10, 0))).toEqual(mixAt(at(14, 0)));
  });

  it('crickets are gone at noon and fade monotonically in across dusk', () => {
    expect(mixAt(at(12, 0)).cricketGain).toBe(0);
    const samples = [at(17, 45), at(18, 30), at(19, 20), at(20, 0), at(21, 0)].map(
      (d) => mixAt(d).cricketGain,
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });

  it('lerps, never steps: 19:00 sits strictly between its dusk keyframes', () => {
    const mid = mixAt(at(19, 0)).birdRate;
    const before = mixAt(at(18, 45)).birdRate;
    const after = mixAt(at(19, 20)).birdRate;
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(after);
  });

  it('midnight is continuous: 23:59 and 00:01 agree to within a whisker', () => {
    const a = mixAt(at(23, 59));
    const b = mixAt(at(0, 1));
    for (const f of fields) {
      expect(Math.abs(a[f] - b[f])).toBeLessThan(0.01 * Math.max(1, a[f]));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/soundscape.test.ts`
Expected: FAIL — cannot resolve `./soundscape.js`.

- [ ] **Step 3: Write `soundscape.ts`**

```ts
// packages/web/src/sound/soundscape.ts

/**
 * What the world should sound like right now. Spec §5: the same daily
 * skeleton as the time-of-day palettes spec, and like the light it lerps —
 * never steps. When the palettes arc builds its theme store, this module
 * swaps its (Date) input for the store's resolved frame; nothing else moves.
 */
export interface AmbienceMix {
  /** Lowpass corner of the wind bed, Hz. */
  windFreq: number;
  /** Wind bed level, pre-master. */
  windGain: number;
  /** Bird songs per second (Poisson rate for the player's scheduler). */
  birdRate: number;
  /** Total cricket-field level; the player splits it across its two voices. */
  cricketGain: number;
  /** 0 = music forbidden this daypart; 1 = full. Scales the music bus. */
  musicLevel: number;
  /** 0 cool … 1 warm. The player pulls the pad's filter down as it rises. */
  musicWarmth: number;
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

const NIGHT: AmbienceMix = { windFreq: 260, windGain: 0.02, birdRate: 0, cricketGain: 0.036, musicLevel: 0, musicWarmth: 0 };
const DAWN_RISE: AmbienceMix = { windFreq: 400, windGain: 0.028, birdRate: 0.25, cricketGain: 0.02, musicLevel: 0, musicWarmth: 0 };
const DAWN_PEAK: AmbienceMix = { windFreq: 520, windGain: 0.032, birdRate: 0.5, cricketGain: 0.008, musicLevel: 0, musicWarmth: 0 };
const MORNING: AmbienceMix = { windFreq: 700, windGain: 0.04, birdRate: 0.3, cricketGain: 0, musicLevel: 0.5, musicWarmth: 0.2 };
const DAY: AmbienceMix = { windFreq: 900, windGain: 0.045, birdRate: 0.18, cricketGain: 0, musicLevel: 1, musicWarmth: 0 };
const DUSK: AmbienceMix = { windFreq: 650, windGain: 0.038, birdRate: 0.08, cricketGain: 0.012, musicLevel: 1, musicWarmth: 1 };
const DUSK_LATE: AmbienceMix = { windFreq: 420, windGain: 0.03, birdRate: 0.02, cricketGain: 0.024, musicLevel: 0.4, musicWarmth: 1 };

/**
 * Anchors in minutes of the local day, straight off the palette spec's
 * table: night holds to 05:30, dawn 06:10–07:20 with the chorus peak at
 * 06:45, the plateau 08:30–16:45, dusk 17:45–19:20, night from 21:00.
 * The 0 and 1440 endpoints are both NIGHT, which is what makes midnight
 * continuous without a special case.
 */
const KEYS: { m: number; mix: AmbienceMix }[] = [
  { m: 0, mix: NIGHT },
  { m: 330, mix: NIGHT },
  { m: 370, mix: DAWN_RISE },
  { m: 405, mix: DAWN_PEAK },
  { m: 440, mix: MORNING },
  { m: 510, mix: DAY },
  { m: 1005, mix: DAY },
  { m: 1065, mix: DUSK },
  { m: 1160, mix: DUSK_LATE },
  { m: 1260, mix: NIGHT },
  { m: 1440, mix: NIGHT },
];

const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

export function mixAt(date: Date): AmbienceMix {
  const m = minuteOfDay(date);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.m <= m) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const q = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m);
  return {
    windFreq: lerp(a.mix.windFreq, b.mix.windFreq, q),
    windGain: lerp(a.mix.windGain, b.mix.windGain, q),
    birdRate: lerp(a.mix.birdRate, b.mix.birdRate, q),
    cricketGain: lerp(a.mix.cricketGain, b.mix.cricketGain, q),
    musicLevel: lerp(a.mix.musicLevel, b.mix.musicLevel, q),
    musicWarmth: lerp(a.mix.musicWarmth, b.mix.musicWarmth, q),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/soundscape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sound/soundscape.ts packages/web/src/sound/soundscape.test.ts
git commit -m "feat(web): the clock decides what the village sounds like

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Music — day-seeded bars and the duty cycle

**Files:**
- Create: `packages/web/src/sound/music.ts`
- Test: `packages/web/src/sound/music.test.ts`

**Interfaces:**
- Consumes: `mulberry`, `fnv` from `./voice.js` (Task 1).
- Produces: `MusicNote { at; freq; gain; kind: 'pad' | 'box' }`, `BAR_SECONDS = 7.5`, `daySeedFor(date: Date): number`, `musicBar(daySeed: number, barIndex: number): MusicNote[]`, `musicGate(secondsOfDay: number): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/music.test.ts
import { describe, it, expect } from 'vitest';
import { BAR_SECONDS, daySeedFor, musicBar, musicGate } from './music.js';

describe('musicBar', () => {
  it('is deterministic: the same day plays the same bar', () => {
    expect(musicBar(12345, 7)).toEqual(musicBar(12345, 7));
  });

  it('pad notes are chord tones; box notes come from the pentatonic pool', () => {
    for (let bar = 0; bar < 16; bar++) {
      const notes = musicBar(999, bar);
      const pads = notes.filter((n) => n.kind === 'pad');
      expect(pads.length).toBe(4); // one chord, four voices
      for (const n of notes) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(BAR_SECONDS);
        expect(n.freq).toBeGreaterThan(80);
        expect(n.freq).toBeLessThan(1200);
      }
    }
  });

  it('different days pick different songs (eventually)', () => {
    // Not every pair differs — four chord sets — but across several seeds
    // at least two must diverge, or the seeding is dead.
    const bars = [1, 2, 3, 4, 5].map((s) => JSON.stringify(musicBar(s, 0)));
    expect(new Set(bars).size).toBeGreaterThan(1);
  });
});

describe('daySeedFor', () => {
  it('is stable within a day and changes across days', () => {
    expect(daySeedFor(new Date(2026, 7, 24, 9, 0))).toBe(daySeedFor(new Date(2026, 7, 24, 21, 0)));
    expect(daySeedFor(new Date(2026, 7, 24))).not.toBe(daySeedFor(new Date(2026, 7, 25)));
  });
});

describe('musicGate', () => {
  it('plays ~3-minute passages with ~2-minute rests — spec §5\'s duty cycle', () => {
    let on = 0;
    for (let s = 0; s < 3000; s++) if (musicGate(s)) on++;
    expect(on).toBe(1800); // 180 of every 300 seconds
  });

  it('a passage is contiguous: no flicker at one-second resolution', () => {
    let flips = 0;
    for (let s = 1; s < 3000; s++) if (musicGate(s) !== musicGate(s - 1)) flips++;
    expect(flips).toBe(20); // 3000s / 300s cycle × 2 edges
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/music.test.ts`
Expected: FAIL — cannot resolve `./music.js`.

- [ ] **Step 3: Write `music.ts`**

```ts
// packages/web/src/sound/music.ts
import { fnv, mulberry } from './voice.js';

/**
 * The generative score, spec §5: a date hash picks a 4-chord loop and a
 * pentatonic pool — each day has its song. Everything here is data; the
 * player schedules it. (Weekend palette-seed inheritance arrives with the
 * theme store, when there is a palette to inherit from.)
 */
export interface MusicNote {
  at: number;
  freq: number;
  gain: number;
  /** 'pad' = the lo-fi bed; 'box' = the chip music-box crossover, spec §10. */
  kind: 'pad' | 'box';
}

export const BAR_SECONDS = 7.5;

/**
 * Four curated loops. Freqs are equal-temperament around C3 — low enough to
 * pad, not rumble. Each set pairs its chords with a pentatonic pool the box
 * notes draw from, so a melody note can never clash with its own bed.
 */
const SONGS: { chords: number[][]; penta: number[] }[] = [
  { // C major-ish: Cmaj7 – Am7 – Dm7 – G
    chords: [
      [130.81, 164.81, 196.0, 246.94],
      [110.0, 130.81, 164.81, 196.0],
      [146.83, 174.61, 220.0, 261.63],
      [98.0, 123.47, 146.83, 196.0],
    ],
    penta: [523.25, 587.33, 659.25, 783.99, 880.0],
  },
  { // A minor-ish: Am – F – C – G
    chords: [
      [110.0, 130.81, 164.81, 220.0],
      [87.31, 110.0, 130.81, 174.61],
      [130.81, 164.81, 196.0, 261.63],
      [98.0, 123.47, 146.83, 196.0],
    ],
    penta: [440.0, 523.25, 587.33, 659.25, 783.99],
  },
  { // D dorian-ish: Dm7 – G – Cmaj7 – Am
    chords: [
      [146.83, 174.61, 220.0, 261.63],
      [98.0, 123.47, 146.83, 196.0],
      [130.81, 164.81, 196.0, 246.94],
      [110.0, 130.81, 164.81, 220.0],
    ],
    penta: [587.33, 659.25, 698.46, 880.0, 987.77],
  },
  { // F lydian-ish: Fmaj7 – C – G – Am
    chords: [
      [87.31, 110.0, 130.81, 164.81],
      [130.81, 164.81, 196.0, 261.63],
      [98.0, 123.47, 146.83, 196.0],
      [110.0, 130.81, 164.81, 220.0],
    ],
    penta: [523.25, 587.33, 698.46, 783.99, 880.0],
  },
];

export function daySeedFor(date: Date): number {
  return fnv(`song:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
}

export function musicBar(daySeed: number, barIndex: number): MusicNote[] {
  const song = SONGS[daySeed % SONGS.length]!;
  const chord = song.chords[barIndex % song.chords.length]!;
  // Seed per (day, bar) so a bar is reproducible without playing its
  // predecessors — the player can start mid-passage after a tab wake.
  const r = mulberry((daySeed ^ Math.imul(barIndex + 1, 2654435761)) | 0);
  const notes: MusicNote[] = chord.map((freq) => ({ at: 0, freq, gain: 0.016, kind: 'pad' as const }));
  // The crossover, spec §10: music-box drops 4–9s apart while music plays.
  // With 7.5s bars, most bars carry one.
  if (r() < 0.8) {
    notes.push({
      at: 1 + r() * 5.5,
      freq: song.penta[Math.floor(r() * song.penta.length)]!,
      gain: 0.055,
      kind: 'box',
    });
  }
  return notes;
}

/** Spec §5: ~3-minute passages, ~2-minute rests. Pure in seconds-of-day. */
export function musicGate(secondsOfDay: number): boolean {
  return secondsOfDay % 300 < 180;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/music.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sound/music.ts packages/web/src/sound/music.test.ts
git commit -m "feat(web): each day gets its song, three minutes at a time

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Settings — volumes that survive a reload

**Files:**
- Create: `packages/web/src/sound/settings.ts`
- Test: `packages/web/src/sound/settings.test.ts`

**Interfaces:**
- Consumes: `BusName` from `./types.js`.
- Produces: `SoundSettings { muted: boolean; master: number; buses: Record<BusName, number> }`, `DEFAULT_SETTINGS`, `parseSettings(raw: string | null): SoundSettings`, `serializeSettings(s: SoundSettings): string`, `loadSettings(): SoundSettings`, `saveSettings(s: SoundSettings): void`, `STORAGE_KEY`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/settings.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from './settings.js';

describe('settings', () => {
  it('round-trips through serialization', () => {
    const s = { muted: true, master: 0.3, buses: { voices: 1, sfx: 0.5, ambience: 0.2, music: 0 } };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('defaults: sound on, master 70%, music slightly lower — spec §6', () => {
    expect(DEFAULT_SETTINGS.muted).toBe(false);
    expect(DEFAULT_SETTINGS.master).toBe(0.7);
    expect(DEFAULT_SETTINGS.buses.music).toBeLessThan(DEFAULT_SETTINGS.buses.voices);
  });

  it('garbage in, defaults out', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"master": "loud"}')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range volumes instead of trusting them', () => {
    const parsed = parseSettings('{"muted":false,"master":9,"buses":{"voices":-1,"sfx":0.5,"ambience":0.5,"music":0.5}}');
    expect(parsed.master).toBe(1);
    expect(parsed.buses.voices).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/settings.test.ts`
Expected: FAIL — cannot resolve `./settings.js`.

- [ ] **Step 3: Write `settings.ts`**

```ts
// packages/web/src/sound/settings.ts
import type { BusName } from './types.js';

/**
 * The player's mixing desk, spec §6. Parsing and serializing are pure and
 * tested; the two localStorage calls at the bottom are the whole of the I/O,
 * and this file is the only one allowed to make them (boundaries test).
 */
export interface SoundSettings {
  muted: boolean;
  master: number;
  buses: Record<BusName, number>;
}

export const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  master: 0.7,
  buses: { voices: 1, sfx: 1, ambience: 1, music: 0.85 },
};

export const STORAGE_KEY = 'skill-village:sound';

const clamp01 = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

export function parseSettings(raw: string | null): SoundSettings {
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const buses = (p.buses ?? {}) as Record<string, unknown>;
    const master = clamp01(p.master);
    const parsedBuses = {
      voices: clamp01(buses.voices),
      sfx: clamp01(buses.sfx),
      ambience: clamp01(buses.ambience),
      music: clamp01(buses.music),
    };
    if (master === null || typeof p.muted !== 'boolean') return DEFAULT_SETTINGS;
    return {
      muted: p.muted,
      master,
      buses: {
        voices: parsedBuses.voices ?? DEFAULT_SETTINGS.buses.voices,
        sfx: parsedBuses.sfx ?? DEFAULT_SETTINGS.buses.sfx,
        ambience: parsedBuses.ambience ?? DEFAULT_SETTINGS.buses.ambience,
        music: parsedBuses.music ?? DEFAULT_SETTINGS.buses.music,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function serializeSettings(s: SoundSettings): string {
  return JSON.stringify(s);
}

export function loadSettings(): SoundSettings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can throw outright (privacy modes); silence is not worth a crash.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSettings(s));
  } catch {
    // Best-effort: a full or forbidden store loses persistence, not sound.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sound/settings.ts packages/web/src/sound/settings.test.ts
git commit -m "feat(web): sound settings that survive a reload

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Director — events in, commands out

**Files:**
- Create: `packages/web/src/sound/director.ts`
- Test: `packages/web/src/sound/director.test.ts`

**Interfaces:**
- Consumes: `GameSoundEvent`, `SoundCommand` from `./types.js`; `VoiceParams`, `babble`, `signaturePhrase` from `./voice.js`.
- Produces: `DirectorCtx { now; camX; viewW; unlocked; rand }`, `DirectorState`, `initialDirectorState(): DirectorState`, `direct(state, ev, ctx): { state: DirectorState; commands: SoundCommand[] }`, `panFor(x, camX, viewW): { pan: number; attenuation: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/director.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/director.test.ts`
Expected: FAIL — cannot resolve `./director.js`.

- [ ] **Step 3: Write `director.ts`**

```ts
// packages/web/src/sound/director.ts
import type { GameSoundEvent, SoundCommand } from './types.js';
import { babble, signaturePhrase, type Syllable, type VoiceParams } from './voice.js';

/**
 * The deciding half of the engine, spec §2: game events in, plain commands
 * out. Pure — state is threaded explicitly so every rule here is testable
 * without an AudioContext in the room.
 */
export interface DirectorCtx {
  /** The player's clock (AudioContext.currentTime), seconds. */
  now: number;
  camX: number;
  viewW: number;
  /** False until the first user gesture. Locked events are dropped, never queued. */
  unlocked: boolean;
  rand: () => number;
}

export interface DirectorState {
  /** Last emission time per cooldown group ('chime' is the only one so far). */
  lastAt: Record<string, number>;
  /** End times of in-flight voice one-shots, for the 8-voice cap. */
  voiceEnds: number[];
  /** Per-creature Poisson deadline for idle chirps. */
  idleNextAt: Record<string, number>;
  /** The village-wide idle-chirp gap: at most one per 8s. */
  lastIdleAt: number;
}

export function initialDirectorState(): DirectorState {
  return { lastAt: {}, voiceEnds: [], idleNextAt: {}, lastIdleAt: -Infinity };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Spec §4's two spatial rules in one place: pan leans with distance from the
 * camera centre, and gain fades to nothing beyond ~1.4 screen-widths — the
 * audio version of "no landing puff for a landing nobody saw".
 */
export function panFor(x: number, camX: number, viewW: number): { pan: number; attenuation: number } {
  const d = (x - camX) / viewW;
  return {
    pan: clamp(d * 1.6, -1, 1),
    attenuation: clamp(1 - Math.abs(d) / 1.4, 0, 1),
  };
}

const CHIME_SPACING = 0.6;
const VOICE_CAP = 8;
const IDLE_VILLAGE_GAP = 8;
const IDLE_MEAN_WAIT = 45;

function syllableCommands(
  syllables: Syllable[], vp: VoiceParams, pan: number, att: number, gainMul: number, at = 0,
): SoundCommand[] {
  return syllables.map((s) => ({
    patch: 'syllable' as const,
    bus: 'voices' as const,
    at: at + s.at,
    pan,
    gain: s.gain * att * gainMul,
    freq: s.freq,
    vibrato: vp.vibrato,
    sineMix: vp.sineMix,
    breathy: vp.breathy,
  }));
}

/** How long a syllable batch occupies a voice slot, for the concurrency cap. */
const phraseEnd = (syllables: Syllable[], now: number, at = 0): number =>
  now + at + (syllables.length === 0 ? 0 : syllables[syllables.length - 1]!.at + 0.16);

export function direct(
  state: DirectorState, ev: GameSoundEvent, ctx: DirectorCtx,
): { state: DirectorState; commands: SoundCommand[] } {
  // Locked = dropped, spec §2: a village that "caught up" on unlock would be
  // a burst of noise. State is untouched so the first unlocked event starts clean.
  if (!ctx.unlocked) return { state, commands: [] };

  const spatial = (x: number) => panFor(x, ctx.camX, ctx.viewW);
  /** Push a chime-group emission out past the last one, spec §4's cooldown. */
  const chimeDelay = (): { at: number; next: DirectorState } => {
    const last = state.lastAt['chime'] ?? -Infinity;
    const at = Math.max(0, last + CHIME_SPACING - ctx.now);
    return { at, next: { ...state, lastAt: { ...state.lastAt, chime: ctx.now + at } } };
  };
  const activeVoices = state.voiceEnds.filter((end) => end > ctx.now).length;
  const trackVoice = (s: DirectorState, end: number): DirectorState => ({
    ...s,
    voiceEnds: [...s.voiceEnds.filter((e) => e > ctx.now), end],
  });

  switch (ev.type) {
    case 'hop-landed': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'thump', bus: 'sfx', at: 0, pan, gain: 0.22 * attenuation, from: 120, to: 52, dur: 0.12 },
          { patch: 'noiseBurst', bus: 'sfx', at: 0.12, pan, gain: 0.06 * attenuation, filter: 'bandpass', freq: 420, q: 0.8, dur: 0.09 },
        ],
      };
    }
    case 'takeoff': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'noiseBurst', bus: 'sfx', at: 0, pan, gain: 0.04 * attenuation, filter: 'bandpass', freq: 600, q: 0.7, dur: 0.25 },
        ],
      };
    }
    case 'touch-down': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'thump', bus: 'sfx', at: 0, pan, gain: 0.12 * attenuation, from: 120, to: 52, dur: 0.12 },
        ],
      };
    }
    case 'sleep-start': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      // The breath sits near §10's 480Hz, nudged by the sleeper's register.
      const freq = clamp(480 * (ev.voice.basePitch / 640), 350, 650);
      return {
        state,
        commands: [{ patch: 'breathSwell', bus: 'sfx', at: 0, pan, gain: 0.05 * attenuation, freq }],
      };
    }
    case 'speak': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const syllables = babble(ev.voice, ev.textLength, ctx.rand);
      // Chat babble is never dropped by the cap — spec §7 — but it still occupies a slot.
      return {
        state: trackVoice(state, phraseEnd(syllables, ctx.now)),
        commands: syllableCommands(syllables, ev.voice, pan, attenuation, ev.canned ? 0.75 : 1),
      };
    }
    case 'greeting': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0 || activeVoices >= VOICE_CAP) return { state, commands: [] };
      const syllables = signaturePhrase(ev.voice);
      return {
        state: trackVoice(state, phraseEnd(syllables, ctx.now)),
        commands: syllableCommands(syllables, ev.voice, pan, attenuation, 1),
      };
    }
    case 'thinking': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      // §10: two syllables of the creature's own voice, an octave down, quiet.
      const blip: Syllable[] = [
        { at: 0, freq: ev.voice.basePitch * 0.5, gain: 0.06 },
        { at: 0.07, freq: ev.voice.basePitch * 0.5, gain: 0.06 },
      ];
      return { state, commands: syllableCommands(blip, ev.voice, pan, attenuation, 1) };
    }
    case 'bubble-in': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [{ patch: 'blip', bus: 'sfx', at: 0, pan, gain: 0.05 * attenuation, from: 520, to: 880, dur: 0.05 }],
      };
    }
    case 'bubble-out': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [{ patch: 'blip', bus: 'sfx', at: 0, pan, gain: 0.035 * attenuation, from: 880, to: 520, dur: 0.05 }],
      };
    }
    case 'chat-open':
      return { state, commands: [{ patch: 'thump', bus: 'sfx', at: 0, pan: 0, gain: 0.1, from: 320, to: 180, dur: 0.06 }] };
    case 'chat-close':
      return { state, commands: [{ patch: 'thump', bus: 'sfx', at: 0, pan: 0, gain: 0.07, from: 240, to: 150, dur: 0.06 }] };
    case 'chat-send':
      return { state, commands: [{ patch: 'noiseBurst', bus: 'sfx', at: 0, pan: 0, gain: 0.05, filter: 'highpass', freq: 1800, q: 0.7, dur: 0.03 }] };
    case 'moved-in': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const { at, next } = chimeDelay();
      // §10: E5 then B5 120ms apart, then the newcomer introduces itself.
      const phrase = signaturePhrase(ev.voice);
      return {
        state: trackVoice(next, phraseEnd(phrase, ctx.now, at + 0.45)),
        commands: [
          { patch: 'boxNote', bus: 'sfx', at, pan, gain: 0.05 * attenuation, freq: 659.25 },
          { patch: 'boxNote', bus: 'sfx', at: at + 0.12, pan, gain: 0.045 * attenuation, freq: 987.77 },
          ...syllableCommands(phrase, ev.voice, pan, attenuation, 1, at + 0.45),
        ],
      };
    }
    case 'stage-up': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const { at, next } = chimeDelay();
      // §10: C5–E5–G5, 140ms apart.
      return {
        state: next,
        commands: [523.25, 659.25, 783.99].map((freq, i) => ({
          patch: 'boxNote' as const, bus: 'sfx' as const,
          at: at + i * 0.14, pan, gain: 0.055 * attenuation, freq,
        })),
      };
    }
    case 'offline':
      return { state, commands: [{ patch: 'tone', bus: 'sfx', at: 0, pan: 0, gain: 0.07, freq: 160, attack: 0.15, decay: 0.9 }] };
    case 'reconnected':
      return {
        state,
        commands: [
          { patch: 'tone', bus: 'sfx', at: 0, pan: 0, gain: 0.05, freq: 392, attack: 0.02, decay: 0.3 },
          { patch: 'tone', bus: 'sfx', at: 0.11, pan: 0, gain: 0.05, freq: 587.33, attack: 0.02, decay: 0.3 },
        ],
      };
    case 'idle-tick': {
      // Spec §3: Poisson-spaced ~45s per creature, at most one chirp per 8s
      // village-wide, dropped first when the voice cap is reached.
      let next = state;
      for (const cand of ev.candidates) {
        const deadline = next.idleNextAt[cand.id];
        if (deadline === undefined) {
          // First sighting arms the timer; -ln(U) is the exponential draw.
          next = {
            ...next,
            idleNextAt: {
              ...next.idleNextAt,
              [cand.id]: ctx.now + IDLE_MEAN_WAIT * -Math.log(Math.max(ctx.rand(), 1e-9)),
            },
          };
          continue;
        }
        if (ctx.now < deadline) continue;
        if (ctx.now - next.lastIdleAt < IDLE_VILLAGE_GAP) continue;
        const { pan, attenuation } = spatial(cand.x);
        const rearm = {
          ...next.idleNextAt,
          [cand.id]: ctx.now + IDLE_MEAN_WAIT * -Math.log(Math.max(ctx.rand(), 1e-9)),
        };
        if (attenuation === 0 || activeVoices >= VOICE_CAP) {
          next = { ...next, idleNextAt: rearm };
          continue;
        }
        // A short remark, not the full name: the first two signature syllables.
        const syllables = signaturePhrase(cand.voice).slice(0, 2)
          .map((s) => ({ ...s, gain: 0.09 }));
        next = trackVoice({ ...next, idleNextAt: rearm, lastIdleAt: ctx.now }, phraseEnd(syllables, ctx.now));
        return { state: next, commands: syllableCommands(syllables, cand.voice, pan, attenuation, 1) };
      }
      return { state: next, commands: [] };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/director.test.ts`
Expected: PASS. If the idle-chirp test's timing assumptions fail, check the exponential draw: with `rand: () => 0.5`, the first deadline is `now + 45·ln 2 ≈ now + 31.2`, so `now = 200` is past it and `now = 203.5` is inside the village gap.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sound/director.ts packages/web/src/sound/director.test.ts
git commit -m "feat(web): the sound director — events in, decisions out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Arrivals — hearing the view change

**Files:**
- Create: `packages/web/src/sound/arrivals.ts`
- Test: `packages/web/src/sound/arrivals.test.ts`

**Interfaces:**
- Consumes: `GameSoundEvent` from `./types.js`, `VoiceParams` from `./voice.js`.
- Produces: `CreatureSnapshot { id: string; stage: string; x: number; voice: VoiceParams }`, `viewSoundEvents(prevStages: Map<string, string> | null, next: CreatureSnapshot[]): GameSoundEvent[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/sound/arrivals.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/src/sound/arrivals.test.ts`
Expected: FAIL — cannot resolve `./arrivals.js`.

- [ ] **Step 3: Write `arrivals.ts`**

```ts
// packages/web/src/sound/arrivals.ts
import type { GameSoundEvent } from './types.js';
import type { VoiceParams } from './voice.js';

/**
 * What village.ts hands this on each view: just the fields the diff reads,
 * with x already resolved from the layout and the voice already derived.
 */
export interface CreatureSnapshot {
  id: string;
  stage: string;
  x: number;
  voice: VoiceParams;
}

/**
 * Diff two views into sound events. `prevStages` is null before any view has
 * been seen: the founding view — a page load — must be silent, or every
 * reload greets the player with seventy arrival chimes. An *empty* map is a
 * real (empty) village, so its first villager genuinely moves in.
 */
export function viewSoundEvents(
  prevStages: Map<string, string> | null,
  next: CreatureSnapshot[],
): GameSoundEvent[] {
  if (prevStages === null) return [];
  const out: GameSoundEvent[] = [];
  for (const c of next) {
    const before = prevStages.get(c.id);
    if (before === undefined) {
      out.push({ type: 'moved-in', x: c.x, voice: c.voice });
    } else if (before !== c.stage) {
      out.push({ type: 'stage-up', x: c.x });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/src/sound/arrivals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sound/arrivals.ts packages/web/src/sound/arrivals.test.ts
git commit -m "feat(web): hear the view change — arrivals and stage-ups

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Boundaries — the last inch stays the last inch

**Files:**
- Modify: `packages/web/src/boundaries.test.ts` (append two `it` blocks inside the existing `describe`)

**Interfaces:**
- Consumes: the existing `collectSourceFiles` helper and `SRC_DIR` constant in that file.
- Produces: nothing importable — a standing guard.

- [ ] **Step 1: Write the new guards (they should pass immediately — the tree is currently clean — but each test self-checks its own regex so a dead pattern can't rot silently)**

Append inside `describe('package boundaries', ...)`:

```ts
  it('under sound/, only player.ts touches the Web Audio API', () => {
    // The house rule, spec §2: everything that decides is pure; only the
    // last inch rings. The regex is exercised against a known-bad string so
    // this guard can never silently stop matching.
    const AUDIO_API = /\b(AudioContext|webkitAudioContext|createOscillator|createGain|StereoPannerNode)\b/;
    expect(AUDIO_API.test('new AudioContext()')).toBe(true);
    const offenders = files
      .filter((f) => f.includes('sound') && !f.endsWith('player.ts'))
      .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
      .filter(({ text }) => AUDIO_API.test(text))
      .map(({ f }) => relative(SRC_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('under sound/, only settings.ts touches localStorage', () => {
    const STORAGE = /\blocalStorage\b/;
    expect(STORAGE.test('localStorage.getItem(k)')).toBe(true);
    const offenders = files
      .filter((f) => f.includes('sound') && !f.endsWith('settings.ts'))
      .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
      .filter(({ text }) => STORAGE.test(text))
      .map(({ f }) => relative(SRC_DIR, f));
    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Run the whole boundaries file**

Run: `npx vitest run packages/web/src/boundaries.test.ts`
Expected: PASS (5 tests). Note the test files under `sound/` are also walked — they must stay free of Web Audio references too, which they are: they assert on plain command objects.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/boundaries.test.ts
git commit -m "test(web): pin the sound engine's last-inch boundary

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Player — the last inch rings

**Files:**
- Create: `packages/web/src/sound/player.ts`

**Interfaces:**
- Consumes: everything — `direct`/`initialDirectorState`/`DirectorCtx` (Task 5), `mixAt` (Task 2), `musicBar`/`musicGate`/`daySeedFor`/`BAR_SECONDS` (Task 3), `loadSettings`/`saveSettings`/`SoundSettings` (Task 4), `SoundCommand`/`GameSoundEvent`/`BusName` (Task 1).
- Produces (the facade every wiring site imports):
  - `sound.init(): void` — installs unlock + visibility listeners; call once from `main.ts`.
  - `sound.event(ev: GameSoundEvent): void`
  - `sound.setCamera(camX: number, viewW: number): void`
  - `sound.settings(): SoundSettings` / `sound.updateSettings(s: SoundSettings): void`
  - `sound.unlocked(): boolean`

No unit test: this file is the deliberately thin impure shell (like the KAPLAY glue, which is also untested); the boundaries test, `npm run typecheck`, and Task 9's `?soundcheck` page are its gates.

- [ ] **Step 1: Write `player.ts`**

```ts
// packages/web/src/sound/player.ts
import type { BusName, GameSoundEvent, SoundCommand } from './types.js';
import { direct, initialDirectorState, type DirectorState } from './director.js';
import { mixAt, type AmbienceMix } from './soundscape.js';
import { BAR_SECONDS, daySeedFor, musicBar, musicGate } from './music.js';
import { loadSettings, saveSettings, type SoundSettings } from './settings.js';

/**
 * The last inch, spec §2: the only file that touches the Web Audio API
 * (enforced by boundaries.test.ts). It executes SoundCommands, runs the
 * ambience loops against soundscape.ts's mix, and schedules music.ts's bars.
 * Nothing in here decides anything — patch shapes are §10 verbatim.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let buses: Record<BusName, GainNode> | null = null;
let noiseBuffer: AudioBuffer | null = null;
let dirState: DirectorState = initialDirectorState();
let settings: SoundSettings = loadSettings();
let cam = { x: 2150, w: 1280 };
let inited = false;

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function applySettings(): void {
  if (!masterGain || !buses) return;
  masterGain.gain.value = settings.muted ? 0 : settings.master;
  for (const name of Object.keys(buses) as BusName[]) {
    buses[name].gain.value = settings.buses[name];
  }
}

/** Every one-shot routes source → (filter) → envelope → panner → bus. */
function route(c: AudioContext, bus: BusName, pan: number): GainNode {
  const dest = c.createGain();
  const panner = new StereoPannerNode(c, { pan });
  dest.connect(panner);
  panner.connect(buses![bus]);
  return dest;
}

function playSyllable(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'syllable' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2800;
  lp.connect(dest);
  const mk = (type: OscillatorType, g0: number) => {
    const o = c.createOscillator(); o.type = type;
    // §10: bends up ~20% over 50ms then settles to 92%; vibrato 6.2Hz.
    o.frequency.setValueAtTime(cmd.freq, t0);
    o.frequency.exponentialRampToValueAtTime(cmd.freq * 1.2, t0 + 0.05);
    o.frequency.exponentialRampToValueAtTime(cmd.freq * 0.92, t0 + 0.11);
    const v = c.createOscillator(); v.frequency.value = 6.2;
    const vg = c.createGain(); vg.gain.value = cmd.vibrato;
    v.connect(vg); vg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(g0, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(lp);
    o.start(t0); o.stop(t0 + 0.16); v.start(t0); v.stop(t0 + 0.16);
  };
  mk('triangle', cmd.gain * (1 - cmd.sineMix * 0.5));
  if (cmd.sineMix > 0.15) mk('sine', cmd.gain * cmd.sineMix * 0.5);
  if (cmd.breathy) {
    const s = c.createBufferSource(); s.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cmd.freq * 1.5; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(cmd.gain * 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.13);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t0); s.stop(t0 + 0.15);
  }
}

function playThump(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'thump' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(cmd.from, t0);
  o.frequency.exponentialRampToValueAtTime(cmd.to, t0 + cmd.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.dur + 0.02);
}

function playNoiseBurst(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'noiseBurst' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = cmd.filter; f.frequency.value = cmd.freq; f.Q.value = cmd.q;
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t0); s.stop(t0 + cmd.dur + 0.01);
}

function playBreathSwell(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'breathSwell' }>): void {
  // §10: two swells 1.5s apart, 550ms rise, 750ms fall.
  const dest = route(c, cmd.bus, cmd.pan);
  for (let i = 0; i < 2; i++) {
    const t = t0 + i * 1.5;
    const s = c.createBufferSource(); s.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cmd.freq; bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(cmd.gain, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 1.3);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t); s.stop(t + 1.4);
  }
}

function playBoxNote(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'boxNote' }>): void {
  // §10: sine at f plus sine at 4f (12%), sharp attack, 1.4s decay.
  const dest = route(c, cmd.bus, cmd.pan);
  for (const [mult, gm] of [[1, 1], [4, 0.12]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = cmd.freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(cmd.gain * gm, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.4);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + 1.45);
  }
}

function playBlip(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'blip' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(cmd.from, t0);
  o.frequency.exponentialRampToValueAtTime(cmd.to, t0 + cmd.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur + 0.02);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.dur + 0.04);
}

function playTone(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'tone' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = cmd.freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(cmd.gain, t0 + cmd.attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.attack + cmd.decay);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.attack + cmd.decay + 0.05);
}

function execute(commands: SoundCommand[]): void {
  if (!ctx) return;
  for (const cmd of commands) {
    const t0 = ctx.currentTime + 0.02 + cmd.at;
    switch (cmd.patch) {
      case 'syllable': playSyllable(ctx, t0, cmd); break;
      case 'thump': playThump(ctx, t0, cmd); break;
      case 'noiseBurst': playNoiseBurst(ctx, t0, cmd); break;
      case 'breathSwell': playBreathSwell(ctx, t0, cmd); break;
      case 'boxNote': playBoxNote(ctx, t0, cmd); break;
      case 'blip': playBlip(ctx, t0, cmd); break;
      case 'tone': playTone(ctx, t0, cmd); break;
    }
  }
}

// ---------------------------------------------------------------- ambience

The continuous layers route through two chain gains — everything ambient
through `ambienceMaster → buses.ambience`, everything musical through
`musicMaster → buses.music` — so the visibility ramp and the unlock fade are
each a single `setTargetAtTime` on two nodes:

```ts
/** The visibility ramp's handles: all continuous sound hangs off these two. */
let ambienceMaster: GainNode | null = null;
let musicMaster: GainNode | null = null;

function startAmbience(c: AudioContext): void {
  ambienceMaster = c.createGain();
  ambienceMaster.gain.value = 0;
  ambienceMaster.gain.setTargetAtTime(1, c.currentTime, 0.7);
  ambienceMaster.connect(buses!.ambience);
  musicMaster = c.createGain();
  musicMaster.gain.value = 0;
  musicMaster.gain.setTargetAtTime(1, c.currentTime, 0.7);
  musicMaster.connect(buses!.music);

  // Wind: looped noise → lowpass → gain, with a slow LFO breathing ±40%.
  // The engine tick below retargets freq and gain toward the current mix,
  // so the bed lerps with the clock instead of stepping.
  const windSrc = c.createBufferSource();
  windSrc.buffer = noise(c); windSrc.loop = true;
  const windLp = c.createBiquadFilter();
  windLp.type = 'lowpass'; windLp.Q.value = 0.5;
  const windGain = c.createGain(); windGain.gain.value = 0;
  const windLfo = c.createOscillator(); windLfo.frequency.value = 0.1;
  const windLfoGain = c.createGain();
  windLfo.connect(windLfoGain); windLfoGain.connect(windGain.gain);
  windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(ambienceMaster);
  windSrc.start(); windLfo.start();

  // Crickets: two persistent §10 voices whose level follows the mix.
  const crickets = ([[4250, 38, 340, 240, 0.6], [3850, 31, 420, 380, 0.4]] as const).map(
    ([freq, amHz, onMs, offMs, share]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = c.createGain(); g.gain.value = 0;
      const am = c.createOscillator(); am.frequency.value = amHz;
      const amGain = c.createGain(); amGain.gain.value = 0;
      am.connect(amGain); amGain.connect(g.gain);
      o.connect(g); g.connect(ambienceMaster!);
      o.start(); am.start();
      let level = 0;
      const gate = () => {
        g.gain.setTargetAtTime(level, c.currentTime, 0.02);
        // Page-lifetime timers throughout this function: ambience never
        // stops, so nothing holds their handles.
        setTimeout(() => {
          g.gain.setTargetAtTime(0, c.currentTime, 0.03);
        }, onMs);
        setTimeout(gate, onMs + offMs + Math.random() * 120);
      };
      gate();
      return { setLevel(total: number) { level = total * share; amGain.gain.value = level * 0.5; } };
    },
  );

  // Birds: a Poisson scheduler over §10's songbird — sine syllables,
  // 2.1–3.7kHz, sweeps up ×1.35–1.65 or down ×0.7, at a random pan.
  let birdRate = 0;
  const song = () => {
    const n = 2 + Math.floor(Math.random() * 4);
    let t0 = c.currentTime + 0.05;
    const panner = new StereoPannerNode(c, { pan: (Math.random() - 0.5) * 1.2 });
    panner.connect(ambienceMaster!);
    for (let i = 0; i < n; i++) {
      const up = Math.random() > 0.5;
      const f1 = 2100 + Math.random() * 1600;
      const f2 = f1 * (up ? 1.35 + Math.random() * 0.3 : 0.7);
      const dur = 0.06 + Math.random() * 0.1;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g); g.connect(panner);
      o.start(t0); o.stop(t0 + dur + 0.01);
      t0 += dur + 0.02 + Math.random() * 0.06;
    }
  };
  const birdLoop = () => {
    if (birdRate > 0) song();
    // Exponential inter-song gap at the current rate; poll every 5s when silent.
    const wait = birdRate > 0 ? -Math.log(Math.max(Math.random(), 1e-9)) / birdRate : 5;
    setTimeout(birdLoop, Math.min(wait, 30) * 1000);
  };
  birdLoop();

  // Music: pad + box notes from music.ts through one warmth-following
  // lowpass, plus the §10 crackle while a passage is on.
  const padLp = c.createBiquadFilter();
  padLp.type = 'lowpass'; padLp.frequency.value = 700; padLp.Q.value = 0.4;
  padLp.connect(musicMaster);
  let nextBarAt = 0;
  let barIndex = 0;
  const crackle = () => {
    const now = new Date();
    const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (musicGate(secs) && mixAt(now).musicLevel > 0) {
      const t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = noise(c);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = c.createGain();
      g.gain.setValueAtTime(0.012, t);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.015);
      s.connect(hp); hp.connect(g); g.connect(musicMaster!);
      s.start(t); s.stop(t + 0.02);
    }
    setTimeout(crackle, 60 + Math.random() * 320);
  };
  crackle();

  // The engine tick: every 2s, retarget every continuous node toward the
  // clock's current mix. setTargetAtTime with a 3s constant makes the 2s
  // steps inaudible — the bed drifts, it never jumps.
  const tick = () => {
    const now = new Date();
    const mix = mixAt(now);
    windLp.frequency.setTargetAtTime(mix.windFreq, c.currentTime, 3);
    windGain.gain.setTargetAtTime(mix.windGain, c.currentTime, 3);
    windLfoGain.gain.setTargetAtTime(mix.windGain * 0.4, c.currentTime, 3);
    for (const cr of crickets) cr.setLevel(mix.cricketGain);
    birdRate = mix.birdRate;
    padLp.frequency.setTargetAtTime(700 - mix.musicWarmth * 150, c.currentTime, 3);
    musicMaster!.gain.setTargetAtTime(mix.musicLevel, c.currentTime, 3);

    // Bar scheduling rides the same tick: when a passage is on and the last
    // bar has elapsed, lay down the next one.
    const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (musicGate(secs) && mix.musicLevel > 0 && c.currentTime >= nextBarAt) {
      const t0 = Math.max(nextBarAt, c.currentTime + 0.05);
      for (const note of musicBar(daySeedFor(now), barIndex)) {
        if (note.kind === 'pad') {
          for (const cents of [-6, 6]) {
            const o = c.createOscillator(); o.type = 'sawtooth';
            o.frequency.value = note.freq * Math.pow(2, cents / 1200);
            const g = c.createGain();
            g.gain.setValueAtTime(0, t0 + note.at);
            g.gain.linearRampToValueAtTime(note.gain, t0 + note.at + 2.5);
            g.gain.setValueAtTime(note.gain, t0 + note.at + 5);
            g.gain.linearRampToValueAtTime(0, t0 + note.at + 8);
            o.connect(g); g.connect(padLp);
            o.start(t0 + note.at); o.stop(t0 + note.at + 8.1);
          }
        } else {
          for (const [mult, gm] of [[1, 1], [4, 0.12]] as const) {
            const o = c.createOscillator(); o.type = 'sine';
            o.frequency.value = note.freq * mult;
            const g = c.createGain();
            g.gain.setValueAtTime(note.gain * gm, t0 + note.at);
            g.gain.exponentialRampToValueAtTime(0.0008, t0 + note.at + 1.4);
            o.connect(g); g.connect(musicMaster!);
            o.start(t0 + note.at); o.stop(t0 + note.at + 1.45);
          }
        }
      }
      nextBarAt = t0 + BAR_SECONDS;
      barIndex++;
    }
    setTimeout(tick, 2000);
  };
  tick();
}
```

Then the unlock, visibility, and facade section:

```ts
function unlock(): void {
  if (ctx) return;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  buses = {
    voices: ctx.createGain(), sfx: ctx.createGain(),
    ambience: ctx.createGain(), music: ctx.createGain(),
  };
  for (const name of Object.keys(buses) as BusName[]) buses[name].connect(masterGain);
  applySettings();
  startAmbience(ctx);
}

export const sound = {
  init(): void {
    if (inited) return;
    inited = true;
    // The browser requires a gesture anyway, spec §6 — the first click of
    // any kind is the switch. { once: false } + the ctx guard rather than
    // { once: true }: a keydown and a pointerdown can race.
    const onGesture = () => unlock();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    document.addEventListener('visibilitychange', () => {
      // No sound from a tab you are not watching, spec §2. One-shots are
      // short enough to die on their own; the ramp handles the beds.
      if (!ctx || !ambienceMaster || !musicMaster) return;
      const target = document.hidden ? 0 : 1;
      ambienceMaster.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
      musicMaster.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
    });
  },
  event(ev: GameSoundEvent): void {
    // Spec §7: a muted bus is the player multiplying by zero, but a locked
    // context is a director decision — direct() drops on unlocked: false,
    // keeping "never queued" in the tested layer.
    const now = ctx ? ctx.currentTime : 0;
    const result = direct(dirState, ev, {
      now, camX: cam.x, viewW: cam.w, unlocked: ctx !== null, rand: Math.random,
    });
    dirState = result.state;
    execute(result.commands);
  },
  setCamera(camX: number, viewW: number): void {
    cam = { x: camX, w: viewW };
  },
  settings(): SoundSettings {
    return settings;
  },
  updateSettings(next: SoundSettings): void {
    settings = next;
    saveSettings(next);
    applySettings();
  },
  unlocked(): boolean {
    return ctx !== null;
  },
};
```

Assemble the file in this order: imports → module state → `noise`/`applySettings`/`route` → the seven `play*` patches → `execute` → ambience section (chain-gain version) → `unlock` → the `sound` facade. Delete the intentionally-wrong first `startAmbience` sketch; only the chain-gain version ships.

- [ ] **Step 2: Typecheck and run the boundary guard**

Run: `npm run typecheck` — expected clean.
Run: `npx vitest run packages/web/src/boundaries.test.ts` — expected PASS (player.ts is the allowed file).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/sound/player.ts
git commit -m "feat(web): the last inch rings — the Web Audio player

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: HUD, soundcheck harness, and main.ts wiring

**Files:**
- Create: `packages/web/src/sound/hud.ts`
- Create: `packages/web/src/sound/soundcheck.ts`
- Modify: `packages/web/index.html` (append CSS inside the existing `<style>` block)
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: the `sound` facade (Task 8), `DEFAULT_SETTINGS`/`SoundSettings` shape (Task 4), `voiceParamsFor` (Task 1, for soundcheck's synthetic events).
- Produces: `mountSoundHud(): void`, `mountSoundcheck(): void` — both imported only by `main.ts`.

- [ ] **Step 1: Write `hud.ts`**

```ts
// packages/web/src/sound/hud.ts
import { sound } from './player.js';
import type { BusName } from './types.js';

/**
 * The mixing desk, spec §6: one speaker button, click toggles master mute,
 * hover reveals the four bus sliders. Plain DOM like the chat panel — the
 * canvas stays a place where creatures live.
 */
export function mountSoundHud(): void {
  const root = document.createElement('div');
  root.id = 'sound-hud';
  root.innerHTML = `
    <button id="sound-mute" type="button" aria-label="Toggle sound"></button>
    <div id="sound-popover" hidden>
      <label>master <input data-bus="master" type="range" min="0" max="100"></label>
      <label>voices <input data-bus="voices" type="range" min="0" max="100"></label>
      <label>sfx <input data-bus="sfx" type="range" min="0" max="100"></label>
      <label>ambience <input data-bus="ambience" type="range" min="0" max="100"></label>
      <label>music <input data-bus="music" type="range" min="0" max="100"></label>
    </div>
  `;
  document.body.appendChild(root);

  const btn = root.querySelector<HTMLButtonElement>('#sound-mute')!;
  const popover = root.querySelector<HTMLDivElement>('#sound-popover')!;
  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];

  const render = () => {
    const s = sound.settings();
    // The dot is "audio not unlocked yet", spec §6 — not an error, a hint.
    btn.textContent = s.muted ? '🔇' : '🔊';
    btn.classList.toggle('locked', !sound.unlocked());
    for (const slider of sliders) {
      const bus = slider.dataset.bus!;
      slider.value = String(Math.round((bus === 'master' ? s.master : s.buses[bus as BusName]) * 100));
    }
  };

  btn.addEventListener('click', () => {
    const s = sound.settings();
    sound.updateSettings({ ...s, muted: !s.muted });
    render();
  });
  for (const slider of sliders) {
    slider.addEventListener('input', () => {
      const s = sound.settings();
      const v = Number(slider.value) / 100;
      const bus = slider.dataset.bus!;
      sound.updateSettings(
        bus === 'master'
          ? { ...s, master: v }
          : { ...s, buses: { ...s.buses, [bus]: v } },
      );
    });
  }
  root.addEventListener('mouseenter', () => { popover.hidden = false; });
  root.addEventListener('mouseleave', () => { popover.hidden = true; });
  // The unlock dot clears on the same first gesture that unlocks audio.
  window.addEventListener('pointerdown', () => setTimeout(render, 0), { once: true });
  render();
}
```

- [ ] **Step 2: Write `soundcheck.ts`**

```ts
// packages/web/src/sound/soundcheck.ts
import { sound } from './player.js';
import { voiceParamsFor } from './voice.js';

/**
 * Dev tuning harness, spec §8: `?soundcheck` adds trigger buttons over the
 * real engine so retuning a §10 constant doesn't require staging a hop.
 * Synthetic events fire at the camera's own x so nothing is attenuated away.
 */
export function mountSoundcheck(): void {
  if (!new URLSearchParams(location.search).has('soundcheck')) return;
  const voice = voiceParamsFor({ id: 'skill:soundcheck', kind: 'skill', appearance: { body: 'round' } });
  const agentVoice = voiceParamsFor({ id: 'agent:soundcheck', kind: 'agent', appearance: { body: 'lanky' } });
  const x = () => 2150; // Homes centre; setCamera keeps the director honest anyway.

  const panel = document.createElement('div');
  panel.id = 'soundcheck';
  const triggers: [string, () => void][] = [
    ['chirp', () => sound.event({ type: 'greeting', x: x(), voice })],
    ['agent chirp', () => sound.event({ type: 'greeting', x: x(), voice: agentVoice })],
    ['babble', () => sound.event({ type: 'speak', x: x(), voice, textLength: 90, canned: false })],
    ['thinking', () => sound.event({ type: 'thinking', x: x(), voice })],
    ['hop', () => sound.event({ type: 'hop-landed', x: x() })],
    ['sleep', () => sound.event({ type: 'sleep-start', x: x(), voice })],
    ['bubble', () => sound.event({ type: 'bubble-in', x: x() })],
    ['moved in', () => sound.event({ type: 'moved-in', x: x(), voice })],
    ['stage up', () => sound.event({ type: 'stage-up', x: x() })],
    ['offline', () => sound.event({ type: 'offline' })],
    ['reconnect', () => sound.event({ type: 'reconnected' })],
  ];
  for (const [label, fire] of triggers) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fire);
    panel.appendChild(b);
  }
  document.body.appendChild(panel);
}
```

- [ ] **Step 3: Append the CSS to `packages/web/index.html`** (inside the existing `<style>` block, after the `#silent-banner` rules; same palette comment discipline — every hex mirrors a THEME value)

```css
      #sound-hud {
        position: fixed; left: 12px; bottom: 12px; z-index: 12;
        font: 11px/1.4 'IBM Plex Mono', monospace; color: #F2E5C4;
      }
      #sound-mute {
        width: 36px; height: 36px; font-size: 16px; cursor: pointer;
        background: #F2E5C4; border: 2px solid #3A2E22; border-radius: 6px;
      }
      #sound-mute.locked::after {
        content: ''; position: absolute; margin-left: 2px; margin-top: -14px;
        width: 6px; height: 6px; border-radius: 3px; background: #D97757;
      }
      #sound-popover {
        position: absolute; bottom: 42px; left: 0; width: 170px;
        background: #F2E5C4; color: #3A2E22; border: 2px solid #3A2E22;
        border-radius: 6px; padding: 8px 10px;
      }
      #sound-popover label { display: block; margin: 4px 0; }
      #sound-popover input { width: 100%; accent-color: #D97757; }
      #soundcheck {
        position: fixed; right: 12px; bottom: 12px; z-index: 12; width: 150px;
        display: flex; flex-wrap: wrap; gap: 4px;
      }
      #soundcheck button {
        font: 10px 'IBM Plex Mono', monospace; cursor: pointer;
        background: #F2E5C4; border: 1.5px solid #3A2E22; border-radius: 4px; padding: 3px 6px;
      }
```

- [ ] **Step 4: Wire `main.ts`** — add these imports and calls; extend the status handler with offline/reconnect transitions:

```ts
import { sound } from './sound/player.js';
import { mountSoundHud } from './sound/hud.js';
import { mountSoundcheck } from './sound/soundcheck.js';
```

After `const scene = await startVillage(...)`:

```ts
sound.init();
mountSoundHud();
mountSoundcheck();
```

Replace the `onStatus` handler with:

```ts
  onStatus: (status) => {
    scene.setStatus(
      status === 'live' ? 'live' : status === 'connecting' ? 'connecting…' : 'server offline — retrying',
    );
    // Only real transitions ring, spec §4: losing a live village, or getting
    // it back. The initial 'connecting' is a pending answer, not a verdict.
    if (status === 'offline' && lastStatus === 'live') sound.event({ type: 'offline' });
    if (status === 'live' && lastStatus === 'offline') sound.event({ type: 'reconnected' });
    lastStatus = status;
  },
```

with `let lastStatus: 'connecting' | 'live' | 'offline' = 'connecting';` declared above the `connect(...)` call.

- [ ] **Step 5: Manual verification via the soundcheck harness**

Run: `npm run dev`, open `http://localhost:5173/?soundcheck`.
Check, in order: (1) the speaker button shows the clay unlock dot; (2) the first click anywhere clears it and ambience fades in over ~2s at the correct daypart (evening = crickets); (3) every soundcheck trigger makes its sound; (4) `agent chirp` is audibly higher/breathier than `chirp`; (5) the mute button silences everything instantly and un-mutes cleanly; (6) each bus slider affects only its bus; (7) hide the tab — ambience ramps out; return — it ramps back; (8) reload — volume settings survived.

- [ ] **Step 6: Typecheck, full test run, commit**

Run: `npm run typecheck` and `npm test` — both expected clean.

```bash
git add packages/web/src/sound/hud.ts packages/web/src/sound/soundcheck.ts packages/web/index.html packages/web/src/main.ts
git commit -m "feat(web): sound reaches the page — HUD, unlock, soundcheck

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Scene wiring — the village makes its own sounds

**Files:**
- Modify: `packages/web/src/scene/creature.ts`
- Modify: `packages/web/src/scene/village.ts`
- Modify: `packages/web/src/chat/panel.ts`
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: `sound` facade (Task 8), `voiceParamsFor` (Task 1), `viewSoundEvents`/`CreatureSnapshot` (Task 6).
- Produces (signature changes downstream code must match):
  - `CreatureActor.say(text: string, source?: 'llm' | 'canned'): void` (source new, optional)
  - `CreatureActor.greet(): void` (new)
  - `VillageScene.sayFor(creatureId: string, text: string, source?: 'llm' | 'canned'): void`
  - `VillageScene.greetFor(creatureId: string): void` (new)
  - `createChatPanel`'s `onBubble(creatureId: string, text: string, source: 'llm' | 'canned'): void` (source new)

- [ ] **Step 1: Wire `creature.ts`**

Add imports:

```ts
import { sound } from '../sound/player.js';
import { voiceParamsFor } from '../sound/voice.js';
```

Inside `spawnCreature`, next to `const phi = phaseFor(creature.id);`:

```ts
  // The audio half of identity, derived once like the phase offset.
  const voice = voiceParamsFor(creature);
```

At the landing-guard site (the `else if (hop.landedAt !== lastLanding)` branch that calls `puff(...)` — currently around `creature.ts:650`), add one line after the `puff` call:

```ts
          lastLanding = hop.landedAt;
          puff(k, root.pos.x, root.pos.y);
          // The same exactly-once guard scores the landing: a landing that
          // draws no puff makes no sound either (the adopt-silently branch
          // above emits nothing).
          sound.event({ type: 'hop-landed', x: at.x });
```

In the bubble machinery: where `showBubble` makes the bubble visible (it sets `bubbleShownAt = -1`), emit pop-in; where `update` retires an expired bubble (the code path that sets `bubbleText.hidden = true` when the bubble's life runs out — not the initial hidden state), emit pop-out:

```ts
    sound.event({ type: 'bubble-in', x: at.x });
```
```ts
      sound.event({ type: 'bubble-out', x: at.x });
```

The pop-out must fire only on the transition frame. If the retirement code runs every frame while hidden, guard it with the same "was visible last frame" check the fade already implies (`bubbleShownAt !== null` before nulling it).

In `setCreature`, detect behaviour transitions:

```ts
    setCreature(next) {
      const prev = behaviour;
      behaviour = behaviourFor(next);
      // Transitions ring; states don't. setCreature runs on every server
      // tick, so comparing against the previous flags is what keeps a
      // sleeping creature from snoring once per second.
      if (!prev.asleep && behaviour.asleep) {
        sound.event({ type: 'sleep-start', x: at.x, voice });
      }
      if (prev.fly !== 'roam' && behaviour.fly === 'roam') {
        sound.event({ type: 'takeoff', x: at.x });
      }
      if (prev.fly === 'roam' && behaviour.fly !== 'roam') {
        sound.event({ type: 'touch-down', x: at.x });
      }
    },
```

Extend `say` and add `greet` (and add both to the `CreatureActor` interface at the top of the file):

```ts
    say(text, source = 'llm') {
      if (text.trim() === '') return;
      showBubble(text, bubbleLifetime(text));
      sound.event({ type: 'speak', x: at.x, voice, textLength: text.length, canned: source === 'canned' });
    },
    greet() {
      sound.event({ type: 'greeting', x: at.x, voice });
    },
```

And in `think()`:

```ts
    think() {
      showBubble('…', Number.POSITIVE_INFINITY);
      sound.event({ type: 'thinking', x: at.x, voice });
    },
```

Interface additions in `CreatureActor`:

```ts
  say(text: string, source?: 'llm' | 'canned'): void;
  /** The creature's audible signature, played when the player opens chat with it. */
  greet(): void;
```

- [ ] **Step 2: Wire `village.ts`**

Add imports:

```ts
import { sound } from '../sound/player.js';
import { voiceParamsFor } from '../sound/voice.js';
import { viewSoundEvents, type CreatureSnapshot } from '../sound/arrivals.js';
```

Extend the `VillageScene` interface:

```ts
  sayFor(creatureId: string, text: string, source?: 'llm' | 'canned'): void;
  /** Play the creature's signature chirp — main.ts calls it on chat open. */
  greetFor(creatureId: string): void;
```

Above the `k.onUpdate(...)` block, add the idle-tick accumulator:

```ts
  // Idle chirps, spec §3: once a second the scene offers the director its
  // on-screen, happy, awake villagers; the director's Poisson state decides
  // who (if anyone) actually chirps.
  let lastIdleTickAt = 0;
```

Inside `k.onUpdate(() => { ... })`, after the existing hover loop and before the actor updates, add:

```ts
    sound.setCamera(k.getCamPos().x, k.width());
    if (t - lastIdleTickAt >= 1) {
      lastIdleTickAt = t;
      const camX = k.getCamPos().x;
      const halfW = k.width() / 2 + 200;
      const candidates: { id: string; x: number; voice: ReturnType<typeof voiceParamsFor> }[] = [];
      for (const [id, spot] of placements) {
        const c = known.get(id);
        if (!c) continue;
        if (Math.abs(spot.x - camX) > halfW) continue;
        if (c.stats.mood <= 75 || c.stats.energy < 25) continue;
        candidates.push({ id, x: spot.x, voice: voiceParamsFor(c) });
      }
      if (candidates.length > 0) sound.event({ type: 'idle-tick', candidates });
    }
```

In `setView`, before `known = new Map(...)` at the bottom, add the arrival diff. `prevStages` must be `null` on the first view ever, so hold it in a module-scoped-to-`startVillage` variable:

```ts
  // Declared beside `known`: null until the first view lands, so a reload
  // is not seventy arrival chimes (see arrivals.ts).
  let prevStages: Map<string, string> | null = null;
```

and at the end of `setView`:

```ts
      const snapshots: CreatureSnapshot[] = view.creatures.map((c) => ({
        id: c.id,
        stage: String((c as { stage?: unknown }).stage ?? 'adult'),
        x: spots.get(c.id)!.x,
        voice: voiceParamsFor(c),
      }));
      for (const ev of viewSoundEvents(prevStages, snapshots)) sound.event(ev);
      prevStages = new Map(view.creatures.map((c) => [c.id, c.stage]));

      known = new Map(view.creatures.map((c) => [c.id, c]));
```

Note: `Creature.stage` must be present on the wire. `protocol.ts`'s `isRenderable` does not require `stage`; the server sends it, but a defensive `String((c as { stage?: unknown }).stage ?? 'adult')` in the snapshot keeps a missing field from becoming `undefined !== undefined` noise. Use exactly that expression.

Extend the returned scene object:

```ts
    sayFor(creatureId, text, source) {
      actors.get(creatureId)?.say(text, source);
    },
    greetFor(creatureId) {
      actors.get(creatureId)?.greet();
    },
```

- [ ] **Step 3: Wire `chat/panel.ts`**

Change the `onBubble` option signature and thread the source through:

```ts
  onBubble(creatureId: string, text: string, source: 'llm' | 'canned'): void;
```

At the reply site, pass it:

```ts
          opts.onBubble(target, body.reply.text, body.reply.source);
```

Add the three chat sounds — import `sound` at the top:

```ts
import { sound } from '../sound/player.js';
```

In `open()` (after `root.hidden = false;`): `sound.event({ type: 'chat-open' });`
In both close paths — the `#chat-close` click handler and the returned `close()` — add: `sound.event({ type: 'chat-close' });`
In the submit handler, right after `render()`: `sound.event({ type: 'chat-send' });`

- [ ] **Step 4: Wire `main.ts`**

The panel's `onBubble` gains the source parameter, and chat-open plays the greeting:

```ts
const panel = createChatPanel({
  onBubble: (creatureId, text, source) => scene.sayFor(creatureId, text, source),
  onThinking: (creatureId) => scene.thinkFor(creatureId),
  onThinkingDone: (creatureId) => scene.clearThoughtFor(creatureId),
});

const scene = await startVillage({
  onCreatureClick: (creature) => {
    panel.open({ id: creature.id, label: displayName(creature) });
    // Its audible name, spec §3: the signature phrase on meeting.
    scene.greetFor(creature.id);
  },
});
```

- [ ] **Step 5: Full verification**

Run: `npm run typecheck` — clean.
Run: `npm test` — the whole suite passes (the pure sound tests plus every pre-existing test; nothing in this task changes tested behaviour, so any failure here is a regression to fix before committing).

Manual playtest (`npm run dev`, no `?soundcheck`):
1. First click fades ambience in; the daypart matches your clock.
2. A happy skill's hop lands with the thump+brush, in the correct stereo position; pan the camera away ≥1.5 screens — its landings go silent.
3. Click a creature: chat opens with the woody tap and its greeting chirp; send a message: paper tick, then thinking blip with the thought bubble, then babble with the reply bubble — canned replies audibly quieter.
4. Leave the village idle a few minutes: occasional lone idle chirps, never a chorus.
5. Stop the server: one low tone; restart it: the two-note reconnect.
6. Mute survives a reload.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/scene/creature.ts packages/web/src/scene/village.ts packages/web/src/chat/panel.ts packages/web/src/main.ts
git commit -m "feat(web): the village makes its own sounds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan notes for the reviewer

- **Spec §5 weekend seed inheritance** is deliberately deferred with the theme store (noted in `music.ts`'s header) — the ISO-week palette logic this would inherit from does not exist yet. The spec's own §5 scopes weather the same way.
- **Spec §7 concurrency cap**: enforced in the director via `voiceEnds` for greeting and idle chirps (the droppable classes); speak/babble is exempt by spec. One-shot `sfx` commands are unbounded but individually ≤1.5s and event-rate-limited upstream (cooldowns, one idle per 8s), which is the spirit of the cap.
- The throwaway A/B demo page in the session scratchpad is superseded by `?soundcheck` and is not part of the repo.
