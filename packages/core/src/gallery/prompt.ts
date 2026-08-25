import { CROWN_IDS } from '../types.js';
import { HUES } from '../appearance/palette.js';
import { BODIES } from '../appearance/grids.js';
import { MAX_TITLE_CHARS, SKETCH_MAX, SKETCH_MIN } from './validate.js';
import type { DreamSketch, GalleryState } from './types.js';

export const EXEMPLAR_SAMPLE = 6;
export const REJECT_SAMPLE = 6;
/** Per fate, so the distillation sample stays balanced. */
export const GUIDE_SAMPLE = 20;
export const VERDICTS_PER_GUIDE = 12;
export const GUIDE_MAX_WORDS = 100;

/** Two hand-authored bodies: enough to show the house style, cheap in context. */
const PRIMER = [BODIES.round, BODIES.bean];

function renderSketch(s: DreamSketch): string {
  return [`  title: ${s.title}  crown: ${s.crown}  hue: ${s.hue}`, ...s.rows.map((r) => `  ${r}`)].join('\n');
}

function gallerySection(heading: string, sketches: DreamSketch[]): string[] {
  if (!sketches.length) return [];
  return ['', heading, ...sketches.map(renderSketch)];
}

/**
 * Everything the artist knows, assembled from gallery state alone — which is
 * what makes the whole training loop a pure function of the player's verdicts.
 */
export function sketchPrompt(gallery: GalleryState): string {
  const exemplars = gallery.stock.slice(-EXEMPLAR_SAMPLE);
  const rejects = gallery.rejects.slice(0, REJECT_SAMPLE);

  const lines = [
    'You are drawing a pixel portrait of a small creature for a village game.',
    'Everything is a character grid, one character per pixel:',
    '',
    '  X  the body, in its own colour',
    '  D  a foot',
    '  W  eye white',
    '  K  the mouth',
    '  A  a light accent',
    '  .  transparent',
    '',
    'Rules the grid must obey, or it cannot be drawn:',
    `  - between ${SKETCH_MIN} and ${SKETCH_MAX} rows, and the same in columns; every row the same length`,
    "  - exactly two 2x2 blocks of W, on the same two adjacent rows, with at least one",
    '    column between them, and no other W anywhere',
    '  - at least one K below the eyes',
    "  - the bottom row holds only D and '.', with at least two D",
    '  - D appears nowhere except the bottom row',
    '  - every drawn pixel touches the rest of the body edge-on: no floating pieces',
    '',
    'Two villagers drawn in the house style:',
    ...PRIMER.map((body) => ['', ...body.rows.map((r) => `  ${r}`)].join('\n')),
    ...gallerySection('Portraits the village kept — draw more like these:', exemplars),
    ...gallerySection('Portraits the village threw out — never draw like these:', rejects),
  ];

  if (gallery.styleGuide) {
    lines.push('', 'Art direction learned from the village so far:', gallery.styleGuide);
  }

  lines.push(
    '',
    'Draw one new creature. Reply with JSON only, no prose, matching exactly:',
    '{',
    '  "rows": ["one string per row"],',
    `  "crown": "one of: ${CROWN_IDS.join(', ')}",`,
    `  "hue": "one of: ${HUES.join(', ')}",`,
    `  "title": "a short evocative name, at most ${MAX_TITLE_CHARS} characters"`,
    '}',
  );

  return lines.join('\n');
}

/** Cadence needs no clock: it is a count against a count. */
export function guideIsDue(gallery: GalleryState): boolean {
  return gallery.verdicts.length - gallery.verdictsAtLastGuide >= VERDICTS_PER_GUIDE;
}

/**
 * The stock is uncapped and the rejects are capped at 20, so an unfiltered
 * sample would drift positive over months and teach the guide that everything
 * is beautiful. Sampling evenly per fate keeps the evidence honest.
 */
export function styleGuidePrompt(gallery: GalleryState): string {
  const kept = gallery.stock.slice(-GUIDE_SAMPLE);
  const culled = gallery.rejects.slice(0, GUIDE_SAMPLE);

  return [
    'You are the art director for a pixel village. Below are creature portraits and',
    'what happened to each: the ones the village kept, and the ones it threw out.',
    ...gallerySection('These were kept:', kept),
    ...gallerySection('These were thrown out:', culled),
    '',
    'Write the art direction these choices imply — the shape, proportion, crown and',
    'colour tendencies that keep winning, and the ones that keep losing. Say what a',
    'list of examples cannot: the generalisation behind them.',
    '',
    `Reply with at most ${GUIDE_MAX_WORDS} words of plain prose. No JSON, no lists,`,
    'no preamble. Write it as instructions to the artist.',
  ].join('\n');
}

/** One retry, with the validator's own words. Vague scolding produces vague repairs. */
export function repairPrompt(original: string, complaints: string[]): string {
  return [
    'That reply cannot be drawn. You sent:',
    '',
    original,
    '',
    'The problems, exactly:',
    ...complaints.map((c) => `  - ${c}`),
    '',
    'Send the corrected JSON only, in the same shape. Fix every problem listed.',
  ].join('\n');
}
