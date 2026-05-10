import type { AnalysisResult, CandidateLatestAnalysisOverview } from "../../../types/domain";

export type CandidateAnalysisSummary = {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "danger" | "warning";
  actionLabel: string;
  inProgress: boolean;
};

function matchesActiveJob(
  latestAnalysis: CandidateLatestAnalysisOverview | null | undefined,
  activeJobId: string | null,
): boolean {
  if (!latestAnalysis || !activeJobId) return false;
  return latestAnalysis.job_id === activeJobId;
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
  const latestForActiveJob = matchesActiveJob(latestAnalysis, activeJobId);
  const latestStatus = latestForActiveJob ? latestAnalysis?.status ?? null : null;

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
        latestAnalysis?.failure_reason?.trim() ||
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
