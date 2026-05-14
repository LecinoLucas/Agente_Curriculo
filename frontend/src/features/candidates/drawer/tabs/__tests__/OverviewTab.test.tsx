import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OverviewTab } from "../OverviewTab";
import type { CandidateOverview } from "../../../../../types/domain";

function buildOverview(overrides?: Partial<CandidateOverview>): CandidateOverview {
  return {
    candidate: {
      id: "candidate-1",
      full_name: "Pessoa Teste",
      email: "pessoa@teste.com",
      phone: null,
      cpf: null,
      location_city: null,
      location_state: null,
      location_country: "Brasil",
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
    active_job_id: null,
    active_job: null,
    pipeline_entries: [],
    ...overrides,
  };
}

describe("OverviewTab", () => {
  it("exibe CTA e estado vazio quando o candidato não tem vaga vinculada", async () => {
    const user = userEvent.setup();
    const onLinkJob = vi.fn();

    render(
      <OverviewTab
        overview={buildOverview()}
        activeJobId={null}
        activeJob={null}
        activePipelineEntry={null}
        onEdit={vi.fn()}
        onLinkJob={onLinkJob}
      />,
    );

    expect(
      screen.getByText("Este candidato ainda não está vinculado a nenhuma vaga"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma vaga vinculada")).toBeInTheDocument();
    expect(screen.getByText("Processos seletivos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vincular a uma vaga" }));

    expect(onLinkJob).toHaveBeenCalledTimes(1);
  });

  it("mostra resumo operacional enxuto quando existe vaga vinculada", () => {
    render(
      <OverviewTab
        overview={buildOverview({
          latest_analysis: {
            analysis_id: "analysis-1",
            job_id: "job-1",
            resume_id: "resume-1",
            resume_title: "CV",
            status: "completed",
            started_at: null,
            completed_at: null,
            failed_at: null,
            failure_reason: null,
            used_real_ai: true,
            task_id: null,
            worker_id: null,
            seniority_level: null,
            total_experience_years: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pipeline_entries: [
            {
              candidate_id: "candidate-1",
              job_id: "job-1",
              job_title: "Vaga Oficial",
              stage: "screening",
              relationship_status: "active",
              is_terminal: false,
              terminated_at: null,
              termination_reason: null,
              candidate_status: "Em análise",
              updated_at: new Date().toISOString(),
            },
          ],
          active_job_id: "job-1",
        })}
        activeJobId="job-1"
        activeJob={{ id: "job-1", title: "Vaga Oficial", status: "published" } as any}
        activePipelineEntry={{
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga Oficial",
          stage: "screening",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Em análise",
          updated_at: new Date().toISOString(),
        }}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    expect(screen.getByText("Status na Vaga")).toBeInTheDocument();
    expect(screen.getByText("Próximo passo")).toBeInTheDocument();
  });

  it("não mostra análise concluída de outra vaga quando vaga ativa é diferente", () => {
    render(
      <OverviewTab
        overview={buildOverview({
          latest_analysis: {
            analysis_id: "analysis-1",
            job_id: "job-2",
            resume_id: "resume-1",
            resume_title: "CV",
            status: "completed",
            started_at: null,
            completed_at: null,
            failed_at: null,
            failure_reason: null,
            used_real_ai: true,
            task_id: null,
            worker_id: null,
            seniority_level: null,
            total_experience_years: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pipeline_entries: [
            {
              candidate_id: "candidate-1",
              job_id: "job-1",
              job_title: "Vaga Ativa",
              stage: "screening",
              relationship_status: "active",
              is_terminal: false,
              terminated_at: null,
              termination_reason: null,
              candidate_status: "Em análise",
              updated_at: new Date().toISOString(),
            },
          ],
          active_job_id: "job-1",
        })}
        activeJobId="job-1"
        activeJob={{ id: "job-1", title: "Vaga Ativa", status: "published" } as any}
        activePipelineEntry={{
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga Ativa",
          stage: "screening",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Em análise",
          updated_at: new Date().toISOString(),
        }}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    expect(screen.queryByText("Análise concluída")).not.toBeInTheDocument();
    expect(screen.getByText("Aguardando análise")).toBeInTheDocument();
  });

  it("usa active_job_decision para mostrar status canônico quando disponível", () => {
    render(
      <OverviewTab
        overview={buildOverview({
          latest_analysis: {
            analysis_id: "analysis-1",
            job_id: "job-1",
            resume_id: "resume-1",
            resume_title: "CV",
            status: "completed",
            started_at: null,
            completed_at: null,
            failed_at: null,
            failure_reason: null,
            used_real_ai: true,
            task_id: null,
            worker_id: null,
            seniority_level: null,
            total_experience_years: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pipeline_entries: [
            {
              candidate_id: "candidate-1",
              job_id: "job-1",
              job_title: "Vaga Ativa",
              stage: "screening",
              relationship_status: "active",
              is_terminal: false,
              terminated_at: null,
              termination_reason: null,
              candidate_status: "Em análise",
              updated_at: new Date().toISOString(),
            },
          ],
          active_job_id: "job-1",
          active_job_decision: {
            score_status: "score_ready",
            analysis_status: "completed",
            current_analysis_id: "analysis-1",
            match_score: 0.85,
            warnings: [],
            next_action: "review_candidate",
          },
        })}
        activeJobId="job-1"
        activeJob={{ id: "job-1", title: "Vaga Ativa", status: "published" } as any}
        activePipelineEntry={{
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga Ativa",
          stage: "screening",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Em análise",
          updated_at: new Date().toISOString(),
        }}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    expect(screen.getByText("Aderência pronta")).toBeInTheDocument();
  });

  it("mostra aderência desatualizada quando score_stale no active_job_decision", () => {
    render(
      <OverviewTab
        overview={buildOverview({
          latest_analysis: {
            analysis_id: "analysis-1",
            job_id: "job-1",
            resume_id: "resume-1",
            resume_title: "CV",
            status: "completed",
            started_at: null,
            completed_at: null,
            failed_at: null,
            failure_reason: null,
            used_real_ai: true,
            task_id: null,
            worker_id: null,
            seniority_level: null,
            total_experience_years: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pipeline_entries: [
            {
              candidate_id: "candidate-1",
              job_id: "job-1",
              job_title: "Vaga Ativa",
              stage: "screening",
              relationship_status: "active",
              is_terminal: false,
              terminated_at: null,
              termination_reason: null,
              candidate_status: "Em análise",
              updated_at: new Date().toISOString(),
            },
          ],
          active_job_id: "job-1",
          active_job_decision: {
            score_status: "score_stale",
            analysis_status: "completed",
            current_analysis_id: "analysis-1",
            match_score: 0.72,
            warnings: ["analysis_from_different_job"],
            next_action: "wait_analysis",
          },
        })}
        activeJobId="job-1"
        activeJob={{ id: "job-1", title: "Vaga Ativa", status: "published" } as any}
        activePipelineEntry={{
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga Ativa",
          stage: "screening",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Em análise",
          updated_at: new Date().toISOString(),
        }}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    const texts = screen.getAllByText("Aderência desatualizada");
    expect(texts.length).toBeGreaterThan(0);
  });

  it("renderiza card de resumo decisório quando vaga está vinculada", () => {
    render(
      <OverviewTab
        overview={buildOverview({
          latest_analysis: {
            analysis_id: "analysis-1",
            job_id: "job-1",
            resume_id: "resume-1",
            resume_title: "CV",
            status: "completed",
            started_at: null,
            completed_at: null,
            failed_at: null,
            failure_reason: null,
            used_real_ai: true,
            task_id: null,
            worker_id: null,
            seniority_level: null,
            total_experience_years: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pipeline_entries: [
            {
              candidate_id: "candidate-1",
              job_id: "job-1",
              job_title: "Vaga Ativa",
              stage: "screening",
              relationship_status: "active",
              is_terminal: false,
              terminated_at: null,
              termination_reason: null,
              candidate_status: "Em análise",
              updated_at: new Date().toISOString(),
            },
          ],
          active_job_id: "job-1",
          active_job_decision: {
            score_status: "score_ready",
            analysis_status: "completed",
            current_analysis_id: "analysis-1",
            match_score: 0.85,
            warnings: [],
            next_action: "review_candidate",
          },
        })}
        activeJobId="job-1"
        activeJob={{ id: "job-1", title: "Vaga Ativa", status: "published" } as any}
        activePipelineEntry={{
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga Ativa",
          stage: "screening",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Em análise",
          updated_at: new Date().toISOString(),
        }}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    expect(screen.getByTestId("decision-summary-card")).toBeInTheDocument();
    expect(screen.getByText("Resumo decisório")).toBeInTheDocument();
  });

  it("não renderiza card de resumo decisório quando não há vagas vinculadas", () => {
    render(
      <OverviewTab
        overview={buildOverview()}
        activeJobId={null}
        activeJob={null}
        activePipelineEntry={null}
        onEdit={vi.fn()}
        onLinkJob={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("decision-summary-card")).not.toBeInTheDocument();
  });
});
