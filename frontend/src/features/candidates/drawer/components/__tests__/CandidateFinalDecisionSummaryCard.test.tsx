import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CandidateFinalDecisionSummaryCard } from "../CandidateFinalDecisionSummaryCard";
import type { CandidateFinalDecisionSummary } from "../../../../../types/domain";

const readySummary: CandidateFinalDecisionSummary = {
  candidate_id: "candidate-1",
  job_id: "job-1",
  active_job_decision: {
    score_status: "score_ready",
    match_score: 86,
    freshness_status: "current",
    warnings: [],
  },
  behavioral_assessment: {
    template_required: true,
    assignment_status: "submitted",
    answered_count: 5,
    question_count: 5,
    submitted_at: "2026-05-14T10:00:00Z",
    ai_evaluation_status: "completed",
    ai_confidence: "medium",
    ai_summary: "Resumo operacional curto da avaliação comportamental.",
  },
  interview_scorecard: {
    status: "submitted",
    final_recommendation: "yes",
    average_rating: 4.2,
    submitted_at: "2026-05-14T11:00:00Z",
  },
  decision_readiness: {
    status: "ready_for_human_decision",
    missing_items: [],
    warnings: [],
    next_action: "review_and_move_pipeline",
  },
};

function renderCard(summary: CandidateFinalDecisionSummary) {
  render(
    <CandidateFinalDecisionSummaryCard
      jobId="job-1"
      candidateId="candidate-1"
      summary={summary}
    />,
  );
}

describe("CandidateFinalDecisionSummaryCard", () => {
  it("renderiza resumo com tudo pronto", () => {
    renderCard(readySummary);

    expect(screen.getByText("Decisão final consolidada")).toBeInTheDocument();
    expect(screen.getByText("Pronto para decisão humana")).toBeInTheDocument();
    expect(screen.getAllByText("86%").length).toBeGreaterThan(0);
    expect(screen.getByText("Resumo operacional curto da avaliação comportamental.")).toBeInTheDocument();
  });

  it("mostra pendência comportamental", () => {
    renderCard({
      ...readySummary,
      behavioral_assessment: {
        ...readySummary.behavioral_assessment,
        assignment_status: "pending",
        answered_count: 0,
      },
      decision_readiness: {
        status: "waiting_behavioral_assessment",
        missing_items: ["behavioral_assessment"],
        warnings: [],
        next_action: "wait_candidate_behavioral_submission",
      },
    });

    expect(screen.getByText("Aguardando comportamental")).toBeInTheDocument();
    expect(screen.getByText(/Pendências: behavioral_assessment/i)).toBeInTheDocument();
  });

  it("mostra pendência de IA", () => {
    renderCard({
      ...readySummary,
      behavioral_assessment: {
        ...readySummary.behavioral_assessment,
        ai_evaluation_status: "processing",
        ai_confidence: null,
      },
      decision_readiness: {
        status: "waiting_behavioral_ai",
        missing_items: ["behavioral_ai_evaluation"],
        warnings: [],
        next_action: "run_or_wait_behavioral_ai",
      },
    });

    expect(screen.getByText("Aguardando IA assistiva")).toBeInTheDocument();
    expect(screen.getByText("Gerar ou aguardar análise assistiva")).toBeInTheDocument();
  });

  it("mostra pendência de scorecard", () => {
    renderCard({
      ...readySummary,
      interview_scorecard: {
        status: "draft",
        final_recommendation: null,
        average_rating: null,
        submitted_at: null,
      },
      decision_readiness: {
        status: "waiting_interview_scorecard",
        missing_items: ["interview_scorecard"],
        warnings: [],
        next_action: "complete_interview_scorecard",
      },
    });

    expect(screen.getByText("Aguardando scorecard")).toBeInTheDocument();
    expect(screen.getByText("Preencher scorecard de entrevista")).toBeInTheDocument();
  });

  it("mostra warning de score stale", () => {
    renderCard({
      ...readySummary,
      active_job_decision: {
        ...readySummary.active_job_decision,
        score_status: "score_stale",
        freshness_status: "stale",
        warnings: ["score_stale"],
      },
      decision_readiness: {
        status: "needs_attention",
        missing_items: ["job_match_current"],
        warnings: ["score_stale"],
        next_action: "refresh_job_match",
      },
    });

    expect(screen.getByText("Requer atenção")).toBeInTheDocument();
    expect(screen.getByText(/Warnings: score_stale/i)).toBeInTheDocument();
  });

  it("mostra recomendação humana", () => {
    renderCard({
      ...readySummary,
      interview_scorecard: {
        ...readySummary.interview_scorecard,
        final_recommendation: "strong_yes",
      },
    });

    expect(screen.getByText("Sim forte")).toBeInTheDocument();
  });

  it("não mostra aprovado ou reprovado automático", () => {
    renderCard(readySummary);

    expect(screen.queryByText(/aprovado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reprovado/i)).not.toBeInTheDocument();
  });
});
