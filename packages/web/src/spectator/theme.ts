/**
 * The spectator's own palette — the classic daytime THEME, frozen.
 *
 * The main village replaced the static `THEME` export with the live token
 * store (theme/store.ts) when time-of-day palettes landed; the spectator is
 * a standalone build with no theme store, no weather, and no clock, and its
 * look is deliberately the fixed classic day. Owning a private copy keeps it
 * that way without coupling the spectator bundle to the theme subsystem.
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
