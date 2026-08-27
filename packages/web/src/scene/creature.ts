import type { KAPLAYCtx } from 'kaplay';
import { WING, type Creature } from '@village/core/visual';
import { TEXT_SS, U } from '../theme.js';
import { themeStore } from '../theme/index.js';
import type { Tokens } from '../theme/store.js';
import { tokenTag, sceneryColor, creatureTintColor, creatureOverlayColor } from './retint.js';
import { composeGrid } from '../render/compose.js';
import { bakePixels } from '../render/bake.js';
import { roleMap } from '../render/roles.js';
import { displayName, fileLabel } from '../render/label.js';
import { behaviourFor, type Behaviour } from '../motion/behaviour.js';
import { sound } from '../sound/player.js';
import { voiceParamsFor } from '../sound/voice.js';
import {
  breathe,
  BUBBLE_OUT,
  bubbleLifetime,
  bubbleScale,
  gaze,
  hopState,
  isBlinking,
  phaseFor,
  shadowSquash,
  wanderOffset,
  wingAngle,
} from '../motion/motion.js';
import type { Spot } from '../layout/zones.js';

/** Speech-bubble geometry, all in screen pixels. */
const BUBBLE_SIZE = 13;
const BUBBLE_PAD = 10;
/** Extra leading between wrapped lines; KAPLAY's own default is none. */
const BUBBLE_LEADING = 4;
/** Where a long line breaks. A short quip never reaches it — see `say`. */
const BUBBLE_MAX_W = 180;
/** How far above the feet the bubble's tail sits — clear of the hover sign. */
const BUBBLE_LIFT = 50;

/**
 * The creature's contact shadow. Fixed regardless of theme, unlike every
 * other colour below — shadows already draw at a constant low alpha, and the
 * scene's ambient tint (the `themed:creature` multiply on the sprite above
 * it) is what carries the day/night mood, not the shadow itself.
 */
const SHADOW = '#5A4628';

/**
 * A token colour struck from the *current* resolved theme, for chrome that
 * (like village.ts's `block()`) needs both an initial colour and the tag
 * that lets `startVillage`'s retint walker find and recolour it later.
 */
function themedColor(k: KAPLAYCtx, token: keyof Tokens) {
  const { tokens, tint } = themeStore.current();
  return k.Color.fromHex(sceneryColor(tokens, tint, token));
}

/**
 * Umbrella ownership, seeded per creature id — the reference's own trick
 * (a plain charCode sum, not zones.ts's FNV hash used for layout) so the
 * result is stable across respawns without depending on that other hash's
 * exact algorithm. Roughly one creature in three owns one.
 */
