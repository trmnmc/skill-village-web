import kaplay, { type KAPLAYCtx } from 'kaplay';
import type { Creature } from '@village/core/visual';
import { THEME } from '../theme.js';
import { ZONES, WORLD_W, GROUND_Y, GROUND_TOP, placeCreatures, type Spot } from '../layout/zones.js';
import type { VillageView } from '../net/protocol.js';
import { spawnCreature, type CreatureActor } from './creature.js';

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

  // Ground: a far band and a near band, so the field reads as having depth.
  // The far band starts at GROUND_TOP, which zones.ts derives from the depth
  // rows themselves, so the painted ground reaches back past the furthest row
  // instead of stopping 98px short of it and leaving most of the village
  // standing on sky.
  block(k, 0, GROUND_TOP, WORLD_W, GROUND_Y - GROUND_TOP, THEME.groundDark, 0);
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

  const actors = new Map<string, CreatureActor>();
  // Bumped every time setView decides to (re)spawn a given id. A spawn's own
  // `.then` compares the generation it captured at decision time against the
  // current value; a mismatch means a later setView call already decided to
  // respawn that same id again, so this resolution lost the race and must
  // not touch `actors` — otherwise two overlapping spawns for one id (e.g.
  // two view updates racing 70 in-flight sprite loads at startup) both
  // resolve, both call actors.set, and the loser's root is orphaned:
  // untracked, never destroyed, never updated, a permanent frozen creature.
  const generations = new Map<string, number>();
  let known = new Map<string, Creature>();
  // The placement from the most recent view. Held so a spawn that is still
  // loading sprites can adopt the newest spot when it resolves, the same way
  // it adopts the newest stats from `known`.
  let placements = new Map<string, Spot>();
  let lookAt: number | null = null;

  // A second onMouseMove consumer, alongside the drag-pan handler above —
  // KAPLAY's event registry supports multiple listeners per event and
  // neither one calls stopPropagation, so this composes cleanly with it
  // (see the comment on the drag-pan block). camPos() is deprecated in the
  // installed KAPLAY build (Task 9 hit the same thing); getCamPos() is its
  // replacement.
  k.onMouseMove((pos) => {
    lookAt = pos.x + k.getCamPos().x - k.width() / 2;
  });

  k.onUpdate(() => {
    const t = k.time();
    for (const actor of actors.values()) actor.update(t, lookAt);
  });

  return {
    k,
    setView(view) {
      counter.text = `${view.creatures.length} villagers`;
      const spots = placeCreatures(view.creatures.map((c) => c.id));
      placements = spots;
      const seen = new Set<string>();

      for (const creature of view.creatures) {
        seen.add(creature.id);
        const spot = spots.get(creature.id)!;
        const before = known.get(creature.id);
        // Respawn only when the look changes; stats alone (which change on
        // every server tick) must not restart a creature's motion.
        const changed = before && JSON.stringify(before.appearance) !== JSON.stringify(creature.appearance);
        if (!actors.has(creature.id) || changed) {
          actors.get(creature.id)?.destroy();
          // Delete immediately, not just on the eventual respawn: otherwise
          // the dead actor stays in `actors` and keeps getting `update()`d
          // every frame until the new one resolves — including, for a
          // dangling lanky, `body.use(...)` called on an already-destroyed
          // game object.
          actors.delete(creature.id);
          const gen = (generations.get(creature.id) ?? 0) + 1;
          generations.set(creature.id, gen);
          void spawnCreature(k, creature, spot, { pixel: pixelFont, mono: monoFont })
            .then((actor) => {
              if (generations.get(creature.id) !== gen) { actor.destroy(); return; }
              // Stats can tick several times while 70 sprites load, and a
              // villager arriving in that window can move this one along its
              // row. `known` and `placements` hold the newest view by the time
              // this resolves, so hand the actor those rather than the
              // snapshot the spawn started from.
              actor.setSpot(placements.get(creature.id) ?? spot);
              actor.setCreature(known.get(creature.id) ?? creature);
              actors.set(creature.id, actor);
            })
            .catch(() => {
              // A failed sprite load leaves nothing to add. Without this,
              // the rejection creature.ts's loadSprite() produces via
              // onError(reject) would be an unhandled promise rejection.
            });
        } else {
          const actor = actors.get(creature.id)!;
          // A villager can be pushed along its row when a newcomer's hash
          // lands on its spot (see zones.ts). The actor owns its root
          // position, so without this it carries on drawing where it used to
          // stand while somebody else occupies that ground — the static
          // overlap traded for a moving one. Repositioning is not a respawn:
          // the motion clock, the phase and every baked sprite survive it.
          actor.setSpot(spot);
          // Same look, newer stats: the actor re-derives its behaviour flags
          // in place. Without this, mood and energy select a creature's
          // behaviour exactly once — on the frame it was first drawn — and
          // never again.
          actor.setCreature(creature);
        }
      }

      for (const [id, actor] of actors) {
        if (!seen.has(id)) { actor.destroy(); actors.delete(id); }
      }

      known = new Map(view.creatures.map((c) => [c.id, c]));
    },
    setStatus(s) {
      status.text = s;
    },
  };
}
