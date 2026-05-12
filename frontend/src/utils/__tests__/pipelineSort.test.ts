import { describe, it, expect } from "vitest";
import { sortCandidatesByScore } from "../pipelineSort";
import type { JobCandidate } from "../../types/domain";

describe("sortCandidatesByScore", () => {
  it("deve ordenar candidatos por job_fit_score decrescente por padrão", () => {
    const candidates = [
      { candidate_id: "1", candidate_name: "A", job_fit_score: 64 },
      { candidate_id: "2", candidate_name: "B", job_fit_score: 97 },
      { candidate_id: "3", candidate_name: "C", job_fit_score: 54 },
    ] as JobCandidate[];

    const sorted = sortCandidatesByScore(candidates);

    expect(sorted[0].candidate_id).toBe("2"); // 97%
    expect(sorted[1].candidate_id).toBe("1"); // 64%
    expect(sorted[2].candidate_id).toBe("3"); // 54%
  });

  it("deve ordenar candidatos por job_fit_score crescente", () => {
    const candidates = [
      { candidate_id: "1", candidate_name: "A", job_fit_score: 64 },
      { candidate_id: "2", candidate_name: "B", job_fit_score: 97 },
      { candidate_id: "3", candidate_name: "C", job_fit_score: 54 },
    ] as JobCandidate[];

    const sorted = sortCandidatesByScore(candidates, "score_asc");

    expect(sorted[0].candidate_id).toBe("3"); // 54%
    expect(sorted[1].candidate_id).toBe("1"); // 64%
    expect(sorted[2].candidate_id).toBe("2"); // 97%
  });

  it("deve ordenar candidatos por nome A-Z", () => {
    const candidates = [
      { candidate_id: "1", candidate_name: "Zebra", job_fit_score: 97 },
      { candidate_id: "2", candidate_name: "Abacate", job_fit_score: 54 },
    ] as JobCandidate[];

    const sorted = sortCandidatesByScore(candidates, "name_az");

    expect(sorted[0].candidate_id).toBe("2"); // Abacate
    expect(sorted[1].candidate_id).toBe("1"); // Zebra
  });

  it("deve colocar candidatos sem score no final mesmo em ordem crescente", () => {
    const candidates = [
      { candidate_id: "1", candidate_name: "A", job_fit_score: null },
      { candidate_id: "2", candidate_name: "B", job_fit_score: 97 },
      { candidate_id: "3", candidate_name: "C", job_fit_score: 54 },
    ] as JobCandidate[];

    const sorted = sortCandidatesByScore(candidates, "score_asc");

    expect(sorted[0].candidate_id).toBe("3"); // 54%
    expect(sorted[1].candidate_id).toBe("2"); // 97%
    expect(sorted[2].candidate_id).toBe("1"); // Null
  });

  it("deve manter ordenação determinística em caso de empate usando o nome", () => {
    const candidates = [
      { candidate_id: "1", candidate_name: "Zebra", job_fit_score: 50 },
      { candidate_id: "2", candidate_name: "Abacate", job_fit_score: 50 },
    ] as JobCandidate[];

    const sorted = sortCandidatesByScore(candidates);

    expect(sorted[0].candidate_id).toBe("2"); // Abacate vem antes de Zebra
    expect(sorted[1].candidate_id).toBe("1");
  });
});
