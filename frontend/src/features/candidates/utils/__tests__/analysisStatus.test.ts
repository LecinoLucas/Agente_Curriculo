import { describe, expect, it } from "vitest";

import { buildCandidateAnalysisSummary } from "../analysisStatus";

describe("buildCandidateAnalysisSummary", () => {
  it("retorna Em andamento quando existe análise pendente para a vaga ativa", () => {
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

    expect(summary.label).toBe("Em andamento");
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

    expect(summary.label).toBe("Falhou");
    expect(summary.detail).toContain("Timeout no provedor");
  });
});
