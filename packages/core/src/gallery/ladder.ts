import type { DreamSketch, GalleryState } from './types.js';

/**
 * A cull is one bit of evidence against one sketch, not a ranking of the other
 * four — which is why keeping takes three survivals rather than one.
 */
export const SURVIVALS_TO_KEEP = 3;

/** Taste evolves. What the player found ugly in week one should not haunt the prompt forever. */
export const MAX_REJECTS = 20;

export interface VerdictResult {
  gallery: GalleryState;
  culled: DreamSketch;
  /** Sketches that reached the threshold with this verdict. Often empty. */
  kept: DreamSketch[];
}

/**
 * Total by design: every refusable situation returns null instead of throwing,
 * so a cull that races midnight resolves as a quiet no-op rather than an error
 * the player has to see.
 */
export function applyVerdict(
  gallery: GalleryState,
  culledId: string,
  day: string,
): VerdictResult | null {
  const current = gallery.case;
  if (!current || current.day !== day || current.judged) return null;

  const culled = current.sketches.find((s) => s.id === culledId);
  if (!culled) return null;

  const survivors = current.sketches
    .filter((s) => s.id !== culledId)
    .map((s) => ({ ...s, survivals: s.survivals + 1 }));

  const kept = survivors.filter((s) => s.survivals >= SURVIVALS_TO_KEEP);
  const staying = survivors.filter((s) => s.survivals < SURVIVALS_TO_KEEP);

  return {
    culled,
    kept,
    gallery: {
      ...gallery,
      case: { day, sketches: staying, judged: true },
      stock: [...gallery.stock, ...kept],
      rejects: [culled, ...gallery.rejects].slice(0, MAX_REJECTS),
      verdicts: [...gallery.verdicts, { day, culledId, survivorIds: survivors.map((s) => s.id) }],
    },
  };
}
