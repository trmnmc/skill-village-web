import kaplay, { type KAPLAYCtx } from 'kaplay';
import type { CreatureAppearance } from '@village/core/visual';
import { TEXT_SS, U } from '../theme.js';
import { THEME } from './theme.js';
import { GROUND_TOP, GROUND_Y, placeInRange, type Spot } from '../layout/zones.js';
import { spawnCreature, type CreatureActor } from '../scene/creature.js';
import { composeGrid, type EyeAnchor } from '../render/compose.js';
import { bakePixels } from '../render/bake.js';
import { roleMap } from '../render/roles.js';
import { clamp, easeOutBack, phaseFor } from '../motion/motion.js';
import { bakeEgg, EGG_ROWS } from './egg.js';
import { formatAuctionCountdown, type PanelTarget } from './copy.js';
import type { EggView, RareViewFull, ResidentView, ShowroomView } from './protocol.js';

/** One meadow, no zone strip — spec §5's showroom layout. */
const WORLD_W = 2200;
/** Fenced pen; eggs are placed here via placeInRange. */
const NURSERY = { lo: 160, hi: 520 };
/** Residents are placed here via placeInRange. */
const COMMONS = { lo: 640, hi: 1560 };
/** The rare stands here, never in the commons. */
const PEDESTAL_X = 1800;

/** How far a press may travel and still count as a click, in client pixels. */
const CLICK_SLOP = 6;
/** Reach for a creature/rare click or hover, squared distance in world pixels. */
const CREATURE_REACH = 90;
/** Eggs are smaller than creatures — a tighter reach keeps clicks unambiguous. */
const EGG_REACH = 55;

/**
 * The nursery's "active" wobble, copied verbatim from the trailer
 * (reference/swarm-village-trailer/swarm-village-scene.jsx): a 6.5s period,
 * 1.1s of it spent rocking through three ±6° oscillations, the rest resting.
 * The trailer offsets every egg by the same fixed 400ms, which is fine for a
 * two-egg demo scene but violates this task's own staging law once dozens of
 * eggs share a nest — so each egg is phase-shifted by its own hash instead,
 * the same trick zones.ts and motion.ts already use to keep the crowd off
 * one shared clock.
 */
const WOBBLE_PERIOD = 6.5;
const WOBBLE_BURST = 1.1;
const WOBBLE_OSCILLATIONS = 3;
const WOBBLE_DEG = 6;

/** Confetti hues — the trailer's eight-colour core palette (its `HUES`). */
const CONFETTI_HUES = ['#e58c68', '#b79fd6', '#9dba77', '#7fbf8a', '#e2b45e', '#e0a3b2', '#7fb6d9', '#6fbcad'];

/** The trailer's three crack stages, in the egg's own 9×11 grid coordinates. */
const CRACK_STAGES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[4, 4], [5, 5]],
  [[3, 5], [6, 4]],
  [[2, 6], [7, 5], [4, 6]],
];

export interface SpectatorVillage {
  setView(view: ShowroomView): void;
  playHatch(slug: string): void;
  setStatus(line: string): void;
}

export interface SpectatorVillageOptions {
  /** An egg, a villager, or the pedestal/rosette was clicked (a press that did not drag). */
  onTarget(target: PanelTarget): void;
}

function hex(k: KAPLAYCtx, value: string) {
  return k.Color.fromHex(value);
}

/** A flat rectangle prop, optionally translucent. Spec §4.1: props are rectangles, never sprites. */
function block(k: KAPLAYCtx, x: number, y: number, w: number, h: number, colour: string, z = 0, opacity = 1) {
  return k.add([k.rect(w, h), k.pos(x, y), k.color(hex(k, colour)), k.opacity(opacity), k.z(z)]);
}

/**
 * The contact-shadow ellipse every standing thing gets — trailer's `Shadow`,
 * `rgba(90,70,40,0.28)`, which is THEME.shadow at 0.28 opacity almost to the
 * hex. Staging law: nothing floats.
 */
function contactShadow(k: KAPLAYCtx, cx: number, y: number, w: number, h = 8, z = -0.5) {
  k.add([
    k.rect(w, h, { radius: h / 2 }),
    k.pos(cx, y),
    k.anchor('center'),
    k.color(hex(k, THEME.shadow)),
    k.opacity(0.28),
    k.z(z),
  ]);
}

