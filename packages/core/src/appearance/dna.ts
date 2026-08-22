import { createHash } from 'node:crypto';
import type { CreatureKind } from '../types.js';

/**
 * Named byte offsets into the digest, one per independent choice.
 *
 * Using fixed named offsets rather than a sequential cursor means adding a new
 * choice later does not shift the bytes an existing choice reads — so every
 * creature already in a player's village keeps the appearance it has always had.
 * Never renumber these.
 */
export const DNA_OFFSET = {
  body: 0,
  crown: 1,
  hue: 2,
  posture: 3,
  crownReroll: 4,
} as const;

/** SHA-256 of the creature's kind and name. Same input, same creature, any machine. */
export function dnaSeed(kind: CreatureKind, name: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`${kind}:${name}`).digest());
}

export function pickIndex(seed: Uint8Array, offset: number, count: number): number {
  if (count <= 0) throw new Error(`pickIndex: count must be positive, got ${count}`);
  // Two bytes, half the digest apart, to keep the modulo bias negligible.
  const hi = seed[offset % seed.length]!;
  const lo = seed[(offset + 16) % seed.length]!;
  return ((hi << 8) | lo) % count;
}

export function pickFrom<T>(seed: Uint8Array, offset: number, items: readonly T[]): T {
  return items[pickIndex(seed, offset, items.length)]!;
}
