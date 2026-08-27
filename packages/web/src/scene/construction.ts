/**
 * Building sites for the three zones that are scenery until their milestones
 * land: Hatchery (M6), Adoption Center (M5), Notice Board (M9).
 *
 * One deliberate cluster per zone, not debris strewn evenly across them —
 * scattered texture reads as the graphics being turned down, while a single
 * grounded cluster reads as somebody working here tomorrow. Every piece sits
 * on the zone's baseline; nothing floats.
 */
import type { KAPLAYCtx } from 'kaplay';
import { TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import { tokenTag, sceneryColor } from './retint.js';
import { CONSTRUCTION_XS, CONSTRUCTION_BASE_Y, CONSTRUCTION_W } from '../layout/zones.js';
import { block } from './prop.js';

/** Post height, and the two crossbars measured down from the top. */
const POST_H = 104;
const BAR_YS = [22, 60];
/** The barrier's stripe width — wide enough to read at a glance, not a zebra. */
const STRIPE_W = 12;
const BARRIER_H = 12;

export function mountConstruction(k: KAPLAYCtx, monoFont: string): void {
  for (const x of CONSTRUCTION_XS) {
    const base = CONSTRUCTION_BASE_Y;
    const top = base - POST_H;

    // Two posts and the bars between them: a scaffold frame.
    block(k, x, top, 8, POST_H, 'wood', 1);
    block(k, x + CONSTRUCTION_W - 8, top, 8, POST_H, 'wood', 1);
    for (const dy of BAR_YS) block(k, x, top + dy, CONSTRUCTION_W, 6, 'wood', 1);

    // A striped barrier across the front, alternating wood and cream. Tiles
    // cleanly only when CONSTRUCTION_W is a whole multiple of STRIPE_W.
    for (let i = 0; i * STRIPE_W < CONSTRUCTION_W; i++) {
      block(k, x + i * STRIPE_W, base - BARRIER_H, STRIPE_W, BARRIER_H,
        i % 2 === 0 ? 'wood' : 'cream', 2);
    }

    // The plate, sized from the rendered text rather than a guessed width —
    // the first playtest's complaint about oversized signs applies here too.
    const { tokens, tint } = themeStore.current();
    const label = k.add([
      k.text('UNDER CONSTRUCTION', { size: 9 * TEXT_SS, font: monoFont }),
      k.scale(1 / TEXT_SS),
      k.pos(x + CONSTRUCTION_W / 2, top + 40),
      k.anchor('center'),
      k.color(k.Color.fromHex(sceneryColor(tokens, tint, 'ink'))),
      k.z(4),
      tokenTag('ink'),
    ]);
    const plate = k.add([
      k.rect(label.width / TEXT_SS + 10, label.height / TEXT_SS + 8, { radius: 3 }),
      k.pos(x + CONSTRUCTION_W / 2, top + 40),
      k.anchor('center'),
      k.color(k.Color.fromHex(sceneryColor(tokens, tint, 'cream'))),
      k.outline(2, k.Color.fromHex(sceneryColor(tokens, tint, 'ink'))),
      k.z(3),
      tokenTag('cream'),
    ]);
    // The plate is built after the text so it can be sized from it, so it has
    // to be pushed behind it explicitly.
    plate.z = 3;
  }
}