/**
 * A house: wall/door/window/roof geometry lifted from `scene/village.ts`'s
 * `house()` so the two villages read as the same place, plus what that
 * function never needed — a contact shadow, a base-shade row along the
 * footing, and a dirt apron at the doorstep (trailer: `pal.line` under every
 * house). `x`/`y` are the wall's left edge and baseline, same convention.
 */
function house(k: KAPLAYCtx, x: number, y: number, wall: string, roof: string) {
  contactShadow(k, x + 43, y, 94, 10, 0.5);
  block(k, x, y - 66, 86, 66, wall, 1);
  block(k, x, y - 8, 86, 8, THEME.shadow, 1.1, 0.35);
  block(k, x + 30, y - 34, 22, 34, THEME.wood, 2);
  block(k, x + 10, y - 56, 16, 14, THEME.sky, 2);
  block(k, x - 8, y - 80, 102, 14, roof, 2);
  block(k, x + 6, y - 92, 74, 12, roof, 2);
  block(k, x + 22, y - 102, 42, 10, roof, 2);
  block(k, x + 22, y, 30, 6, THEME.groundDark, 0.4, 0.6);
}

function tree(k: KAPLAYCtx, x: number, y: number) {
  contactShadow(k, x + 20, y, 40, 8, 0.5);
  block(k, x + 14, y - 44, 12, 44, THEME.wood, 1);
  block(k, x, y - 96, 40, 54, THEME.foliage, 1);
  block(k, x + 8, y - 110, 24, 18, THEME.foliageLite, 1);
}

/** Two posts, two rails, a nest patch. Eggs sit inside via placeInRange(NURSERY.lo, NURSERY.hi). */
function nurseryFence(k: KAPLAYCtx, lo: number, hi: number, groundY: number) {
  const postTop = groundY - 150;
  for (const px of [lo, hi]) {
    contactShadow(k, px + 6, groundY, 22, 6, 0.4);
    block(k, px, postTop, 12, groundY - postTop, THEME.wood, 1);
    block(k, px - 2, postTop - 4, 16, 8, THEME.shadow, 1.2, 0.6);
  }
  block(k, lo + 6, groundY - 100, hi - lo - 12, 9, THEME.wood, 1);
  block(k, lo + 6, groundY - 132, hi - lo - 12, 9, THEME.wood, 1);
  block(k, lo + 30, groundY - 18, hi - lo - 60, 14, THEME.moss, 0.6, 0.55);
}

/** A small pixel diamond — "the rosette" the hint chip names as a click target. */
function rosette(k: KAPLAYCtx, cx: number, cy: number, colour: string) {
  const px = 4;
  const cells: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
  for (const [c, r] of cells) block(k, cx - 1.5 * px + c * px, cy - 1.5 * px + r * px, px, px, colour, 2);
}

/**
 * The rare's plinth: a dark base, a wider wood cap the creature stands on,
 * and the rosette badge mounted on the base's face so it reads as clickable
 * even before any rare is configured. Returns the cap's top edge — where a
 * standing creature's feet belong, same "y is the bottom-anchored point"
 * convention `layout/zones.ts`'s Spot uses everywhere else.
 */
function pedestal(k: KAPLAYCtx, x: number, y: number): number {
  contactShadow(k, x, y, 96, 10, 0.5);
  block(k, x - 40, y - 26, 80, 26, THEME.shadow, 1, 0.9);
  const topY = y - 42;
  block(k, x - 55, topY, 110, 16, THEME.wood, 1);
  block(k, x - 55, topY + 13, 110, 3, THEME.shadow, 1.5, 0.6);
  rosette(k, x, y - 13, THEME.accent);
  return topY;
}

/**
 * See the long comment on `resolveWebFont` in `scene/village.ts` — same
 * problem (KAPLAY throws "Font not found" unless the browser has already
 * fetched the glyphs), same fix, duplicated because that function is not
 * exported.
 */
async function resolveWebFont(family: string, fallback: string): Promise<string> {
  try {
    await document.fonts.load(`16px "${family}"`);
  } catch {
    // Fall through — the check below is what actually decides.
  }
  return document.fonts.check(`16px "${family}"`) ? family : fallback;
}

/** Paint raw pixels onto a canvas so KAPLAY can load it as a sprite. Mirrors creature.ts's private helper. */
function toCanvas(baked: { w: number; h: number; data: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = baked.w;
  canvas.height = baked.h;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(baked.data), baked.w, baked.h), 0, 0);
  return canvas;
}

