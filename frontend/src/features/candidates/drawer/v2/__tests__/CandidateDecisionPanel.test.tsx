import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CandidateDecisionPanel } from "../CandidateDecisionPanel";

describe("CandidateDecisionPanel", () => {
  it("aciona ver score e avaliar melhor quando a recomendação exige revisão", async () => {
    const user = userEvent.setup();
    const onViewAnalysis = vi.fn();
    const onEvaluateBetter = vi.fn();

    render(
      <CandidateDecisionPanel
        currentStage="screening"
        analysisResult={null}
        rankingEntry={{
          rank: 4,
          candidate_id: "candidate-1",
          candidate_name: "Pessoa Teste",
          stage: "screening",
          pipeline_status: "active",
          score_breakdown: {
            skill_match_score: 68,
            experience_match_score: 61,
            seniority_match_score: 59,
            education_score: 70,
            confidence_score: 85,
            penalty_score: 0,
            job_fit_score: 66,
          },
          job_fit_score: 66,
          decision_suggestion: "review",
          reason_tags: [],
          score_factors: { positive: [], negative: [], contextual: [] },
          data_confidence_score: 85,
          ranking_summary_text: "Compatibilidade moderada.",
          entered_at: null,
          computed_at: new Date().toISOString(),
          ranking_freshness_status: "fresh",
          match_freshness_status: "fresh",
          version: "v1",
          data_quality_status: "valid",
        }}
        compatibilityScore={66}
        hasActiveJob
        aiScore={null}
        aiStatus="completed"
        scoreExplanation={null}
        onViewAnalysis={onViewAnalysis}
        onEvaluateBetter={onEvaluateBetter}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver score" }));
    await user.click(screen.getByRole("button", { name: "Avaliar melhor" }));

    expect(onViewAnalysis).toHaveBeenCalledTimes(1);
    expect(onEvaluateBetter).toHaveBeenCalledTimes(1);
  });
});
