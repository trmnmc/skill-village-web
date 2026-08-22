import type { Creature } from '@village/core';

export interface VillageView {
  /** Sorted by id, so render order never flickers between frames. */
  creatures: Creature[];
  problems: unknown[];
  startupNote: string | null;
}

function isRenderable(value: unknown): value is Creature {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<Creature>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    (c.kind === 'skill' || c.kind === 'agent') &&
    typeof c.appearance === 'object' && c.appearance !== null &&
    typeof c.stats === 'object' && c.stats !== null
  );
}

/**
 * Turn a server state payload into what the renderer needs. Anything the
 * renderer cannot draw is dropped rather than crashing the village: one bad
 * creature must not cost you the other sixty-nine.
 */
export function toView(payload: unknown): VillageView | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { creatures?: unknown; problems?: unknown; startupNote?: unknown };
  if (typeof p.creatures !== 'object' || p.creatures === null) return null;

  const creatures = Object.values(p.creatures as Record<string, unknown>)
    .filter(isRenderable)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    creatures,
    problems: Array.isArray(p.problems) ? p.problems : [],
    startupNote: typeof p.startupNote === 'string' ? p.startupNote : null,
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
