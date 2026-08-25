import {
  mintSketchId, repairPrompt, sketchPrompt, styleGuidePrompt, validateSketchDraft,
  type DreamSketch, type GalleryState,
} from '@village/core';
import { extractJson } from '../llm/json.js';
import type { LlmReply, LlmService } from '../llm/service.js';

export interface DrawRequest {
  count: number;
  gallery: GalleryState;
  day: string;
}

export interface DrawResult {
  sketches: DreamSketch[];
  /** The gallery's next counter value, advanced past every id minted here. */
  nextNumber: number;
}

export interface SketchArtist {
  draw(request: DrawRequest): Promise<DrawResult>;
  /** The distilled art-direction note, or null to leave the old one standing. */
  distil(gallery: GalleryState): Promise<string | null>;
}

/** Only a failed *call* stops the round. A failed *drawing* just costs a slot. */
function callFailed(reply: LlmReply): reply is Extract<LlmReply, { ok: false }> {
  return !reply.ok;
}

export function createSketchArtist(opts: { llm: LlmService }): SketchArtist {
  const { llm } = opts;

  const ask = (prompt: string) =>
    llm.request({ kind: 'serious', budget: 'interactive', prompt });

  return {
    async draw({ count, gallery, day }) {
      const sketches: DreamSketch[] = [];
      let nextNumber = gallery.nextSketchNumber;
      const prompt = sketchPrompt(gallery);

      for (let slot = 0; slot < count; slot++) {
        const first = await ask(prompt);
        // budget, silent, or a dead CLI: asking again cannot help, and the
        // player would just wait longer for the same nothing.
        if (callFailed(first)) break;

        let validation = validateSketchDraft(extractJson(first.text));

        if (!validation.ok) {
          const repair = await ask(repairPrompt(first.text, validation.complaints));
          if (callFailed(repair)) break;
          validation = validateSketchDraft(extractJson(repair.text));
        }

        // One repair is the whole allowance. A slot that still cannot be drawn
        // is simply left empty — the player sees a shorter case and no error.
        if (!validation.ok) continue;

        sketches.push({
          ...validation.draft,
          id: mintSketchId(nextNumber),
          createdDay: day,
          survivals: 0,
        });
        nextNumber++;
      }

      return { sketches, nextNumber };
    },

    async distil(gallery) {
      const reply = await ask(styleGuidePrompt(gallery));
      if (!reply.ok) return null;
      const text = reply.text.trim();
      return text.length ? text : null;
    },
  };
}
