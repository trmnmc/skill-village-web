import type { KAPLAYCtx } from 'kaplay';
import { PEDDLER_GRID, PEDDLER_HUE, derivePalette } from '@village/core/visual';
import { GROUND_Y, ZONES } from '../layout/zones.js';
import { U, TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import { tokenTag, sceneryColor, creatureTintColor } from './retint.js';
import type { ComposedGrid } from '../render/compose.js';
import { bakePixels } from '../render/bake.js';
import { roleMap } from '../render/roles.js';
import { breathe } from '../motion/motion.js';
import { screenToWorld } from './camera.js';
import { createDragTracker } from '../input/drag.js';
import {
  SHADOW,
  escapeStyled,
  wrapToWidth,
  toCanvas,
  loadSprite,
  BUBBLE_SIZE,
  BUBBLE_PAD,
  BUBBLE_LEADING,
  BUBBLE_MAX_W,
  BUBBLE_LIFT,
  type CreatureFonts,
} from './creature.js';

/**
 * Just outside the Homes margin — villagers are seated from +90 — so the
 * visitor stands at the edge of the village rather than in it.
 */
export const PEDDLER_SPOT = {
  x: ZONES.find((z) => z.id === 'homes')!.x + 40,
  y: GROUND_Y,
};

/** The single cached sprite key: one peddler look, drawn once, reused every visit. */
const SPRITE_KEY = 'peddler:body';

export interface PeddlerHandle {
  /**
   * Show a line in a bubble over the peddler's head — built the same way
   * (and out of the same exported pieces: BUBBLE_*, wrapToWidth,
   * escapeStyled) `creature.ts`'s `say` does, but static: no pop-in, no
   * decay timer. The peddler says exactly one thing per visit, and the case
   * overlay opens over it in the same gesture, so there is nothing to
   * animate away.
   */
  say(text: string): void;
  destroy(): void;
}

function hex(k: KAPLAYCtx, v: string) {
  return k.Color.fromHex(v);
}

/**
 * Bake the peddler's look once and cache it under a fixed sprite key —
 * exactly `spawnCreature`'s own `k.getSprite(key)` guard (see the wing
 * sprite in creature.ts), so the second and later visits across a session
 * skip the bake/canvas/loadSprite round trip entirely.
 */
async function ensureSprite(k: KAPLAYCtx): Promise<{ w: number; h: number }> {
  const w = PEDDLER_GRID[0]!.length;
  const h = PEDDLER_GRID.length;
  if (!k.getSprite(SPRITE_KEY)) {
    // bakePixels reads only rows/w/h off a ComposedGrid — ` eyes`/`crownRows`
    // exist solely to satisfy the type, per the brief: the peddler's grid
    // already bakes its own eye-white blocks as ordinary body pixels, with
    // no overlay pupil drawn over them (a stranger's face stays unreadable,
    // which is part of how "stranger" reads).
    const grid: ComposedGrid = {
      rows: [...PEDDLER_GRID],
      w,
      h,
      eyes: [
        { c: 0, r: 0 },
        { c: 0, r: 0 },
      ],
      crownRows: 0,
    };
    const map = roleMap(derivePalette(PEDDLER_HUE));
    await loadSprite(k, SPRITE_KEY, toCanvas(bakePixels(grid, map)));
  }
  return { w, h };
}

/**
 * The visitor: drawn via the exact bake → canvas → loadSprite → k.add path
 * `creature.ts` uses for a villager (see that file's authority note), stood
 * with its feet on `PEDDLER_SPOT.y` and carrying the same fixed-hex contact
 * shadow so it reads as standing on the same ground. Unlike a villager it
 * has no eyes overlay, no wander, no hop, no wings — just `breathe`, the
 * same subtle idle motion every resting villager already uses, so it is not
 * a frozen cardboard cutout without being "animated" in any way that reads
 * as alive-and-busy. The M3 lesson is explicit: uniform animation is worse
 * than none, and this is deliberately the least motion creature.ts offers.
 */
export async function addPeddler(k: KAPLAYCtx, fonts: CreatureFonts, onClick: () => void): Promise<PeddlerHandle> {
  const { w, h } = await ensureSprite(k);
  const bw = w * U;
  const bh = h * U;

  const root = k.add([k.pos(PEDDLER_SPOT.x, PEDDLER_SPOT.y), k.z(PEDDLER_SPOT.y)]);

  root.add([
    k.rect(bw * 0.78, 10, { radius: 5 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, SHADOW)),
    k.opacity(0.18),
    k.z(-1),
  ]);

  const creatureTint = hex(k, creatureTintColor(themeStore.current().tint));

  const body = root.add([
    k.sprite(SPRITE_KEY),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(U),
    k.color(creatureTint),
    'themed:creature',
  ]);

  // The bubble: same box, same tags (so the existing retint walker owns its
  // colour), same wrap rule as a villager's — built empty and hidden, shown
  // once by `say`. No pop/decay state machine: see PeddlerHandle.say above.
  const bubbleText = root.add([
    k.text('', {
      size: BUBBLE_SIZE * TEXT_SS,
      font: fonts.mono,
      align: 'center',
      lineSpacing: BUBBLE_LEADING * TEXT_SS,
    }),
    k.pos(0, -bh - BUBBLE_LIFT - BUBBLE_PAD),
    k.anchor('bot'),
    k.scale(1 / TEXT_SS),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.z(7),
    tokenTag('ink'),
  ]);
  const bubbleBg = root.add([
    k.rect(10, 10, { radius: 6 }),
    k.pos(0, -bh - BUBBLE_LIFT),
    k.anchor('bot'),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'bubble'))),
    k.outline(2, hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.opacity(0.97),
    k.z(6.5),
    tokenTag('bubble'),
  ]);
  bubbleText.hidden = true;
  bubbleBg.hidden = true;

  // Idle breathing only — no phase stagger needed, there is only ever one.
  const updateEv = k.onUpdate(() => {
    const { sx, sy } = breathe(k.time(), 0, false);
    body.scale = k.vec2(U * sx, U * sy);
  });

  // Click detection, in the same two-tier shape village.ts's own click
  // system uses (a synchronous DOM `mousedown` to arm, a window-level
  // `mouseup` to resolve — see the long comment on village.ts's mousedown
  // block for why neither is `k.onMousePress`/`k.onClick`) but scoped to
  // this one static hit box rather than the whole creature crowd, and
  // reusing `createDragTracker` for the click-vs-drag slop rather than
  // reimplementing it.
  const tracker = createDragTracker();
  const hitsPeddler = (worldX: number, worldY: number): boolean =>
    worldX >= PEDDLER_SPOT.x - bw / 2 &&
    worldX <= PEDDLER_SPOT.x + bw / 2 &&
    worldY >= PEDDLER_SPOT.y - bh &&
    worldY <= PEDDLER_SPOT.y;

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const rect = k.canvas.getBoundingClientRect();
    const wx = screenToWorld(event.clientX - rect.left, k.getCamPos().x, k.width());
    const wy = screenToWorld(event.clientY - rect.top, k.getCamPos().y, k.height());
    tracker.press(event.clientX, event.clientY, hitsPeddler(wx, wy) ? 'peddler' : null);
  };
  const onMouseMove = (event: MouseEvent) => tracker.move(event.clientX, event.clientY);
  const onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const gesture = tracker.release(event.clientX, event.clientY);
    if (gesture.type === 'click' && gesture.targetId === 'peddler') onClick();
  };

  k.canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    say(text) {
      if (text.trim() === '') return;
      bubbleText.scale = k.vec2(1, 1);
      const measure = (line: string) => {
        bubbleText.text = escapeStyled(line);
        return bubbleText.width / TEXT_SS;
      };
      bubbleText.text = wrapToWidth(measure, text, BUBBLE_MAX_W).map(escapeStyled).join('\n');
      bubbleText.scale = k.vec2(1 / TEXT_SS, 1 / TEXT_SS);
      const bw2 = bubbleText.width / TEXT_SS;
      const bh2 = bubbleText.height / TEXT_SS;
      bubbleBg.width = bw2 + BUBBLE_PAD * 2;
      bubbleBg.height = bh2 + BUBBLE_PAD * 2;
      bubbleText.pos = k.vec2(0, -bh - BUBBLE_LIFT - BUBBLE_PAD);
      bubbleBg.pos = k.vec2(0, -bh - BUBBLE_LIFT);
      bubbleText.hidden = false;
      bubbleBg.hidden = false;
    },
    destroy() {
      k.canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      updateEv.cancel();
      k.destroy(root);
    },
  };
}
