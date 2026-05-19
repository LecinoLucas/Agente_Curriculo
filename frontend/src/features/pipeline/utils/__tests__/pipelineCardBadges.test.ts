import { describe, expect, it } from "vitest";

import { derivePipelineCardBadges } from "../pipelineCardBadges";
import type { JobCandidate } from "../../../../types/domain";

const now = new Date("2026-05-18T12:00:00.000Z");

function candidate(overrides: Partial<JobCandidate> & Record<string, unknown> = {}): JobCandidate {
  return {
    candidate_id: "candidate-1",
    candidate_name: "Aline Santos",
    stage: "entry",
    ai_status: "completed",
    job_fit_score: 88,
    ...overrides,
  } as JobCandidate;
}

function labels(input: ReturnType<typeof derivePipelineCardBadges>) {
  return input.map((badge) => badge.label);
}

describe("derivePipelineCardBadges", () => {
  it("retorna IA pendente quando não há análise solicitada", () => {
    const badges = derivePipelineCardBadges(candidate({ ai_status: null }), { now });

    expect(labels(badges)).toContain("IA pendente");
    expect(badges.find((badge) => badge.label === "IA pendente")?.tone).toBe("warning");
  });

  it("retorna análise em andamento para análise processando", () => {
    const badges = derivePipelineCardBadges(candidate({ ai_status: "processing", job_fit_score: null }), { now });

    expect(labels(badges)[0]).toBe("Análise em andamento");
  });

  it("retorna avaliação respondida quando há submissão comportamental", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        behavioral_assessment: {
          template_required: true,
          assignment_status: "submitted",
          submitted_at: "2026-05-16T10:00:00.000Z",
        },
      }),
      { now },
    );

    expect(labels(badges)).toContain("Avaliação respondida");
  });

  it("retorna IA comportamental pendente quando a avaliação foi respondida e a vaga exige IA", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        requires_behavioral_ai_evaluation: true,
        behavioral_assessment_status: "submitted",
        behavioral_submitted_at: "2026-05-16T10:00:00.000Z",
        behavioral_ai_evaluation_status: null,
      }),
      { now },
    );

    expect(labels(badges)).toContain("IA comportamental pendente");
  });

  it("retorna IA comportamental em andamento quando a avaliação assistida está processando", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        requires_behavioral_ai_evaluation: true,
        behavioral_assessment_status: "submitted",
        behavioral_submitted_at: "2026-05-16T10:00:00.000Z",
        behavioral_ai_evaluation_status: "processing",
      }),
      { now },
    );

    expect(labels(badges)).toContain("IA comportamental em andamento");
  });

  it("retorna entrevista pendente quando a entrevista é exigida na etapa de entrevista", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        stage: "hr_interview",
        requires_interview: true,
      }),
      { now },
    );

    expect(labels(badges)).toContain("Entrevista pendente");
  });

  it("retorna pronto para decisão quando não há pendência visível", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        stage: "final",
        ai_status: "completed",
        job_fit_score: 91,
      }),
      { now },
    );

    expect(labels(badges)).toContain("Pronto para decisão");
  });

  it("não retorna pronto para decisão quando a IA comportamental obrigatória está pendente", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        stage: "final",
        ai_status: "completed",
        job_fit_score: 91,
        requires_behavioral_ai_evaluation: true,
        behavioral_assessment_status: "submitted",
        behavioral_submitted_at: "2026-05-16T10:00:00.000Z",
        behavioral_ai_evaluation_status: "pending",
      }),
      { now },
    );

    expect(labels(badges)).toContain("IA comportamental pendente");
    expect(labels(badges)).not.toContain("Pronto para decisão");
  });

  it("limita a lista a 3 badges", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        ai_status: "completed",
        job_fit_score: null,
        requires_behavioral_assessment: true,
        behavioral_assessment_status: "not_started",
        requires_interview: true,
        stage: "hr_interview",
        updated_at: "2026-05-10T12:00:00.000Z",
      }),
      { now },
    );

    expect(badges).toHaveLength(3);
  });

  it("prioriza pendências antes de informações neutras", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        ai_status: "completed",
        job_fit_score: null,
        requires_behavioral_assessment: true,
        behavioral_assessment_status: "not_started",
        updated_at: "2026-05-10T12:00:00.000Z",
      }),
      { now },
    );

    expect(labels(badges)).toEqual(["Aguardando score", "Sem avaliação", "Parado há 8 dias"]);
  });

  it("não inventa badge de avaliação ou entrevista quando o dado não existe", () => {
    const badges = derivePipelineCardBadges(
      candidate({
        ai_status: "completed",
        job_fit_score: 88,
        stage: "entry",
      }),
      { now },
    );

    expect(labels(badges)).toEqual([]);
  });
});