/** `k.loadSprite`'s `Asset` is not a real Promise — see creature.ts's identical helper. */
function loadSprite(k: KAPLAYCtx, name: string, canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    k.loadSprite(name, canvas).onLoad(() => resolve()).onError(reject);
  });
}

function loadIfMissing(k: KAPLAYCtx, key: string, canvas: () => HTMLCanvasElement): Promise<void> {
  return k.getSprite(key) ? Promise.resolve() : loadSprite(k, key, canvas());
}

const eggScale = (runs: number) => U * (1 + Math.min(runs, 6) * 0.04);

/** A point in the egg's own 9×11 grid, converted to local pixels around the anchor('bot') root. */
function cellPoint(col: number, row: number, w: number, h: number, scale: number): [number, number] {
  return [(col - w / 2 + 0.5) * scale, -(h - row - 0.5) * scale];
}

interface EggActor {
  update(t: number): void;
  setEgg(next: EggView): void;
  setSpot(next: Spot): void;
  destroy(): void;
}

/**
 * The nursery's ordinary standing egg: shadow, baked shell, always-visible
 * name tag. An egg's hue never changes once assigned, so — unlike a
 * resident — this never needs to respawn on a later view; `setEgg` only
 * ever adjusts scale, wobble and the tag text in place.
 */
async function spawnEggActor(k: KAPLAYCtx, egg: EggView, spot: Spot, mono: string): Promise<EggActor> {
  const spriteKey = `egg:${egg.hue}`;
  await loadIfMissing(k, spriteKey, () => toCanvas(bakeEgg(egg.hue)));

  const seed = phaseFor(egg.slug) * WOBBLE_PERIOD;
  let at = spot;
  let active = egg.active;
  let name = egg.name;

  const root = k.add([k.pos(at.x, at.y), k.z(at.y)]);
  root.add([
    k.rect(9 * U * 0.8, 8, { radius: 4 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, THEME.shadow)),
    k.opacity(0.28),
    k.z(-1),
  ]);
  const sprite = root.add([
    k.sprite(spriteKey),
    k.pos(0, 0),
    k.anchor('bot'),
    k.scale(eggScale(egg.runs)),
    k.rotate(0),
  ]);
  const tagY = () => -11 * sprite.scale.x - 16;
  const plate = root.add([
    k.rect(10, 20, { radius: 4 }),
    k.pos(0, tagY()),
    k.anchor('center'),
    k.color(hex(k, THEME.signCream)),
    k.outline(2, hex(k, THEME.ink)),
    k.z(4.6),
  ]);
  const label = root.add([
    k.text(name !== '' ? name : '?????', { size: 12 * TEXT_SS, font: mono }),
    k.pos(0, tagY()),
    k.anchor('center'),
    k.scale(1 / TEXT_SS),
    k.color(hex(k, THEME.ink)),
    k.z(5),
  ]);
  plate.width = label.width / TEXT_SS + 10;

  return {
    update(t) {
      if (!active) {
        sprite.angle = 0;
        return;
      }
      const b = (t + seed) % WOBBLE_PERIOD;
      sprite.angle = b < WOBBLE_BURST
        ? Math.sin((b / WOBBLE_BURST) * Math.PI * 2 * WOBBLE_OSCILLATIONS) * WOBBLE_DEG
        : 0;
    },
    setEgg(next) {
      active = next.active;
      if (next.name !== name) {
        name = next.name;
        label.text = name !== '' ? name : '?????';
        plate.width = label.width / TEXT_SS + 10;
      }
      sprite.scale = k.vec2(eggScale(next.runs), eggScale(next.runs));
      plate.pos.y = tagY();
      label.pos.y = tagY();
    },
    setSpot(next) {
      at = next;
      root.pos.x = next.x;
      root.pos.y = next.y;
      root.z = next.y;
    },
    destroy() {
      k.destroy(root);
    },
  };
}

/** 5 cream squares on an expanding ring — same shape as creature.ts's landing `puff`, at the pedestal/egg scale. */
function confettiBurst(k: KAPLAYCtx, x: number, y: number): void {
  CONFETTI_HUES.forEach((hue, i) => {
    const angle = (i / CONFETTI_HUES.length) * Math.PI * 2 + 0.4;
    k.add([
      k.rect(5, 5),
      k.pos(x, y),
      k.anchor('center'),
      k.color(hex(k, hue)),
      k.opacity(1),
      k.z(20),
      k.lifespan(0.9, { fade: 0.25 }),
      k.move(k.vec2(Math.cos(angle), Math.sin(angle) * 0.8), 110),
    ]);
  });
}

