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
});
