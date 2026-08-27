import { describe, expect, it } from 'vitest';
import { resolveDrop, resolveHeldDrop, seatAll } from './placement.js';
import { PIN_LO, PIN_HI, snapRowY, type Pin } from '../layout/zones.js';
import { PORCH_SPOT } from '../layout/robot.js';

// A raw drop point picked to land clear of every prop's keep-out band, so
// `resolveDrop` needs no spacing rule to satisfy and returns exactly what
// was asked for — the baseline these tests build their pins from, rather
// than a hand-picked (x, y) that could silently start colliding with scenery
// the moment zones.ts's layout changes.
function clearSpot(): Pin {
  return resolveDrop(new Map(), 'seed', 2900, 300);
}

describe('resolveDrop', () => {
  it('does not space a re-dropped villager away from its own previous pin', () => {
    // Dropped again on the exact spot it already holds. If the villager's own
    // pin were counted as an "other" to space away from, pinSpot would read
    // this as two villagers sharing one row and shove the result sideways by
    // a full MIN_SEPARATION; excluding self is what keeps it landing exactly
    // where it was dropped.
    const home = clearSpot();
    const pins = new Map<string, Pin>([['a', home]]);
    const spot = resolveDrop(pins, 'a', home.x, home.y);
    expect(spot).toEqual(home);
  });

  it('does space a drop away from a different villager already pinned there', () => {
    const home = clearSpot();
    const pins = new Map<string, Pin>([['other', home]]);
    const spot = resolveDrop(pins, 'a', home.x, home.y);
    expect(spot.x).not.toBe(home.x);
  });

  it('clamps into the pinnable world range regardless of what is nearby', () => {
    const spot = resolveDrop(new Map(), 'a', -99999, 620);
    expect(spot.x).toBeGreaterThanOrEqual(PIN_LO);
    expect(spot.x).toBeLessThanOrEqual(PIN_HI);
  });
});

describe('resolveHeldDrop', () => {
  // A cursor y whose row (620, per snapRowY) sits comfortably inside the
  // seven-row band — nowhere near the clamp at either end — so adding the
  // offset below is guaranteed to land on a genuinely different row rather
  // than being swallowed by a clamp both values would hit anyway.
  const cursorY = 600;
  // Bigger than one ROW_DEPTH (46px), so the feet land on a different row
  // than the cursor itself — the exact bug this seam exists to fix.
  const footOffset = 60;

  it('resolves against the cursor y plus the foot offset, not the cursor alone', () => {
    const atFeet = resolveHeldDrop(new Map(), 'a', 2900, cursorY, footOffset);
    expect(atFeet.y).toBe(snapRowY(cursorY + footOffset));
    expect(atFeet.y).not.toBe(snapRowY(cursorY));
  });

  it('falls back to the raw cursor position when there is nothing in the hand to measure', () => {
    // footOffset is 0 for a drag whose sprites never finished loading —
    // held.ts drew nothing, so there is no visible foot to correct for.
    const atCursor = resolveHeldDrop(new Map(), 'a', 2900, cursorY, 0);
    expect(atCursor).toEqual(resolveDrop(new Map(), 'a', 2900, cursorY));
  });
});

describe('seatAll', () => {
  it('stands the resident on the porch even when the resident also holds a pin', () => {
    const pins = new Map<string, Pin>([['bot', clearSpot()]]);
    const spots = seatAll(['bot', 'other'], pins, 'bot');
    expect(spots.get('bot')).toEqual(PORCH_SPOT);
  });

  it('leaves a non-resident pin exactly where it was placed', () => {
    const home = clearSpot();
    const pins = new Map<string, Pin>([['villager', home]]);
    const spots = seatAll(['villager'], pins, null);
    expect(spots.get('villager')?.x).toBe(home.x);
    expect(spots.get('villager')?.y).toBe(home.y);
  });

  it('seats an unpinned resident on the porch, same as any other resident', () => {
    const spots = seatAll(['bot'], new Map(), 'bot');
    expect(spots.get('bot')).toEqual(PORCH_SPOT);
  });
});