/**
 * The ceremony's "pop the new resident in" beat. The real `CreatureActor`
 * already exists at its true commons spot by the time this runs (the
 * showroom server always sends the village frame before the paired hatch
 * frame — see `app.ts`'s `wsFrames`), so this is a decorative echo, not a
 * second copy of the interactive creature: it bakes a one-off sprite from
 * the same appearance if one is known, overshoots in at the egg's own spot,
 * and fades itself out a couple of seconds later.
 */
function popResident(k: KAPLAYCtx, x: number, y: number, appearance: CreatureAppearance | null): void {
  let spriteKey: string | null = null;
  let gw = 8;
  let gh = 8;
  if (appearance) {
    const grid = composeGrid(appearance);
    gw = grid.w;
    gh = grid.h;
    spriteKey = `hatch-pop:${appearance.palette.hue}:${appearance.body}:${appearance.crown}:${appearance.winged ? 1 : 0}`;
    if (!k.getSprite(spriteKey)) void loadSprite(k, spriteKey, toCanvas(bakePixels(grid, roleMap(appearance.palette))));
  }
  const w = gw * U;
  const h = gh * U;
  const t0 = k.time();
  const root = k.add([k.pos(x, y), k.z(y + 2), k.opacity(1), k.lifespan(2.4, { fade: 0.6 })]);
  root.add([
    k.rect(w * 0.75, 8, { radius: 4 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, THEME.shadow)),
    k.opacity(0.28),
  ]);
  const body = spriteKey
    ? root.add([k.sprite(spriteKey), k.pos(0, 0), k.anchor('bot'), k.scale(U)])
    : root.add([k.rect(w, h, { radius: 4 }), k.pos(0, 0), k.anchor('bot'), k.color(hex(k, THEME.accent)), k.scale(1)]);
  const POP_DURATION = 0.55;
  root.onUpdate(() => {
    // 0.4 -> ~1.06 -> 1: easeOutBack's own overshoot peak (~1.10) lands the
    // curve on the brief's numbers without hand-tuning a second easing.
    const age = k.time() - t0;
    const s = 0.4 + easeOutBack(clamp(age / POP_DURATION, 0, 1)) * 0.6;
    body.scale = spriteKey ? k.vec2(U * s, U * s) : k.vec2(s, s);
  });
}

/** A transient cream sign, stamped once and left to fade — not architecture. */
function stampSign(k: KAPLAYCtx, x: number, y: number, label: string, pixel: string): void {
  const root = k.add([k.pos(x, y - 96), k.z(y + 3), k.opacity(1), k.lifespan(6, { fade: 1.2 })]);
  root.add([k.rect(6, 30), k.pos(0, 26), k.anchor('top'), k.color(hex(k, THEME.wood))]);
  const text = root.add([
    k.text(label, { size: 13 * TEXT_SS, font: pixel }),
    k.pos(0, 0),
    k.anchor('center'),
    k.scale(1 / TEXT_SS),
    k.color(hex(k, THEME.ink)),
    k.z(1),
  ]);
  const box = root.add([
    k.rect(Math.max(120, text.width / TEXT_SS + 20), 34, { radius: 4 }),
    k.pos(0, 0),
    k.anchor('center'),
    k.color(hex(k, THEME.signCream)),
    k.outline(2, hex(k, THEME.ink)),
  ]);
  box.width = Math.max(120, text.width / TEXT_SS + 20);
}

/**
 * The hatch mockup timeline (spec's §5 reference, timed against the trailer):
 * rock hard through 2.1s, ink cracks from 1.4s in three stages, the shell
 * splits and flings apart from 2.1s to 2.6s, a resident pops in with
 * confetti at 2.15s, a sign stamps at 2.85s. Fully self-contained — it bakes
 * its own shell/half sprites rather than reusing the live `EggActor`,
 * because by the time this runs the ordinary `setView` cleanup may already
 * have destroyed that actor (the hatched egg is gone from `view.eggs` the
 * moment the resident appears in `view.residents`).
 */
