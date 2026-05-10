import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "recruiter" } }),
}));

import { ScoreTab } from "../ScoreTab";

describe("ScoreTab", () => {
  it("usa Aderência à Vaga e não renderiza Score final como rótulo público", () => {
    render(
      <ScoreTab
        overview={{
          candidate: {
            id: "candidate-1",
            full_name: "Pessoa Teste",
            email: "pessoa@teste.com",
            phone: null,
            cpf: null,
            location_city: null,
            location_state: null,
            location_country: "BR",
            linkedin_url: null,
            github_url: null,
            portfolio_url: null,
            internal_notes: null,
            tags: [],
            user_id: null,
            created_by: "user-1",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          resumes: [],
          latest_analysis: null,
          latest_analysis_pipeline: null,
          top_matches: [],
          active_job_id: "job-1",
          active_job: { id: "job-1", title: "Vaga Teste", status: "published" },
          pipeline_entries: [],
        }}
        activeJobId="job-1"
        activeJob={{
          id: "job-1",
          title: "Vaga Teste",
          description: "Desc",
          requirements: null,
          status: "published",
          seniority_level: null,
          minimum_education_level: null,
          minimum_years_experience: null,
          deal_breakers: [],
          work_model: null,
          location: null,
          salary_min: null,
          salary_max: null,
          salary_currency: "BRL",
          job_area: null,
          responsibilities: null,
          experience_context: null,
          behavioral_requirements: [],
          priority: "normal",
          quality_score: null,
          quality_status: null,
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }}
        activePipelineEntry={null}
        rankingEntry={{
          rank: 1,
          candidate_id: "candidate-1",
          candidate_name: "Pessoa Teste",
          stage: "screening",
          pipeline_status: "active",
          score_breakdown: {
            skill_match_score: 80,
            experience_match_score: 75,
            seniority_match_score: 70,
            education_score: 85,
            confidence_score: 90,
            penalty_score: 0,
            job_fit_score: 82,
          },
          job_fit_score: 82,
          decision_suggestion: "approved",
          reason_tags: [],
          ranking_summary_text: "Resumo oficial.",
          entered_at: null,
          computed_at: new Date().toISOString(),
          ranking_freshness_status: "fresh",
          version: "v1",
        }}
        analysisResult={null}
        loading={false}
        error={null}
        compatibilityGuidance={null}
        scoreExplanation={null}
      />,
    );

    expect(screen.getAllByText("Aderência à Vaga").length).toBeGreaterThan(0);
    expect(screen.queryByText("Score final")).not.toBeInTheDocument();
  });
});
