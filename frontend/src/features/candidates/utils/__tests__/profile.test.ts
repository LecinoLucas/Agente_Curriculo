import { describe, expect, it } from "vitest";

import type { CandidateOverview } from "../../../../types/domain";
import { deriveNextAction, derivePendencies, getActivePipelineEntry } from "../profile";

const admittedOverview: CandidateOverview = {
  candidate: {
    id: "candidate-1",
    full_name: "Ana Souza",
    email: "ana@example.com",
    phone: null,
    cpf: null,
    application_source: null,
    location_city: "São Paulo",
    location_state: "SP",
    location_country: "BR",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    internal_notes: null,
    tags: [],
    user_id: null,
    created_by: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
  },
  resumes: [],
  latest_analysis: null,
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: "job-1",
  active_job: {
    id: "job-1",
    title: "Analista Protheus",
    status: "published",
  },
  pipeline_entries: [
    {
      candidate_id: "candidate-1",
      job_id: "job-1",
      job_title: "Analista Protheus",
      stage: "admitted",
      relationship_status: "hired",
      is_terminal: false,
      terminated_at: null,
      termination_reason: null,
      candidate_status: "Admitido",
      updated_at: "2026-05-25T10:00:00Z",
    },
  ],
  active_job_decision: null,
  active_job_skill_preview: null,
  active_job_score_dimensions: null,
  latest_note: null,
  preview_pendencies: [
    { id: "behavioral_assignment", label: "Teste comportamental pendente", tone: "warning" },
  ],
  latest_movement: {
    event_type: "stage_moved",
    to_stage: "admitted",
    actor_name: "Juliana",
    moved_at: "2026-05-25T10:00:00Z",
  },
};

describe("profile terminal post-hire states", () => {
  it("oculta pendências legadas quando o candidato já foi admitido", () => {
    expect(derivePendencies(admittedOverview)).toEqual([]);
  });

  it("não sugere ações operacionais após admitted", () => {
    const activeEntry = getActivePipelineEntry(admittedOverview);

    expect(deriveNextAction(admittedOverview, activeEntry)).toEqual({
      label: "Sem ação pendente",
      hint: "Candidato admitido",
    });
  });

  it.each([
    ["hired", "Inicie ou acompanhe o caso admissional"],
    ["pre_admission", "Acompanhe checklist, pendências e readiness"],
    ["protheus", "Confira o caso admissional antes da integração"],
  ] as const)("direciona %s para a aba robusta de pré-admissão", (stage, hint) => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      resumes: admittedOverview.resumes.length
        ? admittedOverview.resumes
        : [
            {
              resume_id: "resume-1",
              title: "Currículo",
              status: "active",
              current_version: 1,
              current_version_id: "version-1",
              current_file_name: "curriculo.pdf",
              extraction_status: "completed",
              updated_at: "2026-05-25T10:00:00Z",
            },
          ],
      latest_analysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo",
        status: "completed",
        started_at: null,
        completed_at: "2026-05-25T10:00:00Z",
        failed_at: null,
        failure_reason: null,
        used_real_ai: true,
        task_id: null,
        worker_id: null,
        seniority_level: null,
        total_experience_years: null,
        created_at: "2026-05-25T09:00:00Z",
        updated_at: "2026-05-25T10:00:00Z",
      },
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage,
          relationship_status: "active",
          is_terminal: false,
          candidate_status: stage,
        },
      ],
      preview_pendencies: [],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(deriveNextAction(overview, activeEntry)).toEqual({
      label: "Abrir pré-admissão",
      hint,
      targetTab: "pre_admission",
    });
  });
});