function playHatchCeremony(
  k: KAPLAYCtx,
  spot: Spot,
  hue: string,
  name: string,
  appearance: CreatureAppearance | null,
  pixelFont: string,
): void {
  const shellKey = `hatch-shell:${hue}`;
  const topKey = `hatch-top:${hue}`;
  const botKey = `hatch-bot:${hue}`;
  const shellMap = { X: THEME.signCream, A: hue };
  const eyes: [EyeAnchor, EyeAnchor] = [{ c: 0, r: 0 }, { c: 0, r: 0 }];

  void Promise.all([
    loadIfMissing(k, shellKey, () => toCanvas(bakePixels({ w: 9, h: 11, rows: EGG_ROWS as string[], eyes, crownRows: 0 }, shellMap))),
    loadIfMissing(k, topKey, () => toCanvas(bakePixels({ w: 9, h: 5, rows: EGG_ROWS.slice(0, 5) as string[], eyes, crownRows: 0 }, shellMap))),
    loadIfMissing(k, botKey, () => toCanvas(bakePixels({ w: 9, h: 6, rows: EGG_ROWS.slice(5) as string[], eyes, crownRows: 0 }, shellMap))),
  ]).then(() => {
    const t0 = k.time();
    const root = k.add([k.pos(spot.x, spot.y), k.z(spot.y + 1)]);

    root.add([
      k.rect(9 * U * 0.8, 8, { radius: 4 }),
      k.pos(0, 0),
      k.anchor('center'),
      k.color(hex(k, THEME.shadow)),
      k.opacity(0.28),
      k.z(-1),
    ]);
    const shell = root.add([k.sprite(shellKey), k.pos(0, 0), k.anchor('bot'), k.scale(U), k.rotate(0)]);
    const top = root.add([k.sprite(topKey), k.pos(0, -6 * U), k.anchor('bot'), k.scale(U), k.rotate(0), k.opacity(1)]);
    const bot = root.add([k.sprite(botKey), k.pos(0, 0), k.anchor('bot'), k.scale(U), k.rotate(0), k.opacity(1)]);
    top.hidden = true;
    bot.hidden = true;

    const crackDots = CRACK_STAGES.flatMap((stage, si) =>
      stage.map(([cx, cy]) => {
        const [px, py] = cellPoint(cx, cy, 9, 11, U);
        const dot = root.add([
          k.rect(U * 0.7, U * 0.7),
          k.pos(px, py),
          k.anchor('center'),
          k.color(hex(k, THEME.shadow)),
          k.z(1),
        ]);
        dot.hidden = true;
        return { dot, at: 1.4 + si * 0.25 };
      }),
    );

    root.onUpdate(() => {
      const h = k.time() - t0;
      if (h < 2.1) {
        const b = h % 1.3;
        const amp = h > 1.4 ? 1.3 : 1;
        shell.angle = b < 0.75 ? Math.sin((b / 0.75) * Math.PI * 6) * 6 * amp : 0;
        for (const { dot, at } of crackDots) dot.hidden = h < at;
      } else {
        shell.hidden = true;
        for (const { dot } of crackDots) dot.hidden = true;
        top.hidden = false;
        bot.hidden = false;
        const sp = k.easings.easeOutCubic(clamp((h - 2.1) / 0.5, 0, 1));
        top.pos = k.vec2(-sp * 20, -6 * U - sp * 40);
        top.angle = -sp * 20;
        top.opacity = 1 - sp;
        bot.pos = k.vec2(sp * 15, sp * 18);
        bot.angle = sp * 9;
        bot.opacity = 1 - sp;
      }
    });

    k.wait(2.15, () => {
      confettiBurst(k, spot.x, spot.y - 6 * U);
      popResident(k, spot.x, spot.y, appearance);
    });
    k.wait(2.6, () => k.destroy(root));
    k.wait(2.85, () => stampSign(k, spot.x, spot.y, `${name} — hatched!`, pixelFont));
  });
}

