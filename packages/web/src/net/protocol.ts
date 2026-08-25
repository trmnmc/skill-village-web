import {
  BODY_IDS, CROWN_IDS, MIN_JUDGEABLE_CASE, validateSketchGrid,
  type CaseView, type Creature, type SketchView,
} from '@village/core/visual';

export interface LlmView {
  mode: 'full' | 'silent';
  interactiveRemaining: number;
  interactiveCap: number;
}

export interface VillageView {
  /** Sorted by id, so render order never flickers between frames. */
  creatures: Creature[];
  problems: unknown[];
  startupNote: string | null;
  llm: LlmView | null;
  /** Who lives in the physical robot, or null. Drawn at the robot-house porch. */
  robotResidentId: string | null;
  /** When the robot last spoke (server process memory), for the presence glow. */
  robotLastTurnAt: number | null;
  /** Today's case, or null when nobody is visiting. */
  peddlerCase: CaseView | null;
  peddler: boolean;
}

const BODY_ID_SET: ReadonlySet<string> = new Set(BODY_IDS);
const CROWN_ID_SET: ReadonlySet<string> = new Set(CROWN_IDS);

function isRenderablePalette(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p.hue === 'string' && typeof p.lite === 'string' && typeof p.dark === 'string';
}

/**
 * `body`/`crown` must be real ids, not merely strings: compose.ts indexes
 * `BODIES[body]`/`CROWNS[crown]` directly and then reads `body.w`, so a
 * stray string produces `undefined` there rather than a real grid. `restPosture`
 * is deliberately left unchecked â€” it is legitimately null for most creatures,
 * and composeGrid already falls back to 'stubs' when it is absent.
 */
function isRenderableAppearance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.body === 'string' && BODY_ID_SET.has(a.body) &&
    typeof a.crown === 'string' && CROWN_ID_SET.has(a.crown) &&
    typeof a.winged === 'boolean' &&
    isRenderablePalette(a.palette)
  );
}

/** behaviourFor compares both against thresholds, so both must be numbers. */
function isRenderableStats(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.mood === 'number' && typeof s.energy === 'number';
}

/**
 * True only for the fields the renderer actually dereferences downstream:
 * roles.ts reads palette.hue/lite, compose.ts indexes BODIES[body]/CROWNS[crown]
 * then body.w, behaviour.ts branches on winged and compares stats.mood/energy,
 * and displayName calls nickname.trim(). This is deliberately narrower than the
 * full Creature shape â€” over-fitting to every field core exposes would reject
 * server payloads for no reason the renderer cares about.
 */
function isRenderable(value: unknown): value is Creature {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.nickname === 'string' &&
    (c.kind === 'skill' || c.kind === 'agent') &&
    isRenderableAppearance(c.appearance) &&
    isRenderableStats(c.stats)
  );
}

/** The renderable subset of an arbitrary list, sorted for stable render order. */
export function filterRenderable(values: unknown[]): Creature[] {
  return values.filter(isRenderable).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Checks exactly what the case overlay dereferences. The grid is re-validated
 * here rather than trusted, because the renderer is the last place a bad grid
 * can be stopped cheaply.
 */
function isDrawableSketch(value: unknown): value is SketchView {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    typeof s.hue === 'string' &&
    typeof s.crown === 'string' && CROWN_ID_SET.has(s.crown) &&
    Array.isArray(s.rows) && s.rows.every((row) => typeof row === 'string') &&
    validateSketchGrid(s.rows as string[]).ok
  );
}

/**
 * One undrawable sketch must not cost the player the other four — the same
 * rule the creature list follows. If dropping the bad ones leaves too few to
 * judge, there is no round to play and the peddler simply is not here.
 */
function toCase(value: unknown): CaseView | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.day !== 'string' || !Array.isArray(c.sketches)) return null;

  const sketches = c.sketches.filter(isDrawableSketch);
  if (sketches.length < MIN_JUDGEABLE_CASE) return null;
  return { day: c.day, sketches };
}

/**
 * Turn a server state payload into what the renderer needs. Anything the
 * renderer cannot draw is dropped rather than crashing the village: one bad
 * creature must not cost you the other sixty-nine.
 */
export function toView(payload: unknown): VillageView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { creatures?: unknown; problems?: unknown; startupNote?: unknown; llm?: unknown; robot?: unknown; robotLastTurnAt?: unknown; peddlerCase?: unknown };
  if (typeof p.creatures !== 'object' || p.creatures === null) return null;

  const creatures = filterRenderable(Object.values(p.creatures as Record<string, unknown>));

  let llm: LlmView | null = null;
  const rawLlm = p.llm;
  if (typeof rawLlm === 'object' && rawLlm !== null) {
    const l = rawLlm as { mode?: unknown; ledger?: Record<string, unknown>; config?: Record<string, unknown> };
    const led = l.ledger;
    const cfg = l.config;
    if (
      led && cfg &&
      typeof led.interactiveIn === 'number' && typeof led.interactiveOut === 'number' &&
      typeof cfg.interactiveCap === 'number'
    ) {
      llm = {
        // The server stamps the live service mode onto each frame; a frame
        // without one (older server, /api/state) reads as full so a missing
        // field can never conjure a false silent-movie banner.
        mode: l.mode === 'silent' ? 'silent' : 'full',
        interactiveCap: cfg.interactiveCap,
        interactiveRemaining: Math.max(0, cfg.interactiveCap - led.interactiveIn - led.interactiveOut),
      };
    }
  }
  let robotResidentId: string | null = null;
  const rawRobot = (p as { robot?: unknown }).robot;
  if (typeof rawRobot === 'object' && rawRobot !== null) {
    const r = rawRobot as { residentId?: unknown };
    if (typeof r.residentId === 'string') robotResidentId = r.residentId;
  }
  const rawTurn = (p as { robotLastTurnAt?: unknown }).robotLastTurnAt;
  const robotLastTurnAt = typeof rawTurn === 'number' ? rawTurn : null;

  const peddlerCase = toCase(p.peddlerCase);

  return {
    creatures,
    problems: Array.isArray(p.problems) ? p.problems : [],
    startupNote: typeof p.startupNote === 'string' ? p.startupNote : null,
    robotResidentId,
    robotLastTurnAt,
    llm,
    peddlerCase,
    peddler: peddlerCase !== null,
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



