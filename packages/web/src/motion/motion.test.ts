import { describe, it, expect } from 'vitest';
import { phaseFor, breathe, isBlinking, gaze, hopState, wingAngle, shadowSquash } from './motion.js';

describe('phaseFor', () => {
  it('is stable for the same id', () => {
    expect(phaseFor('skill:code-review')).toBe(phaseFor('skill:code-review'));
  });

  it('differs between creatures, so the village never moves in lockstep', () => {
    const phases = ['skill:a', 'skill:b', 'agent:c', 'skill:dataviz'].map(phaseFor);
    expect(new Set(phases).size).toBe(phases.length);
  });

  it('stays in [0, 1)', () => {
    for (const id of ['skill:a', 'agent:zzz', 'skill:long-name-here', '']) {
      const p = phaseFor(id);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('breathe', () => {
  it('preserves volume: widening as it shortens', () => {
    const { sx, sy } = breathe(0.3, 0.2, false);
    expect(sx).toBeCloseTo(1 - (sy - 1) * 0.7, 10);
  });

  it('stays within the spec amplitude for a walker', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 10; t += 0.01) {
      const { sy } = breathe(t, 0, false);
      min = Math.min(min, sy);
      max = Math.max(max, sy);
    }
    expect(max).toBeCloseTo(1.028, 3);
    expect(min).toBeCloseTo(0.972, 3);
  });

  it('breathes shallower and faster in flight', () => {
    let flyMax = -Infinity;
    for (let t = 0; t < 10; t += 0.01) flyMax = Math.max(flyMax, breathe(t, 0, true).sy);
    expect(flyMax).toBeCloseTo(1.02, 3);
  });
});

describe('isBlinking', () => {
  it('blinks for 130ms out of every 3400ms', () => {
    let blinks = 0;
    const stepMs = 1;
    for (let ms = 0; ms < 3400; ms += stepMs) {
      if (isBlinking(ms / 1000, 0)) blinks++;
    }
    expect(blinks).toBe(130);
  });

  it('is offset per creature, so they do not blink in unison', () => {
    const a = isBlinking(0.05, 0);
    const b = isBlinking(0.05, 0.5);
    expect(a).not.toBe(b);
  });
});

describe('gaze', () => {
  it('looks toward a target that is clearly to one side', () => {
    expect(gaze(0, 0, 900, 400)).toBe(1);
    expect(gaze(0, 0, 100, 400)).toBe(-1);
  });

  it('ignores a target that is basically here', () => {
    // Within 40px counts as centred, so eyes do not twitch at tiny movements.
    expect(gaze(0, 0, 420, 400)).toBe(0);
  });

  it('drifts on its own with no target', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 40; t += 0.05) seen.add(gaze(t, 0));
    expect(seen).toEqual(new Set([-1, 0, 1]));
  });
});

describe('hopState', () => {
  it('rests on the ground at the start of a cycle', () => {
    const s = hopState(0, 0);
    expect(s.dy).toBe(0);
  });

  it('squashes before it leaves the ground', () => {
    expect(hopState(0.1, 0).sy).toBeLessThan(1);
  });

  it('reaches its peak mid-arc, stretched', () => {
    const peak = hopState(0.18 + 0.54 / 2, 0);
    expect(peak.dy).toBeCloseTo(-64, 0);
    expect(peak.sy).toBeCloseTo(1.07, 2);
  });

  it('repeats on a 2.6 second cycle', () => {
    const a = hopState(0.4, 0);
    const b = hopState(0.4 + 2.6, 0);
    expect(b.dy).toBeCloseTo(a.dy, 6);
  });

  it('reports the landing moment once per cycle, for the puff', () => {
    const landings: number[] = [];
    let previous: number | null = null;
    for (let t = 0; t < 8; t += 1 / 60) {
      const { landedAt } = hopState(t, 0);
      if (landedAt !== null && landedAt !== previous) landings.push(landedAt);
      previous = landedAt;
    }
    expect(landings.length).toBe(3);
  });
});

describe('wingAngle', () => {
  it('sweeps between the spec bounds', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 5; t += 0.001) {
      const a = wingAngle(t, 0);
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    expect(max).toBeCloseTo(18, 0);
    expect(min).toBeCloseTo(-34, 0);
  });
});

describe('shadowSquash', () => {
  it('is full width on the ground', () => {
    expect(shadowSquash(0)).toBe(1);
  });

  it('shrinks as the creature rises, and never past the floor', () => {
    expect(shadowSquash(-26)).toBeCloseTo(1 - 26 / 130, 5);
    expect(shadowSquash(-1000)).toBe(0.55);
  });
});
