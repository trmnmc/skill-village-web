import type { CrownId } from '../types.js';

/** A candidate creature design: what the peddler carries and the player judges. */
export interface DreamSketch {
  /** `sketch-000042`, minted from GalleryState.nextSketchNumber. Never random. */
  id: string;
  /** The body grid, authored by the model, validated before it ever lands here. */
  rows: string[];
  crown: CrownId;
  /** Always one of the curated HUES. Arbitrary hex never enters the system. */
  hue: string;
  title: string;
  /** UTC day bucket it was drawn on. */
  createdDay: string;
  /** How many judgings it has survived. At SURVIVALS_TO_KEEP it leaves the case. */
  survivals: number;
}

/** What the peddler is carrying today. */
export interface PeddlerCase {
  day: string;
  sketches: DreamSketch[];
  /** True once the player has culled today. A judged case shows no peddler. */
  judged: boolean;
}

/** One cull: evidence against one sketch, not a ranking of the others. */
export interface Verdict {
  day: string;
  culledId: string;
  survivorIds: string[];
}

/**
 * The whole hidden engine. Only `case` is ever sent to the browser — see the
 * projection in the API. `stock` is the product: the designs M5 and M6 will
 * dress new creatures from.
 */
export interface GalleryState {
  case: PeddlerCase | null;
  stock: DreamSketch[];
  /** Newest first, capped. Taste evolves; week-one uglies age out of the prompt. */
  rejects: DreamSketch[];
  verdicts: Verdict[];
  styleGuide: string | null;
  /** verdicts.length when the guide was last written, so cadence needs no clock. */
  verdictsAtLastGuide: number;
  nextSketchNumber: number;
}

export function emptyGallery(): GalleryState {
  return {
    case: null,
    stock: [],
    rejects: [],
    verdicts: [],
    styleGuide: null,
    verdictsAtLastGuide: 0,
    nextSketchNumber: 1,
  };
}

export function mintSketchId(n: number): string {
  return `sketch-${String(n).padStart(6, '0')}`;
}

/**
 * A sketch as the browser is allowed to know it: exactly what the case overlay
 * draws, and nothing else. `survivals` is withheld deliberately — a counter
 * named that in the payload is the clearest possible hint that a hidden ladder
 * exists, which is the one thing this minigame must not admit.
 */
export interface SketchView {
  id: string;
  rows: string[];
  crown: CrownId;
  hue: string;
  title: string;
}

export interface CaseView {
  day: string;
  sketches: SketchView[];
}

export function toCaseView(open: PeddlerCase): CaseView {
  return {
    day: open.day,
    sketches: open.sketches.map(({ id, rows, crown, hue, title }) => ({ id, rows, crown, hue, title })),
  };
}
