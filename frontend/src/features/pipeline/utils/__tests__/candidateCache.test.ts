import { describe, expect, it } from "vitest";
import type { CandidateOverview } from "../../../../types/domain";
import {
  CANDIDATE_CACHE_TTL_MS,
  CachedCandidateEntry,
  getCandidateCacheEntry,
  MAX_CANDIDATE_CACHE_ENTRIES,
  pruneCandidateCache,
  setCandidateCacheEntryWithLimit,
} from "../candidateCache";

const NOW = 2_000_000;
const OPTS = { maxSize: MAX_CANDIDATE_CACHE_ENTRIES, ttlMs: CANDIDATE_CACHE_TTL_MS, now: NOW };

function fakeOverview(id: string): CandidateOverview {
  return { candidate: { id } } as unknown as CandidateOverview;
}

function entry(id: string, ageMsAgo = 0): CachedCandidateEntry {
  return { data: fakeOverview(id), timestamp: NOW - ageMsAgo };
}

function makeMap(
  pairs: Array<[string, CachedCandidateEntry]>,
): Map<string, CachedCandidateEntry> {
  return new Map(pairs);
}

// ── getCandidateCacheEntry ────────────────────────────────────────────────────

describe("getCandidateCacheEntry", () => {
  it("retorna undefined para chave ausente", () => {
    const map = makeMap([]);
    expect(getCandidateCacheEntry(map, "x", OPTS)).toBeUndefined();
  });

  it("retorna o CandidateOverview para entrada recente", () => {
    const map = makeMap([["c1", entry("c1")]]);
    expect(getCandidateCacheEntry(map, "c1", OPTS)).toEqual(fakeOverview("c1"));
  });

  it("retorna undefined para entrada expirada (TTL ultrapassado em 1ms)", () => {
    const expiredAge = CANDIDATE_CACHE_TTL_MS + 1;
    const map = makeMap([["c1", entry("c1", expiredAge)]]);
    expect(getCandidateCacheEntry(map, "c1", OPTS)).toBeUndefined();
  });

  it("retorna entrada exatamente no limite do TTL (nao expirada)", () => {
    const map = makeMap([["c1", entry("c1", CANDIDATE_CACHE_TTL_MS)]]);
    expect(getCandidateCacheEntry(map, "c1", OPTS)).toEqual(fakeOverview("c1"));
  });

  it("cache hit nao remove a entrada do mapa", () => {
    const map = makeMap([["c1", entry("c1")]]);
    getCandidateCacheEntry(map, "c1", OPTS);
    expect(map.has("c1")).toBe(true);
  });
});

// ── pruneCandidateCache ───────────────────────────────────────────────────────

describe("pruneCandidateCache", () => {
  it("nao altera mapa vazio", () => {
    const map = makeMap([]);
    pruneCandidateCache(map, OPTS);
    expect(map.size).toBe(0);
  });

  it("remove entradas expiradas e preserva recentes", () => {
    const expiredAge = CANDIDATE_CACHE_TTL_MS + 1;
    const map = makeMap([
      ["expired", entry("expired", expiredAge)],
      ["fresh", entry("fresh", 0)],
    ]);
    pruneCandidateCache(map, OPTS);
    expect(map.has("expired")).toBe(false);
    expect(map.has("fresh")).toBe(true);
  });

  it("remove as mais antigas quando excede maxSize", () => {
    const limit = 3;
    const pairs: Array<[string, CachedCandidateEntry]> = [
      ["oldest", entry("oldest", 5000)],
      ["middle", entry("middle", 2000)],
      ["newest", entry("newest", 0)],
      ["extra", entry("extra", 100)],
    ];
    const map = makeMap(pairs);
    pruneCandidateCache(map, { ...OPTS, maxSize: limit });
    expect(map.size).toBe(limit);
    expect(map.has("oldest")).toBe(false);
  });

  it("nao remove entradas recentes abaixo do limite", () => {
    const pairs: Array<[string, CachedCandidateEntry]> = Array.from({ length: 5 }, (_, i) => [
      `c${i}`,
      entry(`c${i}`),
    ]);
    const map = makeMap(pairs);
    pruneCandidateCache(map, OPTS);
    expect(map.size).toBe(5);
  });
});

// ── setCandidateCacheEntryWithLimit ───────────────────────────────────────────

describe("setCandidateCacheEntryWithLimit", () => {
  it("adiciona entrada com timestamp correto", () => {
    const map = makeMap([]);
    setCandidateCacheEntryWithLimit(map, "c1", fakeOverview("c1"), OPTS);
    const stored = map.get("c1");
    expect(stored?.data).toEqual(fakeOverview("c1"));
    expect(stored?.timestamp).toBe(NOW);
  });

  it("atualiza entrada existente expirada sem erro", () => {
    const expiredAge = CANDIDATE_CACHE_TTL_MS + 1;
    const map = makeMap([["c1", entry("c1", expiredAge)]]);
    setCandidateCacheEntryWithLimit(map, "c1", fakeOverview("c1-updated"), OPTS);
    expect(map.get("c1")?.data).toEqual(fakeOverview("c1-updated"));
    expect(map.get("c1")?.timestamp).toBe(NOW);
  });

  it("nao cresce acima de MAX_CANDIDATE_CACHE_ENTRIES apos insercoes repetidas", () => {
    const map = new Map<string, CachedCandidateEntry>();
    for (let i = 0; i < MAX_CANDIDATE_CACHE_ENTRIES + 50; i++) {
      setCandidateCacheEntryWithLimit(map, `c${i}`, fakeOverview(`c${i}`), OPTS);
    }
    expect(map.size).toBeLessThanOrEqual(MAX_CANDIDATE_CACHE_ENTRIES);
  });

  it("expurga expirados antes de inserir nova entrada", () => {
    const expiredAge = CANDIDATE_CACHE_TTL_MS + 1;
    const map = makeMap([
      ["exp1", entry("exp1", expiredAge)],
      ["exp2", entry("exp2", expiredAge)],
    ]);
    setCandidateCacheEntryWithLimit(map, "novo", fakeOverview("novo"), OPTS);
    expect(map.has("exp1")).toBe(false);
    expect(map.has("exp2")).toBe(false);
    expect(map.has("novo")).toBe(true);
    expect(map.size).toBe(1);
  });

  it("preserva entradas recentes ao inserir dentro do limite", () => {
    const map = makeMap([
      ["c1", entry("c1")],
      ["c2", entry("c2")],
    ]);
    setCandidateCacheEntryWithLimit(map, "c3", fakeOverview("c3"), OPTS);
    expect(map.has("c1")).toBe(true);
    expect(map.has("c2")).toBe(true);
    expect(map.has("c3")).toBe(true);
  });
});
