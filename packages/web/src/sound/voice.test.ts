import { describe, it, expect } from 'vitest';
import type { BodyId } from '@village/core/visual';
import { babble, mulberry, signaturePhrase, voiceParamsFor } from './voice.js';

const skill = (id: string, body: BodyId = 'round') => ({
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
