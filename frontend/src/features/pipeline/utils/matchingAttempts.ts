export const MAX_MATCHING_ATTEMPTS = 100;
export const MATCHING_ATTEMPT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface MatchingAttemptEntry {
  status: "in_flight" | "completed" | "failed";
  error?: string;
  timestamp: number;
}

type MatchingAttemptMap = Map<string, MatchingAttemptEntry>;

interface PruneOptions {
  maxSize: number;
  ttlMs: number;
  now: number;
}

/**
 * Removes expired entries, then evicts oldest-first until the map is within maxSize.
 * Operates in-place. Pure outside of the Map mutation.
 */
export function pruneMatchingAttempts(map: MatchingAttemptMap, { maxSize, ttlMs, now }: PruneOptions): void {
  for (const [key, entry] of map) {
    if (now - entry.timestamp > ttlMs) {
      map.delete(key);
    }
  }
  if (map.size > maxSize) {
    const excess = map.size - maxSize;
    let removed = 0;
    for (const key of map.keys()) {
      if (removed >= excess) break;
      map.delete(key);
      removed++;
    }
  }
}

/**
 * Prunes the map then sets the new entry. Call this instead of map.set() directly.
 */
export function setMatchingAttemptWithLimit(
  map: MatchingAttemptMap,
  key: string,
  value: Pick<MatchingAttemptEntry, "status" | "error">,
  options: PruneOptions,
): void {
  // Prune to maxSize - 1 to make room for the incoming entry.
  pruneMatchingAttempts(map, { ...options, maxSize: Math.max(0, options.maxSize - 1) });
  map.set(key, { ...value, timestamp: options.now });
}

/**
 * Returns true if an existing entry should block a new attempt
 * (i.e., it exists and has not yet expired).
 */
export function isMatchingAttemptBlocked(
  entry: MatchingAttemptEntry | undefined,
  { ttlMs, now }: { ttlMs: number; now: number },
): boolean {
  if (!entry) return false;
  if (now - entry.timestamp > ttlMs) return false;
  return (
    entry.status === "in_flight" ||
    entry.status === "completed" ||
    entry.status === "failed"
  );
}
