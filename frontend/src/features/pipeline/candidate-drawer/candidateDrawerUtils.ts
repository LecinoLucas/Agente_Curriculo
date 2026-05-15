import type { PipelineStage } from "../../../types/domain";
import type { CandidateActionFeedback } from "../../candidates/drawer/v2";

export function isAnalysisInProgress(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

export const STAGE_LABEL: Record<PipelineStage, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

export const NEXT_PIPELINE_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  entry: "screening",
  screening: "hr_interview",
  hr_interview: "technical_interview",
  technical_interview: "final",
  final: "hired",
  offer: "hired",
};

export function buildStageActionFeedback(
  stage: PipelineStage,
  phase: "pending" | "success" | "error",
): Omit<CandidateActionFeedback, "id"> {
  const label = STAGE_LABEL[stage] ?? stage;

  if (phase === "pending") {
    return {
      tone: "info",
      pending: true,
      title:
        stage === "hired"
          ? "Aplicando aprovação"
          : stage === "rejected"
            ? "Encerrando candidatura"
            : `Movendo para ${label}`,
      detail:
        stage === "hired"
          ? "O candidato está sendo movido para Contratado."
          : stage === "rejected"
            ? "A candidatura está sendo encerrada."
            : "O novo estado está sendo aplicado no workspace.",
    };
  }

  if (phase === "error") {
    return {
      tone: "danger",
      title: "Ação não aplicada",
      detail: `Não foi possível mover o candidato para ${label}.`,
    };
  }

  return {
    tone: stage === "rejected" ? "danger" : "success",
    title:
      stage === "hired"
        ? "Candidato aprovado"
        : stage === "rejected"
          ? "Candidatura encerrada"
          : `Candidato movido para ${label}`,
    detail:
      stage === "hired"
        ? "O estado atual foi atualizado para Contratado."
        : stage === "rejected"
          ? "A candidatura foi encerrada para esta vaga."
          : "A etapa atual já foi sincronizada no workspace.",
  };
}
