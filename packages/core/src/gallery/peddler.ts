/**
 * The visitor. Hooded, a head taller than any villager, with its case slung at
 * its right side in the accent colour (`A`).
 *
 * Deliberately NOT in `BODY_IDS`: no skill or agent can ever roll this
 * appearance, which is the whole reason a stranger reads as a stranger. It is
 * a legal sketch grid all the same — pinned by a test — so the ordinary
 * compositor draws it with no special case.
 */
export const PEDDLER_GRID: readonly string[] = Object.freeze([
  '...XXXXX...',
  '..XXXXXXX..',
  '.XXXXXXXXX.',
  '.XXWWXWWXX.',
  '.XXWWXWWXX.',
  '.XXXXKXXXX.',
  '.XXXAAAXXX.',
  '.XXXXXXXXXX',
  '..XXXXXXXAA',
  '..XXXXXXXAA',
  '...DD.DD...',
]);

/** Lilac: the least common villager hue, so the visitor never blends in. */
export const PEDDLER_HUE = '#b79fd6';

/**
 * The only thing it ever says. Delivered through the existing speech bubble
 * when the case opens — the peddler is not chatty and not care-able, so this
 * line never goes near the language model.
 */
export const PEDDLER_LINE =
  'The case only holds five, and I have sketched a new one — throw out the ugliest for me?';
