import type { AnalysisResult, CandidateLatestAnalysisOverview } from "../../../types/domain";

export type CandidateAnalysisSummary = {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "danger" | "warning";
  actionLabel: string;
  inProgress: boolean;
};

export function getLatestAnalysisForActiveJob(
  latestAnalysis: CandidateLatestAnalysisOverview | null | undefined,
  activeJobId: string | null,
): CandidateLatestAnalysisOverview | null {
  if (!latestAnalysis || !activeJobId) return null;
  return latestAnalysis.job_id === activeJobId ? latestAnalysis : null;
}

export function buildCandidateAnalysisSummary({
  activeJobId,
  hasResume,
  latestAnalysis,
  analysisResult,
  pollingAnalysisId,
}: {
  activeJobId: string | null;
  hasResume: boolean;
  latestAnalysis: CandidateLatestAnalysisOverview | null | undefined;
  analysisResult: AnalysisResult | null;
  pollingAnalysisId: string | null;
}): CandidateAnalysisSummary {
  const hasActiveJob = Boolean(activeJobId);
  const activeJobAnalysis = getLatestAnalysisForActiveJob(latestAnalysis, activeJobId);
  const latestStatus = activeJobAnalysis?.status ?? null;

  if (!hasActiveJob) {
    return {
      label: "Aguardando vaga",
      detail: "Vincule o candidato a uma vaga antes de iniciar a análise.",
      tone: "neutral",
      actionLabel: "Iniciar análise",
      inProgress: false,
    };
  }

  if (!hasResume) {
    return {
      label: "Sem currículo",
      detail: "Envie ou atualize o currículo para iniciar a análise da vaga atual.",
      tone: "warning",
      actionLabel: "Iniciar análise",
      inProgress: false,
    };
  }

  if (pollingAnalysisId || latestStatus === "pending" || latestStatus === "processing") {
    return {
      label: "Em andamento",
      detail: "A análise da vaga atual está em processamento neste momento.",
      tone: "info",
      actionLabel: "Análise em andamento",
      inProgress: true,
    };
  }

  if (latestStatus === "failed" || latestStatus === "cancelled") {
    return {
      label: "Falhou",
      detail:
        activeJobAnalysis?.failure_reason?.trim() ||
        "A última análise não foi concluída. Revise o currículo e tente novamente.",
      tone: "danger",
      actionLabel: "Iniciar análise",
      inProgress: false,
    };
  }

  if (analysisResult) {
    return {
      label: "Concluída",
      detail: "A análise da vaga atual está pronta para consulta no score e no resumo.",
      tone: "success",
      actionLabel: "Reanalisar",
      inProgress: false,
    };
  }

  return {
    label: "Não iniciada",
    detail: "Inicie a análise da vaga atual para liberar score e recomendação.",
    tone: "warning",
    actionLabel: "Iniciar análise",
    inProgress: false,
  };
}
