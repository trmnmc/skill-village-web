/**
 * The creature you are holding.
 *
 * While a drag is live the real actor is hidden at its spot (see
 * `CreatureActor.setHeld`) and this draws the same villager hanging from the
 * cursor instead: its own baked body, its own wings, its own palette. It is a
 * second set of game objects rather than a borrowed actor because the actor
 * owns its root position and its whole standing-on-the-ground vocabulary —
 * breathing, hopping, ambling, a contact shadow — none of which applies to
 * something dangling from a fist.
 *
 * Nothing here loads a sprite. Every texture it draws was baked by
 * `spawnCreature` for this same creature id, so a held villager costs a few
 * game objects and no GPU upload. That also means this can fail: a creature
 * grabbed while its sprites are still loading has nothing to draw, and
 * `createHeld` returns null rather than inventing a placeholder.
 */

import type { KAPLAYCtx, GameObj, PosComp, TextComp, ScaleComp, AnchorComp, ColorComp, ZComp } from 'kaplay';
import type { Creature } from '@village/core/visual';
import { TEXT_SS, U } from '../theme.js';
import { themeStore } from '../theme/index.js';
import { tokenTag, sceneryColor, creatureTintColor, creatureOverlayColor } from './retint.js';
import { composeGrid } from '../render/compose.js';
import { roleMap } from '../render/roles.js';
import { displayName } from '../render/label.js';
import { phaseFor, wingAngle } from '../motion/motion.js';
import { createDangle } from '../motion/dangle.js';
import type { CreatureFonts } from './creature.js';

/**
 * Above the whole village, with room to spare. Depth here is not a small
 * layer index: creature actors sort on their feet's world y (`root.z = at.y`,
 * up to `GROUND_Y`) and a hovered one adds a further 100000 to jump the crowd.
 * Anything in the player's hand has to clear that ceiling, or it draws behind
 * the villagers it is being carried over.
 */
const HELD_Z = 1_000_000;
const LABEL_Z = HELD_Z + 1;

/**
 * How far below the cursor the body hangs. The grab is at the scruff, not the
 * crown — a body pinned exactly at the cursor reads as impaled on it.
 */
const GRAB_INSET = 6;

/** The name sign rides this far above the hand, clear of the swinging body. */
const LABEL_LIFT = 22;

/**
 * A startled pupil is a small one: the eye white behind it is baked at a fixed
 * 2x2 cells, so shrinking the pupil is the only way to show more of it, and
 * more white is exactly how a cartoon face reads as alarmed.
 */
const STARTLED_PUPIL = 0.62;

/** Panic, not patrol — the held flap runs well over the airborne one. */
const PANIC_FLAP = 1.8;

export interface HeldCreature {
  /**
   * Ride the cursor for one frame. `x`/`y` are world coordinates, `cursorVx`
   * the hand's horizontal speed in px/s (what drives the swing).
   */
  update(t: number, dt: number, x: number, y: number, cursorVx: number): void;
  destroy(): void;
}

