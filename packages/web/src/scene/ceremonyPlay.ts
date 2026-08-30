import type { KAPLAYCtx } from 'kaplay';
import type { HeldCreature } from './held.js';
import { flightFrame, flightPoint } from './ceremony.js';

/**
 * The KAPLAY skin over ceremony.ts: flies a held creature into the
 * robot-house face-screen. Takes ownership of `held` — the caller must
 * already have cleared its own references (the hand reads as empty the
 * frame the drop landed) — destroys it at contact, then fires the hook so
 * the caller can flash the house, puff, chime, and unhide the actor.
 *
 * The dangle spring keeps running mid-flight: position updates go through
 * `held.update` with a synthetic cursor velocity, so the body trails and
 * swings exactly as it did in the hand.
 */
export function playCeremony(
  k: KAPLAYCtx,
  held: HeldCreature,
  from: { x: number; y: number },
  to: { x: number; y: number },
  hooks: { onContact(): void },
): void {
  let elapsed = 0;
  let lastX = from.x;
  const tick = k.onUpdate(() => {
    elapsed += k.dt();
    const f = flightFrame(elapsed);
    if (f.phase === 'contact') {
      tick.cancel();
      held.destroy();
      hooks.onContact();
      return;
    }
    const p = flightPoint(from, to, f.progress);
    const vx = (p.x - lastX) / Math.max(k.dt(), 1e-4);
    lastX = p.x;
    held.update(k.time(), k.dt(), p.x, p.y, vx);
    held.setStretch(f.sx, f.sy);
    held.setLabelAlpha(f.labelAlpha);
  });
}
