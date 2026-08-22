# Skill Village M3 — Web Village Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@village/web` — the browser game that draws the villagers M2 already serves: a scrollable pixel-art village where your real skills and agents breathe, blink, look around, hop, and fly.

**Architecture:** The discipline that made M1 and M2 testable applies here, moved one layer out: **everything that decides is a pure function; only the last inch draws.** Grid composition, colour mapping, motion math, behaviour flags, layout, and the socket reducer are all pure TypeScript with no DOM — so they run under the existing `environment: 'node'` Vitest config with zero test-infra changes. The KAPLAY glue that turns their output into pixels is deliberately thin and verified by running the game, not by mocking a canvas. Creature bodies are **baked once** into textures at load, since body, crown and underside are static per creature; only eyes, wings and shadow are drawn per frame, which is what keeps 70 villagers cheap.

**Tech Stack:** TypeScript (strict), Vite 6, KAPLAY 3001, Vitest. No art assets — creatures are pixel grids from `@village/core`, props are flat rectangles.

**Spec:** `docs/superpowers/specs/2026-08-21-skill-village-web-design.md` — §2.3 (the village and its zones), §4 (creature generation), §4.0.1 (flight undersides), §4.1 (visual identity), §4.2 (motion vocabulary), §7.1 (the client).

**Visual bible:** `reference/animation-trailer/skill-village-scene.jsx` — an animated trailer that already realizes this system. Every motion constant below is copied from it. **Copy, do not reinvent.**

**Depends on:** M1 Core and M2 Server, both merged. This plan consumes `BODIES`, `CROWNS`, `FLIGHT_UNDERSIDE`, `POSTURES`, `WING`, `INK`, `derivePalette`, `HUES` and the `Creature` / `CreatureAppearance` / `Palette` types from `@village/core`, and the `GET /api/state` and `GET /ws` endpoints from `@village/server`. It re-derives none of them.

## Global Constraints

