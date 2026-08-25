import type {
  KAPLAYCtx,
  GameObj,
  RectComp,
  PosComp,
  AnchorComp,
  ColorComp,
  OutlineComp,
  FixedComp,
  ZComp,
} from 'kaplay';
import { INK, derivePalette, type CaseView, type SketchView } from '@village/core/visual';
import { U, TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import { sceneryColor } from './retint.js';
import { composeSketchGrid, type ComposedGrid } from '../render/compose.js';
import { bakePixels } from '../render/bake.js';
import { roleMap } from '../render/roles.js';
import { createDragTracker } from '../input/drag.js';
import { escapeStyled, toCanvas, loadSprite, type CreatureFonts } from './creature.js';

/** Margin between a portrait and its own frame's inner edge — frames hug, they never share one width. */
const FRAME_MARGIN = 14;
/** Gap between adjacent slots in the row. */
const FRAME_GAP = 26;
/** Gap between a frame's bottom edge and its title plaque. */
const PLAQUE_GAP = 10;
const PLAQUE_PAD_X = 10;
const PLAQUE_H = 24;
const PLAQUE_TEXT_SIZE = 13;
/** Fixed-viewport y every frame's top edge shares — a gallery rail, not a floor: frames vary in height below it. */
const ROW_TOP_Y = 130;
/** Outline weight, ordinary vs the ring drawn around the selected sketch pending confirmation. */
const FRAME_OUTLINE = 2;
const FRAME_OUTLINE_SELECTED = 4;

/**
 * Every draw call in KAPLAY sorts *all* of one parent's children together by
 * `(layerIndex, z)` (see `GameObj.draw` in the bundle) — `fixed()` only
 * exempts an object from the camera transform, it does not exempt it from
 * that shared sort. Every scene object here is a sibling of every creature
 * root under the same scene root, and a hovered villager's root climbs to
 * `at.y + 100000` (creature.ts's hover pop, `plateAlpha * 100000`) — so a
 * z below that would let a hovered creature draw *through* this modal the
 * instant the cursor crosses one on its way to a portrait. This base sits
 * comfortably above that ceiling.
 */
const OVERLAY_Z = 200_000;

export interface CaseOverlayHandle {
  close(): void;
}

interface Portrait {
  sketch: SketchView;
  grid: ComposedGrid;
  key: string;
  /** Portrait pixel size, `grid.{w,h} * U`. */
  w: number;
  h: number;
  /** The frame's own size — hugs the portrait plus FRAME_MARGIN, nothing else. */
  frameW: number;
  frameH: number;
  /** The title plaque's width, measured before layout (see below) so the row can reserve room for it. */
  plaqueW: number;
  /**
   * What the row layout actually reserves for this sketch: `max(frameW,
   * plaqueW)`. A title wider than its portrait (routine at up to ~40 mono
   * characters — titles are the artist's own voice and must never truncate)
   * would otherwise overlap a neighbour, since frame spacing used to be
   * measured off the portrait alone.
   */
  slotW: number;
}

interface FrameRect {
  x: number;
  y: number;
  /** The full slot width — same reservation the layout used, not just the frame's own width. */
  w: number;
  /** Frame height plus the plaque band below it — the sketch's whole clickable footprint. */
  hitH: number;
}

function hex(k: KAPLAYCtx, v: string) {
  return k.Color.fromHex(v);
}

/**
 * Five framed portraits, a title plaque under each, click-to-select then
 * click-again-to-confirm, and a background click to clear the selection.
 *
 * Every game object here is a child of one `root`, exactly the way
 * `creature.ts`'s `spawnCreature` roots a whole villager under one `root` —
 * `close()` is a single `k.destroy(root)`, the same one-call teardown.
 * `close()` also fires `onClose` synchronously, before any caller-supplied
 * cull promise has even started — see the confirm handler below for why
 * that ordering matters.
 *
 * Sketches are drawings, not creatures (the brief's own words): unlike a
 * villager's baked sprite, a portrait is drawn full-bright, untouched by the
 * day/night ambient tint — it is a framed picture in a case, not a body
 * standing in the field. Pupils are drawn the same way `creature.ts` draws a
 * villager's — two rects in `INK.mouth`, positioned off `grid.eyes` with the
 * same `U * 0.125` centring offset — but static: no blink state, no gaze,
 * no lids, nothing overlaid but the two pupils themselves.
 *
 * Click handling is the same two-tier shape `village.ts`'s own click system
 * and `peddler.ts` use — a synchronous `mousedown` to arm, a window-level
 * `mouseup` to resolve, `createDragTracker` for the click-vs-drag slop —
 * rather than KAPLAY's own `area()`/`onClick()`. That keeps every click in
 * this scene resolved by the one hand-rolled system already proven here,
 * instead of mixing in a second, untested one for a five-target modal.
 */
export async function openCaseOverlay(
  k: KAPLAYCtx,
  caseData: CaseView,
  fonts: CreatureFonts,
  onCull: (sketchId: string) => void | Promise<void>,
  onClose: () => void,
): Promise<CaseOverlayHandle> {
  const { tokens, tint } = themeStore.current();
  const inkCol = hex(k, sceneryColor(tokens, tint, 'ink'));
  const creamCol = hex(k, sceneryColor(tokens, tint, 'cream'));
  const bubbleCol = hex(k, sceneryColor(tokens, tint, 'bubble'));
  const accentCol = hex(k, sceneryColor(tokens, tint, 'accent'));

  // Compose every sketch up front — a sketch that fails to compose (the
  // validator refusing something the server somehow let through) is skipped
  // rather than drawn broken, same rule `composeSketchGrid` itself documents.
  //
  // Each title is also measured here, before any layout math runs, via
  // `k.formatText` — the same text-formatting routine a `text()` component
  // uses internally, but one that returns metrics without adding anything to
  // the scene. Sizing the row from the portrait alone (the earlier version
  // of this file) let a long title overlap its neighbour, since nothing
  // reserved room for it; measuring first is what lets the row give each
  // slot exactly as much width as its wider of {frame, plaque} needs.
  const portraits: Portrait[] = [];
  for (const sketch of caseData.sketches) {
    const grid = composeSketchGrid({ rows: sketch.rows, crown: sketch.crown });
    if (!grid) continue;
    const key = `sketch:${sketch.id}`;
    if (!k.getSprite(key)) {
      await loadSprite(k, key, toCanvas(bakePixels(grid, roleMap(derivePalette(sketch.hue)))));
    }
    const w = grid.w * U;
    const h = grid.h * U;
    const frameW = w + FRAME_MARGIN * 2;
    const frameH = h + FRAME_MARGIN * 2;
    const titleMetrics = k.formatText({
      text: escapeStyled(sketch.title),
      font: fonts.mono,
      size: PLAQUE_TEXT_SIZE * TEXT_SS,
    });
    const plaqueW = titleMetrics.width / TEXT_SS + PLAQUE_PAD_X * 2;
    portraits.push({ sketch, grid, key, w, h, frameW, frameH, plaqueW, slotW: Math.max(frameW, plaqueW) });
  }

  const root = k.add([k.pos(0, 0), k.fixed(), k.z(OVERLAY_Z)]);

  // Backdrop: a fixed, deliberately untinted dim — the same kind of
  // exception creature.ts's own contact SHADOW is (see that file's comment
  // on SHADOW): a modal scrim dims focus, it does not represent outdoor
  // light, so it does not follow the palette or the clock.
  root.add([
    k.rect(k.width(), k.height()),
    k.pos(0, 0),
    k.anchor('topleft'),
    k.color(k.rgb(0, 0, 0)),
    k.opacity(0.55),
    k.fixed(),
    k.z(OVERLAY_Z),
  ]);

  let selectedId: string | null = null;
  const frameObjs = new Map<
    string,
    GameObj<RectComp | PosComp | AnchorComp | ColorComp | OutlineComp | FixedComp | ZComp>
  >();
  const frameRects = new Map<string, FrameRect>();

  const totalW = portraits.reduce((sum, p) => sum + p.slotW, 0) + FRAME_GAP * Math.max(0, portraits.length - 1);
  let cursorX = k.width() / 2 - totalW / 2;

  for (const p of portraits) {
    const fy = ROW_TOP_Y;
    // Frame and plaque both centre on the slot's own centre, not on each
    // other — a slot widened by its plaque must not drag the (still
    // frame-sized) frame sideways with it.
    const slotCenterX = cursorX + p.slotW / 2;
    const fx = slotCenterX - p.frameW / 2;

    const frame = root.add([
      k.rect(p.frameW, p.frameH, { radius: 6 }),
      k.pos(fx, fy),
      k.anchor('topleft'),
      k.color(creamCol),
      k.outline(FRAME_OUTLINE, inkCol),
      k.fixed(),
      k.z(OVERLAY_Z + 2),
    ]);
    frameObjs.set(p.sketch.id, frame);

    const portraitCenterX = slotCenterX;
    const portraitBottomY = fy + FRAME_MARGIN + p.h;

    root.add([
      k.sprite(p.key),
      k.pos(portraitCenterX, portraitBottomY),
      k.anchor('bot'),
      k.scale(U),
      k.fixed(),
      k.z(OVERLAY_Z + 3),
    ]);

    // Static pupils: creature.ts's own per-eye placement math, with sx=sy=1
    // fixed (no breathing squash) and no shut/lid/lash state at all.
    for (const anchor of p.grid.eyes) {
      const baseX = (anchor.c - p.grid.w / 2 + 1) * U;
      const baseY = (anchor.r - p.grid.h + 1) * U;
      root.add([
        k.rect(U * 0.95, U * 1.15),
        k.pos(portraitCenterX + baseX, portraitBottomY + baseY + U * 0.125),
        k.anchor('center'),
        k.color(hex(k, INK.mouth)),
        k.fixed(),
        k.z(OVERLAY_Z + 4),
      ]);
    }

    // Plaque: `p.plaqueW` was already measured before layout (that is what
    // let this slot reserve the right width in the first place), so the box
    // is sized from it directly rather than re-measuring a freshly created
    // text object — same text, same font, same size, so the two numbers can
    // never disagree.
    const plaqueY = fy + p.frameH + PLAQUE_GAP;
    root.add([
      k.rect(p.plaqueW, PLAQUE_H, { radius: 4 }),
      k.pos(portraitCenterX, plaqueY + PLAQUE_H / 2),
      k.anchor('center'),
      k.color(bubbleCol),
      k.outline(2, inkCol),
      k.fixed(),
      k.z(OVERLAY_Z + 5),
    ]);
    root.add([
      k.text(escapeStyled(p.sketch.title), { size: PLAQUE_TEXT_SIZE * TEXT_SS, font: fonts.mono }),
      k.pos(portraitCenterX, plaqueY + PLAQUE_H / 2),
      k.anchor('center'),
      k.scale(1 / TEXT_SS),
      k.color(inkCol),
      k.fixed(),
      k.z(OVERLAY_Z + 6),
    ]);

    // The hit box covers the *whole slot*, not just the (possibly narrower)
    // frame — a click on an overflowing title must still resolve to this
    // sketch rather than its neighbour or nothing.
    frameRects.set(p.sketch.id, {
      x: cursorX,
      y: fy,
      w: p.slotW,
      hitH: p.frameH + PLAQUE_GAP + PLAQUE_H,
    });

    cursorX += p.slotW + FRAME_GAP;
  }

  const refreshSelection = () => {
    for (const [id, frame] of frameObjs) {
      const selected = id === selectedId;
      frame.outline.width = selected ? FRAME_OUTLINE_SELECTED : FRAME_OUTLINE;
      frame.outline.color = selected ? accentCol : inkCol;
    }
  };

  // Background sentinel: DragTracker treats a null targetId as "not a
  // trackable gesture at all" (see input/drag.ts), so a background press
  // needs its own non-null id to come back as a resolvable click.
  const BACKGROUND = '__case_background__';

  const hitTest = (x: number, y: number): string => {
    for (const [id, rect] of frameRects) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.hitH) return id;
    }
    return BACKGROUND;
  };

  let closed = false;
  const tracker = createDragTracker();

  const canvasPos = (clientX: number, clientY: number) => {
    const rect = k.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /**
   * Torn down exactly once, from either caller: the confirm handler below
   * (self-close, before `onCull` even starts) or `village.ts` calling the
   * returned handle's `close()` directly (the peddler leaving while the
   * case is still open). `onClose` fires synchronously, in the same tick as
   * the rest of the teardown — the caller's own "the overlay is gone" state
   * must not lag behind a network round trip it has no reason to wait on.
   */
  const close = () => {
    if (closed) return;
    closed = true;
    k.canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    k.destroy(root);
    onClose();
  };

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const p = canvasPos(event.clientX, event.clientY);
    tracker.press(event.clientX, event.clientY, hitTest(p.x, p.y));
  }
  function onMouseMove(event: MouseEvent) {
    tracker.move(event.clientX, event.clientY);
  }
  function onMouseUp(event: MouseEvent) {
    if (event.button !== 0 || closed) return;
    const gesture = tracker.release(event.clientX, event.clientY);
    if (gesture.type !== 'click') return;

    if (gesture.targetId === BACKGROUND) {
      selectedId = null;
      refreshSelection();
      return;
    }
    if (selectedId === gesture.targetId) {
      // Confirm: close first — "as soon as the cull is posted, not waiting
      // for the server" — then fire the cull. The socket's next frame is
      // what actually removes the peddler; this overlay does not wait for
      // it, and neither does anything gated on `onClose` having already run.
      const id = gesture.targetId;
      close();
      void onCull(id);
      return;
    }
    selectedId = gesture.targetId;
    refreshSelection();
  }

  k.canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return { close };
}
