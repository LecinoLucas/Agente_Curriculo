import type { PipelineAnalysisDecision } from "../../types/domain";

type AnalysisDecisionToast = {
  tone: "success" | "info" | "warning" | "error";
  message: string;
};

export function buildAnalysisDecisionToast(
  decision: PipelineAnalysisDecision | null | undefined,
): AnalysisDecisionToast | null {
  if (!decision) return null;

  if (decision.reason === "analysis_enqueue_failed") {
    return {
      tone: "error",
      message: "A entrevista/vaga foi atualizada, mas a análise IA falhou ao iniciar.",
    };
  }

  if (decision.stuck) {
    return {
      tone: "warning",
      message: "A análise IA está demorando mais que o esperado. Verifique o worker ou tente reprocessar.",
    };
  }

  if (decision.created) {
    return {
      tone: "success",
      message: "Nova análise IA iniciada para a vaga atual.",
    };
  }

  if (decision.reused) {
    return {
      tone: "info",
      message: "Já existe uma análise IA em andamento para este candidato e vaga.",
    };
  }

  if (decision.blocked) {
    return {
      tone: "warning",
      message:
        "Análise IA automática não foi iniciada porque o candidato já está em etapa avançada. Use \"Reanalisar\" se necessário.",
    };
  }

  if (decision.reason === "analysis_skipped_no_resume") {
    return {
      tone: "info",
      message: "Sem currículo disponível para iniciar a análise automática desta vaga.",
    };
  }

  return null;
}

export function shouldTrackAnalysisDecision(
  decision: PipelineAnalysisDecision | null | undefined,
): boolean {
  if (!decision?.analysis_id || !decision.status) return false;
  return decision.status === "pending" || decision.status === "processing" || decision.status === "retry_scheduled";
}
