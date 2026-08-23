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
