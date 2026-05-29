import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatesPage } from "../CandidatesPage";
import { CandidateProfilePage } from "../CandidateProfilePage";
import { candidatesService } from "../../services/candidatesService";
import { agendaService } from "../../services/agendaService";
import { analysisService } from "../../services/analysisService";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import { getBehavioralEvaluation, triggerBehavioralAnalysis } from "../../services/behavioralAIEvaluationService";
import { getCandidateBehavioralAssessment } from "../../services/behavioralAssessmentService";
import { communicationService } from "../../services/communicationService";
import { HttpError } from "../../services/http";
import * as hiringDecisionService from "../../services/hiringDecisionService";
import * as scorecardService from "../../services/interviewScorecardService";
import { listJobs, getCandidateRankingEntry } from "../../services/jobsService";
import { pipelineService } from "../../services/pipelineService";
import * as preAdmissionService from "../../services/preAdmissionService";
import { resumeService } from "../../services/resumeService";
import { scoreExplanationService, type ScoreExplanationResponse } from "../../services/scoreExplanationService";
import type { InterviewSchedule } from "../../types/agenda";
import type { BehavioralAssignmentDetailResponse, CandidateOverview, CandidateListSummary, HiringDecision, Job, JobRankingEntry } from "../../types/domain";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

let mockedUserRole = "admin";

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: mockedUserRole,
      real_ai_token_spend_enabled: true,
    },
  }),
}));

vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: () => ({
    notifyCandidatesChanged: vi.fn(),
    candidatesSyncTick: 0,
  }),
}));

vi.mock("../../features/pipeline/NewCandidateModal", () => ({
  NewCandidateModal: () => <div data-testid="new-candidate-modal" />,
}));

vi.mock("../../features/candidates/components/CandidatePreviewDrawer", () => ({
  CandidatePreviewDrawer: ({ candidateId }: { candidateId: string | null }) =>
    candidateId ? <div data-testid="candidate-preview-drawer">preview {candidateId}</div> : null,
}));

vi.mock("../../features/candidates/drawer/components/CandidateNotesTab", () => ({
  CandidateNotesTab: ({ candidateId }: { candidateId: string }) => (
    <div data-testid="profile-notes-tab">Observações {candidateId}</div>
  ),
}));

vi.mock("../../services/candidatesService", () => ({
  candidatesService: {
    getOverview: vi.fn(),
    getProcessHistory: vi.fn(),
    listSummaries: vi.fn(),
    checkDuplicate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
  },
}));

vi.mock("../../services/agendaService", () => ({
  agendaService: {
    listCandidateJobInterviews: vi.fn(),
    createCandidateJobInterview: vi.fn(),
    completeInterview: vi.fn(),
    rescheduleInterview: vi.fn(),
    cancelInterviewOperational: vi.fn(),
    markNoShow: vi.fn(),
  },
}));

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    result: vi.fn(),
    request: vi.fn(),
    status: vi.fn(),
  },
}));

vi.mock("../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getOverview: vi.fn(),
    getWorkspace: vi.fn(),
    approveChecklistItem: vi.fn(),
    rejectChecklistItem: vi.fn(),
    requestChecklistItemCorrection: vi.fn(),
    markChecklistItemNotRequired: vi.fn(),
    markCaseReadyForExport: vi.fn(),
  },
}));

vi.mock("../../services/behavioralAssessmentService", () => ({
  getCandidateBehavioralAssessment: vi.fn(),
}));

vi.mock("../../services/behavioralAIEvaluationService", () => ({
  getBehavioralEvaluation: vi.fn(),
  triggerBehavioralAnalysis: vi.fn(),
}));

vi.mock("../../services/communicationService", () => ({
  communicationService: {
    getRecruiterCommunications: vi.fn(),
    sendCustomMessage: vi.fn(),
    retryCommunication: vi.fn(),
  },
}));

vi.mock("../../services/interviewScorecardService", () => ({
  getInterviewScorecard: vi.fn(),
  createInterviewScorecard: vi.fn(),
  updateInterviewScorecard: vi.fn(),
  submitInterviewScorecard: vi.fn(),
}));

vi.mock("../../services/hiringDecisionService", () => ({
  getHiringDecision: vi.fn(),
  getHiringDecisionHistory: vi.fn(),
  createHiringDecision: vi.fn(),
}));

vi.mock("../../services/jobsService", () => ({
  listJobs: vi.fn(),
  getCandidateRankingEntry: vi.fn(),
}));

vi.mock("../../services/pipelineService", () => ({
  pipelineService: {
    getCandidateHistory: vi.fn(),
    moveCandidateStage: vi.fn(),
    transferCandidateJob: vi.fn(),
    addCandidateToJob: vi.fn(),
  },
}));

vi.mock("../../services/preAdmissionService", () => ({
  getPreAdmission: vi.fn(),
  createPreAdmission: vi.fn(),
}));

vi.mock("../../services/resumeService", () => ({
  resumeService: {
    get: vi.fn(),
    downloadCandidateResume: vi.fn(),
    fetchCandidateResumeFile: vi.fn(),
    getCandidateResumeDownloadUrl: vi.fn(),
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
  },
}));

vi.mock("../../services/scoreExplanationService", () => ({
  scoreExplanationService: {
    get: vi.fn(),
    saveFeedback: vi.fn(),
  },
}));

const job: Job = {
  id: "job-1",
  title: "Analista Protheus",
  description: "Vaga",
  requirements: null,
  status: "published",
  seniority_level: "pleno",
  minimum_education_level: null,
  minimum_years_experience: null,
  deal_breakers: [],
  work_model: "remote",
  location: "São Paulo",
  salary_min: null,
  salary_max: null,
  salary_currency: "BRL",
  job_area: "administrative",
  responsibilities: null,
  experience_context: null,
  behavioral_requirements: [],
  priority: "normal",
  quality_score: null,
  quality_status: null,
  behavioral_template_id: null,
  selection_flow_type: "standard",
  requires_behavioral_assessment: true,
  requires_behavioral_ai_evaluation: false,
  requires_interview: true,
  requires_scorecard: true,
  requires_manager_review: false,
  created_by: "user-1",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
};

