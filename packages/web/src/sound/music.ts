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
