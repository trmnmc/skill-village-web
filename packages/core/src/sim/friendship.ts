export const FRIENDSHIP_MAX = 100;

/** Affinity granted to each pair of creatures used in the same real session. */
export const CO_USE_BONUS = 6;

/** Threshold at which two creatures start hanging around together in the village. */
export const FRIENDS_THRESHOLD = 30;

/** Other creature ids to affinity, 0-100. */
export type FriendshipMap = Record<string, number>;

export function bumpFriendship(
  map: FriendshipMap,
  otherId: string,
  amount: number,
): FriendshipMap {
  const current = map[otherId] ?? 0;
  const next = Math.min(FRIENDSHIP_MAX, Math.max(0, current + amount));
  return { ...map, [otherId]: next };
}

/**
 * Creatures whose skills were invoked in the same session become friends.
 * This is the only place friendship is created, which keeps the village's social
 * graph a direct reflection of how the player actually works.
 */
export function recordCoUse(
  maps: Record<string, FriendshipMap>,
  usedIds: string[],
): Record<string, FriendshipMap> {
  const unique = [...new Set(usedIds)];
  if (unique.length < 2) return maps;

  const next: Record<string, FriendshipMap> = { ...maps };
  for (const id of unique) {
    for (const other of unique) {
      if (id === other) continue;
      next[id] = bumpFriendship(next[id] ?? {}, other, CO_USE_BONUS);
    }
  }
  return next;
}

/** Ids at or above the threshold, strongest first. */
export function friendsOf(map: FriendshipMap, threshold = FRIENDS_THRESHOLD): string[] {
  return Object.entries(map)
    .filter(([, affinity]) => affinity >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