function simpleHash(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

/** The reference umbrella (drawUmbrella) was authored at U=4; the game draws at U=6. */
const UMBRELLA_SCALE = U / 4;

/**
 * How many grid cells across the shut eyelid is drawn. The baked eye white is
 * exactly 2x2 cells, but the sprite texels and this overlay rect round to
 * device pixels independently — at pixelDensity 2, with the body breathing on
 * a non-integer scale, their edges can land a pixel apart and leave a bright
 * sliver of eye white showing around the lid. Covering a quarter-cell past the
 * block on every side absorbs that; the overhang falls on body-coloured cells
 * and the lid wears the body tint, so it is invisible.
 */
const EYE_LID_CELLS = 2.5;

export interface CreatureActor {
  update(t: number, lookAt: number | null, hovered?: boolean): void;
  /**
   * Where this creature is drawn right now: its home x plus however far it
   * has ambled. Hover and click aim at this, not the home spot — a villager
   * at the end of its leash is a full body-width from home.
   */
  worldX(): number;
  /**
   * Adopt a fresh copy of this creature — same look, newer stats — without
   * respawning it. See the implementation's note in `spawnCreature`.
   */
  setCreature(next: Creature): void;
  /**
   * Move to a new placement without respawning. `placeCreatures` can shift a
   * villager sideways when a newcomer's hash lands on its spot; the actor owns
   * its root position, so it has to be told.
   */
  setSpot(next: Spot): void;
  /**
   * Float one line over this creature's head. Scene furniture, not chat
   * history — the panel keeps the log — so a second `say` replaces the first
   * rather than queueing behind it.
   */
  say(text: string, source?: 'llm' | 'canned'): void;
  /**
   * Show a small endless "…" bubble — the creature is composing a reply.
   * The next `say` replaces it; `clearThought` shrinks it away when the
   * reply never comes.
   */
  think(): void;
  clearThought(): void;
  /** The creature's audible signature, played when the player opens chat with it. */
  greet(): void;
  /**
   * Lift this villager off the ground, or set it back down. While held, the
   * actor draws nothing and makes no sound — `scene/held.ts` is drawing it on
   * the cursor instead — and putting it back down lands it with the same puff
   * and thud a hop does. Idempotent: only a real change does anything.
   */
  setHeld(held: boolean): void;
  destroy(): void;
}

/**
 * KAPLAY runs every string a text component holds through its styled-text
 * parser: `[name]…[/name]` opens a style span and `\` escapes the next
 * character. A stray tag or a trailing backslash does not degrade — it
 * *throws* (compileStyledText, kaplay/src/gfx/formatText.ts), from the `.text`
 * setter and then from every subsequent draw of that object, which would take
 * the whole scene down. Creature replies are LLM prose, where `[laughs]` or a
 * Windows path is entirely ordinary. Escaping both characters renders them
 * literally, cannot throw, and does not change the measured width: the parser
 * strips the backslashes before anything is laid out.
 */
function escapeStyled(text: string): string {
  return text.replace(/[\\[]/g, (ch) => `\\${ch}`);
}

/**
 * One unbroken run — a path, a URL, an id — can be wider than the bubble is
 * allowed to be, and no word boundary will save it. The bubble font is mono,
 * so every glyph advances by the same width and the character budget for a
 * line follows exactly from the measured width of the run.
 */
function splitLongWord(measure: (line: string) => number, word: string, maxWidth: number): string[] {
  const width = measure(word);
  if (width <= maxWidth) return [word];
  // Code points, not UTF-16 units: slicing a surrogate pair in half would
  // hand the renderer a lone surrogate.
  const chars = [...word];
  const per = Math.max(1, Math.floor((chars.length * maxWidth) / width));
  const pieces: string[] = [];
  for (let i = 0; i < chars.length; i += per) pieces.push(chars.slice(i, i + per).join(''));
  return pieces;
}

/**
 * Greedy word wrap against whatever `measure` says a line is worth. The
 * bubble does its own wrapping rather than handing KAPLAY a `width` option
 * because that option is a wrap *constraint* and formatText then reports the
 * constraint as the text's width however short the line is — which is how you
 * end up with a three-word quip in a 180px box. Breaking the lines here means
 * the reported width is always the longest line actually drawn, so the box can
 * hug it. Whitespace collapses on the way through: a reply's own newlines are
 * the LLM's paragraphing, not this bubble's.
 */
function wrapToWidth(measure: (line: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (word === '') continue;
    for (const piece of splitLongWord(measure, word, maxWidth)) {
      const candidate = line === '' ? piece : `${line} ${piece}`;
      if (line !== '' && measure(candidate) > maxWidth) {
        lines.push(line);
        line = piece;
      } else {
        line = candidate;
      }
    }
  }
  if (line !== '') lines.push(line);
  return lines;
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

/**
 * Five cream squares on an expanding ring — the punctuation on a landing.
 * Nothing holds on to them: `lifespan` fades each one out and removes it from
 * the scene 0.45s later, so the scene graph owns them from here.
 */
function puff(k: KAPLAYCtx, x: number, y: number): void {
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    k.add([
      k.rect(5, 5),
      k.pos(x, y),
      k.anchor('center'),
      k.color(themedColor(k, 'bubble')),
      k.opacity(0.9),
      k.z(4),
      k.lifespan(0.45, { fade: 0.25 }),
      k.move(k.vec2(Math.cos(angle), Math.sin(angle) * 0.5), 120),
      tokenTag('bubble'),
    ]);
  }
}

/**
 * Resolved CSS family names — `village.ts`'s `resolveWebFont` result, not the
 * literal strings 'village'/'mono'. KAPLAY's `resolveFont` checks a font
 * string against loaded bitmap fonts and `document.fonts.check()` and throws
 * "Font not found" otherwise (see the long comment on `resolveWebFont` in
 * village.ts); nothing here ever registers fonts named "village" or "mono",
 * so passing those literals would throw the moment a frame actually draws.
 */
export interface CreatureFonts {
  pixel: string;
  mono: string;
}

export async function spawnCreature(
  k: KAPLAYCtx,
  creature: Creature,
  spot: Spot,
  fonts: CreatureFonts,
): Promise<CreatureActor> {
  const map = roleMap(creature.appearance.palette);
  // Not const: `setCreature` re-derives this whenever the server sends new
  // stats, so mood and energy keep selecting behaviours for as long as the
  // page is open rather than only on the frame the creature was first drawn.
  let lastCreature = creature;
  let lastNight = themeStore.current().flags.isNight;
  let behaviour = behaviourFor(creature, lastNight);
  const phi = phaseFor(creature.id);
  // The audio half of identity, derived once like the phase offset.
  const voice = voiceParamsFor(creature);
  // Appearance (and so `winged`) never changes without a respawn — village.ts
  // only calls spawnCreature again when the look itself changed — so this is
  // safe to capture once rather than re-reading `creature.appearance` per frame.
  const winged = creature.appearance.winged;
  const hasUmbrella = simpleHash(creature.id) % 3 === 0;

  // Bake the resting body once. A roaming lanky agent gets a second bake with
  // trailing legs; everyone else needs only the one.
  const restGrid = composeGrid(creature.appearance);
  const restKey = `body:${creature.id}`;
  await loadSprite(k, restKey, toCanvas(bakePixels(restGrid, map)));

  const dangles = creature.appearance.winged && creature.appearance.body === 'lanky';
  const roamKey = `body:${creature.id}:roam`;
  // Kept, not thrown away after baking: the two grids are *different heights*.
  // composeGrid keeps the torso and appends the posture's rows, and the
  // postures differ in length (stubs 1, splayed 2, floating 3, trailing 4), so
  // a roaming lanky agent wears a texture 1-3 rows (6-18px) taller than its
  // resting one. The body sprite is anchored at its base, so the taller
  // texture lifts the head — and every overlay measured off the top of the
  // body has to follow it.
  const roamGrid = dangles ? composeGrid(creature.appearance, 'trailing') : null;
  if (roamGrid) {
    await loadSprite(k, roamKey, toCanvas(bakePixels(roamGrid, map)));
  }

  const wingKey = `wing:${creature.appearance.palette.lite}`;
  if (!k.getSprite(wingKey)) {
    const wingGrid = { rows: WING, w: 4, h: 3, eyes: restGrid.eyes, crownRows: 0 };
    await loadSprite(k, wingKey, toCanvas(bakePixels(wingGrid, { X: creature.appearance.palette.lite, '.': null })));
  }

  const bw = restGrid.w * U;
  /** Body height at rest. Only ever the starting value — see `shown()`. */
  const restH = restGrid.h * U;

  /**
   * The grid actually on screen this frame. Same body and the same eye
   * anchors, but not the same height, which is the only reason this exists.
   * Takes the frame's already-weather-gated `fly` rather than reading
   * `behaviour.fly` itself, so a flyer grounded by rain drops the taller roam
   * texture immediately rather than waiting for `behaviour` to catch up.
   */
  const shown = (fly: Behaviour['fly']) => (roamGrid && fly === 'roam' ? roamGrid : restGrid);

  // Where this creature is standing right now. Not the `spot` parameter for
  // the life of the actor: the layout can move a villager along its row when a
  // newcomer's hash lands on its x (see zones.ts), and `setSpot` has to move
  // the gaze origin with the sprite.
  let at: Spot = spot;

  const root = k.add([k.pos(at.x, at.y), k.z(at.y)]);

  const shadow = root.add([
    k.rect(bw * 0.78, 10, { radius: 5 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(k.Color.fromHex(SHADOW)),
    k.opacity(creature.appearance.winged ? 0.1 : 0.18),
    k.z(-1),
  ]);

  // A creature spawned after a theme change (e.g. the clock crosses into
  // night while the page is open, and the server then sends a fresh look for
  // this id) has to wear the *current* tint from its very first frame — it
  // gets no help from the walker's own pass, which already ran before this
  // sprite existed. Struck once here, not re-read per frame: `applyTheme`'s
  // own pass is what keeps it current after that.
  const creatureTint = k.Color.fromHex(creatureTintColor(themeStore.current().tint));

  const body = root.add([
    k.sprite(restKey),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(U),
    k.color(creatureTint),
    'themed:creature',
  ]);

  const wings = creature.appearance.winged
    ? [-1, 1].map((side) =>
        root.add([
          k.sprite(wingKey),
          k.pos(side * (bw / 2), -restH * 0.55),
          // Both wings anchor 'left', including the mirrored one. KAPLAY turns
          // the anchor into a translate pushed *inside* the object transform
          // (drawUVQuad: pushScale then pushTranslate(offset), where offset =
          // anchorPt * -size/2), so the offset is multiplied by this object's
          // own scale. A negative sx therefore flips which side of the anchor
          // point the sprite occupies: 'right' — which reads as "extend
          // leftwards" — put the left wing at [-21, +3] for a lanky body,
          // lying inward across a torso spanning [-21, +21]. 'left' with the
          // mirror puts it at [-45, -21], the exact mirror of the right wing's
          // [+21, +45]. The negative scale is what mirrors the shape; the
          // anchor only names the hinge, which stays on the shoulder either way.
          k.anchor('left'),
          k.scale(U * side, U),
          k.rotate(0),
          k.z(-2),
          k.color(creatureTint),
          'themed:creature',
        ]),
      )
    : [];

  // Eye overlays are solid rects, so unlike the body sprite they get no
  // multiply from the tint for free — see creatureOverlayColor. Kept as hex
  // so the tint can be re-applied whenever the sky moves.
  const lidHex = creature.appearance.palette.hue;
  const pupilHex = map.K!;
  let eyeTintKey = '';
  let lidColour = k.Color.fromHex(creatureOverlayColor(lidHex, themeStore.current().tint));
  let pupilColour = k.Color.fromHex(creatureOverlayColor(pupilHex, themeStore.current().tint));

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
  // Eyes are siblings of `body`, not children, so `body.scale = vec2(U*sx,
  // U*sy)` deforming the baked eye-white block does nothing to these
  // overlays on its own — each one also carries its own `k.scale`, driven by
  // the same sx/sy every frame below, so the lid stays exactly the size of
  // the (now squashed/stretched) 2x2 white block it must fully cover.
  const eyes = restGrid.eyes.map(() => {
    const pupil = root.add([
      k.rect(U * 0.95, U * 1.15),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(pupilColour),
      k.scale(1),
      k.z(1),
    ]);
    const lid = root.add([
      k.rect(U * EYE_LID_CELLS, U * EYE_LID_CELLS),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(lidColour),
      k.scale(1),
      k.z(1),
    ]);
    const lash = root.add([
      k.rect(U * 2 - 2, 3.5),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(pupilColour),
      k.scale(1),
      k.z(2),
    ]);
    return { pupil, lid, lash };
  });

  // Labels start invisible and fade in on hover. Seventy always-on plates
  // stacked four depth rows deep were the first thing the first human viewer
  // complained about; one label, on the villager under the cursor, is the
  // village's whole name UI. And it is a *sign*, not floating text — bare ink
  // over a crowd of colourful bodies was the second thing they complained
  // about. The spec and the trailer both put names on cream signs; the
  // deferred finding that said so was deferred wrongly.
  // Until the LLM writes a nickname (M4), displayName falls back to the
  // filename — so a two-line sign would show the same long string twice and
  // size its plate to a 30-character mono line. One line until a creature has
  // a real given name; two lines after.
  const hasNickname = creature.nickname.trim().length > 0;

  const plate = root.add([
    k.rect(10, hasNickname ? 36 : 24, { radius: 4 }),
    k.pos(0, -restH - (hasNickname ? 25 : 20)),
    k.anchor('center'),
    k.color(themedColor(k, 'cream')),
    k.outline(2, themedColor(k, 'ink')),
    k.opacity(0),
    k.z(4.6),
    tokenTag('cream'),
  ]);

  // Text renders at TEXT_SS times its intended size and is scaled back down,
  // so glyphs downsample crisply instead of nearest-neighbour upscaling on
  // scaled displays (see theme.ts). Mono for the name line too: Pixelify Sans
  // is a decorative blocky face, and the first human reader could not read it
  // at sign size — it stays on the big zone signs only.
  const nameplate = root.add([
    k.text(hasNickname ? displayName(creature) : fileLabel(creature), {
      size: 14 * TEXT_SS,
      font: fonts.mono,
    }),
    k.pos(0, -restH - (hasNickname ? 32 : 20)),
    k.anchor('center'),
    k.scale(1 / TEXT_SS),
    k.color(themedColor(k, 'ink')),
    k.opacity(0),
    k.z(5),
    tokenTag('ink'),
  ]);

  const fileTag = hasNickname
    ? root.add([
        k.text(fileLabel(creature), { size: 11 * TEXT_SS, font: fonts.mono }),
        k.pos(0, -restH - 15),
        k.anchor('center'),
        k.scale(1 / TEXT_SS),
        k.color(themedColor(k, 'ink')),
        k.opacity(0),
        k.z(5),
        tokenTag('ink'),
      ])
    : null;

  // Fit the sign to whichever line runs longer. Text width is only known
  // after the components exist (and is measured pre-scale, hence / TEXT_SS);
  // the rect starts at a dummy size for the same reason.
  plate.width = Math.max(nameplate.width, fileTag ? fileTag.width : 0) / TEXT_SS + 12;

  // One speech bubble per creature, built empty and hidden: a villager that
  // is spoken to an hour from now has to have it ready, because nothing
  // respawns an actor when the player clicks it.
  // Deliberately no `width` option on the text — see wrapToWidth above; this
  // component's `.width` must report the rendered line, not a wrap budget.
  const bubbleText = root.add([
    // lineSpacing because formatText advances a line by `size + lineSpacing`
    // and defaults that to 0 — a multi-line reply would otherwise have its em
    // boxes touching. `say` reads the height back off this component, so the
    // leading is already inside the box it sizes.
    k.text('', {
      size: BUBBLE_SIZE * TEXT_SS,
      font: fonts.mono,
      align: 'center',
      lineSpacing: BUBBLE_LEADING * TEXT_SS,
    }),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(1 / TEXT_SS),
    k.color(themedColor(k, 'ink')),
    k.z(7),
    tokenTag('ink'),
  ]);
  const bubbleBg = root.add([
    // Sized from the rendered text on every `say`; these are placeholders.
    k.rect(10, 10, { radius: 6 }),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(1),
    k.color(themedColor(k, 'bubble')),
    k.outline(2, themedColor(k, 'ink')),
    k.opacity(0.97),
    k.z(6.5),
    tokenTag('bubble'),
  ]);
  bubbleText.hidden = true;
  bubbleBg.hidden = true;

  /**
   * When the current line started, on `update`'s clock. `null` is "no bubble";
   * -1 is "`say` ran since the last frame, start on the next one" — the age
   * has to be measured against the same `t` every other motion here uses, and
   * `say` is called from a network callback that has no `t` in hand.
   */
  let bubbleShownAt: number | null = null;
  let bubbleLife = 0;
  let endThought = false;

  /**
   * Measure on the component that will draw the line. Assigning `.text`
   * re-runs KAPLAY's own formatter synchronously and republishes
   * `.width`/`.height` (its `set text` → `update()` path), so these are
   * the dimensions of the glyphs that actually land on screen — the box is
   * sized from the text, never from a wrap budget, which is the whole
   * point of the first playtest's complaint about oversized signs.
   *
   * The scale is pinned first because the component reports the
   * *pre-scale* width (`formatted.width / scale.x`, components/draw/text.ts)
   * and a new bubble can arrive while the previous one is mid-shrink at some
   * arbitrary scale. At 1 the reported numbers are supersampled pixels,
   * so screen pixels are one division away. `update` takes the scale back
   * over on the next frame.
   */
  const showBubble = (text: string, life: number) => {
    bubbleText.scale = k.vec2(1, 1);
    const measure = (line: string) => {
      bubbleText.text = escapeStyled(line);
      return bubbleText.width / TEXT_SS;
    };
    bubbleText.text = wrapToWidth(measure, text, BUBBLE_MAX_W).map(escapeStyled).join('\n');
    bubbleW = bubbleText.width / TEXT_SS;
    bubbleH = bubbleText.height / TEXT_SS;
    bubbleLife = life;
    bubbleShownAt = -1;
    sound.event({ type: 'bubble-in', x: at.x });
    endThought = false;
    // Nothing draws until `update` has given this line a real scale; without
    // this it could flash for one frame at the measuring scale of 1, which
    // is TEXT_SS times too big.
    bubbleText.hidden = true;
    bubbleBg.hidden = true;
  };
  /** The rendered size of the current line, in screen pixels. Set by `say`. */
  let bubbleW = 0;
  let bubbleH = 0;

  // Sleep glyphs: three z's drifting up on their own offsets. Built for every
  // creature and shown only while it is asleep — a creature that dozes off an
  // hour from now has to have them ready, because `behaviour` changes under
  // this actor and nothing respawns it when it does.
  const zzz = [0, 1, 2].map((i) =>
    root.add([
      k.text('z', { size: (12 + i * 2) * TEXT_SS, font: fonts.mono }),
      k.pos(bw * 0.4, -restH),
      k.anchor('center'),
      k.scale(1 / TEXT_SS),
      k.color(themedColor(k, 'ink')),
      k.opacity(0.7),
      k.z(5),
      tokenTag('ink'),
      { drift: i * 0.34 },
    ]),
  );

  // The umbrella: 1 stick + 4 canopy rects, reference's drawUmbrella
  // geometry scaled from its U=4 authoring to this game's U=6. Built for
  // every umbrella-owning creature regardless of whether it's raining right
  // now — like the sleep glyphs above, a creature spawned in clear weather
  // still needs one ready for the next storm, since nothing respawns an
  // actor when the weather changes.
  //
  // Visibility for all 5 rects is owned by weather-layer.ts's `update()`
  // (tag 'themed:umbrella', found via the recursive k.get() every
  // village.ts applyTheme run). Colour is split the same way village.ts's
  // house windows split lamp-glow from ordinary scenery tint: the stick is
  // an ordinary wood-token prop (tokenTag('wood') keeps it in step with
  // every other wood prop via the *generic* per-token walker), while the
  // canopy's colour — the reference's `cc(d.accent)`, i.e. accent mixed at
  // the *creature* tint strength rather than the scenery one, so it tracks
  // the creature it shelters rather than the surrounding scenery — has no
  // generic token tag and is instead the sole responsibility of
  // weather-layer.ts's 'themed:umbrella:canopy' pass, to avoid the two
  // walkers fighting over the same paint every publish.
  if (hasUmbrella) {
    const nowTheme = themeStore.current();
    // Correct initial visibility struck from the *current* weather, not a
    // blanket "hidden until the next applyTheme" — the same reasoning as
    // `creatureTint` above: a creature spawned mid-storm (server data
    // arrives after the scene's own initial weather.update() already ran)
    // gets no help from a walker pass that ran before it existed, and
    // weather.update() only republishes when the resolved theme actually
    // changes, which an already-steady storm may not do again for a while.
    const rainingNow =
      (nowTheme.weather.kind === 'rain' || nowTheme.weather.kind === 'storm') && nowTheme.weather.ramp > 0.5;
    const yB = -restH - 8 * UMBRELLA_SCALE;
    const stick = root.add([
      k.rect(4 * UMBRELLA_SCALE, 20 * UMBRELLA_SCALE),
      k.pos(6 * UMBRELLA_SCALE, yB),
      k.color(themedColor(k, 'wood')),
      k.z(3),
      k.opacity(1),
      tokenTag('wood'),
      'themed:umbrella',
    ]);
    stick.hidden = !rainingNow;
    const canopyColour = k.Color.fromHex(
      sceneryColor(nowTheme.tokens, { col: nowTheme.tint.col, sceneryK: nowTheme.tint.creatureK }, 'accent'),
    );
    const canopyRects: [number, number, number, number][] = [
      [-10 * UMBRELLA_SCALE, yB - 4 * UMBRELLA_SCALE, 36 * UMBRELLA_SCALE, 5 * UMBRELLA_SCALE],
      [-5 * UMBRELLA_SCALE, yB - 9 * UMBRELLA_SCALE, 26 * UMBRELLA_SCALE, 5 * UMBRELLA_SCALE],
      [1 * UMBRELLA_SCALE, yB - 13 * UMBRELLA_SCALE, 14 * UMBRELLA_SCALE, 4 * UMBRELLA_SCALE],
      [6 * UMBRELLA_SCALE, yB - 17 * UMBRELLA_SCALE, 4 * UMBRELLA_SCALE, 4 * UMBRELLA_SCALE],
    ];
    for (const [x, y, w, h] of canopyRects) {
      const canopy = root.add([
        k.rect(w, h),
        k.pos(x, y),
        k.color(canopyColour),
        k.z(3.5),
        'themed:umbrella',
        'themed:umbrella:canopy',
      ]);
      canopy.hidden = !rainingNow;
    }
  }

  // Whether the player is holding this villager right now. It hides the whole
  // root, but the actor keeps updating underneath: the motion clock is
  // absolute, so nothing needs winding back when it lands, and letting
  // `update` run means a creature is drawn correctly on the very first frame
  // after it is set down rather than one frame stale.
  let held = false;

  // Timestamp of the most recently *observed* landing, so a hopper's `update`
  // (called once per frame) fires a puff exactly once per landing rather than
  // on every frame the hop's own `landedAt` continues to report it. Null only
  // until the first landing is observed — never again after that.
  let lastLanding: number | null = null;

  // Hover-label fade state. `lastT` exists only to derive a frame delta —
  // update() receives absolute time, and the fade should be frame-rate
  // independent rather than a fixed step per frame.
  let plateAlpha = 0;
  let lastT: number | null = null;

  // The wander leash eases toward its target instead of switching: a
  // creature dozing off drifts gently home as its leash shrinks to nothing,
  // and a fresh spawn strolls out from its spot rather than teleporting to
  // wherever its clock says it should already be.
  let leash = 0;
  let drift = 0;

  /**
   * Re-derive the behaviour flags and ring only the *transitions*. Called
   * both when the server sends new stats and when the sky crosses into or
   * out of night, so dozing follows the clock as well as the stats.
   *
   * The audible flag is false for the nightfall crossing: every villager flips on
   * the same minute, and seventy-five simultaneous sleep sighs is a wall of
   * noise rather than a village going to bed.
   */
  function applyBehaviour(night: boolean, audible: boolean): void {
    const prev = behaviour;
    lastNight = night;
    behaviour = behaviourFor(lastCreature, night);
    if (!audible) return;
    // Transitions ring; states don't. setCreature runs on every server tick,
    // so comparing against the previous flags is what keeps a sleeping
    // creature from snoring once per second.
    if (!prev.asleep && behaviour.asleep) {
      sound.event({ type: 'sleep-start', x: at.x, voice });
    }
    if (prev.fly !== 'roam' && behaviour.fly === 'roam') {
      sound.event({ type: 'takeoff', x: at.x });
    }
    if (prev.fly === 'roam' && behaviour.fly !== 'roam') {
      sound.event({ type: 'touch-down', x: at.x });
    }
  }

  return {
    update(t, lookAt, hovered = false) {
      const frameDt = lastT === null ? 0 : Math.min(t - lastT, 0.1);
      lastT = t;
      // Weather grounding: re-checked every frame (not just on the next
      // server tick's setCreature) so a flyer settles the instant rain or a
      // storm ramps past half strength, and lifts off again the instant it
      // clears — themeStore.current() is a cheap read, not a subscription.
      const themeNow = themeStore.current();
      // Eye overlays are solid rects: the retint walker's multiply only
      // reaches the body sprite, so their tinted shade is recomputed here
      // whenever the sky actually moves (a string compare, not a per-frame
      // colour mix), or a shut lid stays full-bright over a darkened body.
      const tintKey = themeNow.tint.col + themeNow.tint.creatureK;
      if (tintKey !== eyeTintKey) {
        eyeTintKey = tintKey;
        lidColour = k.Color.fromHex(creatureOverlayColor(lidHex, themeNow.tint));
        pupilColour = k.Color.fromHex(creatureOverlayColor(pupilHex, themeNow.tint));
        for (const { pupil, lid, lash } of eyes) {
          pupil.color = pupilColour;
          lid.color = lidColour;
          lash.color = pupilColour;
        }
      }
      // Nightfall beds the village down. Checked per frame from the same
      // cheap cached read as the weather below, so dozing follows the sky
      // without every actor holding its own theme subscription.
      if (themeNow.flags.isNight !== lastNight) applyBehaviour(themeNow.flags.isNight, false);
      const weatherNow = themeNow.weather;
      const grounded =
        winged && (weatherNow.kind === 'rain' || weatherNow.kind === 'storm') && weatherNow.ramp > 0.5;
      const fly = grounded ? null : behaviour.fly;

      // Grounded villagers amble; airborne flyers have their own roam, and a
      // sleeping creature's leash eases to zero, walking it home to doze.
      // Gated on the *effective* fly state, so a rain-grounded flyer ambles
      // under its umbrella like any walker.
      const leashTarget = behaviour.asleep || fly ? 0 : at.wander;
      leash += (leashTarget - leash) * Math.min(1, frameDt * 0.5);
      drift = wanderOffset(t, phi, leash);
      root.pos.x = at.x + drift;
      // t0 = -phi * 2.6 (the hop cycle length, private to motion.ts) shifts
      // each hopper's cycle start by its own phase, the same way breathe/
      // isBlinking/gaze/wingAngle/hover already do — without it every hopper
      // lands in lockstep, which is exactly what phaseFor exists to prevent.
      const hop = behaviour.hopper ? hopState(t, -phi * 2.6) : null;
      const dy = hop ? hop.dy : 0;
      const { sx, sy } = behaviour.asleep
        ? { sx: 1, sy: 1 }
        : hop
          ? { sx: 1 - (hop.sy - 1) * 0.7, sy: hop.sy }
          : breathe(t, phi, Boolean(fly));

      const hover = fly ? Math.sin(t * 1.3 + phi * 4) * 10 : 0;
      // Everything hung off the top of the body is measured from the grid
      // being drawn right now, not from the resting one. Freeze this at
      // restGrid and a roaming lanky agent's pupils, nameplate, file label and
      // wings all stay put while the taller roam texture lifts its head out
      // from under them.
      const grid = shown(fly);
      const bh = grid.h * U;
      body.pos.y = dy + hover;
      body.scale = k.vec2(U * sx, U * sy);

      if (dangles) {
        const wanted = fly === 'roam' ? roamKey : restKey;
        if (body.sprite !== wanted) body.use(k.sprite(wanted));
      }

      const squash = shadowSquash(dy);
      shadow.width = bw * 0.78 * squash;
      shadow.pos.y = 0;

      // A sleeping agent folds its wings; only a flying one flaps. Decided per
      // frame because `behaviour` can change without a respawn, and now also
      // because weather can ground a flyer without one either.
      const flap = fly ? wingAngle(t, phi) : 0;
      wings.forEach((wing, i) => {
        wing.angle = i === 0 ? -flap : flap;
        wing.pos.y = -bh * 0.55 + hover;
      });

      const shut = behaviour.asleep || isBlinking(t, phi);
      const look = shut ? 0 : gaze(t, phi, lookAt ?? undefined, at.x + drift);

      grid.eyes.forEach((anchor, i) => {
        const { pupil, lid, lash } = eyes[i]!;
        // Grid cells are measured from the top-left; the body is anchored at
        // its base. This recovers the eye-white block's centre in the same
        // *unscaled* local space the body sprite occupies at sx=sy=1 — off the
        // live grid's height, so it tracks the roam texture's taller head.
        const baseX = (anchor.c - grid.w / 2 + 1) * U;
        const baseY = (anchor.r - grid.h + 1) * U;
        // Scaling by sx/sy here mirrors body.scale exactly: a cell offset of
        // baseX/baseY unscaled cell-units becomes baseX*sx / baseY*sy screen
        // pixels under the same (U*sx, U*sy)-per-cell transform the body
        // sprite uses, so the eye overlays deform in lockstep with the baked
        // eye-white block instead of staying fixed while it moves under them.
        // dy/hover are body's own translation (hop/hover), not part of the
        // scale, so they're added after scaling, same as body.pos.y.
        const x = baseX * sx;
        const y = baseY * sy + dy + hover;

        pupil.hidden = shut;
        lid.hidden = !shut;
        lash.hidden = !shut;
        pupil.scale = k.vec2(sx, sy);
        lid.scale = k.vec2(sx, sy);
        lash.scale = k.vec2(sx, sy);

        if (shut) {
          lid.pos = k.vec2(x, y);
          // The lash sits just above the lid's own centre — the row
          // boundary inside the 2-row eye-white block it is covering.
          lash.pos = k.vec2(x, y - 0.25 * sy);
        } else {
          // U*0.125: the trailer's pupil is `top: e.r*U + U*0.55` in
          // top-left coordinates with height U*1.15, so its centre sits at
          // e.r*U + U*1.125 — the eye-white block's own centre (baseY) plus
          // U*0.125, not U*0.55 (that arithmetic slipped converting the
          // trailer's top-left anchoring to this file's centre anchoring).
          pupil.pos = k.vec2(x + look * 3.5 * sx, y + U * 0.125 * sy);
        }
      });

      plate.pos.y = -bh - (fileTag ? 25 : 20);
      nameplate.pos.y = -bh - (fileTag ? 32 : 20);
      if (fileTag) fileTag.pos.y = -bh - 15;

      if (bubbleShownAt !== null) {
        if (bubbleShownAt === -1) bubbleShownAt = t;
        if (endThought) {
          // Give the endless thinking bubble exactly a shrink-out's worth of
          // remaining life, measured from this frame.
          endThought = false;
          if (bubbleLife === Number.POSITIVE_INFINITY) bubbleLife = t - bubbleShownAt + BUBBLE_OUT;
        }
        const age = t - bubbleShownAt;
        const scale = bubbleScale(age, bubbleLife);
        // Scale is 0 at both ends of the life; the age guard is what tells the
        // frame the bubble was born on from the frame it finished shrinking.
        if (scale <= 0 && age > 0.5) {
          bubbleShownAt = null;
          bubbleText.hidden = true;
          bubbleBg.hidden = true;
          sound.event({ type: 'bubble-out', x: at.x });
        } else {
          // Both pieces are anchored 'bot' at the same base point, so the pop
          // grows the bubble upward out of the villager's head rather than out
          // of its own middle.
          const baseY = -bh - BUBBLE_LIFT;
          bubbleBg.width = bubbleW + BUBBLE_PAD * 2;
          bubbleBg.height = bubbleH + BUBBLE_PAD * 2;
          bubbleBg.pos = k.vec2(0, baseY);
          bubbleBg.scale = k.vec2(scale, scale);
          // The padding scales with the box. The box's own bottom is pinned at
          // baseY and its top rises by scale * (h + 2 * pad); a text baseline
          // held a fixed pad above baseY would therefore burst out of the top
          // of it early in the pop, when the box is still small.
          bubbleText.pos = k.vec2(0, baseY - BUBBLE_PAD * scale);
          bubbleText.scale = k.vec2(scale / TEXT_SS, scale / TEXT_SS);
          bubbleText.hidden = scale <= 0;
          bubbleBg.hidden = scale <= 0;
        }
      }

      for (const glyph of zzz) {
        glyph.hidden = !behaviour.asleep;
        const d = (glyph as unknown as { drift: number }).drift;
        const p = (t * 0.42 + d) % 1;
        glyph.pos = k.vec2(bw * 0.4 + p * 18, -bh - p * 40);
        glyph.opacity = 0.7 * (1 - p);
      }

      // hop.landedAt names the instant of the most recently completed
      // landing (see motion.ts); comparing it against lastLanding rather than
      // firing on every frame the hop is "in a landed state" is what keeps
      // one hop to exactly one puff.
      if (hop && hop.landedAt !== null) {
        if (lastLanding === null || held) {
          // The first landing this actor ever sees is one it did not watch
          // happen: the hop clock is staggered by -phi * 2.6, so most hoppers
          // are already mid-cycle on their first drawn frame and hopState
          // reports a landing that took place before the creature existed.
          // Adopt it silently — a puff is punctuation on a transition.
          //
          // Every landing during a hold is adopted the same silent way. The
          // hop clock runs on regardless of whose hand the creature is in,
          // and `puff` adds to the *scene* root rather than this one, so
          // without this a held hopper would kick dust off the empty patch of
          // ground it is not standing on. Adopting as we go also means being
          // set down never fires the backlog.
          lastLanding = hop.landedAt;
        } else if (hop.landedAt !== lastLanding) {
          lastLanding = hop.landedAt;
          puff(k, root.pos.x, root.pos.y);
          // The same exactly-once guard scores the landing: a landing that
          // draws no puff makes no sound either (the adopt-silently branch
          // above emits nothing).
          sound.event({ type: 'hop-landed', x: at.x });
        }
      }

      // Ease the label in and out of hover; scruffiness dims whatever shows.
      plateAlpha += ((hovered ? 1 : 0) - plateAlpha) * Math.min(1, frameDt * 14);
      plate.opacity = plateAlpha * 0.95;
      nameplate.opacity = plateAlpha * (behaviour.scruffy ? 0.55 : 1);
      if (fileTag) fileTag.opacity = plateAlpha * 0.65;
      // Pop the hovered villager (and its sign) in front of the crowd; depth
      // sorting is keyed on the feet's y, so a big additive term wins over
      // every unhovered neighbour and fades back as the label does. Composes
      // with setSpot, which writes the base depth into `at`.
      root.z = at.y + plateAlpha * 100000;
    },
    /**
     * Stats change on every server tick and the appearance does not, so
     * `village.ts` respawns an actor only when the *look* changes — otherwise
     * every creature's motion would restart several times a minute. That left
     * `behaviour` frozen at whatever the stats happened to be on the frame the
     * creature was first drawn, so `asleep`, `hopper`, `fly` and `scruffy`
     * selected once and then stopped mattering, against spec §4.2. Re-deriving
     * the flags here is the whole fix: the sprites, the phase and the motion
     * clock are all untouched, and everything downstream of `behaviour` —
     * sleep glyphs, nameplate dimming, wings, hop state, the roam posture
     * swap — is already read per frame in `update`.
     */
    setCreature(next) {
      lastCreature = next;
      applyBehaviour(lastNight, true);
    },
    /**
     * Guaranteed spacing and per-id-only placement cannot both hold — with a
     * finite number of non-overlapping spots, a newcomer landing on an
     * occupied one has to move somebody — so a villager's x can change while
     * it is on screen. Moving it here rather than respawning keeps the motion
     * clock, the phase and every baked sprite exactly as they were; the jump
     * is instant, which reads as the village making room. `z` follows `y`
     * because depth sorting is keyed on it.
     */
    worldX() {
      return at.x + drift;
    },
    setSpot(next) {
      at = next;
      // The next update() re-adds the current drift; writing the bare home x
      // here just keeps the frame between them from flashing stale ground.
      root.pos.x = next.x + drift;
      root.pos.y = next.y;
      root.z = next.y;
    },
    say(text, source = 'llm') {
      if (text.trim() === '') return;
      // Reading time comes off the line the creature said, not the wrapped
      // one — the line breaks are this bubble's business, not the reader's.
      showBubble(text, bubbleLifetime(text));
      sound.event({ type: 'speak', x: at.x, voice, textLength: text.length, canned: source === 'canned' });
    },
    think() {
      showBubble('…', Number.POSITIVE_INFINITY);
      sound.event({ type: 'thinking', x: at.x, voice });
    },
    clearThought() {
      // Only a thinking bubble is endless, so this can never cut short a
      // spoken line that replaced it. `update` resolves the flag because the
      // remaining life is measured on the same clock as every other motion.
      if (bubbleLife === Number.POSITIVE_INFINITY && bubbleShownAt !== null) endThought = true;
    },
    greet() {
      sound.event({ type: 'greeting', x: at.x, voice });
    },
    /**
     * `root.hidden` is enough to take the whole villager off screen: KAPLAY's
     * `draw()` returns on a hidden object *before* it walks its children, so
     * the body, wings, eyes, sign, bubble and sleep glyphs all go with it.
     */
    setHeld(next) {
      if (next === held) return;
      held = next;
      root.hidden = next;
      // Being set down is a landing, and it gets a landing's punctuation —
      // the same puff and thud a hop earns, at the feet the creature is
      // standing on rather than at the cursor that let go of it.
      if (!next) {
        puff(k, root.pos.x, root.pos.y);
        sound.event({ type: 'touch-down', x: at.x });
      }
    },
    destroy() {
      k.destroy(root);
    },
  };
}
