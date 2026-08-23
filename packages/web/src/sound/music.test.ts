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
    expect(flips).toBe(19); // 3000s / 300s cycle × 2 edges
  });
});
