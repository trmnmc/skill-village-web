import kaplay, { type KAPLAYCtx } from 'kaplay';
import { role, type Creature } from '@village/core/visual';
import { TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import type { Tokens, ResolvedTheme } from '../theme/store.js';
import { mix } from '../theme/palettes.js';
import { tokenTag, sceneryColor, creatureTintColor } from './retint.js';
import {
  ZONES,
  WORLD_W,
  GROUND_Y,
  GROUND_TOP,
  HOMES_HOUSE_XS,
  HOMES_TREE_XS,
  HOUSE_BASE_Y,
  TREE_BASE_Y,
  SIGN_BASE_Y,
  signLeft,
  type Spot,
  type Pin,
} from '../layout/zones.js';
import { buildRenderList, keyCreatureId, presenceScale, seatResident, type RenderEntry } from '../layout/instances.js';
import type { VillageView } from '../net/protocol.js';
import { ZOOM, screenToWorld, clampCamX } from './camera.js';
import { spawnCreature, puff, type CreatureActor } from './creature.js';
import { sound } from '../sound/player.js';
import { voiceParamsFor } from '../sound/voice.js';
import { hudChipRect } from './hud-chip.js';
import { viewSoundEvents, type CreatureSnapshot } from '../sound/arrivals.js';
import { HAPPY_ABOVE, SLEEP_BELOW } from '../motion/behaviour.js';
import { mountSky } from './sky.js';
import { mountWeather } from './weather-layer.js';
import { createRobotHouse } from './robotHouse.js';
import { buildGroundTexture, retintGroundTexture, groundPreset } from './ground.js';
import { inRobotHouse, PORCH_SPOT, ROBOT_HOUSE_X, ROBOT_HOUSE_Y } from '../layout/robot.js';
import { ceremonyPreset } from './ceremony.js';
import { playCeremony } from './ceremonyPlay.js';
import { createDragTracker } from '../input/drag.js';
import { createHeld, type HeldCreature } from './held.js';
import { displayName } from '../render/label.js';
import { pinCreature, resetLayout as resetLayoutCall } from '../net/client.js';
import { resolveHeldDrop, seatAll } from './placement.js';
import { hex, block } from './prop.js';
import { mountConstruction } from './construction.js';

/** Where the suck-in lands: the centre of the robot's face-screen. */
const ROBOT_SCREEN = { x: ROBOT_HOUSE_X + 49, y: ROBOT_HOUSE_Y - 44 };

export interface VillageScene {
  k: KAPLAYCtx;
  setView(view: VillageView): void;
  setStatus(status: string): void;
  /**
   * Float a reply over one creature's head. The chat panel calls this; the
   * bubble is a second showing of the line, not the record of it.
   */
  sayFor(creatureId: string, text: string, source?: 'llm' | 'canned'): void;
  /** Play the creature's signature chirp — main.ts calls it on chat open. */
  greetFor(creatureId: string): void;
  /** Show / retire the "composing a reply" thought bubble over one creature. */
  thinkFor(creatureId: string): void;
  clearThoughtFor(creatureId: string): void;
  /** Release every hand-placed villager. The HUD's reset button calls this. */
  resetLayout(): void;
  /** Whether any villager is currently hand-placed — the button's enabled state. */
  hasPins(): boolean;
}

export interface VillageOptions {
  /**
   * A villager was clicked — a press that did not turn into a drag. The scene
   * does not know what a chat panel is; `main.ts` connects the two.
   */
  onCreatureClick?(creature: Creature): void;
  /** A villager was dropped onto the robot-house. */
  onRobotDrop?(creatureId: string): void;
  /** The current resident was dragged off the robot-house and let go elsewhere. */
  onRobotEvict?(creatureId: string): void;
  /**
   * The local `pins` map just changed (a drop, or a reset) — fired
   * synchronously, before the round trip to the server. Without this, the
   * HUD's reset button only learns about a fresh pin on the next view
   * broadcast, up to ~2s later.
   */
  onPinsChanged?(): void;
}

/** How far a press may travel and still count as a click, in client pixels. */
const CLICK_SLOP = 6;

/** Token counts at a glance: 483000 reads as "483k". */
const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/**
 * Both the stage-diff snapshot and the prevStages map that feeds the next
 * one's diff need to read the same field the same defensive way — two
 * different reads of `c.stage` here previously could (in principle) diverge
 * and either miss a stage-up chime or fire a phantom one.
 */
const stageOf = (c: Creature): string => String((c as { stage?: unknown }).stage ?? 'adult');

/**
 * Ten cells of remaining budget. Clamped rather than trusted: an empty bar is
 * a true thing to draw, and `'░'.repeat(-1)` would throw inside `setView` and
 * cost the whole frame's update.
 */
const bar = (remainingTok: number, cap: number) => {
  const filled = cap > 0 ? Math.min(10, Math.max(0, Math.round((remainingTok / cap) * 10))) : 0;
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

function house(k: KAPLAYCtx, x: number, y: number, wall: keyof Tokens, roof: keyof Tokens) {
  block(k, x, y - 66, 86, 66, wall, 1);
  block(k, x + 30, y - 34, 22, 34, 'wood', 2);
  // Tagged ONLY 'themed:window', not 'themed:sky1' — sky.ts's night-ambience
  // layer is this block's sole colour owner (lamp-glow when `windowsGlow` is
  // on, else the ordinary sky1 scenery colour); the generic per-token pass
  // below must never also touch it, or the two would fight over the same
  // paint every publish.
  block(k, x + 10, y - 56, 16, 14, 'sky1', 2, ['themed:window'], false);
  // Roof: three stacked bars, widest at the eaves — a pixel gable.
  block(k, x - 8, y - 80, 102, 14, roof, 2);
  block(k, x + 6, y - 92, 74, 12, roof, 2);
  block(k, x + 22, y - 102, 42, 10, roof, 2);
}

function tree(k: KAPLAYCtx, x: number, y: number) {
  block(k, x + 14, y - 44, 12, 44, 'wood', 1);
  block(k, x, y - 96, 40, 54, 'foliage', 1);
  block(k, x + 8, y - 110, 24, 18, 'foliageLite', 1);
}

function sign(k: KAPLAYCtx, x: number, y: number, label: string, font: string) {
  block(k, x + 44, y - 34, 10, 34, 'wood', 3);
  block(k, x, y - 62, 100, 30, 'cream', 3);
  const { tokens, tint } = themeStore.current();
  k.add([
    k.text(label, { size: 15 * TEXT_SS, font }),
    k.scale(1 / TEXT_SS),
    k.pos(x + 50, y - 47),
    k.anchor('center'),
    k.color(hex(k, sceneryColor(tokens, tint, 'ink'))),
    k.z(4),
    tokenTag('ink'),
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

export async function startVillage(opts: VillageOptions = {}): Promise<VillageScene> {
  const [pixelFont, monoFont] = await Promise.all([
    resolveWebFont('Pixelify Sans', 'monospace'),
    resolveWebFont('IBM Plex Mono', 'monospace'),
  ]);

  const k = kaplay({
    background: sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'sky1'),
    crisp: true,
    global: false,
    // KAPLAY's default pixelDensity is 1: the canvas backing store gets one
    // texel per CSS pixel, and on a display scaled above 100% (the Windows
    // default) the browser then upscales it nearest-neighbour — which crisp
    // requested. Blocky creatures survive that; 10-13px text gets glyph rows
    // randomly doubled or dropped and reads as broken. Match the backing
    // store to the physical display, capped at 2 per KAPLAY's own
    // performance warning. Logical coordinates are unaffected — KAPLAY
    // divides gfx dimensions back down by this factor.
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  // Zoomed in past 1:1 so the frame holds village instead of sky and bare
  // foreground. Every cursor→world conversion below goes through camera.ts —
  // raw offsets land wide of their target by exactly this factor.
  k.setCamScale(ZOOM);

  // Ground: a thin dark strip at the horizon over one light field — the
  // trailer's own construction. GROUND_TOP is derived in zones.ts from the
  // depth rows themselves, so the field always reaches back past the furthest
  // villager; painting everything above GROUND_Y dark instead turned into a
  // 250px wall once GROUND_TOP moved up to give the back row real field.
  block(k, 0, GROUND_TOP, WORLD_W, 14, 'groundDark', 0);
  block(k, 0, GROUND_TOP + 14, WORLD_W, k.height() * 2, 'ground', 0);

  // Ground texture (default preset `b`; `?ground=a|c|off` to compare).
  // Mounted directly on the two field rects above and repainted by
  // `applyTheme` below, so it follows palette, weather and night tint
  // without knowing about any of them.
  const preset = groundPreset();
  const texCount = buildGroundTexture(k, preset, themeStore.current());
  if (texCount) console.info(`[ground] preset ${preset}: ${texCount} texture rects`);

  const homes = ZONES.find((z) => z.id === 'homes')!;

  // Prop positions come from zones.ts, where placeCreatures derives its
  // keep-out bands from the same anchors — draw them anywhere else and the
  // villagers would no longer know to stand clear.
  for (const zone of ZONES) {
    sign(k, signLeft(zone), SIGN_BASE_Y, zone.label, pixelFont);
  }
  mountConstruction(k, monoFont);

  // House 1 and house 2 each get their own wall/roof pair; house 3 (the old
  // wallSand/roofClay THEME hexes, retired with THEME) reuses house 1's wall
  // with house 2's roof for variety without a third token pair.
  const houseStyles: { wall: keyof Tokens; roof: keyof Tokens }[] = [
    { wall: 'houseAWall', roof: 'houseARoof' },
    { wall: 'houseBWall', roof: 'houseBRoof' },
    { wall: 'houseAWall', roof: 'houseBRoof' },
  ];
  HOMES_HOUSE_XS.forEach((x, i) => {
    const style = houseStyles[i % houseStyles.length]!;
    house(k, x, HOUSE_BASE_Y, style.wall, style.roof);
  });
  for (const x of HOMES_TREE_XS) tree(k, x, TREE_BASE_Y);

  // Sun/moon/stars/fireflies/lantern glow — mounted after the static
  // scenery it sits in front of (or, for the sky, behind) and before any
  // creature spawns, so a villager arriving mid-session never lands above
  // an object this layer hasn't created yet.
  const sky = mountSky(k);
  // Screen-space rain/snow/fog/etc, mounted alongside the sky layer — both are
  // driven from the same `applyTheme` walker below, `sky.update(t)` and
  // `weather.update(t)` called back to back on every resolved-theme change.
  const weather = mountWeather(k);

  const robotHouse = createRobotHouse(k, { pixel: pixelFont, mono: monoFont });

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
    if (tracker.current() === null) panning = true;
  });
  k.onMouseMove((_pos, delta) => {
    if (!panning) return;
    // Screen pixels shrink to world pixels under the zoom, or the world
    // would slide faster than the hand dragging it.
    const next = k.getCamPos().x - delta.x / ZOOM;
    k.setCamPos(clampCamX(next, k.width()), k.getCamPos().y);
  });
  window.addEventListener('mouseup', stopPanning);
  window.addEventListener('pointercancel', stopPanning);
  window.addEventListener('blur', stopPanning);
  // A gesture the tracker owns must not survive a cancelled pointer or the
  // window losing focus mid-drag — a plain 'mouseup' already reaches the
  // tracker's own release handler below, so only these two are needed here.
  window.addEventListener('pointercancel', () => tracker.cancel());
  window.addEventListener('blur', () => tracker.cancel());

  const status = k.add([
    k.text('connecting…', { size: 14 * TEXT_SS, font: monoFont }),
    k.scale(1 / TEXT_SS),
    k.pos(12, 12),
    k.fixed(),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.z(100),
    tokenTag('ink'),
  ]);

  const counter = k.add([
    k.text('', { size: 14 * TEXT_SS, font: monoFont }),
    k.scale(1 / TEXT_SS),
    k.pos(12, 32),
    k.fixed(),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.z(100),
    tokenTag('ink'),
  ]);

  // How much interactive voice budget is left. Empty text is the whole of
  // "hidden": a server that reports no llm block (M3) simply has no third HUD
  // line, and nothing below it has to move.
  const meter = k.add([
    k.text('', { size: 14 * TEXT_SS, font: monoFont }),
    k.scale(1 / TEXT_SS),
    k.pos(12, 52),
    k.fixed(),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.z(100),
    tokenTag('ink'),
  ]);

  // The cream backing that keeps the HUD readable when a storm deck drifts
  // behind it (first night storm playtest: "live / 75 villagers" drowned in
  // the near clouds). Same chrome as the nameplates: cream, ink outline,
  // hugging the text — resized whenever any of the three lines changes.
  const hudChip = k.add([
    k.rect(1, 1, { radius: 4 }),
    k.pos(0, 0),
    k.fixed(),
    k.color(hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'cream'))),
    k.outline(2, hex(k, sceneryColor(themeStore.current().tokens, themeStore.current().tint, 'ink'))),
    k.z(99),
    tokenTag('cream'),
  ]);
  const layoutHudChip = () => {
    const bounds = hudChipRect([status.text, counter.text, meter.text]);
    hudChip.hidden = bounds === null;
    if (!bounds) return;
    hudChip.pos.x = bounds.x;
    hudChip.pos.y = bounds.y;
    hudChip.width = bounds.w;
    hudChip.height = bounds.h;
  };
  layoutHudChip();

  // Open on the middle of Homes — the crowd — not on the empty Hatchery at
  // world x=0, and frame the field as the lower two thirds rather than
  // centring the camera on the horizon line, which put half the opening
  // frame in the sky and read as the village floating.
  k.setCamPos(clampCamX(homes.x + homes.w / 2, k.width()), GROUND_Y - 130);

  // Every map below is keyed by *render key*, not creature id: one creature
  // can be drawn several times over (a helper stands beside each project that
  // links it — see layout/instances.ts), and each of those bodies needs its
  // own actor, spot and generation. `keyCreatureId` recovers the creature.
  const actors = new Map<string, CreatureActor>();
  // Bumped every time setView decides to (re)spawn a given render key. A
  // spawn's own `.then` compares the generation it captured at decision time
  // against the current value; a mismatch means a later setView call already
  // decided to respawn that same key again, so this resolution lost the race
  // and must not touch `actors` — otherwise two overlapping spawns for one key
  // (e.g. two view updates racing 70 in-flight sprite loads at startup) both
  // resolve, both call actors.set, and the loser's root is orphaned:
  // untracked, never destroyed, never updated, a permanent frozen creature.
  const generations = new Map<string, number>();
  let known = new Map<string, Creature>();
  // The presence each body was *spawned* at. Presence is baked into the actor's
  // geometry at spawn time, so a project that gains or loses a helper has to be
  // respawned to grow — this is what the sync loop diffs against to notice.
  const presences = new Map<string, number>();
  // Declared beside `known`: null until the first view lands, so a reload
  // is not seventy arrival chimes (see arrivals.ts). Keyed by creature id, not
  // render key — arrivals and stage-ups are events in a creature's life, and a
  // creature that gains a second body has not been born twice.
  let prevStages: Map<string, string> | null = null;
  // The placement from the most recent view. Held so a spawn that is still
  // loading sprites can adopt the newest spot when it resolves, the same way
  // it adopts the newest stats from `known`.
  let placements = new Map<string, Spot>();
  // The creature list from the most recent view, kept whole. `reseat()` has to
  // rebuild the render list after a local pin, and that needs creatures — the
  // render keys in `placements` cannot be turned back into one (a linked
  // helper's key names a project it is tethered to, not a seat of its own).
  let lastCreatures: readonly Creature[] = [];
  // The arrangement the player has made. Seeded from every view frame, but
  // written locally the instant a drop lands so the villager stays under the
  // hand instead of waiting out a round trip. A refused or lost write simply
  // loses to the next frame.
  let pins = new Map<string, Pin>();
  let lookAt: number | null = null;

  // A second onMouseMove consumer, alongside the drag-pan handler above —
  // KAPLAY's event registry supports multiple listeners per event and
  // neither one calls stopPropagation, so this composes cleanly with it
  // (see the comment on the drag-pan block). camPos() is deprecated in the
  // installed KAPLAY build (Task 9 hit the same thing); getCamPos() is its
  // replacement.
  let cursorY: number | null = null;

  // The body under the cursor this frame, or null — a render key, since it is
  // one *body* that gets hovered, not a creature. Written by the update loop
  // and read by the click handler below — "the one I clicked" is exactly "the
  // one whose name I can see", so both answers come from one test. The click
  // path then looks the key up in `known`, which for an instance hands back
  // the helper itself: every body of a helper opens the same panel.
  let hoveredId: string | null = null;

  const tracker = createDragTracker(CLICK_SLOP);
  /** Creature id, straight from the view — never a render key. */
  let residentId: string | null = null;

  // The villager in the player's hand: the id, and the dangling visual that
  // draws it on the cursor. Both live only while a drag is past the slop.
  //
  // `heldId` is the authority and outlives `held`: a creature can be picked up
  // before its sprites finish loading (createHeld returns null), and a respawn
  // mid-drag destroys and rebuilds the actor under us. Keeping the id
  // separately is what lets `setHeld(true)` be re-applied to whatever actor is
  // current, and guarantees the villager is put back down even on the frames
  // where there was never anything to draw.
  let heldId: string | null = null;
  let held: HeldCreature | null = null;
  // Cursor world-x on the previous frame, for the swing's drive velocity.
  // Null between drags so the first frame of a new grab reads as zero speed
  // rather than as a leap from wherever the last one ended.
  let lastHeldX: number | null = null;

  /**
   * Put the villager down: retire the dangling visual and hand the actor back
   * its body. Safe to call when nothing is held, which is what lets every exit
   * from a gesture — drop, click, cancel — funnel through one path rather than
   * each remembering to clean up.
   */
  const release = () => {
    held?.destroy();
    held = null;
    lastHeldX = null;
    if (heldId !== null) {
      actors.get(heldId)?.setHeld(false);
      heldId = null;
    }
  };

  /**
   * Re-run placement against the current pins and move every actor to match.
   * Called after a local pin so the arrangement updates on the frame the
   * player let go, rather than on the next frame from the server.
   */
  const reseat = () => {
    const entries = seatAll(lastCreatures, pins, residentId);
    placements = new Map(entries.map((e) => [e.key, e.spot]));
    for (const [key, actor] of actors) {
      const spot = placements.get(key);
      if (spot) actor.setSpot(spot);
    }
  };

  k.onMouseMove((pos) => {
    lookAt = screenToWorld(pos.x, k.getCamPos().x, k.width());
    cursorY = screenToWorld(pos.y, k.getCamPos().y, k.height());
  });

  // Idle chirps, spec §3: once a second the scene offers the director its
  // on-screen, happy, awake villagers; the director's Poisson state decides
  // who (if anyone) actually chirps.
  let lastIdleTickAt = 0;

  k.onUpdate(() => {
    const t = k.time();
    // One hovered villager at a time: the nearest to the cursor within reach,
    // measured against the body's midpoint (~34px above the feet) so tall and
    // short creatures compete fairly. Its actor fades its nameplate in;
    // everyone else stays a clean, label-free silhouette.
    hoveredId = null;
    // Nobody is hovered while the player is carrying somebody. Otherwise every
    // villager the hand passes over fades its nameplate in and — because the
    // hover bump is worth 100000 depth — leaps in front of the creature being
    // carried. A live drag also cannot start a second one, so nothing else
    // needs this value until the hand is empty again.
    const carrying = tracker.current()?.dragging ?? false;
    if (!carrying && lookAt !== null && cursorY !== null) {
      let best = 90 * 90;
      for (const [key, spot] of placements) {
        // Aim at where the villager is drawn, not its home spot — an ambling
        // creature can be a full body-width from home. The spot is only the
        // fallback for an actor whose sprites are still loading.
        const x = actors.get(key)?.worldX() ?? spot.x;
        const dx = lookAt - x;
        const dyMid = cursorY - (spot.y - 34);
        const d = dx * dx + dyMid * dyMid;
        if (d < best) {
          best = d;
          hoveredId = key;
        }
      }
    }

    sound.setCamera(k.getCamPos().x, k.width());
    if (t - lastIdleTickAt >= 1) {
      lastIdleTickAt = t;
      const camX = k.getCamPos().x;
      const halfW = k.width() / 2 + 200;
      const candidates: { id: string; x: number; voice: ReturnType<typeof voiceParamsFor> }[] = [];
      // Offered per body, keyed by render key: the director spaces each id's
      // chirps on its own Poisson timer, and a chirp is a sound coming from a
      // place on screen, so each body earns its own — panned where it stands.
      // The village-wide gap in director.ts still caps the whole crowd.
      for (const [key, spot] of placements) {
        const c = known.get(key);
        if (!c) continue;
        // A villager in the player's hand does not chirp from the empty patch
        // of ground it is not standing on.
        if (key === heldId) continue;
        if (Math.abs(spot.x - camX) > halfW) continue;
        // Same "happy and awake" bar behaviourFor uses to decide who hops
        // (motion/behaviour.ts) — one pair of thresholds, not two that can
        // drift apart.
        if (!(c.stats.mood > HAPPY_ABOVE && c.stats.energy >= SLEEP_BELOW)) continue;
        candidates.push({ id: key, x: spot.x, voice: voiceParamsFor(c) });
      }
      if (candidates.length > 0) sound.event({ type: 'idle-tick', candidates });
    }

    for (const [key, actor] of actors) actor.update(t, lookAt, key === hoveredId);

    // The villager in hand: its own body, hanging off the cursor and swinging
    // with the drag, while the actor it came from stands hidden at its spot.
    // Built and retired here so there is nothing to leak when a gesture ends
    // off-canvas.
    const drag = tracker.current();
    if (drag?.dragging && lookAt !== null && cursorY !== null) {
      if (heldId !== drag.targetId) {
        // A new grab — including the case where a previous one is somehow
        // still standing, which `release` settles before this one starts.
        release();
        heldId = drag.targetId;
        actors.get(heldId)?.setHeld(true);
        const dragged = known.get(heldId);
        // Null when the sprites for this creature have not finished baking.
        // The gesture still works; there is just nothing in the hand to see
        // until the player lets go, which is a sub-second window at startup.
        //
        // The presence multiplier comes from the same helper the render list
        // uses, not a second copy of the rule: a genie picked up has to stay
        // the size it was standing. An instance is always 1 — only the project
        // itself is drawn larger than life.
        const heldPresence =
          dragged && keyCreatureId(heldId) === heldId && role(dragged.kind) === 'project'
            ? presenceScale(dragged.helperIds?.length ?? 0)
            : 1;
        held = dragged
          ? createHeld(k, dragged, { pixel: pixelFont, mono: monoFont }, heldPresence)
          : null;
      }
      // Raw per-frame velocity. The dangle spring is itself a low-pass, so it
      // does the smoothing that a sampling buffer would otherwise have to.
      const vx = lastHeldX === null ? 0 : (lookAt - lastHeldX) / Math.max(k.dt(), 1e-4);
      lastHeldX = lookAt;
      held?.update(t, k.dt(), lookAt, cursorY, vx);
    } else if (heldId !== null) {
      // The gesture ended somewhere this handler never saw — a cancel, or a
      // release that the mouseup path already dealt with. Either way, nobody
      // is left hanging.
      release();
    }
  });

  // A click is a press that did not turn into a drag — the same gesture pans
  // the camera, so only a release within a few pixels of the press means "I
  // meant that villager".
  //
  // Both ends are plain DOM listeners, and both halves of that are deliberate:
  //
  //  - Not `k.onMouseDown`: it fires every frame the button is held, so the
  //    origin would crawl along under the cursor and every pan would end
  //    looking like a click.
  //  - Not `k.onMousePress` either, which is the subtler trap. KAPLAY's canvas
  //    mousedown handler does not raise mousePress there and then — it queues
  //    the whole thing on its `input` event (`state.events.onOnce("input",
  //    ...)` in app.ts), drained once per frame by `processInput()`. A window
  //    mouseup runs synchronously during DOM dispatch, so a press and release
  //    that complete inside one frame — a trackpad tap, the second click of a
  //    double-click — reach the release with the press still unrecorded: the
  //    click is dropped, and then `processInput` arms the origin *after* the
  //    fact, leaving a stale press to be spent on the next gesture. A
  //    synchronous `mousedown` on `k.canvas` keeps the canvas scoping (a press
  //    on the chat panel must not arm this) without the deferral.
  //  - The release is read on `window`, for the same reason the pan block
  //    reads it there: KAPLAY's own release is canvas-scoped and never fires
  //    for a drag that ends outside the canvas.
  //
  // The slop is measured in the events' own client coordinates rather than
  // `k.mousePos()`, which is frame-quantized for the same reason as above (the
  // mousemove handler defers `state.mousePos` onto the input queue) and so can
  // still be reporting a stale position during a fast gesture.
  k.canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    tracker.press(event.clientX, event.clientY, hoveredId);
  });

  window.addEventListener('mousemove', (event) => {
    tracker.move(event.clientX, event.clientY);
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    const gesture = tracker.release(event.clientX, event.clientY);
    if (gesture.type === 'click') {
      // A click never crosses the drag slop, so nothing was ever lifted and
      // `release()` here is a no-op — called anyway, the same as every other
      // ending, so the hand reads as empty before anything downstream runs.
      release();
      const creature = known.get(gesture.targetId);
      if (creature) opts.onCreatureClick?.(creature);
      return;
    }
    if (gesture.type !== 'drop') {
      release();
      return;
    }
    // One point, computed once, for the whole gesture: `screenToWorld`
    // applies the /ZOOM divide KAPLAY's camera uses (camera.ts) — skipping it
    // used to leave `inRobotHouse`'s hit test up to ~140px off, wide of even
    // its forgiving 130x130 box. Both the hit test and the pin below now read
    // the same corrected point that the held villager is actually drawn at.
    const rect = k.canvas.getBoundingClientRect();
    const worldX = screenToWorld(event.clientX - rect.left, k.getCamPos().x, k.width());
    const worldY = screenToWorld(event.clientY - rect.top, k.getCamPos().y, k.height());
    // The gesture carries a render key; the robot house and the pin below
    // both speak creature ids — the house takes in a creature, not one of its
    // bodies, so drag any instance of a helper and the helper moves in.
    const draggedId = keyCreatureId(gesture.targetId);
    if (inRobotHouse(worldX, worldY)) {
      const flying = held;
      const flownKey = heldId;
      if (flying && flownKey !== null) {
        // The ceremony takes ownership of the dangling visual. Clear the
        // hand WITHOUT release() — that would destroy the body and unhide
        // the actor mid-flight — so the streak can fly while the actor
        // stays hidden at its old spot.
        held = null;
        heldId = null;
        lastHeldX = null;
        const preset = ceremonyPreset();
        playCeremony(k, flying, { x: worldX, y: worldY }, ROBOT_SCREEN, {
          onContact: () => {
            robotHouse.impact(preset);
            puff(k, ROBOT_SCREEN.x, ROBOT_SCREEN.y);
            const c = known.get(flownKey);
            if (c) sound.event({ type: 'moved-in', x: ROBOT_SCREEN.x, voice: voiceParamsFor(c) });
            // Hand the body back a beat later. By then the server view has
            // normally seated them at the porch, so setHeld(false)'s own
            // puff-and-thud lands where they reappear; on a slow echo it
            // lands at the old spot, which is today's exact behaviour.
            k.wait(0.35, () => actors.get(flownKey)?.setHeld(false));
          },
        });
      } else {
        // Sprites never baked, nothing was ever drawn in the hand — degrade
        // to today's instant drop.
        release();
      }
      opts.onRobotDrop?.(draggedId);
    } else if (draggedId === residentId) {
      release();
      opts.onRobotEvict?.(draggedId);
    } else if (draggedId !== gesture.targetId) {
      // An aura has no ground of its own: `instanceSpots` fans it around the
      // project it is tethered to, so pinning the helper underneath would
      // move a body that is not on screen and leave this one exactly where it
      // was. An aura's ground belongs to its project — pin the project and
      // the fan follows it. So this drop is a no-op beyond setting it down.
      release();
    } else {
      // Everywhere else means "this is where you live now". Resolved here,
      // not on the server, because the resolved spot is what gets stored:
      // what the player sees on release is what reloads later.
      //
      // Resolved against the villager's FEET, not the cursor: held.ts grabs
      // the body at the scruff and lets it hang down from there, so the
      // cursor's own y reads a row or two further back (toward the horizon)
      // than where the body was actually touching down. `held` has to be
      // read for this before `release()` clears it below.
      const footOffset = held?.footOffset() ?? 0;
      const spot = resolveHeldDrop(pins, draggedId, worldX, worldY, footOffset);
      pins.set(draggedId, spot);
      reseat();
      // `release()` is what fires the landing puff and the touch-down sound
      // (via actor.setHeld(false)), at the actor's position *right now* — so
      // it has to run after `reseat()` has already moved the actor to
      // `spot`, or both land on the villager's old ground instead of its new
      // one.
      release();
      opts.onPinsChanged?.();
      void pinCreature(draggedId, spot.x, spot.y);
    }
  });

  // Retint every tagged scenery object (and every tagged creature sprite) in
  // one pass whenever the resolved theme changes — a clock tick crossing a
  // frame boundary, a weather mode flip, a `?at=`/`?palette=` override. Every
  // `block()`/`sign()` object and every HUD text line above already carries
  // its `themed:<token>` tag from creation, so this walker needs no list of
  // its own to stay in sync with; `creature.ts` tags its own chrome and
  // sprite roots with the same tags at spawn time, including a fresh spawn
  // that lands after this theme change has already fired.
  //
  // `{ recursive: true }` is load-bearing on both `k.get()` calls below.
  // KAPLAY's `get(tag, opts)` (kaplay.mjs) is `opts.recursive ? deep-flatMap
  // : this.children` — a plain `k.get(tag)` only returns *direct* children of
  // the scene root. Every creature's themed chrome (body/wing sprites,
  // nameplate box, ink texts, bubble bg) lives under `creature.ts`'s own
  // `root = k.add(...)`, so it is a *grandchild* of the scene root
  // (`root.add(...)`), and without `recursive: true` this walker would never
  // find it — the village would darken around already-spawned creatures
  // stuck at their spawn-time tint forever.
  const applyTheme = (t: ResolvedTheme) => {
    k.setBackground(hex(k, mix(t.tokens.sky1, t.tint.col, t.tint.sceneryK)));
    // Every `k.outline()` in the scene (the nameplate box, the speech
    // bubble's background) is ink-coloured; struck once per call rather than
    // per tagged object.
    const inkCol = hex(k, sceneryColor(t.tokens, t.tint, 'ink'));
    for (const token of Object.keys(t.tokens) as (keyof Tokens)[]) {
      const colour = hex(k, sceneryColor(t.tokens, t.tint, token));
      for (const obj of k.get(tokenTag(token), { recursive: true })) {
        (obj as unknown as { color: unknown }).color = colour;
        const outlined = obj as unknown as { outline?: { color?: unknown } };
        if (outlined.outline) outlined.outline.color = inkCol;
      }
    }
    retintGroundTexture(k, t);
    const cTint = hex(k, creatureTintColor(t.tint));
    for (const obj of k.get('themed:creature', { recursive: true })) {
      (obj as unknown as { color: unknown }).color = cTint;
    }
    // Positions/toggles the sun, moon, stars, fireflies, lantern, and (since
    // house windows carry only 'themed:window', never 'themed:sky1' — see
    // `house()` above) sets the one colour a window wears, with no other
    // pass in this walker touching it.
    sky.update(t);
    weather.update(t);
  };
  applyTheme(themeStore.current());
  // No teardown path exists for this scene yet — same as the window-level
  // pan/click listeners above, this subscription lives for the page's
  // lifetime. Held rather than discarded so a future scene-teardown path has
  // it ready to call.
  const unsubscribeTheme = themeStore.subscribe(applyTheme);

  return {
    k,
    setView(view) {
      counter.text = `${view.creatures.length} villagers`;
      const llm = view.llm;
      meter.text = llm
        ? `voice ${bar(llm.interactiveRemaining, llm.interactiveCap)} ${fmt(llm.interactiveRemaining)}/${fmt(llm.interactiveCap)}`
        : '';
      layoutHudChip();
      // The server's arrangement replaces the local one wholesale — an
      // optimistic pin written on the last drop only had to survive until
      // this frame confirmed it.
      lastCreatures = view.creatures;
      pins = new Map(Object.entries(view.pins).map(([id, at]) => [id, { ...at }]));
      // Everything to draw: projects and unlinked helpers on their hashed
      // spots (or the ones the player pinned them to), plus one instance of
      // each linked helper fanned around the project that uses it — and then
      // the robot's resident lifted out of the crowd onto the porch, aura and
      // all. `residentId` has to be current before this runs, since the porch
      // override reads it.
      const prevResident = residentId;
      residentId = view.robotResidentId;
      if (prevResident !== null && prevResident !== residentId) {
        // Evict or swap: the outgoing resident pops off the porch. Half a
        // ceremony — the one who left gets punctuation, not a whole beat.
        puff(k, PORCH_SPOT.x, PORCH_SPOT.y - 12);
      }
      const entries: RenderEntry[] = seatAll(view.creatures, pins, residentId);

      const resident = residentId ? view.creatures.find((c) => c.id === residentId) : undefined;
      robotHouse.setResidentLabel(resident ? displayName(resident) : null);
      const active = view.robotLastTurnAt !== null && Date.now() - view.robotLastTurnAt < 15_000;
      robotHouse.setPresence(resident ? (active ? 'talking' : 'lit') : 'dark');

      placements = new Map(entries.map((e) => [e.key, e.spot]));
      const seen = new Set<string>();

      for (const e of entries) {
        seen.add(e.key);
        const before = known.get(e.key);
        // Respawn only when the look changes; stats alone (which change on
        // every server tick) must not restart a creature's motion. Presence
        // joins the look here: it is baked into the actor's geometry at spawn
        // time, so a project that gained a helper can only grow by respawning.
        const changed =
          before &&
          (JSON.stringify(before.appearance) !== JSON.stringify(e.creature.appearance) ||
            presences.get(e.key) !== e.presence);
        if (!actors.has(e.key) || changed) {
          actors.get(e.key)?.destroy();
          // Delete immediately, not just on the eventual respawn: otherwise
          // the dead actor stays in `actors` and keeps getting `update()`d
          // every frame until the new one resolves — including, for a
          // dangling lanky, `body.use(...)` called on an already-destroyed
          // game object.
          actors.delete(e.key);
          const gen = (generations.get(e.key) ?? 0) + 1;
          generations.set(e.key, gen);
          // Named out of the entry so the callback below — which resolves long
          // after this iteration — reads as being about one body: `key` is the
          // render key it is spawning, `creature` the creature wearing it.
          const { key, creature, presence } = e;
          void spawnCreature(k, creature, e.spot, { pixel: pixelFont, mono: monoFont }, presence)
            .then((actor) => {
              if (generations.get(key) !== gen) { actor.destroy(); return; }
              // Stats can tick several times while 70 sprites load, and a
              // villager arriving in that window can move this one along its
              // row. `known` and `placements` hold the newest view by the time
              // this resolves, so hand the actor those rather than the
              // snapshot the spawn started from.
              actor.setCreature(known.get(key) ?? creature);
              // A look that changes mid-drag respawns the actor under the
              // player's hand. The fresh one starts visible and standing at
              // its spot, so without this the villager would appear twice —
              // once dangling from the cursor, once back on the ground.
              // Keyed on the render key, since that is what `heldId` holds:
              // the player grabbed one body, not every body of a creature.
              if (heldId === key) actor.setHeld(true);
              actors.set(key, actor);
            })
            .catch(() => {
              // A failed sprite load leaves nothing to add. Without this,
              // the rejection creature.ts's loadSprite() produces via
              // onError(reject) would be an unhandled promise rejection.
            });
        } else {
          const actor = actors.get(e.key)!;
          // A villager can be pushed along its row when a newcomer's hash
          // lands on its spot (see zones.ts). The actor owns its root
          // position, so without this it carries on drawing where it used to
          // stand while somebody else occupies that ground — the static
          // overlap traded for a moving one. Repositioning is not a respawn:
          // the motion clock, the phase and every baked sprite survive it.
          actor.setSpot(e.spot);
          // Same look, newer stats: the actor re-derives its behaviour flags
          // in place. Without this, mood and energy select a creature's
          // behaviour exactly once — on the frame it was first drawn — and
          // never again.
          actor.setCreature(e.creature);
        }
      }

      for (const [key, actor] of actors) {
        if (!seen.has(key)) { actor.destroy(); actors.delete(key); }
      }

      presences.clear();
      for (const e of entries) presences.set(e.key, e.presence);

      // Sound is per creature, not per body: a helper drawn beside four
      // projects arrives once and chimes from one place. Its first body's spot
      // is that place — a linked helper has no commons spot of its own any more.
      const xByCreature = new Map<string, number>();
      for (const e of entries) {
        if (!xByCreature.has(e.creature.id)) xByCreature.set(e.creature.id, e.spot.x);
      }
      const snapshots: CreatureSnapshot[] = view.creatures.map((c) => ({
        id: c.id,
        stage: stageOf(c),
        x: xByCreature.get(c.id) ?? 0,
        voice: voiceParamsFor(c),
      }));
      for (const ev of viewSoundEvents(prevStages, snapshots)) sound.event(ev);
      prevStages = new Map(view.creatures.map((c) => [c.id, stageOf(c)]));

      known = new Map(entries.map((e) => [e.key, e.creature]));
    },
    setStatus(s) {
      status.text = s;
      layoutHudChip();
    },
    // All four are addressed by *creature* id, and `actors` is keyed by render
    // key — so each one fans out to every body of that creature. A helper
    // standing beside four projects answers in four places at once, which is
    // the reading spec §4 wants: one persona, many bodies.
    //
    // A villager that has despawned — or is still loading its sprites when its
    // reply lands — has no actor to speak through. The panel holds the line
    // either way, so there is nothing to recover here.
    sayFor(creatureId, text, source) {
      for (const [key, actor] of actors) {
        if (keyCreatureId(key) === creatureId) actor.say(text, source);
      }
    },
    greetFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.greet();
    },
    thinkFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.think();
    },
    clearThoughtFor(creatureId) {
      for (const [key, actor] of actors) if (keyCreatureId(key) === creatureId) actor.clearThought();
    },
    resetLayout() {
      if (pins.size === 0) return;
      pins = new Map();
      reseat();
      opts.onPinsChanged?.();
      void resetLayoutCall();
    },
    hasPins() {
      return pins.size > 0;
    },
  };
}
