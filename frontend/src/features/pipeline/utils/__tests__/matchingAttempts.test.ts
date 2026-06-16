import { describe, expect, it } from "vitest";
import {
  isMatchingAttemptBlocked,
  MATCHING_ATTEMPT_TTL_MS,
  MAX_MATCHING_ATTEMPTS,
  MatchingAttemptEntry,
  pruneMatchingAttempts,
  setMatchingAttemptWithLimit,
} from "../matchingAttempts";

const NOW = 1_000_000;
const OPTS = { maxSize: MAX_MATCHING_ATTEMPTS, ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW };

function entry(
  status: MatchingAttemptEntry["status"],
  ageMsAgo = 0,
  error?: string,
): MatchingAttemptEntry {
  return { status, error, timestamp: NOW - ageMsAgo };
}

function makeMap(
  entries: Array<[string, MatchingAttemptEntry]>,
): Map<string, MatchingAttemptEntry> {
  return new Map(entries);
}

// ── isMatchingAttemptBlocked ──────────────────────────────────────────────────

describe("isMatchingAttemptBlocked", () => {
  it("retorna false para entry undefined", () => {
    expect(isMatchingAttemptBlocked(undefined, { ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW })).toBe(false);
  });

  it("retorna true para in_flight recente", () => {
    expect(isMatchingAttemptBlocked(entry("in_flight"), { ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW })).toBe(true);
  });

  it("retorna true para completed recente", () => {
    expect(isMatchingAttemptBlocked(entry("completed"), { ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW })).toBe(true);
  });

  it("retorna true para failed recente", () => {
    expect(isMatchingAttemptBlocked(entry("failed", 0, "erro"), { ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW })).toBe(true);
  });

  it("retorna false para entrada expirada (TTL ultrapassado)", () => {
    const expiredBy1ms = MATCHING_ATTEMPT_TTL_MS + 1;
    expect(
      isMatchingAttemptBlocked(entry("completed", expiredBy1ms), { ttlMs: MATCHING_ATTEMPT_TTL_MS, now: NOW }),
    ).toBe(false);
  });

  it("retorna true para entrada exatamente no limite do TTL (não expirado)", () => {
    expect(
      isMatchingAttemptBlocked(entry("completed", MATCHING_ATTEMPT_TTL_MS), {
        ttlMs: MATCHING_ATTEMPT_TTL_MS,
        now: NOW,
      }),
    ).toBe(true);
  });
});

// ── pruneMatchingAttempts ─────────────────────────────────────────────────────

describe("pruneMatchingAttempts", () => {
  it("não altera mapa vazio", () => {
    const map = makeMap([]);
    pruneMatchingAttempts(map, OPTS);
    expect(map.size).toBe(0);
  });

  it("remove entradas expiradas", () => {
    const map = makeMap([
      ["a:1", entry("completed", MATCHING_ATTEMPT_TTL_MS + 1)],
      ["a:2", entry("completed", 0)],
    ]);
    pruneMatchingAttempts(map, OPTS);
    expect(map.has("a:1")).toBe(false);
    expect(map.has("a:2")).toBe(true);
  });

  it("preserva entradas recentes abaixo do limite", () => {
    const entries: Array<[string, MatchingAttemptEntry]> = Array.from({ length: 10 }, (_, i) => [
      `k:${i}`,
      entry("completed"),
    ]);
    const map = makeMap(entries);
    pruneMatchingAttempts(map, OPTS);
    expect(map.size).toBe(10);
  });

  it("remove as mais antigas quando excede maxSize", () => {
    const limit = 3;
    const entries: Array<[string, MatchingAttemptEntry]> = [
      ["oldest", entry("completed", 5000)],
      ["middle", entry("completed", 2000)],
      ["newest", entry("completed", 0)],
      ["extra", entry("completed", 100)],
    ];
    const map = makeMap(entries);
    pruneMatchingAttempts(map, { ...OPTS, maxSize: limit });
    expect(map.size).toBe(limit);
    expect(map.has("oldest")).toBe(false);
  });

  it("não remove entradas in_flight dentro do TTL", () => {
    const map = makeMap([["a:1", entry("in_flight")]]);
    pruneMatchingAttempts(map, OPTS);
    expect(map.has("a:1")).toBe(true);
  });

  it("não cresce acima de MAX_MATCHING_ATTEMPTS após inserções repetidas", () => {
    const map = new Map<string, MatchingAttemptEntry>();
    for (let i = 0; i < MAX_MATCHING_ATTEMPTS + 50; i++) {
      setMatchingAttemptWithLimit(map, `k:${i}`, { status: "completed" }, OPTS);
    }
    expect(map.size).toBeLessThanOrEqual(MAX_MATCHING_ATTEMPTS);
  });
});

// ── setMatchingAttemptWithLimit ───────────────────────────────────────────────

describe("setMatchingAttemptWithLimit", () => {
  it("adiciona entrada com timestamp", () => {
    const map = makeMap([]);
    setMatchingAttemptWithLimit(map, "a:1", { status: "in_flight" }, OPTS);
    const stored = map.get("a:1");
    expect(stored?.status).toBe("in_flight");
    expect(stored?.timestamp).toBe(NOW);
  });

  it("armazena error quando fornecido", () => {
    const map = makeMap([]);
    setMatchingAttemptWithLimit(map, "a:1", { status: "failed", error: "timeout" }, OPTS);
    expect(map.get("a:1")?.error).toBe("timeout");
  });

  it("não quebra se a mesma chave for atualizada (completed → in_flight nova tentativa)", () => {
    const map = makeMap([["a:1", entry("completed", MATCHING_ATTEMPT_TTL_MS + 1)]]);
    setMatchingAttemptWithLimit(map, "a:1", { status: "in_flight" }, OPTS);
    expect(map.get("a:1")?.status).toBe("in_flight");
    expect(map.get("a:1")?.timestamp).toBe(NOW);
  });

  it("pruna expirados antes de adicionar nova entrada", () => {
    const expiredAge = MATCHING_ATTEMPT_TTL_MS + 1;
    const map = makeMap([
      ["expired:1", entry("completed", expiredAge)],
      ["expired:2", entry("failed", expiredAge)],
    ]);
    setMatchingAttemptWithLimit(map, "new:1", { status: "in_flight" }, OPTS);
    expect(map.has("expired:1")).toBe(false);
    expect(map.has("expired:2")).toBe(false);
    expect(map.has("new:1")).toBe(true);
    expect(map.size).toBe(1);
  });
});
