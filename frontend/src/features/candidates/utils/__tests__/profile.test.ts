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
      actionable: false,
    });
  });

  it.each([
    // sem contexto (preAdmissionContext undefined): fallback conservador
    ["hired", "Registrar decisão", "Registre a decisão de contratação para prosseguir", "workflow:hiring_decision"],
    ["pre_admission", "Acompanhar pré-admissão", "Acesse a aba de pré-admissão para acompanhar o processo", "workflow"],
    ["protheus", "Ver integração ERP", "Confira o caso admissional antes da integração", "pre_admission"],
  ] as const)("sem contexto de pré-admissão, %s retorna label conservadora", (stage, label, hint, targetTab) => {
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
      label,
      hint,
      targetTab,
      actionable: true,
    });
  });

  it("candidato em hired SEM decisão Contratar retorna Registrar decisão (context ciente)", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage: "hired",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Contratado",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: true,
          hasActiveCase: false,
          canCreateCase: false,
          hiringDecisionOutcome: null,
        },
      }),
    ).toEqual({
      label: "Registrar decisão",
      hint: "A pré-admissão só fica disponível após a decisão de contratar.",
      targetTab: "workflow:hiring_decision",
      actionable: true,
    });
  });

  it("candidato em pre_admission SEM decisão Contratar retorna Registrar decisão (context ciente)", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage: "pre_admission",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Pré-admissão",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: true,
          hasActiveCase: false,
          canCreateCase: false,
          hiringDecisionOutcome: null,
        },
      }),
    ).toEqual({
      label: "Registrar decisão",
      hint: "A pré-admissão só fica disponível após a decisão de contratar.",
      targetTab: "workflow:hiring_decision",
      actionable: true,
    });
  });

  it("prioriza criação explícita do caso admissional quando há decisão hire e nenhum caso ativo", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage: "hired",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Contratado",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: true,
          hasActiveCase: false,
          canCreateCase: true,
          hiringDecisionOutcome: "hire",
        },
      }),
    ).toEqual({
      label: "Iniciar pré-admissão",
      hint: "Crie o caso admissional para iniciar checklist, documentos e integração.",
      targetTab: "pre_admission:create",
      actionable: true,
    });
  });

  it("abre a pré-admissão existente quando já há caso admissional ativo", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage: "pre_admission",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Pré-admissão",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: true,
          hasActiveCase: true,
          canCreateCase: false,
          hiringDecisionOutcome: "hire",
        },
      }),
    ).toEqual({
      label: "Abrir pré-admissão",
      hint: "Acompanhe checklist, pendências e readiness",
      targetTab: "pre_admission",
      actionable: true,
    });
  });

  it("quando candidato em final tem gate hiring_decision_required, CTA mostra Registrar decisão", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      resumes: [
        {
          resume_id: "r1",
          title: "CV",
          status: "active",
          current_version: 1,
          current_version_id: "v1",
          current_file_name: "cv.pdf",
          extraction_status: "completed",
          updated_at: "2026-05-25T10:00:00Z",
        },
      ],
      latest_analysis: {
        analysis_id: "a1",
        job_id: "job-1",
        resume_id: "r1",
        resume_title: "CV",
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
          stage: "final",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Final",
        },
      ],
      preview_pendencies: [
        {
          id: "hiring_decision_required",
          label: "Decisão de contratação obrigatória",
          tone: "block",
          action: "open_decision",
          description: "Registre a decisão de contratação antes de avançar para a etapa de oferta.",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(deriveNextAction(overview, activeEntry)).toEqual({
      label: "Registrar decisão",
      hint: "Registre a decisão de contratação antes de avançar para a etapa de oferta.",
      targetTab: "workflow:hiring_decision",
      actionable: true,
    });
  });

  it("quando candidato em hired tem gate hiring_decision_required, CTA mostra Registrar decisão", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      resumes: [
        {
          resume_id: "r2",
          title: "CV",
          status: "active",
          current_version: 1,
          current_version_id: "v2",
          current_file_name: "cv.pdf",
          extraction_status: "completed",
          updated_at: "2026-05-25T10:00:00Z",
        },
      ],
      latest_analysis: {
        analysis_id: "a2",
        job_id: "job-1",
        resume_id: "r2",
        resume_title: "CV",
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
          stage: "hired",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [
        {
          id: "hiring_decision_required",
          label: "Decisão de contratação obrigatória",
          tone: "block",
          action: "open_decision",
          description: "Registre a decisão de contratar antes de iniciar a pré-admissão.",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(deriveNextAction(overview, activeEntry)).toEqual({
      label: "Registrar decisão",
      hint: "Registre a decisão de contratar antes de iniciar a pré-admissão.",
      targetTab: "workflow:hiring_decision",
      actionable: true,
    });
  });

  it("informa restrição ao RH quando o usuário não pode abrir a pré-admissão", () => {
    const overview: CandidateOverview = {
      ...admittedOverview,
      pipeline_entries: [
        {
          ...admittedOverview.pipeline_entries[0],
          stage: "hired",
          relationship_status: "active",
          is_terminal: false,
          candidate_status: "Contratado",
        },
      ],
    };

    const activeEntry = getActivePipelineEntry(overview);

    expect(
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: false,
          hasActiveCase: false,
          canCreateCase: false,
          hiringDecisionOutcome: "hire",
        },
      }),
    ).toEqual({
      label: "Pré-admissão restrita ao RH.",
      hint: "Disponível apenas para RH e administradores.",
      actionable: false,
    });
  });
});
