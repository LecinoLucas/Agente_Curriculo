import type { AnalysisResult, CandidateLatestAnalysisOverview } from "../../../types/domain";

export type CandidateAnalysisSummary = {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "success" | "danger" | "warning";
  actionLabel: string;
  inProgress: boolean;
};

export type CandidateAnalysisUiStateValue =
  | "no_resume"
  | "waiting_job"
  | "ready"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed";

export type CandidateAnalysisUiState = {
  state: CandidateAnalysisUiStateValue;
  title: string;
  description: string;
  primaryAction: string;
  severity: "neutral" | "info" | "success" | "danger" | "warning";
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
  jobFitScore,
  pollingAnalysisId,
}: {
  activeJobId: string | null;
  hasResume: boolean;
  latestAnalysis: CandidateLatestAnalysisOverview | null | undefined;
  analysisResult: AnalysisResult | null;
  jobFitScore?: number | null;
  pollingAnalysisId: string | null;
}): CandidateAnalysisSummary {
  const activeJobAnalysis = getLatestAnalysisForActiveJob(latestAnalysis, activeJobId);
  const uiState = getCandidateAnalysisUiState({
    hasResume,
    activeJobId,
    analysisStatus: activeJobAnalysis?.status ?? null,
    jobFitScore: jobFitScore ?? null,
    aiStatus: activeJobAnalysis?.status ?? null,
    errorMessage: activeJobAnalysis?.failure_reason ?? null,
    pollingAnalysisId,
  });

  return {
    label: uiState.title,
    detail: uiState.description,
    tone: uiState.severity,
    actionLabel: uiState.primaryAction,
    inProgress: uiState.inProgress,
  };
}

export function getCandidateAnalysisUiState({
  hasResume,
  activeJobId,
  analysisStatus,
  jobFitScore,
  aiStatus,
  errorMessage,
  pollingAnalysisId = null,
}: {
  hasResume: boolean;
  activeJobId: string | null;
  analysisStatus: CandidateLatestAnalysisOverview["status"] | null | undefined;
  jobFitScore: number | null | undefined;
  aiStatus: string | null | undefined;
  errorMessage?: string | null;
  pollingAnalysisId?: string | null;
}): CandidateAnalysisUiState {
  if (!hasResume) {
    return {
      state: "no_resume",
      title: "Sem currículo",
      description: "Adicione um currículo para iniciar a análise.",
      primaryAction: "Adicionar currículo",
      severity: "warning",
      inProgress: false,
    };
  }

  if (!activeJobId) {
    return {
      state: "waiting_job",
      title: "Aguardando vaga",
      description: "Vincule o candidato a uma vaga para calcular aderência.",
      primaryAction: "Vincular vaga",
      severity: "neutral",
      inProgress: false,
    };
  }

  const normalizedStatus = analysisStatus ?? aiStatus ?? null;
  const hasScore = jobFitScore !== null && jobFitScore !== undefined;

  if (hasScore || normalizedStatus === "completed") {
    if (!hasScore) {
      return {
        state: "processing",
        title: "Atualizando aderência",
        description: "Currículo analisado. Finalizando o cálculo da aderência da vaga.",
        primaryAction: "Acompanhar análise",
        severity: "info",
        inProgress: true,
      };
    }

    return {
      state: "completed",
      title: "Aderência pronta",
      description: "A análise da vaga atual está pronta para consulta.",
      primaryAction: "Ver score completo",
      severity: "success",
      inProgress: false,
    };
  }

  if (normalizedStatus === "retry_scheduled") {
    return {
      state: "retry_scheduled",
      title: "Limite temporário da IA",
      description: "O provedor IA limitou a requisição. Nova tentativa automática já foi agendada.",
      primaryAction: "Acompanhar análise",
      severity: "warning",
      inProgress: true,
    };
  }

  if (
    pollingAnalysisId ||
    normalizedStatus === "pending" ||
    normalizedStatus === "processing"
  ) {
    return {
      state: "processing",
      title: "Analisando com IA",
      description: "Analisando currículo com IA...",
      primaryAction: "Acompanhar análise",
      severity: "info",
      inProgress: true,
    };
  }

  if (normalizedStatus === "failed" || normalizedStatus === "cancelled") {
    return {
      state: "failed",
      title: "Falha na análise",
      description:
        errorMessage?.trim() ||
        "Não foi possível concluir a análise.",
      primaryAction: "Tentar novamente",
      severity: "danger",
      inProgress: false,
    };
  }

  return {
    state: "ready",
    title: "Currículo recebido",
    description: "Currículo recebido. Inicie a análise para calcular a aderência desta vaga.",
    primaryAction: "Iniciar análise",
    severity: "info",
    inProgress: false,
  };
}