- **Node 20+**, TypeScript `strict: true`, ES modules throughout.
- **`@village/web` must never import `@village/server`.** It talks to the server over HTTP and WebSocket only. It may import `@village/core` for types and grid data.
- **Every module with a test must be DOM-free.** If a function needs `document`, `window`, `HTMLCanvasElement` or a KAPLAY handle, it belongs in a module under `src/scene/` or a `*.render.ts`, which carries no unit test. This is what keeps `environment: 'node'` working with no config change.
- **The web package holds no game truth.** It renders what the server sends and posts intents back. Derived view state (a creature's current hop phase) is fine; persisted state is not.
- **Determinism:** appearance and layout are pure functions of server data. The same village renders identically on every load — **no `Math.random()` anywhere in this package.** Per-creature variation comes from a phase offset derived from the creature id.
- **Pixel unit `U = 6`** in the village; the trailer's `U = 12` is a cinematic close-up. Crisp edges only: nearest-neighbour filtering, integer positions.
- **Colours come from `theme.ts` or a creature's own palette.** No hex literal appears anywhere else in the package.
- **Motion constants are spec values, copied exactly.** Breathing `sin(T*2.0 + phi)*0.028`, flyers `*3.1` and `0.02`, blink `(T*1000 + phi*1700) mod 3400 < 130`, hop cycle `2.6s`, wings `sin(T*16 + phi*3)*26 - 8`. Changing one is a spec change, not an implementation choice.
- **No third-party art, no tilesets, no downloads.** Props are rectangles.

---

### Task 1: The web package and the visual theme

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/theme.ts`, `packages/web/src/theme.test.ts`
- Modify: `package.json` (workspace script), `tsconfig.json` (project reference)

**Interfaces:**
- Produces: `THEME` (the §4.1 palette, frozen), `U` (pixel unit), `isHex(value: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { THEME, U, isHex } from './theme.js';

describe('isHex', () => {
  it('accepts six-digit hex', () => {
    expect(isHex('#F2E5C4')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isHex('F2E5C4')).toBe(false);
    expect(isHex('#FFF')).toBe(false);
    expect(isHex('rebeccapurple')).toBe(false);
  });
});

describe('THEME', () => {
  it('carries the ground and ink values from the spec', () => {
    expect(THEME.night).toBe('#171310');
    expect(THEME.ink).toBe('#3A2E22');
    expect(THEME.signCream).toBe('#F2E5C4');
    expect(THEME.bubbleWhite).toBe('#FFFDF4');
    expect(THEME.wood).toBe('#8A6B4A');
  });

  it('carries the single clay accent', () => {
    expect(THEME.accent).toBe('#D97757');
  });

  it('carries the nature greens', () => {
    expect(THEME.foliage).toBe('#7FA85F');
    expect(THEME.foliageLite).toBe('#8FB86B');
    expect(THEME.moss).toBe('#9DBA77');
  });

  it('is all well-formed hex', () => {
    for (const [name, value] of Object.entries(THEME)) {
      expect(isHex(value), `${name} = ${value}`).toBe(true);
    }
  });

  it('is frozen, so a scene cannot scribble on the palette', () => {
    expect(Object.isFrozen(THEME)).toBe(true);
  });
});

describe('U', () => {
  it('is a whole number of pixels, so grids land on pixel boundaries', () => {
    expect(Number.isInteger(U)).toBe(true);
    expect(U).toBe(6);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/theme.test.ts`
Expected: FAIL — cannot resolve `./theme.js`.

- [ ] **Step 3: Create the package**

Create `packages/web/package.json`:

```json
{
  "name": "@village/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@village/core": "0.1.0",
    "kaplay": "^3001.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0"
  }
}
```

Create `packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../core" }]
}
```

The `DOM` lib is here because the scene modules need it. Tested modules must still not *use* it.

Create `packages/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

/** The server owns 8262; Vite proxies to it so the browser sees one origin. */
export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
});
```

Create `packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Skill Village</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      html, body { margin: 0; height: 100%; background: #171310; overflow: hidden; }
      canvas { display: block; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Fonts come from Google Fonts and fall back to `monospace` / `sans-serif` offline; the village stays legible either way.

- [ ] **Step 4: Write the theme**

Create `packages/web/src/theme.ts`:

```ts
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
});

/**
 * Pixel unit: how many screen pixels one grid cell occupies. The trailer uses
 * 12 for a cinematic close-up; the village is wider, so creatures are smaller.
 */
export const U = 6;

export function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
```

- [ ] **Step 5: Install and run the test**

Run: `npm install`
Run: `npx vitest run packages/web/src/theme.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Register the package**

Add to the `references` array of the root `tsconfig.json`:

```json
{ "path": "./packages/web" }
```

Add to the `scripts` block of the root `package.json`:

```json
"dev:web": "vite --config packages/web/vite.config.ts"
```

- [ ] **Step 7: Commit**

```bash
git add packages/web package.json tsconfig.json package-lock.json
git commit -m "feat(web): add the web package and the village theme"
```

---

### Task 2: Colour roles

**Files:**
- Create: `packages/web/src/render/roles.ts`, `packages/web/src/render/roles.test.ts`

**Interfaces:**
- Consumes: `Palette`, `INK`, `derivePalette`, `HUES` from `@village/core`.
- Produces: `type RoleMap = Record<string, string | null>`, `roleMap(palette: Palette): RoleMap`.

A grid row is a string of colour *roles*. This turns roles into concrete colours for one creature; `.` maps to `null`, meaning "draw nothing".

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/render/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { INK, derivePalette, HUES } from '@village/core';
import { roleMap } from './roles.js';

const palette = derivePalette(HUES[0]!);

describe('roleMap', () => {
  it('paints body pixels in the creature hue', () => {
    expect(roleMap(palette).X).toBe(palette.hue);
  });

  it('paints feet in the body hue, not a darker shade', () => {
    // Spec §4: D stays a semantic marker but renders in the body colour.
    expect(roleMap(palette).D).toBe(palette.hue);
  });

  it('paints accents in the light shade', () => {
    expect(roleMap(palette).A).toBe(palette.lite);
  });

  it('uses the two shared inks, which never vary by creature', () => {
    const other = roleMap(derivePalette(HUES[3]!));
    expect(roleMap(palette).W).toBe(INK.eyeWhite);
    expect(roleMap(palette).K).toBe(INK.mouth);
    expect(other.W).toBe(INK.eyeWhite);
    expect(other.K).toBe(INK.mouth);
  });

  it('maps transparent to null so the painter can skip it', () => {
    expect(roleMap(palette)['.']).toBeNull();
  });

  it('covers every legal role', () => {
    const map = roleMap(palette);
    for (const role of ['X', 'D', 'W', 'K', 'A', '.']) {
      expect(role in map, `missing role ${role}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/render/roles.test.ts`
Expected: FAIL — cannot resolve `./roles.js`.

- [ ] **Step 3: Write the role map**

Create `packages/web/src/render/roles.ts`:

```ts
import { INK, type Palette } from '@village/core';

/** Role character to colour, or null for "draw nothing". */
export type RoleMap = Record<string, string | null>;

/**
 * One creature's colours. `D` deliberately resolves to the body hue: it marks
 * feet so a future walk cycle can find them, but the contact shadow does the
 * grounding work a darker tone used to do (spec §4).
 */
export function roleMap(palette: Palette): RoleMap {
  return {
    X: palette.hue,
    D: palette.hue,
    A: palette.lite,
    W: INK.eyeWhite,
    K: INK.mouth,
    '.': null,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/render/roles.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/render/roles.ts packages/web/src/render/roles.test.ts
git commit -m "feat(web): map creature colour roles to concrete colours"
```

---

### Task 3: Composing a creature's pixel grid

**Files:**
- Create: `packages/web/src/render/compose.ts`, `packages/web/src/render/compose.test.ts`

**Interfaces:**
- Consumes: `BODIES`, `CROWNS`, `FLIGHT_UNDERSIDE`, `POSTURES`, `CreatureAppearance`, `PostureId` from `@village/core`.
- Produces:
  - `interface ComposedGrid { rows: string[]; w: number; h: number; eyes: [EyeAnchor, EyeAnchor]; crownRows: number }`
  - `composeGrid(appearance: CreatureAppearance, posture?: PostureId): ComposedGrid`

This is the sprite compositor's brain: body plus crown plus the right underside, resolved into one rectangular character grid. It is the single most important pure function in this milestone — get it right and the drawing is trivial.

**Rules it must enforce:**
- Crown pixels sit in `crownRows` extra rows above the body, in the body role `X`.
- A **skill** keeps the body exactly as authored (feet included).
- An **agent** replaces the foot row and everything below it with `FLIGHT_UNDERSIDE[body]`, except `lanky`, which uses `POSTURES[posture]` (its resting posture by default, `trailing` while roaming).
- Every row comes out the same width, padded with `.`.
- Eye anchors shift down by `crownRows`, because the grid grew at the top.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/render/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, derivePalette, HUES, type CreatureAppearance } from '@village/core';
import { composeGrid } from './compose.js';

const palette = derivePalette(HUES[0]!);

function appearance(over: Partial<CreatureAppearance> = {}): CreatureAppearance {
  return { body: 'round', crown: 'none', palette, winged: false, restPosture: null, ...over };
}

describe('composeGrid — shape', () => {
  it('returns the body unchanged for a crownless skill', () => {
    const g = composeGrid(appearance());
    expect(g.rows).toEqual(BODIES.round.rows);
    expect(g.w).toBe(BODIES.round.w);
    expect(g.h).toBe(BODIES.round.h);
    expect(g.crownRows).toBe(0);
  });

  it('every row is the full width, whatever the body', () => {
    for (const body of ['pip', 'round', 'lanky', 'bean', 'mound', 'boxy'] as const) {
      for (const crown of ['none', 'ears', 'crest', 'tuft', 'horns'] as const) {
        const g = composeGrid(appearance({ body, crown }));
        for (const row of g.rows) {
          expect(row.length, `${body}/${crown}`).toBe(g.w);
        }
        expect(g.rows.length).toBe(g.h);
      }
    }
  });

  it('contains only legal role characters', () => {
    for (const body of ['pip', 'round', 'lanky', 'bean', 'mound', 'boxy'] as const) {
      const g = composeGrid(appearance({ body, crown: 'crest' }));
      expect(g.rows.join('')).toMatch(/^[XDWKA.]+$/);
    }
  });
});

describe('composeGrid — crowns', () => {
  it('adds the crown height above the body', () => {
    const g = composeGrid(appearance({ crown: 'ears' }));
    expect(g.crownRows).toBe(CROWNS.ears.h);
    expect(g.h).toBe(BODIES.round.h + CROWNS.ears.h);
  });

  it('draws crown cells in the body role', () => {
    const g = composeGrid(appearance({ crown: 'tuft' }));
    // tuft is one row of two pixels flanking the centre column.
    const crownRow = g.rows[0]!;
    expect(crownRow.split('').filter((ch) => ch === 'X').length).toBe(2);
  });

  it('anchors a crown correctly on the widest and narrowest bodies', () => {
    const narrow = composeGrid(appearance({ body: 'pip', crown: 'ears' }));
    const wide = composeGrid(appearance({ body: 'mound', crown: 'ears' }));
    // Ears anchor at columns 1 and w-2 on both.
    expect(narrow.rows[0]![1]).toBe('X');
    expect(narrow.rows[0]![BODIES.pip.w - 2]).toBe('X');
    expect(wide.rows[0]![1]).toBe('X');
    expect(wide.rows[0]![BODIES.mound.w - 2]).toBe('X');
  });

  it('shifts eye anchors down by the crown height', () => {
    const bare = composeGrid(appearance({ crown: 'none' }));
    const crowned = composeGrid(appearance({ crown: 'crest' }));
    expect(crowned.eyes[0].r).toBe(bare.eyes[0].r + CROWNS.crest.h);
    expect(crowned.eyes[0].c).toBe(bare.eyes[0].c);
  });
});

describe('composeGrid — flight undersides', () => {
  it('gives a winged creature a tapered underside instead of feet', () => {
    const g = composeGrid(appearance({ body: 'round', winged: true }));
    expect(g.rows.at(-1)).toBe(FLIGHT_UNDERSIDE.round[0]);
    expect(g.rows.join('')).not.toContain('D');
  });

  it('keeps feet on a skill', () => {
    const g = composeGrid(appearance({ body: 'round', winged: false }));
    expect(g.rows.join('')).toContain('D');
  });

  it('hangs a winged lanky on its resting posture', () => {
    const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: 'splayed' }));
    const tail = g.rows.slice(-POSTURES.splayed.rows.length);
    expect(tail).toEqual(POSTURES.splayed.rows);
  });

  it('sweeps a winged lanky into trailing legs while roaming', () => {
    const g = composeGrid(appearance({ body: 'lanky', winged: true, restPosture: 'stubs' }), 'trailing');
    const tail = g.rows.slice(-POSTURES.trailing.rows.length);
    expect(tail).toEqual(POSTURES.trailing.rows);
  });

  it('ignores a posture argument for a body that cannot dangle', () => {
    const g = composeGrid(appearance({ body: 'bean', winged: true, restPosture: null }), 'trailing');
    expect(g.rows.at(-1)).toBe(FLIGHT_UNDERSIDE.bean[0]);
  });

  it('is unaffected by posture when the creature is not winged', () => {
    const withPosture = composeGrid(appearance({ body: 'lanky', winged: false }), 'trailing');
    const plain = composeGrid(appearance({ body: 'lanky', winged: false }));
    expect(withPosture.rows).toEqual(plain.rows);
  });
});

describe('composeGrid — determinism', () => {
  it('returns an identical grid for identical input', () => {
    const a = composeGrid(appearance({ body: 'boxy', crown: 'horns' }));
    const b = composeGrid(appearance({ body: 'boxy', crown: 'horns' }));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/render/compose.test.ts`
Expected: FAIL — cannot resolve `./compose.js`.

- [ ] **Step 3: Write the compositor**

Create `packages/web/src/render/compose.ts`:

```ts
import {
  BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES,
  type CreatureAppearance, type EyeAnchor, type PostureId,
} from '@village/core';

export type { EyeAnchor };

export interface ComposedGrid {
  /** One string per row, one role character per pixel. All rows are `w` long. */
  rows: string[];
  w: number;
  h: number;
  /** Eye anchors, already shifted for the crown. */
  eyes: [EyeAnchor, EyeAnchor];
  /** How many rows the crown added above the body. */
  crownRows: number;
}

function pad(row: string, w: number): string {
  return row.length >= w ? row.slice(0, w) : row + '.'.repeat(w - row.length);
}

/**
 * Where the body's own base begins — the first row containing a foot pixel, or
 * for `lanky`, the first row of its legs. Everything from here down is replaced
 * when the creature flies.
 */
function baseIndex(rows: string[]): number {
  const footRow = rows.findIndex((row) => row.includes('D'));
  return footRow === -1 ? rows.length : footRow;
}

/**
 * Resolve a creature's appearance into one rectangular character grid.
 *
 * `posture` overrides a dangling creature's legs for the duration of a motion
 * state; omit it and the creature hangs in its own resting posture.
 */
export function composeGrid(
  appearance: CreatureAppearance,
  posture?: PostureId,
): ComposedGrid {
  const body = BODIES[appearance.body];
  const crown = CROWNS[appearance.crown];
  const w = body.w;

  let bodyRows = [...body.rows];

  if (appearance.winged) {
    if (appearance.body === 'lanky') {
      // Lanky has real legs, so it dangles rather than tapering. Everything from
      // the first leg row down is replaced: find the foot row, then walk back
      // over every row identical to the one just above the feet — those are the
      // legs. Any future legged body inherits this rule unchanged.
      const feet = bodyRows.findIndex((row) => row.includes('D'));
      let start = feet === -1 ? bodyRows.length : feet;
      const legRow = start > 0 ? bodyRows[start - 1] : null;
      while (legRow !== null && start > 0 && bodyRows[start - 1] === legRow) start--;

      const chosen: PostureId = posture ?? appearance.restPosture ?? 'stubs';
      bodyRows = [...bodyRows.slice(0, start), ...POSTURES[chosen].rows];
    } else {
      bodyRows = [...bodyRows.slice(0, baseIndex(bodyRows)), ...FLIGHT_UNDERSIDE[appearance.body]];
    }
  }

  // Crown rows sit above the body, drawn in the body role.
  const crownRows: string[] = [];
  if (crown.h > 0) {
    const cells = crown.cells(w);
    for (let r = -crown.h; r < 0; r++) {
      const chars = Array.from({ length: w }, () => '.');
      for (const [col, row] of cells) {
        if (row === r && col >= 0 && col < w) chars[col] = 'X';
      }
      crownRows.push(chars.join(''));
    }
  }

  const rows = [...crownRows, ...bodyRows].map((row) => pad(row, w));

  return {
    rows,
    w,
    h: rows.length,
    eyes: [
      { c: body.eyes[0].c, r: body.eyes[0].r + crown.h },
      { c: body.eyes[1].c, r: body.eyes[1].r + crown.h },
    ],
    crownRows: crown.h,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/render/compose.test.ts`
Expected: PASS — 15 tests.

If the `lanky` leg-replacement test fails, the walk-back heuristic is finding the wrong row. Print `BODIES.lanky.rows` and check which index the legs start at; the fix belongs in `composeGrid`, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/render/compose.ts packages/web/src/render/compose.test.ts
git commit -m "feat(web): compose body, crown and underside into one pixel grid"
```

---

### Task 4: Baking a grid into a texture

**Files:**
- Create: `packages/web/src/render/bake.ts`, `packages/web/src/render/bake.test.ts`

**Interfaces:**
- Consumes: `ComposedGrid`, `RoleMap`.
- Produces:
  - `interface BakedPixels { w: number; h: number; data: Uint8ClampedArray }`
  - `bakePixels(grid: ComposedGrid, map: RoleMap): BakedPixels`
  - `hexToRgb(hex: string): [number, number, number]`

`bakePixels` produces raw RGBA at **one pixel per grid cell** — no DOM involved, so it is fully testable. Task 10 hands that buffer to a canvas and scales it by `U`. Keeping the arithmetic here and the canvas call there is what lets the interesting half be tested.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/render/bake.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePalette, HUES } from '@village/core';
import { bakePixels, hexToRgb } from './bake.js';
import { roleMap } from './roles.js';
import type { ComposedGrid } from './compose.js';

const palette = derivePalette(HUES[0]!);
const map = roleMap(palette);

const tiny: ComposedGrid = {
  rows: ['X.', 'WK'],
  w: 2,
  h: 2,
  eyes: [{ c: 0, r: 0 }, { c: 1, r: 0 }],
  crownRows: 0,
};

function pixelAt(baked: { w: number; data: Uint8ClampedArray }, x: number, y: number) {
  const i = (y * baked.w + x) * 4;
  return [baked.data[i], baked.data[i + 1], baked.data[i + 2], baked.data[i + 3]];
}

describe('hexToRgb', () => {
  it('parses a six-digit hex', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#D97757')).toEqual([217, 119, 87]);
  });

  it('is case insensitive', () => {
    expect(hexToRgb('#d97757')).toEqual(hexToRgb('#D97757'));
  });
});

describe('bakePixels', () => {
  it('produces one RGBA quad per grid cell', () => {
    const baked = bakePixels(tiny, map);
    expect(baked.w).toBe(2);
    expect(baked.h).toBe(2);
    expect(baked.data.length).toBe(2 * 2 * 4);
  });

  it('paints a body pixel opaque in the creature hue', () => {
    const baked = bakePixels(tiny, map);
    const [r, g, b, a] = pixelAt(baked, 0, 0);
    expect([r, g, b]).toEqual(hexToRgb(palette.hue));
    expect(a).toBe(255);
  });

  it('leaves a transparent cell fully transparent', () => {
    const baked = bakePixels(tiny, map);
    expect(pixelAt(baked, 1, 0)[3]).toBe(0);
  });

  it('paints eye white and mouth ink', () => {
    const baked = bakePixels(tiny, map);
    expect(pixelAt(baked, 0, 1).slice(0, 3)).toEqual(hexToRgb(map.W!));
    expect(pixelAt(baked, 1, 1).slice(0, 3)).toEqual(hexToRgb(map.K!));
  });

  it('treats an unknown role as transparent rather than throwing', () => {
    const odd: ComposedGrid = { ...tiny, rows: ['?.', '..'] };
    expect(pixelAt(bakePixels(odd, map), 0, 0)[3]).toBe(0);
  });

  it('is deterministic', () => {
    expect(Array.from(bakePixels(tiny, map).data))
      .toEqual(Array.from(bakePixels(tiny, map).data));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/render/bake.test.ts`
Expected: FAIL — cannot resolve `./bake.js`.

- [ ] **Step 3: Write the baker**

Create `packages/web/src/render/bake.ts`:

```ts
import type { ComposedGrid } from './compose.js';
import type { RoleMap } from './roles.js';

export interface BakedPixels {
  w: number;
  h: number;
  /** RGBA, row-major, one pixel per grid cell. */
  data: Uint8ClampedArray;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Turn a composed grid into raw RGBA at one pixel per cell. No DOM: the caller
 * puts this on a canvas and scales it by U with nearest-neighbour filtering,
 * which is what keeps the edges crisp.
 */
export function bakePixels(grid: ComposedGrid, map: RoleMap): BakedPixels {
  const data = new Uint8ClampedArray(grid.w * grid.h * 4);

  for (let y = 0; y < grid.h; y++) {
    const row = grid.rows[y] ?? '';
    for (let x = 0; x < grid.w; x++) {
      const colour = map[row[x] ?? '.'];
      if (!colour) continue; // transparent, and unknown roles fail safe here
      const [r, g, b] = hexToRgb(colour);
      const i = (y * grid.w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  return { w: grid.w, h: grid.h, data };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/render/bake.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/render/bake.ts packages/web/src/render/bake.test.ts
git commit -m "feat(web): bake a composed grid into raw pixels"
```

---

### Task 5: The motion vocabulary

**Files:**
- Create: `packages/web/src/motion/motion.ts`, `packages/web/src/motion/motion.test.ts`

**Interfaces:**
- Produces: `phaseFor(id: string): number`, `breathe(t, phi, flying): { sx: number; sy: number }`, `isBlinking(t, phi): boolean`, `gaze(t, phi, lookAt?, selfX?): -1 | 0 | 1`, `hopState(t, t0): { dy: number; sy: number; landedAt: number | null }`, `wingAngle(t, phi): number`, `shadowSquash(dy: number): number`.

Every constant here is copied from spec §4.2 and the trailer. These are pure functions of time, which makes the whole motion system testable without a frame ever being drawn.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/motion/motion.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/motion/motion.test.ts`
Expected: FAIL — cannot resolve `./motion.js`.

- [ ] **Step 3: Write the motion module**

Create `packages/web/src/motion/motion.ts`:

```ts
/**
 * The motion vocabulary from spec §4.2, copied from the animation trailer.
 * Every function is pure in (time, phase), which is what makes the village's
 * whole feel testable without drawing a frame.
 */

const HOP_CYCLE = 2.6;
const HOP_ANTICIPATE = 0.18;
const HOP_AIRBORNE = 0.54;
const HOP_RECOVER = 0.23;
const HOP_HEIGHT = 64;

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * A stable per-creature phase offset in [0, 1). Every cycle below is shifted by
 * it, so no two creatures breathe or blink together — spec §4.2 calls this the
 * single detail that carries most of the living-community feeling.
 */
export function phaseFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Idle breathing. Volume-preserving: it widens exactly as much as it shortens. */
export function breathe(t: number, phi: number, flying: boolean): { sx: number; sy: number } {
  const sy = flying
    ? 1 + Math.sin(t * 3.1 + phi * 5) * 0.02
    : 1 + Math.sin(t * 2.0 + phi * 5) * 0.028;
  return { sx: 1 - (sy - 1) * 0.7, sy };
}

/** A 130ms blink roughly every 3.4s. */
export function isBlinking(t: number, phi: number): boolean {
  return ((t * 1000 + phi * 1700) % 3400) < 130;
}

/**
 * Which way the eyes point: -1 left, 0 centre, 1 right. With a target beyond
 * 40px the creature looks at it; otherwise a slow sine drifts the gaze around.
 */
export function gaze(t: number, phi: number, lookAt?: number, selfX?: number): -1 | 0 | 1 {
  if (lookAt != null && selfX != null && Math.abs(lookAt - selfX) > 40) {
    return lookAt > selfX ? 1 : -1;
  }
  const lk = Math.sin(t * 0.62 + phi * 2.3);
  return lk > 0.55 ? 1 : lk < -0.55 ? -1 : 0;
}

/**
 * One hop of the 2.6s cycle: anticipation squash, an arc, then a landing squash
 * that recovers. `landedAt` names the moment of the most recent landing so the
 * caller can fire exactly one puff per cycle.
 */
export function hopState(t: number, t0: number): { dy: number; sy: number; landedAt: number | null } {
  const elapsed = t - t0;
  if (elapsed < 0) return { dy: 0, sy: 1, landedAt: null };

  const p = elapsed % HOP_CYCLE;

  // One formula for the landing moment, computed the same way in every branch.
  // Deriving it per-branch instead lets float error make two expressions for the
  // same instant disagree, and the caller then fires a second puff for one hop.
  const completed = Math.floor((elapsed - HOP_ANTICIPATE - HOP_AIRBORNE) / HOP_CYCLE);
  const landedAt = completed >= 0 ? t0 + completed * HOP_CYCLE + HOP_ANTICIPATE + HOP_AIRBORNE : null;

  if (p < HOP_ANTICIPATE) {
    return { dy: 0, sy: 1 - 0.16 * (p / HOP_ANTICIPATE), landedAt };
  }

  if (p < HOP_ANTICIPATE + HOP_AIRBORNE) {
    const q = (p - HOP_ANTICIPATE) / HOP_AIRBORNE;
    return { dy: -Math.sin(q * Math.PI) * HOP_HEIGHT, sy: 1.07, landedAt };
  }

  const q = clamp((p - HOP_ANTICIPATE - HOP_AIRBORNE) / HOP_RECOVER, 0, 1);
  return { dy: 0, sy: 0.84 + 0.16 * q, landedAt };
}

/** Wing flap in degrees, mirrored per side by the caller. */
export function wingAngle(t: number, phi: number): number {
  return Math.sin(t * 16 + phi * 3) * 26 - 8;
}

/** The shadow narrows as the creature rises. This is what sells the hop as real. */
export function shadowSquash(dy: number): number {
  return clamp(1 + dy / 130, 0.55, 1);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/motion/motion.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/motion/motion.ts packages/web/src/motion/motion.test.ts
git commit -m "feat(web): implement the motion vocabulary as pure functions"
```

---

### Task 6: Behaviour flags from stats

**Files:**
- Create: `packages/web/src/motion/behaviour.ts`, `packages/web/src/motion/behaviour.test.ts`

**Interfaces:**
- Consumes: `Creature` from `@village/core`.
- Produces: `interface Behaviour { hopper: boolean; asleep: boolean; fly: 'roam' | 'hover' | null; scruffy: boolean }`, `behaviourFor(creature: Creature): Behaviour`.

Spec §4.2: *behaviours are data, not code paths*. Mood and energy select which flags are active, so a well-cared-for skill hops and a neglected one dozes. The renderer only reads flags — it never inspects stats.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/motion/behaviour.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Creature, CreatureKind } from '@village/core';
import { behaviourFor } from './behaviour.js';

function creature(over: { kind?: CreatureKind; mood?: number; energy?: number } = {}): Creature {
  const kind = over.kind ?? 'skill';
  return {
    id: `${kind}:test`,
    kind,
    name: 'test',
    nickname: '',
    appearance: {
      body: 'round', crown: 'none',
      palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
      winged: kind === 'agent', restPosture: null,
    },
    stats: { mood: over.mood ?? 70, energy: over.energy ?? 70, bond: 10, xp: 0 },
    stage: 'adult',
    personality: null,
    sourcePath: '/tmp/test',
    friendships: {},
    lastSeenAt: 0,
  };
}

describe('behaviourFor — skills', () => {
  it('hops when it is happy and rested', () => {
    const b = behaviourFor(creature({ mood: 85, energy: 80 }));
    expect(b.hopper).toBe(true);
    expect(b.asleep).toBe(false);
    expect(b.fly).toBeNull();
  });

  it('dozes when energy has bottomed out', () => {
    const b = behaviourFor(creature({ mood: 60, energy: 15 }));
    expect(b.asleep).toBe(true);
    expect(b.hopper).toBe(false);
  });

  it('stands about when it is neither delighted nor exhausted', () => {
    const b = behaviourFor(creature({ mood: 55, energy: 60 }));
    expect(b.hopper).toBe(false);
    expect(b.asleep).toBe(false);
  });

  it('looks scruffy once mood is low, without ever sleeping on its feet', () => {
    const b = behaviourFor(creature({ mood: 20, energy: 70 }));
    expect(b.scruffy).toBe(true);
    expect(b.asleep).toBe(false);
  });

  it('never flies', () => {
    expect(behaviourFor(creature({ mood: 99, energy: 99 })).fly).toBeNull();
  });
});

describe('behaviourFor — agents', () => {
  it('roams when it has the energy for it', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 80, energy: 75 })).fly).toBe('roam');
  });

  it('hovers when it is running low', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 50, energy: 35 })).fly).toBe('hover');
  });

  it('sleeps rather than flying when truly spent', () => {
    const b = behaviourFor(creature({ kind: 'agent', mood: 40, energy: 10 }));
    expect(b.asleep).toBe(true);
    expect(b.fly).toBeNull();
  });

  it('never hops, because it has no feet to hop on', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 95, energy: 95 })).hopper).toBe(false);
  });
});

describe('behaviourFor — determinism', () => {
  it('is a pure function of the creature', () => {
    const c = creature({ mood: 77, energy: 66 });
    expect(behaviourFor(c)).toEqual(behaviourFor(c));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/motion/behaviour.test.ts`
Expected: FAIL — cannot resolve `./behaviour.js`.

- [ ] **Step 3: Write the behaviour module**

Create `packages/web/src/motion/behaviour.ts`:

```ts
import type { Creature } from '@village/core';

export interface Behaviour {
  /** Skills only: bounces on a 2.6s cycle. */
  hopper: boolean;
  /** Dozing: eyes lidded, z glyphs, no other motion. */
  asleep: boolean;
  /** Agents only: crossing the village, or holding station. */
  fly: 'roam' | 'hover' | null;
  /** Visibly unkempt. Cosmetic only — nothing is ever lost to neglect. */
  scruffy: boolean;
}

const SLEEP_BELOW = 25;
const HAPPY_ABOVE = 75;
const RESTED_ABOVE = 70;
const SCRUFFY_BELOW = 35;
const ROAM_ENERGY = 60;

/**
 * Turn a creature's stats into the flags the renderer reads. Spec §4.2:
 * behaviours are data, not code paths — the renderer never sees a stat.
 */
export function behaviourFor(creature: Creature): Behaviour {
  const { mood, energy } = creature.stats;
  const flyer = creature.appearance.winged;
  const asleep = energy < SLEEP_BELOW;
  const scruffy = mood < SCRUFFY_BELOW;

  if (asleep) {
    return { hopper: false, asleep: true, fly: null, scruffy };
  }

  return {
    hopper: !flyer && mood > HAPPY_ABOVE && energy > RESTED_ABOVE,
    asleep: false,
    fly: flyer ? (energy >= ROAM_ENERGY ? 'roam' : 'hover') : null,
    scruffy,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/motion/behaviour.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/motion/behaviour.ts packages/web/src/motion/behaviour.test.ts
git commit -m "feat(web): derive behaviour flags from creature stats"
```

---

### Task 7: Village layout and zone placement

**Files:**
- Create: `packages/web/src/layout/zones.ts`, `packages/web/src/layout/zones.test.ts`

**Interfaces:**
- Produces:
  - `type ZoneId = 'homes' | 'adoption' | 'hatchery' | 'notice'`
  - `interface Zone { id: ZoneId; label: string; x: number; w: number }`
  - `ZONES: readonly Zone[]`, `WORLD_W`, `GROUND_Y`
  - `interface Spot { x: number; y: number }`
  - `placeCreatures(ids: readonly string[]): Map<string, Spot>`

The village is one wide scrollable strip. Placement is **deterministic** — the same villagers land in the same spots every load, so the village has a stable geography you can learn. Adoption, Hatchery and Notice board are scenery in M3; they gain contents in M5, M6 and M9.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/layout/zones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ZONES, WORLD_W, GROUND_Y, placeCreatures } from './zones.js';

const ids = Array.from({ length: 70 }, (_, i) => `skill:s${i}`);

describe('ZONES', () => {
  it('has the four zones from the spec, in reading order', () => {
    expect(ZONES.map((z) => z.id)).toEqual(['hatchery', 'homes', 'adoption', 'notice']);
  });

  it('carries a human label for each', () => {
    for (const zone of ZONES) expect(zone.label.length).toBeGreaterThan(0);
  });

  it('tiles the world without overlapping', () => {
    const sorted = [...ZONES].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.w);
    }
    const last = sorted.at(-1)!;
    expect(last.x + last.w).toBeLessThanOrEqual(WORLD_W);
  });

  it('puts the ground somewhere sensible', () => {
    expect(GROUND_Y).toBeGreaterThan(0);
  });
});

describe('placeCreatures', () => {
  it('places every creature', () => {
    const spots = placeCreatures(ids);
    expect(spots.size).toBe(ids.length);
    for (const id of ids) expect(spots.has(id)).toBe(true);
  });

  it('is deterministic: same input, same spots', () => {
    expect([...placeCreatures(ids)]).toEqual([...placeCreatures(ids)]);
  });

  it('keeps a creature in place when others arrive', () => {
    const before = placeCreatures(ids);
    const after = placeCreatures([...ids, 'agent:newcomer']);
    for (const id of ids) {
      expect(after.get(id)).toEqual(before.get(id));
    }
  });

  it('keeps everyone inside the homes zone', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    for (const { x } of placeCreatures(ids).values()) {
      expect(x).toBeGreaterThanOrEqual(homes.x);
      expect(x).toBeLessThanOrEqual(homes.x + homes.w);
    }
  });

  it('spreads them out rather than stacking them', () => {
    const xs = [...placeCreatures(ids).values()].map((s) => s.x);
    expect(new Set(xs).size).toBeGreaterThan(ids.length / 2);
  });

  it('varies depth so the village reads as a field, not a line', () => {
    const ys = new Set([...placeCreatures(ids).values()].map((s) => s.y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('handles an empty village', () => {
    expect(placeCreatures([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: FAIL — cannot resolve `./zones.js`.

- [ ] **Step 3: Write the layout**

Create `packages/web/src/layout/zones.ts`:

```ts
export type ZoneId = 'hatchery' | 'homes' | 'adoption' | 'notice';

export interface Zone {
  id: ZoneId;
  label: string;
  /** Left edge in world pixels. */
  x: number;
  w: number;
}

/**
 * One wide strip you scroll along. Homes is much the largest because it holds
 * every villager; the other three are scenery until their milestones fill them
 * (adoption M5, hatchery M6, notice board M9).
 */
export const ZONES: readonly Zone[] = Object.freeze([
  { id: 'hatchery', label: 'Hatchery', x: 0, w: 520 },
  { id: 'homes', label: 'Homes', x: 520, w: 2600 },
  { id: 'adoption', label: 'Adoption Center', x: 3120, w: 760 },
  { id: 'notice', label: 'Notice Board', x: 3880, w: 420 },
]);

export const WORLD_W = 4300;
/** Baseline the creatures stand on; depth rows sit just behind it. */
export const GROUND_Y = 620;

const ROWS = 4;
const ROW_DEPTH = 46;
const MARGIN = 90;

/** Same hash as the motion phase: stable, cheap, and no dependency. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Spot {
  x: number;
  y: number;
}

/**
 * Deterministic placement inside Homes. A creature's spot depends only on its
 * own id, so the village has a stable geography: your villagers are where you
 * left them, and a newcomer never shuffles everyone else along.
 */
export function placeCreatures(ids: readonly string[]): Map<string, Spot> {
  const homes = ZONES.find((z) => z.id === 'homes')!;
  const usable = homes.w - MARGIN * 2;
  const spots = new Map<string, Spot>();

  for (const id of ids) {
    const h = hash(id);
    const row = h % ROWS;
    // Two independent draws from the hash: one for the row, one for the offset.
    const along = ((h >>> 8) % 10000) / 10000;
    spots.set(id, {
      x: Math.round(homes.x + MARGIN + along * usable),
      y: GROUND_Y - row * ROW_DEPTH,
    });
  }

  return spots;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/layout/zones.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/layout/zones.ts packages/web/src/layout/zones.test.ts
git commit -m "feat(web): lay out the village zones and place villagers"
```

---

### Task 8: The server client

**Files:**
- Create: `packages/web/src/net/protocol.ts`, `packages/web/src/net/protocol.test.ts`
- Create: `packages/web/src/net/client.ts` (no unit test — it owns the socket)

**Interfaces:**
- Consumes: `GET /api/state`, `GET /ws` from `@village/server`.
- Produces:
  - `interface VillageView { creatures: Creature[]; problems: unknown[]; startupNote: string | null }`
  - `parseServerMessage(raw: string): VillageView | null`
  - `toView(payload: unknown): VillageView | null`
  - `connect(handlers): { close(): void }` from `client.ts`

The socket lives in `client.ts` and is verified by running the game. The **parsing** — the half that can silently corrupt the village — is pure and tested hard. A malformed frame must never take the village down.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/net/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseServerMessage, toView } from './protocol.js';

const creature = {
  id: 'skill:code-review',
  kind: 'skill',
  name: 'code-review',
  nickname: 'Nit',
  appearance: {
    body: 'round', crown: 'ears',
    palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
    winged: false, restPosture: null,
  },
  stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
  stage: 'adult',
  personality: null,
  sourcePath: 'C:/Users/x/.claude/skills/code-review/SKILL.md',
  friendships: {},
  lastSeenAt: 1,
};

const state = { creatures: { 'skill:code-review': creature }, problems: [], startupNote: null };

describe('toView', () => {
  it('turns the creature map into a stable, sorted list', () => {
    const many = {
      creatures: { 'skill:b': { ...creature, id: 'skill:b' }, 'skill:a': { ...creature, id: 'skill:a' } },
      problems: [],
    };
    expect(toView(many)!.creatures.map((c) => c.id)).toEqual(['skill:a', 'skill:b']);
  });

  it('carries problems and the startup note through', () => {
    const view = toView({ ...state, problems: ['bad.md'], startupNote: 'hello' })!;
    expect(view.problems).toEqual(['bad.md']);
    expect(view.startupNote).toBe('hello');
  });

  it('defaults a missing startup note to null', () => {
    expect(toView({ creatures: {}, problems: [] })!.startupNote).toBeNull();
  });

  it('accepts an empty village', () => {
    expect(toView({ creatures: {}, problems: [] })!.creatures).toEqual([]);
  });

  it('rejects a payload with no creature map', () => {
    expect(toView({ problems: [] })).toBeNull();
    expect(toView(null)).toBeNull();
    expect(toView('nope')).toBeNull();
  });

  it('skips a creature missing the fields the renderer needs', () => {
    const view = toView({ creatures: { a: { id: 'a' }, 'skill:ok': creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });
});

describe('parseServerMessage', () => {
  it('reads a state frame', () => {
    const raw = JSON.stringify({ type: 'state', state });
    expect(parseServerMessage(raw)!.creatures[0]!.id).toBe('skill:code-review');
  });

  it('ignores a frame of some other type', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'pong' }))).toBeNull();
  });

  it('survives malformed JSON rather than taking the village down', () => {
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: FAIL — cannot resolve `./protocol.js`.

- [ ] **Step 3: Write the protocol**

Create `packages/web/src/net/protocol.ts`:

```ts
import type { Creature } from '@village/core';

export interface VillageView {
  /** Sorted by id, so render order never flickers between frames. */
  creatures: Creature[];
  problems: unknown[];
  startupNote: string | null;
}

function isRenderable(value: unknown): value is Creature {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<Creature>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    (c.kind === 'skill' || c.kind === 'agent') &&
    typeof c.appearance === 'object' && c.appearance !== null &&
    typeof c.stats === 'object' && c.stats !== null
  );
}

/**
 * Turn a server state payload into what the renderer needs. Anything the
 * renderer cannot draw is dropped rather than crashing the village: one bad
 * creature must not cost you the other sixty-nine.
 */
export function toView(payload: unknown): VillageView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { creatures?: unknown; problems?: unknown; startupNote?: unknown };
  if (typeof p.creatures !== 'object' || p.creatures === null) return null;

  const creatures = Object.values(p.creatures as Record<string, unknown>)
    .filter(isRenderable)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    creatures,
    problems: Array.isArray(p.problems) ? p.problems : [],
    startupNote: typeof p.startupNote === 'string' ? p.startupNote : null,
  };
}

/** Read one WebSocket frame. Returns null for anything that is not a state frame. */
export function parseServerMessage(raw: string): VillageView | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const frame = parsed as { type?: unknown; state?: unknown };
  if (frame.type !== 'state') return null;
  return toView(frame.state);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Write the socket client**

Create `packages/web/src/net/client.ts`:

```ts
import { parseServerMessage, toView, type VillageView } from './protocol.js';

export interface ClientHandlers {
  onView(view: VillageView): void;
  onStatus(status: 'connecting' | 'live' | 'offline'): void;
}

const RETRY_MS = 2000;

/**
 * Fetch the village once so the first frame draws immediately, then follow the
 * socket for updates. A dropped socket retries forever: the server may simply
 * be restarting, and the village should reappear when it comes back.
 */
export function connect(handlers: ClientHandlers): { close(): void } {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  void fetch('/api/state')
    .then((res) => res.json())
    .then((payload) => {
      const view = toView(payload);
      if (view && !closed) handlers.onView(view);
    })
    .catch(() => handlers.onStatus('offline'));

  const open = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => handlers.onStatus('live'));
    socket.addEventListener('message', (event) => {
      const view = parseServerMessage(String(event.data));
      if (view) handlers.onView(view);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      handlers.onStatus('offline');
      retry = setTimeout(open, RETRY_MS);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  open();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/net
git commit -m "feat(web): read village state over REST and WebSocket"
```

---

### Task 9: The scene — ground, zones, props

**Files:**
- Create: `packages/web/src/scene/village.ts`
- Create: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: `THEME`, `U`, `ZONES`, `WORLD_W`, `GROUND_Y`.
- Produces: `startVillage(): Promise<VillageScene>` where `interface VillageScene { setView(view: VillageView): void; setStatus(s: string): void }`.

No unit tests here by design — this module touches KAPLAY on every line. It is verified by looking at it, which is the honest test for scenery.

- [ ] **Step 1: Write the scene**

Create `packages/web/src/scene/village.ts`:

```ts
import kaplay, { type KAPLAYCtx } from 'kaplay';
import { THEME, U } from '../theme.js';
import { ZONES, WORLD_W, GROUND_Y } from '../layout/zones.js';
import type { VillageView } from '../net/protocol.js';

export interface VillageScene {
  k: KAPLAYCtx;
  setView(view: VillageView): void;
  setStatus(status: string): void;
}

function hex(k: KAPLAYCtx, value: string) {
  return k.Color.fromHex(value);
}

/** A flat rectangle prop. Spec §4.1: props are rectangles, never sprites. */
function block(k: KAPLAYCtx, x: number, y: number, w: number, h: number, colour: string, z = 0) {
  return k.add([k.rect(w, h), k.pos(x, y), k.color(hex(k, colour)), k.z(z)]);
}

function house(k: KAPLAYCtx, x: number, y: number, wall: string, roof: string) {
  block(k, x, y - 66, 86, 66, wall, 1);
  block(k, x + 30, y - 34, 22, 34, THEME.wood, 2);
  block(k, x + 10, y - 56, 16, 14, THEME.sky, 2);
  // Roof: three stacked bars, widest at the eaves — a pixel gable.
  block(k, x - 8, y - 80, 102, 14, roof, 2);
  block(k, x + 6, y - 92, 74, 12, roof, 2);
  block(k, x + 22, y - 102, 42, 10, roof, 2);
}

function tree(k: KAPLAYCtx, x: number, y: number) {
  block(k, x + 14, y - 44, 12, 44, THEME.wood, 1);
  block(k, x, y - 96, 40, 54, THEME.foliage, 1);
  block(k, x + 8, y - 110, 24, 18, THEME.foliageLite, 1);
}

function sign(k: KAPLAYCtx, x: number, y: number, label: string) {
  block(k, x + 44, y - 34, 10, 34, THEME.wood, 3);
  block(k, x, y - 62, 100, 30, THEME.signCream, 3);
  k.add([
    k.text(label, { size: 15, font: 'village' }),
    k.pos(x + 50, y - 47),
    k.anchor('center'),
    k.color(hex(k, THEME.ink)),
    k.z(4),
  ]);
}

export async function startVillage(): Promise<VillageScene> {
  const k = kaplay({
    background: THEME.sky,
    crisp: true,
    global: false,
  });

  k.loadFont('village', 'Pixelify Sans');
  k.loadFont('mono', 'IBM Plex Mono');

  // Ground: a near band and a far band, so the field reads as having depth.
  block(k, 0, GROUND_Y - 40, WORLD_W, 40, THEME.groundDark, 0);
  block(k, 0, GROUND_Y, WORLD_W, k.height() * 2, THEME.ground, 0);

  for (const zone of ZONES) {
    sign(k, zone.x + zone.w / 2 - 50, GROUND_Y - 6, zone.label);
  }

  const homes = ZONES.find((z) => z.id === 'homes')!;
  house(k, homes.x + 180, GROUND_Y - 30, THEME.signCream, THEME.accent);
  house(k, homes.x + 900, GROUND_Y - 30, '#E8D3EE', '#B39DDB');
  house(k, homes.x + 1700, GROUND_Y - 30, '#F2D8A7', '#D96C57');
  for (const dx of [60, 620, 1240, 2050, 2420]) tree(k, homes.x + dx, GROUND_Y - 20);

  // Drag to pan along the strip.
  let panning = false;
  k.onMouseDown('left', () => { panning = true; });
  k.onMouseRelease(() => { panning = false; });
  k.onMouseMove((_pos, delta) => {
    if (!panning) return;
    const next = k.camPos().x - delta.x;
    k.camPos(k.clamp(next, k.width() / 2, WORLD_W - k.width() / 2), k.camPos().y);
  });

  const status = k.add([
    k.text('connecting…', { size: 14, font: 'mono' }),
    k.pos(12, 12),
    k.fixed(),
    k.color(hex(k, THEME.ink)),
    k.z(100),
  ]);

  const counter = k.add([
    k.text('', { size: 14, font: 'mono' }),
    k.pos(12, 32),
    k.fixed(),
    k.color(hex(k, THEME.ink)),
    k.z(100),
  ]);

  k.camPos(k.width() / 2, GROUND_Y - 160);

  return {
    k,
    setView(view) {
      counter.text = `${view.creatures.length} villagers`;
    },
    setStatus(s) {
      status.text = s;
    },
  };
}
```

**Note on the kaplay init call:** the exact option names for KAPLAY 3001 must be checked against `node_modules/kaplay/dist/declaration/types.d.ts` when implementing — pass `background`, `crisp: true`, and `global: false`, and drop anything the installed version does not accept. Do not guess; read the type.

- [ ] **Step 2: Write the entry point**

Create `packages/web/src/main.ts`:

```ts
import { startVillage } from './scene/village.js';
import { connect } from './net/client.js';

const scene = await startVillage();

connect({
  onView: (view) => scene.setView(view),
  onStatus: (status) => scene.setStatus(
    status === 'live' ? 'live' : status === 'connecting' ? 'connecting…' : 'server offline — retrying',
  ),
});
```

- [ ] **Step 3: Look at it**

Run the server and the client in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open `http://localhost:5173`.

Expected: sky, a two-band green field, four wooden signs naming the zones, three houses and five trees in Homes, `live` and `70 villagers` in the corner, and dragging pans along the strip. No creatures yet — that is Task 10.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/scene packages/web/src/main.ts
git commit -m "feat(web): draw the village ground, zones and props"
```

---

### Task 10: Creatures on screen

**Files:**
- Create: `packages/web/src/scene/creature.ts`
- Modify: `packages/web/src/scene/village.ts` (spawn and update creatures in `setView`)

**Interfaces:**
- Consumes: `composeGrid`, `bakePixels`, `roleMap`, `behaviourFor`, motion functions, `placeCreatures`.
- Produces: `interface CreatureActor { update(t: number, lookAt: number | null): void; destroy(): void }`, `spawnCreature(k, creature, spot): Promise<CreatureActor>`.

This is where the milestone becomes real. The body is baked **once** into a texture; eyes, wings and shadow are drawn per frame.

- [ ] **Step 1: Write the creature actor**

Create `packages/web/src/scene/creature.ts`:

```ts
import type { KAPLAYCtx } from 'kaplay';
import { WING, type Creature } from '@village/core';
import { U } from '../theme.js';
import { composeGrid } from '../render/compose.js';
import { bakePixels, hexToRgb } from '../render/bake.js';
import { roleMap } from '../render/roles.js';
import { behaviourFor } from '../motion/behaviour.js';
import { breathe, gaze, hopState, isBlinking, phaseFor, shadowSquash, wingAngle } from '../motion/motion.js';
import type { Spot } from '../layout/zones.js';

export interface CreatureActor {
  update(t: number, lookAt: number | null): void;
  destroy(): void;
}

/** Paint raw pixels onto a canvas so KAPLAY can load it as a sprite. */
function toCanvas(baked: { w: number; h: number; data: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = baked.w;
  canvas.height = baked.h;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(baked.data, baked.w, baked.h), 0, 0);
  return canvas;
}

function rgbaCss(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function spawnCreature(
  k: KAPLAYCtx,
  creature: Creature,
  spot: Spot,
): Promise<CreatureActor> {
  const map = roleMap(creature.appearance.palette);
  const behaviour = behaviourFor(creature);
  const phi = phaseFor(creature.id);

  // Bake the resting body once. A roaming lanky agent gets a second bake with
  // trailing legs; everyone else needs only the one.
  const restGrid = composeGrid(creature.appearance);
  const restKey = `body:${creature.id}`;
  await k.loadSprite(restKey, toCanvas(bakePixels(restGrid, map)).toDataURL());

  const dangles = creature.appearance.winged && creature.appearance.body === 'lanky';
  const roamKey = `body:${creature.id}:roam`;
  if (dangles) {
    const roamGrid = composeGrid(creature.appearance, 'trailing');
    await k.loadSprite(roamKey, toCanvas(bakePixels(roamGrid, map)).toDataURL());
  }

  const wingKey = `wing:${creature.appearance.palette.lite}`;
  if (!k.getSprite(wingKey)) {
    const wingGrid = { rows: WING, w: 4, h: 3, eyes: restGrid.eyes, crownRows: 0 };
    await k.loadSprite(wingKey, toCanvas(bakePixels(wingGrid, { X: creature.appearance.palette.lite, '.': null })).toDataURL());
  }

  const bw = restGrid.w * U;
  const bh = restGrid.h * U;

  const root = k.add([k.pos(spot.x, spot.y), k.z(spot.y)]);

  const shadow = root.add([
    k.rect(bw * 0.78, 10, { radius: 5 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(k.Color.fromHex('#5A4628')),
    k.opacity(creature.appearance.winged ? 0.1 : 0.18),
    k.z(-1),
  ]);

  const body = root.add([
    k.sprite(restKey),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(U),
  ]);

  const wings = creature.appearance.winged
    ? [-1, 1].map((side) =>
        root.add([
          k.sprite(wingKey),
          k.pos(side * (bw / 2), -bh * 0.55),
          k.anchor(side === -1 ? 'right' : 'left'),
          k.scale(U * side, U),
          k.rotate(0),
          k.z(-2),
        ]),
      )
    : [];

  // Eyes are overlaid, never baked, so they can blink and track.
  const eyes = restGrid.eyes.map((anchor) =>
    root.add([
      k.rect(U * 0.95, U * 1.15),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(k.Color.fromHex(map.K!)),
      k.z(1),
      { anchorCell: anchor },
    ]),
  );

  const lidColour = k.Color.fromHex(creature.appearance.palette.hue);
  const pupilColour = k.Color.fromHex(map.K!);

  return {
    update(t, lookAt) {
      const hop = behaviour.hopper ? hopState(t, 0) : null;
      const dy = hop ? hop.dy : 0;
      const { sx, sy } = behaviour.asleep
        ? { sx: 1, sy: 1 }
        : hop
          ? { sx: 1 - (hop.sy - 1) * 0.7, sy: hop.sy }
          : breathe(t, phi, Boolean(behaviour.fly));

      const hover = behaviour.fly ? Math.sin(t * 1.3 + phi * 4) * 10 : 0;
      body.pos.y = dy + hover;
      body.scale = k.vec2(U * sx, U * sy);

      if (dangles) {
        const wanted = behaviour.fly === 'roam' ? roamKey : restKey;
        if (body.sprite !== wanted) body.use(k.sprite(wanted));
      }

      const squash = shadowSquash(dy);
      shadow.width = bw * 0.78 * squash;
      shadow.pos.y = 0;

      const flap = wingAngle(t, phi);
      wings.forEach((wing, i) => {
        wing.angle = i === 0 ? -flap : flap;
        wing.pos.y = -bh * 0.55 + hover;
      });

      const shut = behaviour.asleep || isBlinking(t, phi);
      const look = shut ? 0 : gaze(t, phi, lookAt ?? undefined, spot.x);
      eyes.forEach((eye) => {
        const cell = (eye as unknown as { anchorCell: { c: number; r: number } }).anchorCell;
        // Grid cells are measured from the top-left; the body is anchored at its base.
        const baseX = (cell.c - restGrid.w / 2 + 1) * U;
        const baseY = (cell.r - restGrid.h + 1) * U;
        if (shut) {
          eye.width = U * 2;
          eye.height = 3;
          eye.color = pupilColour;
          eye.pos = k.vec2(baseX, baseY + U + dy + hover);
        } else {
          eye.width = U * 0.95;
          eye.height = U * 1.15;
          eye.color = pupilColour;
          eye.pos = k.vec2(baseX + look * 3.5, baseY + U * 0.55 + dy + hover);
        }
      });
      void lidColour;
    },
    destroy() {
      k.destroy(root);
    },
  };
}
```

- [ ] **Step 2: Spawn them from the scene**

In `packages/web/src/scene/village.ts`, add the imports:

```ts
import { spawnCreature, type CreatureActor } from './creature.js';
import { placeCreatures } from '../layout/zones.js';
import type { Creature } from '@village/core';
```

Then replace the returned `setView` with a version that reconciles actors against the view, and drive them from a frame loop. Add this before the `return`:

```ts
  const actors = new Map<string, CreatureActor>();
  let known = new Map<string, Creature>();
  let lookAt: number | null = null;

  k.onMouseMove((pos) => {
    lookAt = pos.x + k.camPos().x - k.width() / 2;
  });

  k.onUpdate(() => {
    const t = k.time();
    for (const actor of actors.values()) actor.update(t, lookAt);
  });
```

and use this `setView`:

```ts
    setView(view) {
      counter.text = `${view.creatures.length} villagers`;
      const spots = placeCreatures(view.creatures.map((c) => c.id));
      const seen = new Set<string>();

      for (const creature of view.creatures) {
        seen.add(creature.id);
        const before = known.get(creature.id);
        // Respawn only when the look changes; stats alone must not restart motion.
        const changed = before && JSON.stringify(before.appearance) !== JSON.stringify(creature.appearance);
        if (!actors.has(creature.id) || changed) {
          actors.get(creature.id)?.destroy();
          void spawnCreature(k, creature, spots.get(creature.id)!).then((actor) => {
            if (!seen.has(creature.id)) { actor.destroy(); return; }
            actors.set(creature.id, actor);
          });
        }
      }

      for (const [id, actor] of actors) {
        if (!seen.has(id)) { actor.destroy(); actors.delete(id); }
      }

      known = new Map(view.creatures.map((c) => [c.id, c]));
    },
```

- [ ] **Step 3: Look at it**

Run both dev servers again and open `http://localhost:5173`.

Expected: your real villagers standing in Homes across four depth rows, each breathing on its own phase, blinking independently, and their eyes following the cursor as you move it. Agents hover with flapping wings and no feet; skills stand on the ground with a shadow. Happy, rested skills hop.

If every creature moves in unison, `phaseFor` is not being applied — check that `phi` is passed to `breathe` and `isBlinking`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — no regressions.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/scene
git commit -m "feat(web): bring the villagers on screen, breathing and blinking"
```

---

### Task 11: Nameplates and punctuation

**Files:**
- Create: `packages/web/src/render/label.ts`, `packages/web/src/render/label.test.ts`
- Modify: `packages/web/src/scene/creature.ts` (nameplate, sleep glyphs, landing puff)

**Interfaces:**
- Produces: `displayName(creature): string`, `fileLabel(creature): string`.

Spec §4: a creature shows its **nickname** with the filename beneath it in mono — skills with a trailing slash because they are folders, agents with `.md`. That trailing character is how a glance tells the two apart.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/render/label.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Creature, CreatureKind } from '@village/core';
import { displayName, fileLabel } from './label.js';

function creature(kind: CreatureKind, name: string, nickname = ''): Creature {
  return {
    id: `${kind}:${name}`, kind, name, nickname,
    appearance: {
      body: 'round', crown: 'none',
      palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
      winged: kind === 'agent', restPosture: null,
    },
    stats: { mood: 70, energy: 70, bond: 0, xp: 0 },
    stage: 'adult', personality: null, sourcePath: '/x', friendships: {}, lastSeenAt: 0,
  };
}

describe('displayName', () => {
  it('prefers the nickname', () => {
    expect(displayName(creature('skill', 'brainstorming', 'Sparky'))).toBe('Sparky');
  });

  it('falls back to the filename until the LLM has named it', () => {
    expect(displayName(creature('skill', 'brainstorming'))).toBe('brainstorming');
  });
});

describe('fileLabel', () => {
  it('marks a skill as a folder', () => {
    expect(fileLabel(creature('skill', 'code-review'))).toBe('code-review/');
  });

  it('marks an agent as a markdown file', () => {
    expect(fileLabel(creature('agent', 'debugger'))).toBe('debugger.md');
  });

  it('does not double up an extension that is already there', () => {
    expect(fileLabel(creature('agent', 'debugger.md'))).toBe('debugger.md');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/render/label.test.ts`
Expected: FAIL — cannot resolve `./label.js`.

- [ ] **Step 3: Write the labels**

Create `packages/web/src/render/label.ts`:

```ts
import type { Creature } from '@village/core';

/** The name over a creature's head: its given name, or its filename until it has one. */
export function displayName(creature: Creature): string {
  return creature.nickname.trim() || creature.name;
}

/**
 * The filename beneath, in mono. Skills end in `/` because they are folders and
 * agents end in `.md` because they are files — which is how a glance tells the
 * two species apart (spec §4).
 */
export function fileLabel(creature: Creature): string {
  if (creature.kind === 'skill') return `${creature.name}/`;
  return creature.name.endsWith('.md') ? creature.name : `${creature.name}.md`;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run packages/web/src/render/label.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Add the nameplate and punctuation to the actor**

In `packages/web/src/scene/creature.ts`, import the labels and `THEME`:

```ts
import { displayName, fileLabel } from '../render/label.js';
import { THEME } from '../theme.js';
```

After the `eyes` block, add the nameplate:

```ts
  const nameplate = root.add([
    k.text(displayName(creature), { size: 13, font: 'village' }),
    k.pos(0, -bh - 26),
    k.anchor('center'),
    k.color(k.Color.fromHex(THEME.ink)),
    k.z(5),
  ]);

  root.add([
    k.text(fileLabel(creature), { size: 10, font: 'mono' }),
    k.pos(0, -bh - 12),
    k.anchor('center'),
    k.color(k.Color.fromHex(THEME.ink)),
    k.opacity(0.6),
    k.z(5),
  ]);

  // Sleep glyphs: three z's drifting up on their own offsets.
  const zzz = behaviour.asleep
    ? [0, 1, 2].map((i) =>
        root.add([
          k.text('z', { size: 12 + i * 2, font: 'mono' }),
          k.pos(bw * 0.4, -bh),
          k.anchor('center'),
          k.color(k.Color.fromHex(THEME.ink)),
          k.opacity(0.7),
          k.z(5),
          { drift: i * 0.34 },
        ]),
      )
    : [];
```

Inside `update`, after the eye block, animate the glyphs and fire the landing puff:

```ts
      for (const glyph of zzz) {
        const d = (glyph as unknown as { drift: number }).drift;
        const p = (t * 0.42 + d) % 1;
        glyph.pos = k.vec2(bw * 0.4 + p * 18, -bh - p * 40);
        glyph.opacity = 0.7 * (1 - p);
      }

      if (hop && hop.landedAt !== null && hop.landedAt !== lastLanding) {
        lastLanding = hop.landedAt;
        puff(k, root.pos.x, root.pos.y);
      }
```

Declare `let lastLanding: number | null = null;` alongside the other actor state, and add the puff helper at module scope:

```ts
/** Five cream squares on an expanding ring — the punctuation on a landing. */
function puff(k: KAPLAYCtx, x: number, y: number): void {
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const square = k.add([
      k.rect(5, 5),
      k.pos(x, y),
      k.anchor('center'),
      k.color(k.Color.fromHex(THEME.bubbleWhite)),
      k.opacity(0.9),
      k.z(4),
      k.lifespan(0.45, { fade: 0.25 }),
      k.move(k.vec2(Math.cos(angle), Math.sin(angle) * 0.5), 120),
    ]);
    void square;
  }
}
```

Also update `nameplate` opacity for scruffy creatures inside `update`:

```ts
      nameplate.opacity = behaviour.scruffy ? 0.55 : 1;
```

- [ ] **Step 6: Look at it, then run the suite**

Run both dev servers. Expected: every villager wears its name in Pixelify Sans with its filename in mono beneath — `code-review/` for skills, `debugger.md` for agents. Sleepers emit drifting z's; hoppers kick up a cream puff on landing.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/render/label.ts packages/web/src/render/label.test.ts packages/web/src/scene/creature.ts
git commit -m "feat(web): name the villagers and punctuate their motion"
```

---

### Task 12: The village is alive

**Files:**
- Create: `packages/web/src/index.ts`
- Create: `packages/web/README.md` (replace the placeholder written in M1's split)
- Modify: root `package.json` (a `dev` script that runs both)

**Interfaces:**
- Produces: the package's public surface.

- [ ] **Step 1: Write the public surface**

Create `packages/web/src/index.ts`:

```ts
export const WEB_VERSION = '0.1.0';

export * from './theme.js';
export * from './render/roles.js';
export * from './render/compose.js';
export * from './render/bake.js';
export * from './render/label.js';
export * from './motion/motion.js';
export * from './motion/behaviour.js';
export * from './layout/zones.js';
export * from './net/protocol.js';
```

Scene modules are deliberately absent: they touch KAPLAY, so nothing should import them but `main.ts`.

- [ ] **Step 2: Add a one-command dev script**

Add to the root `package.json` `scripts`:

```json
"dev": "concurrently -n server,web -c green,cyan \"npm:dev:server\" \"npm:dev:web\""
```

Install the runner:

```bash
npm install -D concurrently
```

- [ ] **Step 3: Rewrite the package README**

Replace `packages/web/README.md` with a description of what actually exists now: the pure render/motion/layout/net modules, the DOM-free testing rule, the scene modules, and the fact that the package holds no game truth. Keep the "must never import `@village/server`" line.

- [ ] **Step 4: The whole thing, end to end**

Run: `npm run dev`

Open `http://localhost:5173` and confirm every claim this milestone makes:

- Your real skills and agents are standing in the village, in stable positions.
- Nobody moves in lockstep — breathing and blinking are visibly independent.
- Eyes track the cursor as it crosses the village.
- Agents fly with flapping wings and tapered undersides; skills stand with shadows.
- Dragging pans along the strip; the four zone signs are all reachable.
- Names read correctly: nickname over filename, `/` for skills, `.md` for agents.

Then confirm the safety property M2 established still holds, because M3 must not have introduced a single write:

```bash
ls ~/.skill-village
```

Expected: `state.json`, `events.jsonl`, `shadow/` — and nothing new under `~/.claude`.

- [ ] **Step 5: Run the full suite and the typechecker**

Run: `npm test`
Expected: PASS — the M1 and M2 tests plus roughly 90 new ones.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web package.json package-lock.json
git commit -m "feat(web): complete the village and add a one-command dev script"
```

---

## Done when

- `npm test` passes, M1's and M2's tests included.
- `npm run typecheck` is clean.
- `npm run dev` brings up server and client together, and the village draws your real villagers.
- **Nobody moves in lockstep.** If the village pulses as one organism, the phase offset is not wired through, and the single most important detail in §4.2 is missing.
- **`~/.claude` is still untouched.** M3 adds no writes; verify before calling it done.
- `@village/web` never imports `@village/server`. Verify with:
  `grep -rE "from '@village/server'" packages/web/src` returns nothing.
- No `Math.random()` in the package. Verify with:
  `grep -rn "Math.random" packages/web/src` returns nothing.

## What M4 picks up

The LLM service and personality: chat panels open on the creatures this milestone draws, speech bubbles pop in over their heads on `easeOutBack` (spec §4.2), and nicknames stop falling back to filenames because Haiku writes them. The socket already carries everything a bubble needs.

## Deliberately not in M3

Chat, personality cards and nicknames (M4); the adoption catalog and installing files (M5); hatching (M6); breeding and training (M7); the Claude Code hook endpoint (M8); the autonomous scheduler and the notice board's contents (M9); the first-run cold open of §4.3, which is a polish deliverable (M11). The Adoption Center, Hatchery and Notice Board exist in M3 as **signposted scenery** — real places with nothing in them yet, so the village reads as a whole map from the first run.
