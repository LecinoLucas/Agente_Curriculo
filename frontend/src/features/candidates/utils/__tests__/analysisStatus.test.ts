import { describe, expect, it } from "vitest";

import {
  buildCandidateAnalysisSummary,
  getCandidateAnalysisUiState,
  getLatestAnalysisForActiveJob,
  mapScoreStatusToUiState,
} from "../analysisStatus";

describe("buildCandidateAnalysisSummary", () => {
  it("ignora latest_analysis que não pertence à vaga ativa", () => {
    const activeAnalysis = getLatestAnalysisForActiveJob(
      {
        analysis_id: "analysis-1",
        job_id: "job-2",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
        status: "processing",
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
      "job-1",
    );

    expect(activeAnalysis).toBeNull();
  });

  it("retorna estado operacional de processamento quando existe análise pendente para a vaga ativa", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
        status: "processing",
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
      analysisResult: null,
      pollingAnalysisId: "analysis-1",
    });

    expect(summary.label).toBe("Analisando com IA");
    expect(summary.inProgress).toBe(true);
  });

  it("retorna Falhou quando a última análise da vaga ativa falhou", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
        status: "failed",
        started_at: null,
        completed_at: null,
        failed_at: null,
        failure_reason: "Timeout no provedor",
        used_real_ai: true,
        task_id: null,
        worker_id: null,
        seniority_level: null,
        total_experience_years: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      analysisResult: null,
      pollingAnalysisId: null,
    });

    expect(summary.label).toBe("Falha na análise");
    expect(summary.detail).toContain("Timeout no provedor");
  });

  it("mantém estado de processamento quando a análise foi reagendada por indisponibilidade temporária", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
        status: "retry_scheduled",
        started_at: null,
        completed_at: null,
        failed_at: null,
        failure_reason: "Alta demanda no provedor IA. Tentando novamente automaticamente.",
        used_real_ai: true,
        task_id: null,
        worker_id: null,
        seniority_level: null,
        total_experience_years: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      analysisResult: null,
      pollingAnalysisId: null,
    });

    expect(summary.label).toBe("Limite temporário da IA");
    expect(summary.inProgress).toBe(true);
    expect(summary.detail).toContain("Nova tentativa automática");
  });

  it("não marca em andamento quando a análise pendente é de outra vaga", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-2",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
        status: "processing",
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
      analysisResult: null,
      pollingAnalysisId: null,
    });

    expect(summary.label).toBe("Currículo recebido");
  });
});

describe("getCandidateAnalysisUiState", () => {
  it("retorna no_resume quando o candidato não possui currículo", () => {
    const state = getCandidateAnalysisUiState({
      hasResume: false,
      activeJobId: "job-1",
      analysisStatus: null,
      jobFitScore: null,
      aiStatus: null,
    });

    expect(state.state).toBe("no_resume");
    expect(state.description).toContain("Adicione um currículo");
  });

  it("retorna waiting_job quando existe currículo mas ainda não há vaga ativa", () => {
    const state = getCandidateAnalysisUiState({
      hasResume: true,
      activeJobId: null,
      analysisStatus: null,
      jobFitScore: null,
      aiStatus: null,
    });

    expect(state.state).toBe("waiting_job");
    expect(state.description).toContain("Vincule o candidato");
  });

  it("retorna completed quando já existe aderência persistida", () => {
    const state = getCandidateAnalysisUiState({
      hasResume: true,
      activeJobId: "job-1",
      analysisStatus: "completed",
      jobFitScore: 72,
      aiStatus: "completed",
    });

    expect(state.state).toBe("completed");
    expect(state.title).toBe("Aderência pronta");
  });

  it("retorna failed quando a análise falhou", () => {
    const state = getCandidateAnalysisUiState({
      hasResume: true,
      activeJobId: "job-1",
      analysisStatus: "failed",
      jobFitScore: null,
      aiStatus: "failed",
      errorMessage: "Timeout no provedor",
    });

    expect(state.state).toBe("failed");
    expect(state.description).toContain("Timeout no provedor");
  });
});

describe("mapScoreStatusToUiState", () => {
  it("mapeia score_ready para estado completed com success", () => {
    const state = mapScoreStatusToUiState("score_ready");

    expect(state.state).toBe("completed");
    expect(state.title).toBe("Aderência calculada");
    expect(state.severity).toBe("success");
    expect(state.inProgress).toBe(false);
  });

  it("mapeia score_stale para estado completed com warning", () => {
    const state = mapScoreStatusToUiState("score_stale");

    expect(state.state).toBe("completed");
    expect(state.title).toBe("Aderência desatualizada");
    expect(state.severity).toBe("warning");
    expect(state.inProgress).toBe(false);
  });

  it("mapeia waiting_analysis para estado ready", () => {
    const state = mapScoreStatusToUiState("waiting_analysis");

    expect(state.state).toBe("ready");
    expect(state.title).toBe("Aguardando análise");
    expect(state.severity).toBe("info");
  });

  it("mapeia analysis_processing para estado processing com in_progress", () => {
    const state = mapScoreStatusToUiState("analysis_processing");

    expect(state.state).toBe("processing");
    expect(state.title).toBe("Análise em andamento");
    expect(state.inProgress).toBe(true);
  });

  it("mapeia analysis_failed para estado failed", () => {
    const state = mapScoreStatusToUiState("analysis_failed");

    expect(state.state).toBe("failed");
    expect(state.title).toBe("Falha na análise");
    expect(state.severity).toBe("danger");
  });

  it("mapeia needs_repair para estado failed com severity danger", () => {
    const state = mapScoreStatusToUiState("needs_repair");

    expect(state.state).toBe("failed");
    expect(state.title).toBe("Inconsistência detectada");
    expect(state.severity).toBe("danger");
  });

  it("mapeia no_active_job para estado waiting_job", () => {
    const state = mapScoreStatusToUiState("no_active_job");

    expect(state.state).toBe("waiting_job");
    expect(state.title).toBe("Nenhuma vaga ativa");
  });
});

describe("buildCandidateAnalysisSummary com scoreStatus", () => {
  it("usa scoreStatus quando disponível ao invés de heurística", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: null,
      analysisResult: null,
      pollingAnalysisId: null,
      scoreStatus: "score_ready",
    });

    expect(summary.label).toBe("Aderência calculada");
    expect(summary.tone).toBe("success");
  });

  it("retorna para heurística quando scoreStatus é null", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
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
      analysisResult: null,
      jobFitScore: 0.85,
      pollingAnalysisId: null,
      scoreStatus: null,
    });

    expect(summary.label).toBe("Aderência pronta");
  });

  it("prioriza scoreStatus score_stale sobre heurística com score disponível", () => {
    const summary = buildCandidateAnalysisSummary({
      activeJobId: "job-1",
      hasResume: true,
      latestAnalysis: {
        analysis_id: "analysis-1",
        job_id: "job-1",
        resume_id: "resume-1",
        resume_title: "Currículo principal",
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
      analysisResult: null,
      jobFitScore: 0.85,
      pollingAnalysisId: null,
      scoreStatus: "score_stale",
    });

    expect(summary.label).toBe("Aderência desatualizada");
    expect(summary.tone).toBe("warning");
  });
});
