import type { KAPLAYCtx } from 'kaplay';
import { themeStore } from '../theme/index.js';
import type { Tokens } from '../theme/store.js';
import { tokenTag, sceneryColor } from './retint.js';

export function hex(k: KAPLAYCtx, value: string) {
  return k.Color.fromHex(value);
}

/**
 * A flat rectangle prop, tagged and coloured off a palette token rather than
 * a fixed hex. Spec §4.1: props are rectangles, never sprites. The colour is
 * struck at creation time from the *current* resolved theme (so a mid-day
 * boot starts correct); the `themed:<token>` tag lets `startVillage`'s
 * retint walker find and recolour every one of these on a later theme
 * change without this function knowing anything about that walker.
 *
 * `token` always seeds the initial colour, but `tagToken: false` skips
 * adding the `themed:<token>` tag itself — for a block whose colour is
 * owned by someone else (e.g. a house window, owned by sky.ts's
 * `windowsGlow` swap) and must not also be caught by this walker's generic
 * per-token pass, which would fight over the same paint every publish.
 */
export function block(
  k: KAPLAYCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  token: keyof Tokens,
  z = 0,
  extraTags: string[] = [],
  tagToken = true,
) {
  const { tokens, tint } = themeStore.current();
  return k.add([
    k.rect(w, h),
    k.pos(x, y),
    k.color(hex(k, sceneryColor(tokens, tint, token))),
    k.z(z),
    ...(tagToken ? [tokenTag(token)] : []),
    ...extraTags,
  ]);
}