export function createHeld(
  k: KAPLAYCtx,
  creature: Creature,
  fonts: CreatureFonts,
): HeldCreature | null {
  // A dangling creature wears its dangling legs where it has them. This is the
  // same pair of conditions `spawnCreature` bakes `body:<id>:roam` under, so
  // asking the sprite registry is also the authoritative test for whether that
  // second bake happened at all.
  const dangles = creature.appearance.winged && creature.appearance.body === 'lanky';
  const roamKey = `body:${creature.id}:roam`;
  const bodyKey = dangles && k.getSprite(roamKey) ? roamKey : `body:${creature.id}`;
  if (!k.getSprite(bodyKey)) return null;

  // The grid must be the one that was baked into the texture being drawn, or
  // every eye lands on the wrong row: the trailing posture is up to three
  // cells taller than the resting one.
  const grid = composeGrid(creature.appearance, bodyKey === roamKey ? 'trailing' : undefined);
  const bw = grid.w * U;
  const bh = grid.h * U;

  const wingKey = `wing:${creature.appearance.palette.lite}`;
  const winged = creature.appearance.winged && Boolean(k.getSprite(wingKey));

  const phi = phaseFor(creature.id);
  const dangle = createDangle();
  const pupilHex = roleMap(creature.appearance.palette).K!;

  const theme = themeStore.current();
  const tint = k.Color.fromHex(creatureTintColor(theme.tint));

  // Rotation lives on the root, so the body, its wings and its eyes swing as
  // one piece around the grab point. KAPLAY pushes pos, then scale, then angle
  // before drawing an object's children, so a child's own `pos` is already in
  // the swung frame — which is why none of the offsets below carry the angle.
  const root = k.add([k.pos(0, 0), k.rotate(0), k.z(HELD_Z)]);

  const body = root.add([
    k.sprite(bodyKey),
    k.pos(0, GRAB_INSET),
    k.anchor('top'),
    k.scale(U),
    k.color(tint),
    'themed:creature',
  ]);

  // Same construction as `spawnCreature`'s wings — anchored at the shoulder,
  // the left one mirrored by a negative scale — but measured down from the
  // crown instead of up from the feet, because this body hangs from its top.
  const wings = winged
    ? [-1, 1].map((side) =>
        root.add([
          k.sprite(wingKey),
          k.pos(side * (bw / 2), GRAB_INSET + bh * 0.45),
          k.anchor('left'),
          k.scale(U * side, U),
          k.rotate(0),
          k.z(-2),
          k.color(tint),
          'themed:creature',
        ]),
      )
    : [];

  // Eyes are pupils only. A held creature never blinks and never sleeps
  // through being picked up, so the lid and lash `spawnCreature` carries have
  // no state here that could show them.
  let overlayKey = '';
  let pupilColour = k.Color.fromHex(creatureOverlayColor(pupilHex, theme.tint));
  const pupils = grid.eyes.map(() =>
    root.add([
      k.rect(U * 0.95 * STARTLED_PUPIL, U * 1.15 * STARTLED_PUPIL),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(pupilColour),
      k.z(1),
    ]),
  );

  // The sign stays upright and stays put: it is the player's label for what is
  // in their hand, not part of the creature's body, and pinning it to a
  // swinging root would set the name rocking with it.
  const label: GameObj<TextComp | ScaleComp | PosComp | AnchorComp | ColorComp | ZComp> = k.add([
    k.text(displayName(creature), { size: 12 * TEXT_SS, font: fonts.mono }),
    k.scale(1 / TEXT_SS),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(k.Color.fromHex(sceneryColor(theme.tokens, theme.tint, 'ink'))),
    tokenTag('ink'),
    k.z(LABEL_Z),
  ]);

  return {
    update(t, dt, x, y, cursorVx) {
      root.pos = k.vec2(x, y);
      root.angle = dangle.update(dt, cursorVx);
      label.pos = k.vec2(x, y - LABEL_LIFT);

      // Solid rects get no multiply from the retint walker (see
      // creatureOverlayColor), so the pupils re-shade themselves whenever the
      // sky actually moves — a string compare per frame, not a colour mix.
      const now = themeStore.current();
      const key = now.tint.col + now.tint.creatureK;
      if (key !== overlayKey) {
        overlayKey = key;
        pupilColour = k.Color.fromHex(creatureOverlayColor(pupilHex, now.tint));
        for (const pupil of pupils) pupil.color = pupilColour;
      }

      const flap = wingAngle(t * PANIC_FLAP, phi);
      wings.forEach((wing, i) => {
        wing.angle = i === 0 ? -flap : flap;
      });

      grid.eyes.forEach((anchor, i) => {
        // The mirror of `spawnCreature`'s eye maths for a top-anchored body:
        // grid cells are measured from the top-left and so is this sprite, so
        // the centre of the 2x2 eye-white block is just the boundary between
        // its two rows and its two columns.
        const px = (anchor.c - grid.w / 2 + 1) * U;
        const py = GRAB_INSET + (anchor.r + 1) * U;
        pupils[i]!.pos = k.vec2(px, py);
      });
    },
    destroy() {
      k.destroy(root);
      k.destroy(label);
    },
  };
}
