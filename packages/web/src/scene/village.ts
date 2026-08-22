import kaplay, { type KAPLAYCtx } from 'kaplay';
import { THEME } from '../theme.js';
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

function sign(k: KAPLAYCtx, x: number, y: number, label: string, font: string) {
  block(k, x + 44, y - 34, 10, 34, THEME.wood, 3);
  block(k, x, y - 62, 100, 30, THEME.signCream, 3);
  k.add([
    k.text(label, { size: 15, font }),
    k.pos(x + 50, y - 47),
    k.anchor('center'),
    k.color(hex(k, THEME.ink)),
    k.z(4),
  ]);
}

/**
 * KAPLAY resolves a text component's `font` string with `document.fonts.check()`
 * at draw time (see the internal `resolveFont` in kaplay.mjs) and *throws*
 * "Font not found" if that check fails — there is no soft fallback once
 * loading is considered finished, and since this scene never calls
 * `k.loadFont`/`k.loadSprite`/etc, KAPLAY's asset-loading progress is always
 * already 1, so that "still loading, don't throw yet" escape hatch never
 * applies to us. `k.loadFont` itself wants a font *file* URL
 * (`loadFont("frogblock", "fonts/frogblock.ttf")` per its own doc example),
 * not a CSS family name, so it cannot register "Pixelify Sans" the way the
 * brief's draft called it. index.html already pulls both families from Google
 * Fonts, but a stylesheet `<link>` only declares the @font-face — the browser
 * fetches actual glyphs lazily, on first use. So we force that fetch with the
 * standard CSS Font Loading API and wait for it before any text is drawn; if
 * the network fails we fall back to a generic family name, which
 * `document.fonts.check()` always treats as satisfied.
 */
async function resolveWebFont(family: string, fallback: string): Promise<string> {
  try {
    await document.fonts.load(`16px "${family}"`);
  } catch {
    // Fall through — the check below is what actually decides.
  }
  return document.fonts.check(`16px "${family}"`) ? family : fallback;
}

export async function startVillage(): Promise<VillageScene> {
  const [pixelFont, monoFont] = await Promise.all([
    resolveWebFont('Pixelify Sans', 'monospace'),
    resolveWebFont('IBM Plex Mono', 'monospace'),
  ]);

  const k = kaplay({
    background: THEME.sky,
    crisp: true,
    global: false,
  });

  // Ground: a near band and a far band, so the field reads as having depth.
  block(k, 0, GROUND_Y - 40, WORLD_W, 40, THEME.groundDark, 0);
  block(k, 0, GROUND_Y, WORLD_W, k.height() * 2, THEME.ground, 0);

  for (const zone of ZONES) {
    sign(k, zone.x + zone.w / 2 - 50, GROUND_Y - 6, zone.label, pixelFont);
  }

  const homes = ZONES.find((z) => z.id === 'homes')!;
  house(k, homes.x + 180, GROUND_Y - 30, THEME.signCream, THEME.accent);
  house(k, homes.x + 900, GROUND_Y - 30, THEME.wallLilac, THEME.roofLilac);
  house(k, homes.x + 1700, GROUND_Y - 30, THEME.wallSand, THEME.roofClay);
  for (const dx of [60, 620, 1240, 2050, 2420]) tree(k, homes.x + dx, GROUND_Y - 20);

  // Drag to pan along the strip. KAPLAY binds mousedown/mousemove/mouseup
  // on the canvas element itself (e.canvas.addEventListener, see
  // kaplay.mjs) and native mouse events do not implicitly capture the
  // pointer, so releasing outside the canvas — or outside the browser
  // window entirely, an ordinary drag-past-the-edge gesture — never
  // reaches k.onMouseRelease (same canvas-scoped listener, same gap).
  // `panning` would stick at true and the camera would lurch on the next
  // bare mouse move. window-level listeners see the release wherever it
  // lands: 'mouseup' bubbles up from the canvas for any release still
  // inside the window (KAPLAY's own handler never calls
  // stopPropagation, so this also covers the ordinary in-canvas release —
  // k.onMouseRelease is redundant once this is here), 'pointercancel'
  // covers a cancelled gesture, and 'blur' covers the button being
  // released after focus has already left the window. Only k.onMouseMove
  // touches the camera, so this stays self-contained and composes cleanly
  // with any other mouse-move consumer registered on the same event (e.g.
  // a future gaze handler).
  let panning = false;
  const stopPanning = () => {
    panning = false;
  };
  k.onMouseDown('left', () => {
    panning = true;
  });
  k.onMouseMove((_pos, delta) => {
    if (!panning) return;
    const next = k.getCamPos().x - delta.x;
    k.setCamPos(k.clamp(next, k.width() / 2, WORLD_W - k.width() / 2), k.getCamPos().y);
  });
  window.addEventListener('mouseup', stopPanning);
  window.addEventListener('pointercancel', stopPanning);
  window.addEventListener('blur', stopPanning);

  const status = k.add([
    k.text('connecting…', { size: 14, font: monoFont }),
    k.pos(12, 12),
    k.fixed(),
    k.color(hex(k, THEME.ink)),
    k.z(100),
  ]);

  const counter = k.add([
    k.text('', { size: 14, font: monoFont }),
    k.pos(12, 32),
    k.fixed(),
    k.color(hex(k, THEME.ink)),
    k.z(100),
  ]);

  k.setCamPos(k.width() / 2, GROUND_Y - 160);

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
