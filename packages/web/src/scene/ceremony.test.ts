import { describe, expect, it } from 'vitest';
import {
  CONTACT_AT,
  HITSTOP_S,
  MAX_ROCK_DEG,
  PULL_S,
  WIND_S,
  WINDUP_RETREAT,
  ceremonyPreset,
  flightFrame,
  flightPoint,
  impactDone,
  impactFlash,
  impactRock,
  impactSquash,
} from './ceremony.js';

describe('ceremonyPreset', () => {
  it('defaults to a on empty search', () => expect(ceremonyPreset('')).toBe('a'));
  it('reads b', () => expect(ceremonyPreset('?ceremony=b')).toBe('b'));
  it('falls back to a on junk', () => expect(ceremonyPreset('?ceremony=zzz')).toBe('a'));
});

describe('flightFrame', () => {
  it('backs away during the windup, never forward', () => {
    for (let t = 0; t < WIND_S; t += 0.01) {
      expect(flightFrame(t).progress).toBeLessThanOrEqual(0);
    }
    expect(flightFrame(WIND_S * 0.99).progress).toBeCloseTo(-WINDUP_RETREAT, 2);
  });
  it('fades the label out across the windup', () => {
    expect(flightFrame(0).labelAlpha).toBeCloseTo(1, 5);
    expect(flightFrame(WIND_S * 0.999).labelAlpha).toBeLessThan(0.05);
  });
  it('progress rises monotonically through the pull and reaches 1', () => {
    // Stepping by an accumulated float never lands on CONTACT_AT itself, so
    // the last sample is taken deliberately rather than left to the loop.
    let prev = -1;
    for (let t = WIND_S; t < CONTACT_AT; t += 0.005) {
      const p = flightFrame(t).progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(flightFrame(CONTACT_AT - 1e-9).progress).toBeGreaterThanOrEqual(prev);
    expect(flightFrame(CONTACT_AT - 1e-9).progress).toBeCloseTo(1, 3);
  });
  it('squashes into a streak late in the pull', () => {
    const f = flightFrame(WIND_S + PULL_S * 0.85);
    expect(f.sx).toBeLessThan(0.6);
    expect(f.sy).toBeGreaterThan(1.2);
  });
  it('reports contact once past WIND_S + PULL_S', () => {
    expect(flightFrame(CONTACT_AT + 0.001).phase).toBe('contact');
  });
});

describe('flightPoint', () => {
  const from = { x: 100, y: 200 };
  const to = { x: 500, y: 150 };
  it('hits both endpoints', () => {
    expect(flightPoint(from, to, 0).x).toBeCloseTo(from.x, 6);
    expect(flightPoint(from, to, 0).y).toBeCloseTo(from.y, 6);
    expect(flightPoint(from, to, 1).x).toBeCloseTo(to.x, 6);
    expect(flightPoint(from, to, 1).y).toBeCloseTo(to.y, 6);
  });
  it('arcs above the straight line mid-flight', () => {
    expect(flightPoint(from, to, 0.5).y).toBeLessThan((from.y + to.y) / 2);
  });
});

describe('impact curves', () => {
  it('preset a: rock starts at MAX_ROCK_DEG and settles', () => {
    expect(impactRock(0, 'a')).toBeCloseTo(MAX_ROCK_DEG, 5);
    expect(Math.abs(impactRock(1.2, 'a'))).toBeLessThan(0.05);
  });
  it('preset a: never squashes', () => {
    for (let s = 0; s < 1; s += 0.05) {
      expect(impactSquash(s, 'a')).toEqual({ sx: 1, sy: 1 });
    }
  });
  it('preset b: squash and flash hold frozen through the hit-stop', () => {
    expect(impactSquash(0.001, 'b')).toEqual(impactSquash(HITSTOP_S - 0.001, 'b'));
    expect(impactFlash(0.001, 'b')).toBe(1);
    expect(impactFlash(HITSTOP_S - 0.001, 'b')).toBe(1);
  });
  it('preset b: squash releases into a decaying spring after the stop', () => {
    expect(impactSquash(HITSTOP_S + 0.001, 'b').sy).toBeLessThan(1);
    expect(Math.abs(1 - impactSquash(HITSTOP_S + 0.4, 'b').sy)).toBeLessThan(0.06);
  });
  it('flash fades within 0.2s of its hold', () => {
    expect(impactFlash(0.16, 'a')).toBeLessThan(0.01);
    expect(impactFlash(HITSTOP_S + 0.16, 'b')).toBeLessThan(0.01);
  });
  it('settles by impactDone', () => {
    expect(impactDone(1.0)).toBe(false);
    expect(impactDone(1.21)).toBe(true);
  });
});
