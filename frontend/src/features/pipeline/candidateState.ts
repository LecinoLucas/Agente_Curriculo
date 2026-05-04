import type { AIAnalysisStatus, PipelineStage } from "../../types/domain";

export type CandidateStateKey =
  | "no_resume"
  | "waiting_analysis"
  | "waiting_job"
  | "in_analysis"
  | "analysis_completed"
  | "ready_for_decision"
  | "moved_in_pipeline"
  | "finalized";

export type CandidateState = {
  key: CandidateStateKey;
  label: string;
  tone: "neutral" | "warning" | "success";
};

export type CandidateNextAction = {
  label: string;
  suggestion: string;
};

type CandidateStateInput = {
  resume_count: number;
  ai_status: AIAnalysisStatus | null;
  pipeline: { stage: PipelineStage | null } | null;
  ranking_available: boolean;
};

const CANDIDATE_STATES: Record<CandidateStateKey, CandidateState> = {
  no_resume: {
    key: "no_resume",
    label: "Aguardando currículo",
    tone: "warning",
  },
  waiting_analysis: {
    key: "waiting_analysis",
    label: "Aguardando análise",
    tone: "warning",
  },
  waiting_job: {
    key: "waiting_job",
    label: "Aguardando vaga",
    tone: "warning",
  },
  in_analysis: {
    key: "in_analysis",
    label: "Em análise",
    tone: "neutral",
  },
  analysis_completed: {
    key: "analysis_completed",
    label: "Análise concluída",
    tone: "success",
  },
  ready_for_decision: {
    key: "ready_for_decision",
    label: "Pronto para decisão",
    tone: "success",
  },
  moved_in_pipeline: {
    key: "moved_in_pipeline",
    label: "Movido no pipeline",
    tone: "neutral",
  },
  finalized: {
    key: "finalized",
    label: "Finalizado",
    tone: "success",
  },
};

function hasMovedBeyondEntry(stage: PipelineStage | null | undefined): boolean {
  return Boolean(stage && stage !== "entry" && stage !== "hired" && stage !== "rejected");
}

function isFinalStage(stage: PipelineStage | null | undefined): boolean {
  return stage === "hired" || stage === "rejected";
}

export function getCandidateState(candidate: CandidateStateInput): CandidateState {
  const resumeCount = Math.max(0, candidate.resume_count || 0);
  const analysisStatus = candidate.ai_status;
  const pipelineStage = candidate.pipeline?.stage ?? null;
  const rankingAvailable = candidate.ranking_available;

  if (isFinalStage(pipelineStage)) return CANDIDATE_STATES.finalized;
  if (analysisStatus === "pending" || analysisStatus === "processing") {
    return CANDIDATE_STATES.in_analysis;
  }
  if (resumeCount === 0) return CANDIDATE_STATES.no_resume;
  if (pipelineStage == null) return CANDIDATE_STATES.waiting_job;
  if (analysisStatus == null || analysisStatus === "failed" || analysisStatus === "cancelled") {
    return CANDIDATE_STATES.waiting_analysis;
  }
  if (rankingAvailable) return CANDIDATE_STATES.ready_for_decision;
  if (hasMovedBeyondEntry(pipelineStage)) return CANDIDATE_STATES.moved_in_pipeline;
  if (analysisStatus === "completed") return CANDIDATE_STATES.analysis_completed;
  return CANDIDATE_STATES.waiting_analysis;
}

export function getNextAction(candidateState: CandidateState): CandidateNextAction {
  switch (candidateState.key) {
    case "no_resume":
      return {
        label: "Ação: Enviar currículo",
        suggestion: "Sugestão: Enviar currículo",
      };
    case "waiting_analysis":
      return {
        label: "Ação: Iniciar análise da IA",
        suggestion: "Sugestão: Iniciar análise da IA",
      };
    case "waiting_job":
      return {
        label: "Ação: Adicionar a uma vaga",
        suggestion: "Sugestão: Adicionar a uma vaga",
      };
    case "in_analysis":
      return {
        label: "Ação: Aguardar processamento",
        suggestion: "Sugestão: Aguardar processamento",
      };
    case "analysis_completed":
      return {
        label: "Ação: Avaliar candidato",
        suggestion: "Sugestão: Avaliar candidato",
      };
    case "ready_for_decision":
      return {
        label: "Ação: Tomar decisão (mover etapa)",
        suggestion: "Sugestão: Avaliar e mover etapa",
      };
    case "moved_in_pipeline":
      return {
        label: "Ação: Acompanhar processo",
        suggestion: "Sugestão: Acompanhar processo",
      };
    case "finalized":
      return {
        label: "Ação: Nenhuma ação necessária",
        suggestion: "Sugestão: Nenhuma ação necessária",
      };
  }
}
