import type { KAPLAYCtx } from 'kaplay';
import { WING, type Creature } from '@village/core/visual';
import { THEME, U } from '../theme.js';
import { composeGrid } from '../render/compose.js';
import { bakePixels } from '../render/bake.js';
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
  // `BakedPixels.data` is typed as the bare (TS 5.9+) `Uint8ClampedArray`,
  // which defaults its buffer parameter to `ArrayBufferLike` (i.e. it could
  // in principle be `SharedArrayBuffer`-backed); `ImageData`'s constructor
  // insists on the plain-`ArrayBuffer`-backed variant. Re-wrapping produces
  // a fresh, correctly-typed copy rather than loosening bake.ts's own type.
  ctx.putImageData(new ImageData(new Uint8ClampedArray(baked.data), baked.w, baked.h), 0, 0);
  return canvas;
}

/**
 * `k.loadSprite` returns an `Asset`, not a real `Promise` — its own `.then`
 * only takes a resolve callback and returns the `Asset` itself, not a
 * chainable `PromiseLike`. `Asset` does expose `onLoad`/`onError`, which are
 * the documented way to observe completion, so this wraps those into a real
 * `Promise` rather than relying on `Asset` structurally satisfying `await`.
 * `ImageSource` (part of `LoadSpriteSrc`) includes `HTMLCanvasElement`
 * directly, so the canvas is passed straight in — no `toDataURL()` detour.
 */
function loadSprite(k: KAPLAYCtx, name: string, canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    k.loadSprite(name, canvas).onLoad(() => resolve()).onError(reject);
  });
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
  await loadSprite(k, restKey, toCanvas(bakePixels(restGrid, map)));

  const dangles = creature.appearance.winged && creature.appearance.body === 'lanky';
  const roamKey = `body:${creature.id}:roam`;
  if (dangles) {
    const roamGrid = composeGrid(creature.appearance, 'trailing');
    await loadSprite(k, roamKey, toCanvas(bakePixels(roamGrid, map)));
  }

  const wingKey = `wing:${creature.appearance.palette.lite}`;
  if (!k.getSprite(wingKey)) {
    const wingGrid = { rows: WING, w: 4, h: 3, eyes: restGrid.eyes, crownRows: 0 };
    await loadSprite(k, wingKey, toCanvas(bakePixels(wingGrid, { X: creature.appearance.palette.lite, '.': null })));
  }

  const bw = restGrid.w * U;
  const bh = restGrid.h * U;

  const root = k.add([k.pos(spot.x, spot.y), k.z(spot.y)]);

  const shadow = root.add([
    k.rect(bw * 0.78, 10, { radius: 5 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(k.Color.fromHex(THEME.shadow)),
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

  const lidColour = k.Color.fromHex(creature.appearance.palette.hue);
  const pupilColour = k.Color.fromHex(map.K!);

  // Eyes are overlaid, never baked, so they can blink and track. `W` (eye
  // white) IS baked into the body texture, though — a shut eye must fully
  // cover that baked 2x2 white block, not just draw a lash line over it, or
  // the white shows straight through. Each eye is three pieces:
  //   - pupil: shown when open, tracks gaze.
  //   - lid: shown when shut, a body-hue block the exact size of the eye
  //     white it covers.
  //   - lash: a thin dark line at the lid's lower edge, same construction as
  //     the trailer (reference/animation-trailer/skill-village-scene.jsx).
  // Visibility swaps via `.hidden` rather than swapping colour/role on one
  // rect, so the lid and lash can differ in both size and colour from the
  // pupil without one shape having to serve every state.
  const eyes = restGrid.eyes.map((anchor) => {
    const pupil = root.add([
      k.rect(U * 0.95, U * 1.15),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(pupilColour),
      k.z(1),
    ]);
    const lid = root.add([
      k.rect(U * 2, U * 2),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(lidColour),
      k.z(1),
    ]);
    const lash = root.add([
      k.rect(U * 2 - 2, 3.5),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(pupilColour),
      k.z(2),
    ]);
    return { anchor, pupil, lid, lash };
  });

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

      for (const { anchor, pupil, lid, lash } of eyes) {
        // Grid cells are measured from the top-left; the body is anchored at
        // its base. This recovers the eye-white block's centre in the same
        // local space the body sprite occupies.
        const baseX = (anchor.c - restGrid.w / 2 + 1) * U;
        const baseY = (anchor.r - restGrid.h + 1) * U + dy + hover;

        pupil.hidden = shut;
        lid.hidden = !shut;
        lash.hidden = !shut;

        if (shut) {
          lid.pos = k.vec2(baseX, baseY);
          // The lash sits just above the lid's own centre — the row
          // boundary inside the 2-row eye-white block it is covering.
          lash.pos = k.vec2(baseX, baseY - 0.25);
        } else {
          pupil.pos = k.vec2(baseX + look * 3.5, baseY + U * 0.55);
        }
      }
    },
    destroy() {
      k.destroy(root);
    },
  };
}
