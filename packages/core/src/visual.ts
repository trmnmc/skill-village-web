/**
 * The browser-safe surface of `@village/core`: everything needed to *draw* a
 * creature, and nothing that needs Node. `packages/web` must import from
 * here, never from the package root — the root barrel (`index.ts`) also
 * re-exports `appearance/dna.ts` (Node's `crypto`) and the file/personality
 * modules (`yaml`, filesystem parsing), none of which can run in a browser.
 *
 * Keep this list exactly as narrow as what drawing needs. Never add an
 * export here that pulls in a Node builtin or a parser — that is the whole
 * point of this file existing as a separate module from `index.ts`.
 */
export * from './types.js';
export * from './appearance/grids.js';
export * from './appearance/palette.js';

// Browser-safe: gallery types and validation import only types, palette, and
// grids — no node builtins, no parsers. The web needs both to draw a sketch.
export * from './gallery/types.js';
export * from './gallery/validate.js';
