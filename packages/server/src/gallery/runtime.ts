import {
  applyVerdict, guideIsDue, openCase, planRefill, type GalleryState,
} from '@village/core';
import type { SketchArtist } from './artist.js';

export interface GalleryRuntime {
  /** The next gallery, or null when nothing changed and no write is needed. */
  refillIfDue(gallery: GalleryState, today: string): Promise<GalleryState | null>;
  cull(gallery: GalleryState, sketchId: string, today: string): Promise<GalleryState | null>;
}

export function createGalleryRuntime(opts: { artist: SketchArtist }): GalleryRuntime {
  const { artist } = opts;

  return {
    async refillIfDue(gallery, today) {
      const plan = planRefill(gallery, today);
      if (plan.ready) return null;

      const drawn = plan.freshNeeded > 0
        ? await artist.draw({ count: plan.freshNeeded, gallery, day: today })
        : { sketches: [], nextNumber: gallery.nextSketchNumber };

      const built = openCase(plan.carried, drawn.sketches, today);
      // No case means no peddler today. The player is told nothing, because a
      // traveller who did not come needs no explanation.
      if (!built) return null;

      return { ...gallery, case: built, nextSketchNumber: drawn.nextNumber };
    },

    async cull(gallery, sketchId, today) {
      const result = applyVerdict(gallery, sketchId, today);
      if (!result) return null;

      let next = result.gallery;
      if (guideIsDue(next)) {
        const guide = await artist.distil(next);
        // A failed distillation leaves both the guide and the cadence counter
        // alone, so the next verdict tries again rather than waiting twelve more.
        if (guide) {
          next = { ...next, styleGuide: guide, verdictsAtLastGuide: next.verdicts.length };
        }
      }
      return next;
    },
  };
}
