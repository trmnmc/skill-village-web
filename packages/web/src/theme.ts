/**
 * The village's fixed palette (spec §4.1). Creature hues do not live here —
 * those come from each creature's own palette, generated in core.
 */
export const THEME = Object.freeze({
  /** Letterbox and night. */
  night: '#171310',
  /** Ink and outlines. */
  ink: '#3A2E22',
  signCream: '#F2E5C4',
  bubbleWhite: '#FFFDF4',
  wood: '#8A6B4A',
  /** The one warm highlight. Used sparingly. */
  accent: '#D97757',
  foliage: '#7FA85F',
  foliageLite: '#8FB86B',
  moss: '#9DBA77',
  /** Sky and ground, mixed from the same warm band. */
  sky: '#CFE9F5',
  ground: '#A8C68D',
  groundDark: '#8FB075',
  /** The creature's contact shadow. */
  shadow: '#5A4628',
  /** Second house. */
  wallLilac: '#E8D3EE',
  roofLilac: '#B39DDB',
  /** Third house. */
  wallSand: '#F2D8A7',
  roofClay: '#D96C57',
});

/**
 * Pixel unit: how many screen pixels one grid cell occupies. The trailer uses
 * 12 for a cinematic close-up; the village is wider, so creatures are smaller.
 */
export const U = 6;

export function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
