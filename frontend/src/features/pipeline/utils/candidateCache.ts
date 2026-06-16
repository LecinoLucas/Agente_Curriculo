import type { CandidateOverview } from "../../../types/domain";

export const MAX_CANDIDATE_CACHE_ENTRIES = 100;
export const CANDIDATE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CachedCandidateEntry {
  data: CandidateOverview;
  timestamp: number;
}

type CandidateCacheMap = Map<string, CachedCandidateEntry>;

interface CacheOptions {
  maxSize: number;
  ttlMs: number;
  now: number;
}

/**
 * Removes expired entries, then evicts oldest-first until the map is within maxSize.
 * Operates in-place on the provided Map.
 */
export function pruneCandidateCache(map: CandidateCacheMap, { maxSize, ttlMs, now }: CacheOptions): void {
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
 * Prunes the map to maxSize - 1, then inserts the new entry.
 * Guarantees the map never exceeds maxSize after this call.
 */
export function setCandidateCacheEntryWithLimit(
  map: CandidateCacheMap,
  key: string,
  data: CandidateOverview,
  options: CacheOptions,
): void {
  pruneCandidateCache(map, { ...options, maxSize: Math.max(0, options.maxSize - 1) });
  map.set(key, { data, timestamp: options.now });
}

/**
 * Returns the cached CandidateOverview if it exists and has not expired.
 * Returns undefined for a miss or an expired entry.
 */
export function getCandidateCacheEntry(
  map: CandidateCacheMap,
  key: string,
  { ttlMs, now }: Pick<CacheOptions, "ttlMs" | "now">,
): CandidateOverview | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (now - entry.timestamp > ttlMs) return undefined;
  return entry.data;
}