export async function startSpectatorVillage(options: SpectatorVillageOptions): Promise<SpectatorVillage> {
  const [pixelFont, monoFont] = await Promise.all([
    resolveWebFont('Pixelify Sans', 'monospace'),
    resolveWebFont('IBM Plex Mono', 'monospace'),
  ]);

  const k = kaplay({
    background: THEME.sky,
    crisp: true,
    global: false,
    // See scene/village.ts's identical option for the full rationale: text
    // reads broken on a display scaled above 100% without it.
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  // Ground: dark horizon strip over one light field, matching the game's own
  // construction so the horizon math agrees between the two scenes.
  block(k, 0, GROUND_TOP, WORLD_W, 14, THEME.groundDark, 0);
  block(k, 0, GROUND_TOP + 14, WORLD_W, k.height() * 2, THEME.ground, 0);
  for (const [px, w] of [[220, 380], [780, 420], [1300, 380], [1780, 300]] as const) {
    block(k, px, GROUND_Y - 200, w, 46, THEME.groundDark, 0.2, 0.4);
  }

  house(k, 300, GROUND_Y - 20, THEME.signCream, THEME.accent);
  house(k, 900, GROUND_Y - 24, THEME.wallLilac, THEME.roofLilac);
  house(k, 1420, GROUND_Y - 18, THEME.wallSand, THEME.roofClay);
  for (const dx of [90, 610, 1160, 1700, 2100]) tree(k, dx, GROUND_Y - 10);

  nurseryFence(k, NURSERY.lo, NURSERY.hi, GROUND_Y);
  const pedestalTopY = pedestal(k, PEDESTAL_X, GROUND_Y);

  // The rare's in-world sign: "RARE DROP" + the auction countdown, re-drawn
  // every second. Built once, hidden until a rare is configured. Must be
  // every second, not once a minute: formatAuctionCountdown renders
  // HH:MM:SS inside the final day, so anything slower makes the seconds
  // digit freeze and then lurch forward in visible jumps.
  const rareSignRoot = k.add([k.pos(PEDESTAL_X + 70, pedestalTopY), k.z(pedestalTopY + 2)]);
  rareSignRoot.hidden = true;
  rareSignRoot.add([k.rect(8, 60), k.pos(20, 4), k.anchor('top'), k.color(hex(k, THEME.wood))]);
  const rareSignBox = rareSignRoot.add([
    k.rect(150, 58, { radius: 4 }),
    k.pos(0, -58),
    k.anchor('topleft'),
    k.color(hex(k, THEME.signCream)),
    k.outline(2, hex(k, THEME.ink)),
    k.z(1),
  ]);
  const rareSignTitle = rareSignRoot.add([
    k.text('RARE DROP', { size: 14 * TEXT_SS, font: pixelFont }),
    k.pos(10, -50),
    k.scale(1 / TEXT_SS),
    k.color(hex(k, THEME.accent)),
    k.z(2),
  ]);
  const rareSignSub = rareSignRoot.add([
    k.text('', { size: 11 * TEXT_SS, font: monoFont }),
    k.pos(10, -28),
    k.scale(1 / TEXT_SS),
    k.color(hex(k, THEME.ink)),
    k.z(2),
  ]);

  let latestRare: RareViewFull | null = null;
  function renderRareSign(): void {
    if (!latestRare) {
      rareSignRoot.hidden = true;
      return;
    }
    rareSignRoot.hidden = false;
    const countdown = formatAuctionCountdown(Date.now(), latestRare.auctionOpensAt);
    rareSignSub.text = countdown === 'open' ? 'auction is open' : countdown === '' ? 'auction tbd' : `auction in ${countdown}`;
    rareSignBox.width = Math.max(rareSignTitle.width, rareSignSub.width) / TEXT_SS + 20;
  }
  setInterval(renderRareSign, 1_000);

  // Drag to pan — identical mechanics to scene/village.ts (see that file's
  // long comment on why the pan/click listeners live on window rather than
  // the canvas): mousedown arms it, any window-level release/cancel/blur
  // disarms it so a drag that ends outside the canvas never leaves the
  // camera stuck mid-pan.
  let panning = false;
  const stopPanning = () => { panning = false; };
  k.onMouseDown('left', () => { panning = true; });
  k.onMouseMove((_pos, delta) => {
    if (!panning) return;
    const next = k.getCamPos().x - delta.x;
    k.setCamPos(k.clamp(next, k.width() / 2, WORLD_W - k.width() / 2), k.getCamPos().y);
  });
  window.addEventListener('mouseup', stopPanning);
  window.addEventListener('pointercancel', stopPanning);
  window.addEventListener('blur', stopPanning);

  k.setCamPos(
    k.clamp((COMMONS.lo + COMMONS.hi) / 2, k.width() / 2, WORLD_W - k.width() / 2),
    GROUND_Y - 130,
  );

  // A single unobtrusive status line — connecting/offline/empty-feed copy —
  // parked away from the four DOM hud corners spectator.html already claims.
  const status = k.add([
    k.text('', { size: 13 * TEXT_SS, font: monoFont }),
    k.scale(1 / TEXT_SS),
    k.pos(k.width() - 12, 12),
    k.anchor('topright'),
    k.fixed(),
    k.color(hex(k, THEME.ink)),
    k.z(100),
  ]);

  let lookAt: number | null = null;
  let cursorY: number | null = null;
  k.onMouseMove((pos) => {
    lookAt = pos.x + k.getCamPos().x - k.width() / 2;
    cursorY = pos.y + k.getCamPos().y - k.height() / 2;
  });

  // Residents (commons + the rare, if one is configured and its appearance
  // is known) share one bookkeeping set, exactly as scene/village.ts does —
  // the rare is just a resident whose spot is the pedestal instead of a
  // placeInRange seat.
  const actors = new Map<string, CreatureActor>();
  const generations = new Map<string, number>();
  let known = new Map<string, ResidentView>();
  let placements = new Map<string, Spot>();
  let rareActorId: string | null = null;
  let residentsBySlug = new Map<string, ResidentView>();

  const eggActors = new Map<string, EggActor>();
  const spawningEggs = new Set<string>();
  let knownEggs = new Map<string, EggView>();
  let eggPlacements = new Map<string, Spot>();
  // Never pruned: playHatch's ceremony needs an egg's last spot/hue/name
  // even after the ordinary setView cleanup has already destroyed its
  // EggActor (the hatched egg is gone from view.eggs the instant the new
  // resident appears in view.residents — see playHatchCeremony's comment).
  const lastEggSpot = new Map<string, Spot>();
  const lastEggHue = new Map<string, string>();
  const lastEggName = new Map<string, string>();

  let hoveredId: string | null = null;

  k.onUpdate(() => {
    const t = k.time();
    hoveredId = null;
    if (lookAt !== null && cursorY !== null) {
      let best = CREATURE_REACH * CREATURE_REACH;
      for (const [id, spot] of placements) {
        const dx = lookAt - spot.x;
        const dyMid = cursorY - (spot.y - 34);
        const d = dx * dx + dyMid * dyMid;
        if (d < best) { best = d; hoveredId = id; }
      }
    }
    for (const [id, actor] of actors) actor.update(t, lookAt, id === hoveredId);
    for (const eggActor of eggActors.values()) eggActor.update(t);
  });

  // Click routing: a press that did not turn into a drag. Same gesture
  // that pans the camera, so only a release within CLICK_SLOP of the press
  // counts — identical contract to scene/village.ts's own click handler.
  let pressedAt: { x: number; y: number } | null = null;
  k.canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    pressedAt = { x: event.clientX, y: event.clientY };
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    const from = pressedAt;
    pressedAt = null;
    if (from === null) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) >= CLICK_SLOP) return;

    if (hoveredId !== null) {
      const resident = known.get(hoveredId);
      if (resident) {
        if (hoveredId === rareActorId && latestRare) options.onTarget({ kind: 'rare', rare: latestRare });
        else options.onTarget({ kind: 'common', resident });
        return;
      }
    }

    if (lookAt === null || cursorY === null) return;

    let bestEggSlug: string | null = null;
    let bestEggD = EGG_REACH * EGG_REACH;
    for (const [slug, spot] of eggPlacements) {
      const dx = lookAt - spot.x;
      const dyMid = cursorY - (spot.y - 36);
      const d = dx * dx + dyMid * dyMid;
      if (d < bestEggD) { bestEggD = d; bestEggSlug = slug; }
    }
    if (bestEggSlug !== null) {
      const egg = knownEggs.get(bestEggSlug);
      if (egg) { options.onTarget({ kind: 'egg', egg }); return; }
    }

    // The empty rosette: a rare is configured but no matching resident (and
    // therefore no actor) was found yet. The static pedestal point is the
    // only click target in that case.
    if (latestRare && rareActorId === null) {
      const dx = lookAt - PEDESTAL_X;
      const dyMid = cursorY - (pedestalTopY - 20);
      if (dx * dx + dyMid * dyMid <= CREATURE_REACH * CREATURE_REACH) {
        options.onTarget({ kind: 'rare', rare: latestRare });
      }
    }
  });

  function setView(view: ShowroomView): void {
    latestRare = view.rare;
    renderRareSign();
    residentsBySlug = new Map(view.residents.map((r) => [r.slug, r]));

    const rareResident = view.rare ? view.residents.find((r) => r.slug === view.rare!.slug) ?? null : null;
    rareActorId = rareResident ? rareResident.id : null;
    const commons = view.residents.filter((r) => !view.rare || r.slug !== view.rare.slug);
    const toRender = rareResident ? [...commons, rareResident] : commons;

    const spots = new Map<string, Spot>(placeInRange(commons.map((r) => r.id), COMMONS.lo, COMMONS.hi));
    // wander 0: the rare resident stands its pedestal — Spot carries a wander
    // leash for the main village's amblers, which the showroom doesn't use.
    if (rareResident) spots.set(rareResident.id, { x: PEDESTAL_X, y: pedestalTopY, wander: 0 });
    placements = spots;

    const seen = new Set<string>();
    for (const creature of toRender) {
      seen.add(creature.id);
      const spot = spots.get(creature.id)!;
      const before = known.get(creature.id);
      const changed = before && JSON.stringify(before.appearance) !== JSON.stringify(creature.appearance);
      if (!actors.has(creature.id) || changed) {
        actors.get(creature.id)?.destroy();
        actors.delete(creature.id);
        const gen = (generations.get(creature.id) ?? 0) + 1;
        generations.set(creature.id, gen);
        void spawnCreature(k, creature, spot, { pixel: pixelFont, mono: monoFont })
          .then((actor) => {
            if (generations.get(creature.id) !== gen) { actor.destroy(); return; }
            actor.setSpot(placements.get(creature.id) ?? spot);
            actor.setCreature(known.get(creature.id) ?? creature);
            actors.set(creature.id, actor);
          })
          .catch(() => {
            // A failed sprite load leaves nothing to add — see creature.ts.
          });
      } else {
        const actor = actors.get(creature.id)!;
        actor.setSpot(spot);
        actor.setCreature(creature);
      }
    }
    for (const [id, actor] of actors) {
      if (!seen.has(id)) { actor.destroy(); actors.delete(id); }
    }
    known = new Map(toRender.map((c) => [c.id, c]));

    const eggIds = view.eggs.map((e) => e.slug);
    const nextEggSpots = placeInRange(eggIds, NURSERY.lo, NURSERY.hi);
    eggPlacements = nextEggSpots;
    const seenEggs = new Set<string>();
    for (const egg of view.eggs) {
      seenEggs.add(egg.slug);
      const spot = nextEggSpots.get(egg.slug)!;
      lastEggSpot.set(egg.slug, spot);
      lastEggHue.set(egg.slug, egg.hue);
      lastEggName.set(egg.slug, egg.name);

      const existing = eggActors.get(egg.slug);
      if (existing) {
        existing.setEgg(egg);
        existing.setSpot(spot);
      } else if (!spawningEggs.has(egg.slug)) {
        spawningEggs.add(egg.slug);
        void spawnEggActor(k, egg, spot, monoFont)
          .then((actor) => {
            spawningEggs.delete(egg.slug);
            if (!knownEggs.has(egg.slug)) { actor.destroy(); return; }
            actor.setSpot(eggPlacements.get(egg.slug) ?? spot);
            actor.setEgg(knownEggs.get(egg.slug) ?? egg);
            eggActors.set(egg.slug, actor);
          })
          .catch(() => { spawningEggs.delete(egg.slug); });
      }
    }
    for (const [slug, actor] of eggActors) {
      if (!seenEggs.has(slug)) { actor.destroy(); eggActors.delete(slug); }
    }
    knownEggs = new Map(view.eggs.map((e) => [e.slug, e]));
  }

  function playHatch(slug: string): void {
    const spot = lastEggSpot.get(slug);
    if (!spot) return;
    const hue = lastEggHue.get(slug) ?? THEME.signCream;
    const resident = residentsBySlug.get(slug) ?? null;
    const name = lastEggName.get(slug) || resident?.name || slug;

    // Ordering guarantee (app.ts's wsFrames always sends the village frame
    // before its paired hatch frame) means the egg is normally already gone
    // from eggActors by now; this only fires for a stray still-live actor.
    const live = eggActors.get(slug);
    if (live) { live.destroy(); eggActors.delete(slug); }

    playHatchCeremony(k, spot, hue, name, resident?.appearance ?? null, pixelFont);
  }

  return {
    setView,
    playHatch,
    setStatus(line) {
      status.text = line;
    },
  };
}
