import { BODY_IDS, CROWN_IDS, type Creature } from '@village/core/visual';

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
 * is deliberately left unchecked — it is legitimately null for most creatures,
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
 * full Creature shape — over-fitting to every field core exposes would reject
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

/**
 * Turn a server state payload into what the renderer needs. Anything the
 * renderer cannot draw is dropped rather than crashing the village: one bad
 * creature must not cost you the other sixty-nine.
 */
export function toView(payload: unknown): VillageView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { creatures?: unknown; problems?: unknown; startupNote?: unknown; llm?: unknown };
  if (typeof p.creatures !== 'object' || p.creatures === null) return null;

  const creatures = Object.values(p.creatures as Record<string, unknown>)
    .filter(isRenderable)
    .sort((a, b) => a.id.localeCompare(b.id));

  let llm: LlmView | null = null;
  const rawLlm = p.llm;
  if (typeof rawLlm === 'object' && rawLlm !== null) {
    const l = rawLlm as { ledger?: Record<string, unknown>; config?: Record<string, unknown> };
    const led = l.ledger;
    const cfg = l.config;
    if (
      led && cfg &&
      typeof led.interactiveIn === 'number' && typeof led.interactiveOut === 'number' &&
      typeof cfg.interactiveCap === 'number'
    ) {
      llm = {
        mode: 'full',
        interactiveCap: cfg.interactiveCap,
        interactiveRemaining: Math.max(0, cfg.interactiveCap - led.interactiveIn - led.interactiveOut),
      };
    }
  }

  return {
    creatures,
    problems: Array.isArray(p.problems) ? p.problems : [],
    startupNote: typeof p.startupNote === 'string' ? p.startupNote : null,
    llm,
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
