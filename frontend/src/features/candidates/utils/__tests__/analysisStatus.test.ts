import { describe, expect, it } from "vitest";

import {
  buildCandidateAnalysisSummary,
  getCandidateAnalysisUiState,
  getLatestAnalysisForActiveJob,
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

    expect(summary.label).toBe("Analisando com IA");
    expect(summary.inProgress).toBe(true);
    expect(summary.detail).toBe("Alta demanda no provedor IA. Tentando novamente automaticamente.");
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