const overview: CandidateOverview = {
  candidate: {
    id: "candidate-1",
    full_name: "Ana Souza",
    email: "ana@example.com",
    phone: "(11) 99999-9999",
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
  resumes: [
    {
      resume_id: "resume-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 1,
      current_version_id: "version-1",
      current_file_name: "ana.pdf",
      extraction_status: "completed",
      updated_at: "2026-05-12T10:00:00Z",
    },
  ],
  latest_analysis: {
    analysis_id: "analysis-1",
    job_id: "job-1",
    resume_id: "resume-1",
    resume_title: "Currículo Ana",
    status: "completed",
    started_at: null,
    completed_at: "2026-05-12T10:00:00Z",
    failed_at: null,
    failure_reason: null,
    used_real_ai: true,
    task_id: null,
    worker_id: null,
    seniority_level: "pleno",
    total_experience_years: 4,
    created_at: "2026-05-12T09:00:00Z",
    updated_at: "2026-05-12T10:00:00Z",
  },
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: "job-1",
  active_job: { id: "job-1", title: "Analista Protheus", status: "published" },
  pipeline_entries: [
    {
      candidate_id: "candidate-1",
      job_id: "job-1",
      job_title: "Analista Protheus",
      stage: "screening",
      resume_version_id: "version-1",
      relationship_status: "active",
      is_terminal: false,
      terminated_at: null,
      termination_reason: null,
      candidate_status: "Em análise",
      updated_at: "2026-05-15T10:00:00Z",
    },
  ],
  active_job_decision: {
    score_status: "score_ready",
    analysis_status: "completed",
    current_analysis_id: "analysis-1",
    match_score: 0.82,
    warnings: [],
    next_action: "review_candidate",
  },
  active_job_skill_preview: null,
  latest_note: null,
  preview_pendencies: [],
  latest_movement: null,
};

const buildTechnicalInterview = (
  overrides: Partial<InterviewSchedule> = {},
): InterviewSchedule => ({
  id: "interview-technical",
  candidate_id: "candidate-1",
  candidate_name: "Ana Souza",
  job_id: "job-1",
  job_title: "Analista Protheus",
  pipeline_id: "pipeline-current",
  title: "Entrevista técnica",
  description: null,
  public_notes: null,
  internal_notes: null,
  scheduled_start: "2026-05-24T10:00:00Z",
  scheduled_end: "2026-05-24T11:00:00Z",
  timezone: "America/Sao_Paulo",
  interview_type: "technical",
  interview_format: "online",
  status: "completed",
  location: null,
  meeting_url: null,
  interviewer_name: "Carlos",
  interviewer_email: null,
  cancel_reason: null,
  created_at: "2026-05-20T10:00:00Z",
  updated_at: "2026-05-24T11:00:00Z",
  scorecard_id: null,
  scorecard_status: null,
  scorecard_final_recommendation: null,
  scorecard_submitted_at: null,
  counts_for_current_gate: true,
  ...overrides,
});

const submittedHireDecision: HiringDecision = {
  id: "decision-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  pipeline_id: "pipeline-current",
  decided_by: "user-1",
  decision_status: "submitted",
  decision_outcome: "hire",
  reason_code: "strong_fit",
  notes: "Contratação aprovada por pessoa autorizada.",
  based_on_decision_summary_snapshot: null,
  based_on_scorecard_id: null,
  based_on_behavioral_assignment_id: null,
  based_on_behavioral_ai_evaluation_id: null,
  created_at: "2026-05-24T14:00:00Z",
  updated_at: "2026-05-24T14:00:00Z",
  submitted_at: "2026-05-24T14:00:00Z",
};

const candidateSummary: CandidateListSummary = {
  id: "candidate-1",
  full_name: "Ana Souza",
  email: "ana@example.com",
  phone: "(11) 99999-9999",
  cpf: null,
  tags: [],
  created_at: "2026-05-01T10:00:00Z",
  resume_count: 1,
  linked_job_count: 1,
  latest_job_id: "job-1",
  latest_job_title: "Analista Protheus",
  latest_job_stage: "screening",
  latest_relationship_status: "active",
  active_job_id: "job-1",
  active_job_title: "Analista Protheus",
  active_job_stage: "screening",
  active_job_job_fit_score: 0.82,
  ai_status: "completed",
};

const behavioralAssignment: BehavioralAssignmentDetailResponse = {
  id: "assignment-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  job_title: "Analista Protheus",
  template_id: "template-1",
  template_name: "Teste comportamental DISC",
  status: "submitted",
  assigned_at: "2026-05-15T09:00:00Z",
  started_at: "2026-05-15T10:00:00Z",
  submitted_at: "2026-05-15T10:30:00Z",
  expires_at: null,
  answered_count: 2,
  question_count: 2,
  competencies: [
    {
      id: "competency-1",
      name: "Colaboração",
      description: "Trabalho em equipe",
      display_order: 1,
      questions: [
        {
          id: "question-1",
          question_text: "Como você resolve conflitos?",
          answer_type: "text",
          is_required: true,
          display_order: 1,
          options_json: null,
          answer: {
            answer_text: "Converso com clareza e busco acordo.",
            answer_value: null,
            selected_options_json: null,
          },
        },
        {
          id: "question-2",
          question_text: "Nível de organização",
          answer_type: "scale",
          is_required: false,
          display_order: 2,
          options_json: null,
          answer: {
            answer_text: null,
            answer_value: 4,
            selected_options_json: null,
          },
        },
      ],
    },
  ],
};

const rankingEntry: JobRankingEntry = {
  rank: 1,
  candidate_id: "candidate-1",
  candidate_name: "Ana Souza",
  stage: "screening",
  pipeline_status: "active",
  score_breakdown: {
    skill_match_score: 0.9,
    experience_match_score: 0.82,
    seniority_match_score: 0.76,
    education_score: 0.68,
    confidence_score: 0.88,
    penalty_score: 0,
    job_fit_score: 0.84,
  },
  job_fit_score: 0.84,
  decision_suggestion: "approved",
  reason_tags: [
    {
      type: "skill_match",
      field: "skills",
      impact: 0.24,
      description: "Protheus e SQL aderentes",
    },
  ],
  score_factors: {
    positive: [
      {
        factor_type: "skill",
        factor_key: "protheus",
        factor_label: "Protheus aderente",
        impact_score: 0.24,
        direction: "positive",
      },
    ],
    negative: [
      {
        factor_type: "experience",
        factor_key: "advpl",
        factor_label: "Pouca evidência de ADVPL",
        impact_score: -0.12,
        direction: "negative",
      },
    ],
    contextual: [],
  },
  entered_at: "2026-05-01T10:00:00Z",
  computed_at: "2026-05-12T10:20:00Z",
  ranking_summary_text: "Boa aderência para a vaga ativa de Protheus.",
  ranking_freshness_status: "fresh",
  match_freshness_status: "fresh",
  score_computed_at: "2026-05-12T10:20:00Z",
  source_analysis_id: "analysis-1",
  source_analysis_created_at: "2026-05-12T10:00:00Z",
  score_model_version: "rank-v2",
  match_updated_at: "2026-05-12T10:20:00Z",
  ranking_updated_at: "2026-05-12T10:20:00Z",
  version: "rank-v2",
  ranking_version: "rank-v2",
  data_quality_status: "valid",
};

const scoreExplanation: ScoreExplanationResponse = {
  job_id: "job-1",
  candidate_id: "candidate-1",
  analysis_id: "analysis-1",
  job_fit_score: 0.84,
  ranking_freshness_status: "fresh",
  score_model_version: "rank-v2",
  explainability_version: "explain-v1",
  computed_at: "2026-05-12T10:20:00Z",
  recommendation: "approved",
  engine_used: "ranking",
  ranking_summary_text: "Explicação resumida da vaga ativa com boa aderência técnica.",
  breakdown: {
    mandatory: { score: 0.9, weight: 0.35, contribution: 0.315 },
    optional: { score: 0.7, weight: 0.2, contribution: 0.14 },
    experience: { score: 0.82, weight: 0.25, contribution: 0.205 },
    seniority: { score: 0.76, weight: 0.15, contribution: 0.114 },
    ai_adjustment: { score: 0.1, weight: 0.05, contribution: 0.005 },
  },
  score_factors: rankingEntry.score_factors!,
  delta: null,
  highlights: ["Protheus aderente", "SQL compatível"],
  risks: ["Pouca evidência de ADVPL"],
  high_score_reasons: ["Experiência consistente com ERP"],
  low_score_reasons: ["Experiência contábil pouco detalhada"],
  overestimation_risks: [],
  recommended_questions: [],
  strongest_evidence: [],
  matched_equivalences: [],
  partial_matches: [],
  gaps: [],
  data_confidence_score: 0.88,
  strengths: ["Atendimento e sustentação"],
  feedback: null,
};

const detailedResume = {
  id: "resume-1",
  candidate_id: "candidate-1",
  title: "Currículo Ana",
  status: "active",
  current_version: 2,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-12T10:00:00Z",
  versions: [
    {
      id: "version-2",
      version_number: 2,
      original_file_name: "ana-v2.pdf",
      mime_type: "application/pdf",
      extraction_status: "completed",
      uploaded_at: "2026-05-12T10:00:00Z",
    },
    {
      id: "version-1",
      version_number: 1,
      original_file_name: "ana-v1.pdf",
      mime_type: "application/pdf",
      extraction_status: "completed",
      uploaded_at: "2026-05-11T10:00:00Z",
    },
  ],
};

describe("Candidate workspace flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUserRole = "admin";
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(candidatesService.getOverview).mockResolvedValue(overview);
    vi.mocked(candidatesService.getProcessHistory).mockResolvedValue({
      candidate_id: "candidate-1",
      processes: [],
    });
    vi.mocked(candidatesService.listSummaries).mockResolvedValue({
      data: [candidateSummary],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(listJobs).mockResolvedValue({
      data: [job, { ...job, id: "job-2", title: "Consultor ERP" }],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
    vi.mocked(getCandidateRankingEntry).mockResolvedValue(rankingEntry);
    vi.mocked(analysisService.result).mockResolvedValue({} as Awaited<ReturnType<typeof analysisService.result>>);
    vi.mocked(analysisService.request).mockResolvedValue({
      analysis_id: "analysis-requested",
      status: "pending",
      created: true,
      blocked: false,
      reused: false,
      stuck: false,
      reason: "analysis_requested",
    });
    vi.mocked(analysisService.status).mockResolvedValue({
      analysis_id: "analysis-requested",
      status: "pending",
      retry_count: 0,
      stuck: false,
      reason: null,
      failure_reason: null,
      next_retry_at: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      updated_at: "2026-05-12T10:00:00Z",
    });
    vi.mocked(scoreExplanationService.get).mockResolvedValue(scoreExplanation);
    vi.mocked(scoreExplanationService.saveFeedback).mockResolvedValue({
      id: "feedback-1",
      job_id: "job-1",
      candidate_id: "candidate-1",
      liked: true,
      rejected: false,
      hired: false,
      comment: null,
      feedback_by: "user-1",
      feedback_at: "2026-05-12T11:00:00Z",
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(agendaService.completeInterview).mockResolvedValue(buildTechnicalInterview());
    vi.mocked(agendaService.createCandidateJobInterview).mockResolvedValue(buildTechnicalInterview({ status: "scheduled" }));
    vi.mocked(agendaService.rescheduleInterview).mockResolvedValue(buildTechnicalInterview({ status: "rescheduled" }));
    vi.mocked(agendaService.cancelInterviewOperational).mockResolvedValue(buildTechnicalInterview({ status: "cancelled" }));
    vi.mocked(agendaService.markNoShow).mockResolvedValue(buildTechnicalInterview({ status: "no_show" }));
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: null,
      suggested_behavioral_questions: [],
    });
    vi.mocked(scorecardService.createInterviewScorecard).mockResolvedValue({
      id: "scorecard-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      interview_id: "interview-technical",
      evaluator_id: "user-1",
      status: "draft",
      final_recommendation: "yes",
      overall_notes: "Bom resultado.",
      submitted_at: null,
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:00:00Z",
      items: [],
    });
    vi.mocked(scorecardService.updateInterviewScorecard).mockResolvedValue({
      id: "scorecard-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      interview_id: "interview-technical",
      evaluator_id: "user-1",
      status: "draft",
      final_recommendation: "yes",
      overall_notes: "Bom resultado.",
      submitted_at: null,
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:00:00Z",
      items: [],
    });
    vi.mocked(scorecardService.submitInterviewScorecard).mockResolvedValue({
      id: "scorecard-1",
      candidate_id: "candidate-1",
      job_id: "job-1",
      interview_id: "interview-technical",
      evaluator_id: "user-1",
      status: "submitted",
      final_recommendation: "yes",
      overall_notes: "Bom resultado.",
      submitted_at: "2026-05-24T12:05:00Z",
      created_at: "2026-05-24T12:00:00Z",
      updated_at: "2026-05-24T12:05:00Z",
      items: [],
    });
    vi.mocked(hiringDecisionService.getHiringDecision).mockResolvedValue({ decision: null });
    vi.mocked(hiringDecisionService.getHiringDecisionHistory).mockResolvedValue({ decisions: [] });
    vi.mocked(hiringDecisionService.createHiringDecision).mockResolvedValue(submittedHireDecision);
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: false,
      hiring_decision_outcome: null,
    });
    vi.mocked(preAdmissionService.createPreAdmission).mockResolvedValue({
      id: "case-created",
      candidate_id: "candidate-1",
      job_id: "job-1",
      hiring_decision_id: "decision-1",
      status: "draft",
      salary_offer: null,
      start_date: null,
      work_model: null,
      notes: null,
      created_by: "user-1",
      ready_for_export: false,
      ready_for_export_at: null,
      ready_for_export_by: null,
      created_at: "2026-05-24T10:00:00Z",
      updated_at: "2026-05-24T10:00:00Z",
      closed_at: null,
      checklist_items: [],
    });
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue({
      case: {
        id: "case-created",
        status: "draft",
        current_stage: "pre_admission",
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-24T10:00:00Z",
      },
      candidate: {
        id: "candidate-1",
        name: "Ana Souza",
        initials: "AS",
        avatar_url: null,
      },
      job: {
        id: "job-1",
        title: "Analista Protheus",
      },
      checklist: {
        total: 0,
        approved: 0,
        pending: 0,
        blocked: 0,
        items: [],
      },
      documents: [],
      main_blockers: [],
      next_actions: [],
      summary: {
        responsible_name: "Juliana",
        created_at: "2026-05-24T10:00:00Z",
        last_update_at: "2026-05-24T10:00:00Z",
        readiness_status: "not_ready",
        ready_for_export: false,
      },
      recent_events: [],
    });
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue({
      case: {
        id: "case-created",
        status: "draft",
        current_stage: "pre_admission",
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-24T10:00:00Z",
      },
      candidate: {
        id: "candidate-1",
        name: "Ana Souza",
        initials: "AS",
        avatar_url: null,
      },
      job: {
        id: "job-1",
        title: "Analista Protheus",
      },
      status_label: "Rascunho",
      progress: {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        in_review: 0,
        waived: 0,
      },
      main_blocker: null,
      main_blockers: [],
      next_action: null,
      next_actions: [],
      summary: {
        responsible_name: "Juliana",
        created_at: "2026-05-24T10:00:00Z",
        last_update_at: "2026-05-24T10:00:00Z",
        readiness_status: "not_ready",
        ready_for_export: false,
      },
      integration_status: {
        state: "pending",
        label: "Pendente",
        ready_for_export: false,
      },
      updated_at: "2026-05-24T10:00:00Z",
    });
    vi.mocked(getCandidateBehavioralAssessment).mockResolvedValue(behavioralAssignment);
    vi.mocked(getBehavioralEvaluation).mockResolvedValue({
      id: "evaluation-1",
      assignment_id: "assignment-1",
      status: "completed",
      confidence: "high",
      summary: "Perfil colaborativo, com boa comunicação em situações de conflito.",
      strengths: [],
      concerns: [],
      competency_signals: [],
      suggested_interview_questions: [],
      risk_flags: [],
      error_message: null,
      created_at: "2026-05-15T10:31:00Z",
      updated_at: "2026-05-15T10:32:00Z",
      completed_at: "2026-05-15T10:32:00Z",
    });
    vi.mocked(triggerBehavioralAnalysis).mockResolvedValue({
      evaluation_id: "evaluation-requested",
      assignment_id: "assignment-1",
      status: "pending",
      message: "Avaliação enfileirada",
    });
    vi.mocked(communicationService.getRecruiterCommunications).mockResolvedValue({
      communications: [],
    });
    vi.mocked(communicationService.sendCustomMessage).mockResolvedValue({} as Awaited<ReturnType<typeof communicationService.sendCustomMessage>>);
    vi.mocked(communicationService.retryCommunication).mockResolvedValue({ message: "ok" });
    vi.mocked(resumeService.get).mockResolvedValue(detailedResume);
    vi.mocked(resumeService.downloadCandidateResume).mockResolvedValue();
    vi.mocked(resumeService.fetchCandidateResumeFile).mockResolvedValue({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      contentType: "application/pdf",
      filename: "ana-v2.pdf",
    });
    vi.mocked(resumeService.getCandidateResumeDownloadUrl).mockResolvedValue({
      url: "http://localhost:8000/api/v1/candidates/candidate-1/resumes/resume-1/download",
      expires_at: null,
      content_type: "application/pdf",
      filename: "ana-v2.pdf",
    });
    vi.mocked(pipelineService.getCandidateHistory).mockResolvedValue({
      candidate_id: "candidate-1",
      candidate_name: "Ana Souza",
      job_id: "job-1",
      job_title: "Analista Protheus",
      current_stage: "screening",
      status: "active",
      entered_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-15T10:00:00Z",
      transitions: [
        {
          id: "transition-1",
          candidate_id: "candidate-1",
          job_id: "job-1",
          from_stage: "entry",
          to_stage: "screening",
          moved_by: "user-1",
          moved_by_name: "Juliana",
          moved_at: "2026-05-15T10:00:00Z",
          trigger: "manual",
          notes: null,
          reason: "Triagem aprovada",
        },
      ],
    });
  });

  it("/candidatos abre CandidatePreviewDrawer leve", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos"]}>
        <Routes>
          <Route path="/candidatos" element={<CandidatesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Ana Souza");
    fireEvent.click(screen.getByText("Ana Souza").closest("tr")!);

    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("candidate-1");
  });

  it("/candidatos/:id renderiza workspace completo com ações portadas", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ações" })).toBeInTheDocument();
    expect(screen.getByTestId("candidate-profile-primary-action")).toHaveTextContent("Agendar entrevista");
    expect(screen.getByRole("button", { name: "Observação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mais ações" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Vincular vaga$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Mover etapa$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ver score$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.getByRole("button", { name: /^Editar candidato$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ver score$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Alterar etapa manualmente$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ações" }));

    expect(screen.getAllByRole("button", { name: /Mover etapa/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Reprovar candidato/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar\/vincular vaga/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar candidato/i })).toBeInTheDocument();
    expect(screen.getAllByText("Transferir candidato").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Currículo e documentos/i }));
    expect(screen.getByRole("button", { name: /Enviar currículo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baixar currículo/i })).toBeInTheDocument();
    expect(screen.getByText("Currículo atual")).toBeInTheDocument();
    expect(screen.getByText("Visualizar currículo")).toBeInTheDocument();
    expect(screen.getByText("Versões do currículo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Score e análise/i }));
    expect(await screen.findByText("Análise da vaga ativa")).toBeInTheDocument();
    expect(screen.getByText("Explicação resumida da vaga ativa com boa aderência técnica.")).toBeInTheDocument();

    vi.mocked(candidatesService.getProcessHistory).mockResolvedValue({
      candidate_id: "candidate-1",
      processes: [
        {
          pipeline_id: "pipeline-current",
          job_id: "job-1",
          job_title: "Engenheiro Backend",
          is_current: true,
          started_at: "2026-05-20T10:00:00Z",
          closed_at: null,
          current_or_final_stage: "screening",
          result_label: "Em andamento",
          closure_reason: null,
          events_count: 1,
          interviews: [],
          scorecards: [],
          behavioral_assessment: null,
          hiring_decision: null,
        },
        {
          pipeline_id: "pipeline-old",
          job_id: "job-1",
          job_title: "Engenheiro Backend",
          is_current: false,
          started_at: "2026-05-10T10:00:00Z",
          closed_at: "2026-05-12T10:00:00Z",
          current_or_final_stage: "rejected",
          result_label: "Não selecionado",
          closure_reason: "Perfil fora do momento.",
          events_count: 4,
          interviews: [
            {
              id: "interview-old",
              type: "technical",
              status: "completed",
              scheduled_at: "2026-05-11T10:00:00Z",
              scorecard_status: "submitted",
              final_recommendation: "yes",
            },
          ],
          scorecards: [
            {
              id: "scorecard-old",
              interview_id: "interview-old",
              status: "submitted",
              final_recommendation: "yes",
              submitted_at: "2026-05-11T11:00:00Z",
            },
          ],
          behavioral_assessment: {
            assignment_id: "assignment-old",
            status: "submitted",
            submitted_at: "2026-05-11T12:00:00Z",
            ai_status: "completed",
            ai_completed_at: "2026-05-11T13:00:00Z",
          },
          hiring_decision: {
            id: "decision-old",
            status: "submitted",
            outcome: "reject",
            submitted_at: "2026-05-12T09:00:00Z",
          },
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: /Histórico/i }));
    await waitFor(() => expect(candidatesService.getProcessHistory).toHaveBeenCalledWith("candidate-1"));
    expect(await screen.findByText("Processo atual")).toBeInTheDocument();
    expect(screen.getByText("Processos anteriores")).toBeInTheDocument();
    expect(screen.getByText(/Resultado: Não selecionado/i)).toBeInTheDocument();
  });

  it("candidato com vaga ativa não mostra Vincular vaga no cabeçalho e mantém ação manual em Mais ações", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "final",
          candidate_status: "Final",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Avançar para oferta");
    expect(screen.queryByRole("button", { name: /^Vincular vaga$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Mover etapa$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.getByRole("button", { name: /^Alterar etapa manualmente$/i })).toBeInTheDocument();
  });

  it("candidato sem vaga ativa mostra Vincular vaga como ação principal", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_id: null,
      active_job: null,
      pipeline_entries: [],
      active_job_decision: null,
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Vincular vaga");
    expect(screen.getByTestId("candidate-profile-next-action-button")).toHaveTextContent("Vincular vaga");
  });

  it("botão da Próxima ação usa a mesma ação contextual do cabeçalho", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "final",
          candidate_status: "Final",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Avançar para oferta");
    expect(screen.getByTestId("candidate-profile-next-action-button")).toHaveTextContent("Avançar para oferta");

    await user.click(screen.getByTestId("candidate-profile-next-action-button"));

    await waitFor(() => {
      expect(screen.getAllByText("Pipeline").length).toBeGreaterThan(1);
    });
  });

  it("candidato com caso ativo em pré-admissão mostra Abrir pré-admissão como ação principal", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: {
        id: "case-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        hiring_decision_id: "decision-1",
        status: "draft",
        salary_offer: null,
        start_date: null,
        work_model: null,
        notes: null,
        created_by: "user-1",
        ready_for_export: false,
        ready_for_export_at: null,
        ready_for_export_by: null,
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-25T10:00:00Z",
        closed_at: null,
        checklist_items: [],
      },
      can_create: false,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "pre_admission",
          candidate_status: "Pré-admissão",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Abrir pré-admissão");
  });

  it("candidato em integração ERP mostra Ver integração ERP como ação principal", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: {
        id: "case-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        hiring_decision_id: "decision-1",
        status: "in_progress",
        salary_offer: null,
        start_date: null,
        work_model: null,
        notes: null,
        created_by: "user-1",
        ready_for_export: false,
        ready_for_export_at: null,
        ready_for_export_by: null,
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-25T10:00:00Z",
        closed_at: null,
        checklist_items: [],
      },
      can_create: false,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "protheus",
          candidate_status: "Protheus",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Ver integração ERP");
  });

  it("decisão contratar sem caso ativo abre drawer de início da pré-admissão e cria o caso para HR/Admin", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_decision: {
        ...overview.active_job_decision!,
        hiring_status: "submitted",
      },
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "hired",
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Iniciar pré-admissão");
    expect(screen.getByTestId("candidate-profile-next-action-button")).toHaveTextContent("Iniciar pré-admissão");

    await user.click(screen.getByTestId("candidate-profile-primary-action"));
    const drawer = await screen.findByRole("dialog", { name: /Iniciar pré-admissão/i });
    expect(screen.queryByText("Caso admissional ainda não aberto")).not.toBeInTheDocument();
    expect(within(drawer).getByText("Analista Protheus")).toBeInTheDocument();
    expect(within(drawer).getByText("Contratar")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: /^Criar caso admissional$/i }));

    await waitFor(() => {
      expect(preAdmissionService.createPreAdmission).toHaveBeenCalledWith("job-1", "candidate-1", {});
    });
    await waitFor(() => {
      expect(admissionWorkspaceService.getOverview).toHaveBeenCalledWith("case-created");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Iniciar pré-admissão/i })).not.toBeInTheDocument();
    });
  });

  it("cancelar o drawer de pré-admissão mantém o usuário na aba atual", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_decision: {
        ...overview.active_job_decision!,
        hiring_status: "submitted",
      },
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "hired",
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByTestId("candidate-profile-primary-action"));
    const drawer = await screen.findByRole("dialog", { name: /Iniciar pré-admissão/i });

    await user.click(within(drawer).getByRole("button", { name: /Cancelar/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Iniciar pré-admissão/i })).not.toBeInTheDocument();
    });
    expect(preAdmissionService.createPreAdmission).not.toHaveBeenCalled();
    expect(screen.queryByText("Caso admissional ainda não aberto")).not.toBeInTheDocument();
  });

  it("quando o caso já existe a ação principal abre direto a aba de pré-admissão", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: {
        id: "case-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        hiring_decision_id: "decision-1",
        status: "draft",
        salary_offer: null,
        start_date: null,
        work_model: null,
        notes: null,
        created_by: "user-1",
        ready_for_export: false,
        ready_for_export_at: null,
        ready_for_export_by: null,
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-24T10:00:00Z",
        closed_at: null,
        checklist_items: [],
      },
      can_create: false,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "pre_admission",
          candidate_status: "Pré-admissão",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Abrir pré-admissão");
    await user.click(screen.getByTestId("candidate-profile-primary-action"));
    expect(screen.queryByRole("dialog", { name: /Iniciar pré-admissão/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(admissionWorkspaceService.getOverview).toHaveBeenCalledWith("case-1");
    });
  });

  it("erro 403 ao criar caso pela CTA principal mostra acesso restrito ao RH", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.createPreAdmission).mockRejectedValueOnce(new HttpError(403, "forbidden"));
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_decision: {
        ...overview.active_job_decision!,
        hiring_status: "submitted",
      },
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "hired",
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByTestId("candidate-profile-primary-action"));
    const drawer = await screen.findByRole("dialog", { name: /Iniciar pré-admissão/i });

    await user.click(within(drawer).getByRole("button", { name: /^Criar caso admissional$/i }));

    expect(await within(drawer).findByText("Acesso restrito ao RH.")).toBeInTheDocument();
  });

  it("recruiter vê a próxima ação atual sem CTA de iniciar pré-admissão", async () => {
    mockedUserRole = "recruiter";
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "hired",
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Registrar decisão");
    expect(screen.queryByText("Iniciar pré-admissão")).not.toBeInTheDocument();
    await waitFor(() => expect(preAdmissionService.getPreAdmission).toHaveBeenCalledWith("job-1", "candidate-1"));
  });

  it("abas progressivas: candidato sem vaga ativa não mostra entrevistas, avaliações ou pré-admissão", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_id: null,
      active_job: null,
      pipeline_entries: [],
      active_job_decision: null,
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visão geral/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currículo e documentos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comunicação/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Observações/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Histórico/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entrevistas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avaliações/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pré-admissão/i })).not.toBeInTheDocument();
  });

  it("abas progressivas: candidato em entrevista mostra Entrevistas", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /Entrevistas/i })).toBeInTheDocument();
  });

  it.each(["final", "offer"] as const)(
    "abas progressivas: candidato em %s mostra Ações, Score, Entrevistas e Histórico",
    async (stage) => {
      vi.mocked(candidatesService.getOverview).mockResolvedValue({
        ...overview,
        pipeline_entries: overview.pipeline_entries.map((entry) => ({
          ...entry,
          stage,
        })),
      });

      render(
        <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
          <Routes>
            <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("button", { name: /^Ações$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Score e análise/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Entrevistas/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Histórico/i })).toBeInTheDocument();
    },
  );

  it("abas progressivas: candidato contratado COM caso de pré-admissão mostra a aba", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: {
        id: "case-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        hiring_decision_id: "decision-1",
        status: "draft",
        salary_offer: null,
        start_date: null,
        work_model: null,
        notes: null,
        created_by: "user-1",
        ready_for_export: false,
        ready_for_export_at: null,
        ready_for_export_by: null,
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-24T10:00:00Z",
        closed_at: null,
        checklist_items: [],
      },
      can_create: false,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "hired",
        candidate_status: "Contratado",
      })),
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByRole("button", { name: /Pré-admissão/i })).length).toBeGreaterThan(0);
  });

  it("abas progressivas: candidato contratado SEM caso de pré-admissão NÃO mostra a aba", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "hired",
        candidate_status: "Contratado",
      })),
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Ana Souza" });
    expect(screen.queryByRole("button", { name: /^Pré-admissão$/i })).not.toBeInTheDocument();
  });

  it("candidato contratado SEM decisão Contratar: CTA mostra 'Registrar decisão', não 'Iniciar pré-admissão'", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: false,
      hiring_decision_outcome: null, // sem decisão
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "hired",
        candidate_status: "Contratado",
      })),
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // CTA principal deve ser "Registrar decisão", não qualquer variação de pré-admissão
    const primaryAction = await screen.findByTestId("candidate-profile-primary-action");
    expect(primaryAction).toHaveTextContent("Registrar decisão");
    expect(primaryAction).not.toHaveTextContent("pré-admissão");
    expect(primaryAction).not.toHaveTextContent("Iniciar");
    expect(primaryAction).not.toHaveTextContent("Mover para Pré-admissão");

    // Card "Próxima ação" também deve mostrar "Registrar decisão"
    expect(screen.getByTestId("candidate-profile-next-action-button")).toHaveTextContent("Registrar decisão");
  });

  it("candidato contratado SEM decisão Contratar: botão 'Mover para Pré-admissão' NÃO aparece na aba Ações", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: false,
      hiring_decision_outcome: null, // sem decisão
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "hired",
        candidate_status: "Contratado",
      })),
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Ana Souza" });

    // navegar para aba Ações
    await user.click(screen.getByRole("button", { name: "Ações" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Mover para Pré-admissão/i })).not.toBeInTheDocument();
    });
  });

  it("candidato contratado COM decisão Contratar: botão 'Mover para Pré-admissão' aparece na aba Ações", async () => {
    const user = userEvent.setup();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire", // com decisão
    });
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "hired",
        candidate_status: "Contratado",
      })),
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Ana Souza" });

    // navegar para aba Ações
    await user.click(screen.getByRole("button", { name: "Ações" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mover para Pré-admissão/i })).toBeInTheDocument();
    });
  });

  it("abas progressivas: candidato reprovado mostra Histórico e Comunicação sem Score ou Entrevistas", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "rejected",
        relationship_status: "rejected",
        is_terminal: true,
        terminated_at: "2026-05-25T12:00:00Z",
        candidate_status: "Reprovado",
      })),
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /Comunicação/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Histórico/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Score e análise/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entrevistas/i })).not.toBeInTheDocument();
  });

  it("deep link tab=interviews mantém Entrevistas visível mesmo quando a matriz esconderia", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "entry",
      })),
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /Entrevistas/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Agendar entrevista/i })).toBeInTheDocument();
  });

  it("tab inválida cai para Visão geral", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=invalida"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Resumo do processo")).toBeInTheDocument();
    expect(screen.getByText("Dados principais")).toBeInTheDocument();
  });

  it("aba Entrevistas mostra scorecard inline na entrevista técnica indicada pelo gate", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
      preview_pendencies: [
        {
          id: "scorecard_not_submitted",
          label: "Scorecard da entrevista pendente",
          tone: "block",
          action: "open_scorecard",
          description: "Preencha e submeta o scorecard da entrevista técnica para continuar.",
          action_payload: {
            interview_id: "interview-technical",
            scorecard_id: null,
            scorecard_status: null,
            interview_type: "technical",
          },
        },
      ],
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [
        {
          id: "interview-technical",
          candidate_id: "candidate-1",
          candidate_name: "Ana Souza",
          job_id: "job-1",
          job_title: "Analista Protheus",
          pipeline_id: "pipeline-current",
          title: "Entrevista técnica",
          description: null,
          public_notes: null,
          internal_notes: null,
          scheduled_start: "2026-05-24T10:00:00Z",
          scheduled_end: "2026-05-24T11:00:00Z",
          timezone: "America/Sao_Paulo",
          interview_type: "technical",
          interview_format: "online",
          status: "completed",
          location: null,
          meeting_url: null,
          interviewer_name: "Carlos",
          interviewer_email: null,
          cancel_reason: null,
          created_at: "2026-05-20T10:00:00Z",
          updated_at: "2026-05-24T11:00:00Z",
          scorecard_id: null,
          scorecard_status: null,
          scorecard_final_recommendation: null,
          scorecard_submitted_at: null,
          counts_for_current_gate: true,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews&focus=scorecard"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Entrevista técnica").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Técnica")).toBeInTheDocument();
    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preencher scorecard/i })).toBeInTheDocument();
    expect(screen.getByText("Esta entrevista precisa de scorecard para avançar.")).toBeInTheDocument();
    expect(await screen.findByText("Nenhum scorecard criado para esta entrevista.")).toBeInTheDocument();
    expect(scorecardService.getInterviewScorecard).toHaveBeenCalledWith(
      "job-1",
      "candidate-1",
      "interview-technical",
    );
  });

  it("botões Registrar feedback e Ver scorecard abrem fluxos diferentes", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
      preview_pendencies: [],
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [
        buildTechnicalInterview({
          scorecard_id: "scorecard-1",
          scorecard_status: "submitted",
          scorecard_final_recommendation: "yes",
          scorecard_submitted_at: "2026-05-24T12:00:00Z",
        }),
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: {
        id: "scorecard-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        interview_id: "interview-technical",
        evaluator_id: "user-1",
        status: "submitted",
        final_recommendation: "yes",
        overall_notes: "Bom resultado.",
        submitted_at: "2026-05-24T12:00:00Z",
        created_at: "2026-05-24T11:30:00Z",
        updated_at: "2026-05-24T12:00:00Z",
        items: [],
      },
      suggested_behavioral_questions: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Entrevista técnica").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("button", { name: /Registrar feedback/i }));

    expect(screen.getByLabelText(/Feedback da entrevista/i)).toBeInTheDocument();
    expect(scorecardService.getInterviewScorecard).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Ver scorecard/i }));

    expect(await screen.findByText("Scorecard enviado. Esta fase não permite edição após envio.")).toBeInTheDocument();
    expect(scorecardService.getInterviewScorecard).toHaveBeenCalledWith(
      "job-1",
      "candidate-1",
      "interview-technical",
    );
  });

  it("após concluir entrevista técnica recarrega o overview", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
      preview_pendencies: [
        {
          id: "technical_interview_not_completed",
          label: "Entrevista técnica ainda não concluída",
          tone: "block",
          action: "open_interview",
          description: "Conclua a entrevista técnica antes de avançar.",
          action_payload: { interview_id: "interview-technical" },
        },
      ],
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [buildTechnicalInterview({ status: "scheduled" })],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(agendaService.completeInterview).mockResolvedValue(
      buildTechnicalInterview({ status: "awaiting_feedback" }),
    );

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /Marcar como concluída/i }));

    await waitFor(() => expect(agendaService.completeInterview).toHaveBeenCalledWith("interview-technical"));
    await waitFor(() => expect(vi.mocked(candidatesService.getOverview).mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("após enviar scorecard recarrega entrevistas e overview", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
      preview_pendencies: [
        {
          id: "scorecard_not_submitted",
          label: "Scorecard da entrevista pendente",
          tone: "block",
          action: "open_scorecard",
          description: "Preencha e submeta o scorecard da entrevista técnica para continuar.",
          action_payload: {
            interview_id: "interview-technical",
            scorecard_id: "scorecard-1",
            scorecard_status: "draft",
            interview_type: "technical",
          },
        },
      ],
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [
        buildTechnicalInterview({
          scorecard_id: "scorecard-1",
          scorecard_status: "draft",
          scorecard_final_recommendation: "yes",
        }),
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: {
        id: "scorecard-1",
        candidate_id: "candidate-1",
        job_id: "job-1",
        interview_id: "interview-technical",
        evaluator_id: "user-1",
        status: "draft",
        final_recommendation: "yes",
        overall_notes: "Bom resultado.",
        submitted_at: null,
        created_at: "2026-05-24T11:30:00Z",
        updated_at: "2026-05-24T11:30:00Z",
        items: [],
      },
      suggested_behavioral_questions: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /Enviar scorecard/i }));

    await waitFor(() => expect(scorecardService.submitInterviewScorecard).toHaveBeenCalledWith("scorecard-1"));
    await waitFor(() => expect(vi.mocked(agendaService.listCandidateJobInterviews).mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(vi.mocked(candidatesService.getOverview).mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("aba Entrevistas não abre scorecard para entrevista ainda agendada", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: overview.pipeline_entries.map((entry) => ({
        ...entry,
        stage: "technical_interview",
      })),
      preview_pendencies: [
        {
          id: "technical_interview_not_completed",
          label: "Entrevista técnica ainda não concluída",
          tone: "block",
          action: "open_interview",
          description: "Agende e conclua a entrevista técnica antes de avançar.",
          action_payload: { interview_id: "interview-scheduled" },
        },
        {
          id: "scorecard_not_submitted",
          label: "Scorecard da entrevista pendente",
          tone: "block",
          action: "open_scorecard",
          description: "Preencha e submeta o scorecard da entrevista técnica para continuar.",
          action_payload: {
            interview_id: "interview-scheduled",
            scorecard_id: null,
            scorecard_status: null,
            interview_type: "technical",
          },
        },
      ],
    });
    vi.mocked(agendaService.listCandidateJobInterviews).mockResolvedValue({
      data: [
        {
          id: "interview-scheduled",
          candidate_id: "candidate-1",
          candidate_name: "Ana Souza",
          job_id: "job-1",
          job_title: "Analista Protheus",
          pipeline_id: "pipeline-current",
          title: "Entrevista técnica",
          description: null,
          public_notes: null,
          internal_notes: null,
          scheduled_start: "2026-05-24T10:00:00Z",
          scheduled_end: "2026-05-24T11:00:00Z",
          timezone: "America/Sao_Paulo",
          interview_type: "technical",
          interview_format: "online",
          status: "scheduled",
          location: null,
          meeting_url: null,
          interviewer_name: "Carlos",
          interviewer_email: null,
          cancel_reason: null,
          created_at: "2026-05-20T10:00:00Z",
          updated_at: "2026-05-20T10:00:00Z",
          scorecard_id: null,
          scorecard_status: null,
          scorecard_final_recommendation: null,
          scorecard_submitted_at: null,
          counts_for_current_gate: true,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=interviews&focus=scorecard"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Entrevista técnica").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Agendada")).toBeInTheDocument();
    expect(screen.getByText("A entrevista precisa ser concluída antes do scorecard.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcar como concluída/i })).toBeInTheDocument();
    expect(screen.queryByText("Nenhum scorecard criado para esta entrevista.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar scorecard/i })).not.toBeInTheDocument();
  });

  it("ações portadas não aparecem no CandidatePreviewDrawer", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos"]}>
        <Routes>
          <Route path="/candidatos" element={<CandidatesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Ana Souza");
    fireEvent.click(screen.getByText("Ana Souza").closest("tr")!);

    expect(screen.getByTestId("candidate-preview-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Transferir candidato/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reprovar candidato/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avaliações/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Explicação resumida da vaga ativa/i)).not.toBeInTheDocument();
  });

  it("aba Score e análise renderiza score e explicação da vaga ativa", async () => {
    const { container } = render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Análise da vaga ativa")).toBeInTheDocument();
    expect((await screen.findAllByText("84%")).length).toBeGreaterThan(0);
    expect(screen.getByText("Status da análise")).toBeInTheDocument();
    expect(screen.getByText("Currículo Ana")).toBeInTheDocument();
    expect(screen.getByText("Explicação resumida da vaga ativa com boa aderência técnica.")).toBeInTheDocument();
    expect(screen.getAllByText("Protheus aderente").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pouca evidência de ADVPL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skills").length).toBeGreaterThan(0);
    expect(scoreExplanationService.get).toHaveBeenCalledWith("job-1", "candidate-1");
    expect(analysisService.result).toHaveBeenCalledWith("analysis-1");

    const technicalDetails = container.querySelector("details");
    expect(technicalDetails).not.toBeNull();
    expect(technicalDetails?.hasAttribute("open")).toBe(false);
  });

  it("aba Score e análise ignora explicação de análise antiga", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      latest_analysis: {
        ...overview.latest_analysis!,
        analysis_id: "analysis-old",
        job_id: "job-old",
        resume_title: "Currículo antigo",
      },
      active_job_decision: {
        ...overview.active_job_decision!,
        current_analysis_id: "analysis-active",
      },
    });
    vi.mocked(getCandidateRankingEntry).mockResolvedValue({
      ...rankingEntry,
      source_analysis_id: "analysis-active",
    });
    vi.mocked(scoreExplanationService.get).mockResolvedValue({
      ...scoreExplanation,
      analysis_id: "analysis-old",
      ranking_summary_text: "Explicação da vaga antiga",
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Análise da vaga ativa")).toBeInTheDocument();
    await waitFor(() => expect(analysisService.result).toHaveBeenCalledWith("analysis-active"));
    expect(screen.queryByText("Explicação da vaga antiga")).not.toBeInTheDocument();
    expect(screen.queryByText("Currículo antigo")).not.toBeInTheDocument();
  });

  it("aba Score e análise mostra empty state sem análise", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      latest_analysis: null,
      active_job_decision: {
        ...overview.active_job_decision!,
        score_status: "waiting_analysis",
        analysis_status: null,
        current_analysis_id: null,
        match_score: null,
      },
    });
    vi.mocked(getCandidateRankingEntry).mockResolvedValue(null);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Análise ainda não gerada")).toBeInTheDocument();
    expect(screen.getByText(/ainda não existe análise IA canônica/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar análise agora/i })).toBeInTheDocument();
  });

  it("409 no ranking mostra ação manual e solicita análise uma única vez", async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: Awaited<ReturnType<typeof analysisService.request>>) => void = () => {};
    vi.mocked(getCandidateRankingEntry).mockRejectedValue(
      new HttpError(409, "Score ainda não disponível para este candidato nesta vaga.", "candidate_score_not_ready"),
    );
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      latest_analysis: null,
      active_job_decision: {
        ...overview.active_job_decision!,
        score_status: "waiting_analysis",
        analysis_status: null,
        current_analysis_id: null,
        match_score: null,
      },
    });
    vi.mocked(analysisService.request).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Análise ainda não gerada")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Gerar análise agora/i });
    await user.click(button);
    await user.click(button);

    expect(analysisService.request).toHaveBeenCalledTimes(1);
    expect(analysisService.request).toHaveBeenCalledWith("version-1", "job-1", { force: true });
    expect(button).toBeDisabled();

    await act(async () => {
      resolveRequest({
        analysis_id: "analysis-requested",
        status: "completed",
        created: true,
        blocked: false,
        reused: false,
        stuck: false,
        reason: "analysis_requested",
      });
    });
  });

  it("erro comum no ranking continua aparecendo como erro", async () => {
    vi.mocked(getCandidateRankingEntry).mockRejectedValue(
      new HttpError(500, "Falha inesperada no ranking"),
    );

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Não foi possível carregar o score detalhado desta vaga/i)).toBeInTheDocument();
  });

  it("aba Score e análise mostra loading quando análise está processando", async () => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_decision: {
        ...overview.active_job_decision!,
        score_status: "analysis_processing",
        analysis_status: "processing",
        current_analysis_id: "analysis-processing",
        match_score: null,
      },
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=score"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Análise em andamento.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar análise agora/i })).toBeDisabled();
    expect(scoreExplanationService.get).not.toHaveBeenCalled();
  });

  it("abre diretamente a aba de documentos quando url contém tab=documents", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=documents"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Currículo atual")).toBeInTheDocument();
    expect(screen.getByText("Visualização do currículo")).toBeInTheDocument();
  });

  it("aba Avaliações renderiza assignment concluído com respostas em accordion e resumo", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Ana Souza" })).toBeInTheDocument();
    expect(await screen.findByText("Teste comportamental")).toBeInTheDocument();
    expect(screen.getByText("Teste comportamental DISC")).toBeInTheDocument();
    expect(screen.getAllByText("Concluído").length).toBeGreaterThan(0);
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
    expect(screen.getByText("Sim")).toBeInTheDocument();
    expect(screen.getAllByText(/15\/05\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Perfil colaborativo/)).toBeInTheDocument();

    await user.click(screen.getByText("Colaboração"));

    expect(screen.getByText("Como você resolve conflitos?")).toBeInTheDocument();
    expect(screen.getByText("Converso com clareza e busco acordo.")).toBeInTheDocument();
  });

  it("aba Avaliações mostra ação de IA comportamental pendente e solicita pelo endpoint oficial", async () => {
    const user = userEvent.setup();
    vi.mocked(getBehavioralEvaluation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "evaluation-requested",
        assignment_id: "assignment-1",
        status: "pending",
        confidence: null,
        summary: null,
        strengths: null,
        concerns: null,
        competency_signals: null,
        suggested_interview_questions: null,
        risk_flags: null,
        error_message: null,
        created_at: "2026-05-15T10:35:00Z",
        updated_at: "2026-05-15T10:35:00Z",
        completed_at: null,
      });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("IA comportamental pendente")).toBeInTheDocument();
    expect(screen.getByText("O candidato concluiu o teste comportamental. Gere a análise com IA para apoiar a decisão.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Gerar análise IA comportamental/i }));

    await waitFor(() => {
      expect(triggerBehavioralAnalysis).toHaveBeenCalledWith("job-1", "candidate-1", {
        retryFailed: false,
      });
    });
    await waitFor(() => expect(candidatesService.getOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("IA comportamental na fila")).toBeInTheDocument();
  });

  it("loading da IA comportamental evita duplo clique", async () => {
    const user = userEvent.setup();
    let resolveTrigger: (value: Awaited<ReturnType<typeof triggerBehavioralAnalysis>>) => void = () => {};
    vi.mocked(getBehavioralEvaluation).mockResolvedValue(null);
    vi.mocked(triggerBehavioralAnalysis).mockReturnValue(
      new Promise((resolve) => {
        resolveTrigger = resolve;
      }),
    );

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", { name: /Gerar análise IA comportamental/i });
    await user.click(button);
    await user.click(button);

    expect(triggerBehavioralAnalysis).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      resolveTrigger({
        evaluation_id: "evaluation-requested",
        assignment_id: "assignment-1",
        status: "pending",
        message: "Avaliação enfileirada",
      });
    });
  });

  it("erro ao gerar IA comportamental mantém tela estável e permite tentar novamente", async () => {
    const user = userEvent.setup();
    vi.mocked(getBehavioralEvaluation).mockResolvedValue(null);
    vi.mocked(triggerBehavioralAnalysis).mockRejectedValue(new Error("Fila indisponível"));

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /Gerar análise IA comportamental/i }));

    expect(await screen.findByText(/Fila indisponível/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar análise IA comportamental/i })).toBeEnabled();
  });

  it("IA comportamental falhou e reprocessa com retry_failed", async () => {
    const user = userEvent.setup();
    vi.mocked(getBehavioralEvaluation).mockResolvedValue({
      id: "evaluation-failed",
      assignment_id: "assignment-1",
      status: "failed",
      confidence: null,
      summary: null,
      strengths: null,
      concerns: null,
      competency_signals: null,
      suggested_interview_questions: null,
      risk_flags: null,
      error_message: "Falha ao processar análise comportamental.",
      created_at: "2026-05-15T10:31:00Z",
      updated_at: "2026-05-15T10:32:00Z",
      completed_at: null,
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("IA comportamental falhou")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(triggerBehavioralAnalysis).toHaveBeenCalledWith("job-1", "candidate-1", {
        retryFailed: true,
      });
    });
  });

  it("?tab=assessments&focus=behavioral_ai abre Avaliações e destaca o bloco de IA comportamental", async () => {
    vi.mocked(getBehavioralEvaluation).mockResolvedValue(null);

    render(
      <MemoryRouter
        future={routerFuture}
        initialEntries={["/candidatos/candidate-1?tab=assessments&focus=behavioral_ai"]}
      >
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Lands directly on the assessments tab (existing IA pending UI rendered).
    expect(
      await screen.findByRole("button", { name: /Gerar análise IA comportamental/i }),
    ).toBeInTheDocument();

    // The IA block carries the highlight marker triggered by the focus param.
    const aiBlock = await screen.findByTestId("behavioral-ai-action-block");
    await waitFor(() => {
      expect(aiBlock).toHaveAttribute("data-highlighted", "true");
    });
  });

  it("ação contextual prioriza Avaliações quando a pendência é IA comportamental (gate)", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      preview_pendencies: [
        {
          id: "behavioral_ai_pending",
          label: "IA comportamental pendente",
          tone: "block",
          action: "open_behavioral_ai",
          description: "Aguarde a IA comportamental concluir a análise.",
        },
      ],
    });
    vi.mocked(getBehavioralEvaluation).mockResolvedValue(null);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Gate-based pendency: label from _ACTION_CODE_LABEL["open_behavioral_ai"]
    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Avaliação IA comportamental");
    await user.click(screen.getAllByRole("button", { name: /Avaliação IA comportamental/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText("IA comportamental pendente").length).toBeGreaterThan(1);
    });
    expect(screen.getByRole("button", { name: /Gerar análise IA comportamental/i })).toBeInTheDocument();
  });

  it("aba Comunicação aparece separada de Observações internas", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Ana Souza" });
    await user.click(screen.getByRole("button", { name: /Comunicação/i }));

    expect(await screen.findByText("Nenhuma comunicação registrada")).toBeInTheDocument();
    expect(communicationService.getRecruiterCommunications).toHaveBeenCalledWith("job-1", "candidate-1");
    expect(screen.queryByTestId("profile-notes-tab")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Observações$/i }));
    expect(await screen.findByTestId("profile-notes-tab")).toHaveTextContent("Observações candidate-1");
  });

  it("aba Avaliações mostra pesquisa comportamental pendente", async () => {
    vi.mocked(listJobs).mockResolvedValue({
      data: [{ ...job, requires_behavioral_assessment: false }],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
    vi.mocked(getCandidateBehavioralAssessment).mockResolvedValue({
      ...behavioralAssignment,
      template_name: "Pesquisa comportamental inicial",
      status: "pending",
      started_at: null,
      submitted_at: null,
      answered_count: 0,
    });
    vi.mocked(getBehavioralEvaluation).mockResolvedValue(null);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Pesquisa comportamental")).toBeInTheDocument();
    expect(screen.getByText("Pesquisa comportamental inicial")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente").length).toBeGreaterThan(0);
    expect(screen.getByText("Não")).toBeInTheDocument();
    expect(getBehavioralEvaluation).not.toHaveBeenCalled();
  });

  it("aba Avaliações mostra estado vazio quando não houver avaliações", async () => {
    vi.mocked(getCandidateBehavioralAssessment).mockResolvedValue(null);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=assessments"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nenhuma avaliação comportamental")).toBeInTheDocument();
  });

  it("aba Ações renderiza decisão de contratação quando existe vaga ativa", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=workflow"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Decisão de contratação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Registrar decisão$/i })).toBeInTheDocument();
    expect(screen.getAllByText("Pipeline").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Transferir candidato").length).toBeGreaterThan(1);
  });

  it("candidato em proposta mostra CTA para mover para contratado", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "offer",
          candidate_status: "Proposta",
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Mover para Contratado");
    await user.click(screen.getAllByRole("button", { name: /Mover para Contratado/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText("Pipeline").length).toBeGreaterThan(1);
    });
    await user.click(screen.getAllByRole("button", { name: /^Mover para Contratado$/i }).at(-1)!);

    await waitFor(() => {
      expect(pipelineService.moveCandidateStage).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({ stage: "hired" }),
      );
    });
  });

  it.each([
    ["hired", "Contratado / iniciar admissão", "active", false],
    ["pre_admission", "Pré-admissão", "active", false],
    ["protheus", "Integração ERP", "active", false],
    ["admitted", "Admitido", "hired", true],
  ] as const)("candidato em %s permanece vinculado à vaga no perfil", async (stage, label, relationshipStatus, isTerminal) => {
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      active_job_id: "job-1",
      active_job: { id: "job-1", title: "Analista Protheus", status: "published" },
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage,
          relationship_status: relationshipStatus,
          is_terminal: isTerminal,
          terminated_at: isTerminal ? "2026-05-25T12:00:00Z" : null,
          candidate_status: label,
        },
      ],
      preview_pendencies: [],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Analista Protheus").length).toBeGreaterThan(0);
    expect(screen.queryByText("Aguardando vaga")).not.toBeInTheDocument();
  });

  it("submeter decisão hire recarrega overview sem mover pipeline pela decisão", async () => {
    const user = userEvent.setup();
    const offerOverview: CandidateOverview = {
      ...overview,
      pipeline_entries: [
        {
          ...overview.pipeline_entries[0],
          stage: "offer",
          candidate_status: "Proposta",
        },
      ],
      preview_pendencies: [],
    };
    vi.mocked(candidatesService.getOverview)
      .mockResolvedValueOnce(offerOverview)
      .mockResolvedValue(offerOverview);
    vi.mocked(hiringDecisionService.getHiringDecision)
      .mockResolvedValueOnce({ decision: null })
      .mockResolvedValue({ decision: submittedHireDecision });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1?tab=workflow&focus=hiring_decision"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Decisão de contratação")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));
    await user.selectOptions(screen.getByLabelText(/^Decisão$/i), "hire");
    await user.selectOptions(screen.getByLabelText(/^Motivo$/i), "strong_fit");
    await user.type(screen.getByLabelText(/^Observação$/i), "Contratação aprovada por pessoa autorizada.");
    await user.click(screen.getByLabelText(/Confirmo que esta decisão/i));
    await user.click(screen.getAllByRole("button", { name: /^Registrar decisão$/i })[1]);

    await waitFor(() => {
      expect(hiringDecisionService.createHiringDecision).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({
          decision_outcome: "hire",
          submit: true,
          pipeline_action: expect.objectContaining({ enabled: false }),
        }),
      );
    });
    expect(pipelineService.moveCandidateStage).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(candidatesService.getOverview).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Nenhuma pendência.")).toBeInTheDocument();
  });

  it("ação contextual prioriza agendamento de Entrevista Técnica quando há pendência do gate", async () => {
    const user = userEvent.setup();
    vi.mocked(candidatesService.getOverview).mockResolvedValue({
      ...overview,
      preview_pendencies: [
        {
          id: "technical_interview_not_completed",
          label: "Entrevista técnica ainda não concluída",
          tone: "block",
          action: "open_interview",
          description: "Conclua a entrevista técnica antes de avançar.",
          action_payload: { interview_type: "technical" },
        },
      ],
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidatos/candidate-1"]}>
        <Routes>
          <Route path="/candidatos/:candidateId" element={<CandidateProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("candidate-profile-primary-action")).toHaveTextContent("Agendar entrevista técnica");
    await user.click(screen.getAllByRole("button", { name: /Agendar entrevista técnica/i })[0]);

    expect((await screen.findAllByText("Agendar entrevista técnica")).length).toBeGreaterThan(1);
    expect(screen.getByText("Esta entrevista é necessária para avançar o candidato.")).toBeInTheDocument();

    const select = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(select.value).toBe("technical");

    fireEvent.change(select, { target: { value: "hr" } });
    expect(await screen.findByText(/Atenção: uma entrevista de RH/i)).toBeInTheDocument();
  });
});

describe("Legacy drawer isolation", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const fullPath = join(dir, entry);
      if (fullPath.includes(`${join("src", "legacy")}${"/"}`)) return [];
      if (fullPath.includes(`${join("src", "pages", "__tests__")}${"/"}`)) return [];
      if (fullPath.includes(`${join("src", "test")}${"/"}`)) return [];
      if (statSync(fullPath).isDirectory()) return walk(fullPath);
      return /\.(ts|tsx)$/.test(fullPath) ? [fullPath] : [];
    });
  }

  it("não importa drawer antigo em telas ativas", () => {
    const srcDir = join(process.cwd(), "src");
    const legacyPath = ["legacy", "candidate-drawer"].join("/");
    const drawerImportPattern = new RegExp(`from\\s+["'][^"']*${["Candidate", "Drawer"].join("")}["']`);
    const offenders = walk(srcDir).filter((file) => {
      const content = readFileSync(file, "utf8");
      return (
        content.includes(legacyPath) ||
        drawerImportPattern.test(content)
      );
    });

    expect(offenders).toEqual([]);
  });
});
