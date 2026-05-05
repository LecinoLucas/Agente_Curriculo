import { toast } from "../shared/utils/toast";
import { formatContextError } from "./errorMessages";
import { HttpError } from "./http";

const FEEDBACK_KEY = {
  createCandidate: "feedback-create-candidate",
  uploadResume: "feedback-upload-resume",
  requestAnalysis: "feedback-request-analysis",
  reprocessAnalysis: "feedback-reprocess-analysis",
  moveCandidate: "feedback-move-candidate",
} as const;

function formatRetryAfter(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (remaining === 0) return `${minutes}min`;
  return `${minutes}min ${remaining}s`;
}

function buildAiRateLimitMessage(error?: unknown): string | null {
  if (!(error instanceof HttpError) || error.status !== 429) {
    return null;
  }

  const lines = [
    "🚫 Limite de uso da IA atingido",
    "Aguarde alguns minutos ou troque a chave da API.",
  ];

  if (typeof error.retryAfterSeconds === "number" && Number.isFinite(error.retryAfterSeconds)) {
    lines.push(`Tempo estimado para nova tentativa: ${formatRetryAfter(error.retryAfterSeconds)}.`);
  }

  return lines.join(" ");
}

export const feedback = {
  createCandidate: {
    processing: () =>
      toast.loading("Criando candidato...", { key: FEEDBACK_KEY.createCandidate }),
    success: (message = "Candidato criado com sucesso") =>
      toast.success(message, { key: FEEDBACK_KEY.createCandidate }),
    error: (error?: unknown) =>
      toast.error(
        formatContextError(
          error,
          "Não foi possível criar o candidato.",
          "Revise os dados e tente novamente.",
        ),
        { key: FEEDBACK_KEY.createCandidate },
      ),
  },
  uploadResume: {
    processing: () =>
      toast.loading("Enviando currículo...", { key: FEEDBACK_KEY.uploadResume }),
    success: () =>
      toast.success("Currículo enviado com sucesso", { key: FEEDBACK_KEY.uploadResume }),
    error: (error?: unknown) =>
      toast.error(
        formatContextError(
          error,
          "Não foi possível enviar o currículo.",
          "Verifique o arquivo e tente novamente.",
        ),
        { key: FEEDBACK_KEY.uploadResume },
      ),
  },
  requestAnalysis: {
    processing: () =>
      toast.loading("Iniciando análise...", { key: FEEDBACK_KEY.requestAnalysis }),
    success: () =>
      toast.success("Análise iniciada", { key: FEEDBACK_KEY.requestAnalysis }),
    error: (error?: unknown) => {
      const rateLimitMessage = buildAiRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage, { key: FEEDBACK_KEY.requestAnalysis });
        return;
      }
      toast.error(
        formatContextError(
          error,
          "A análise não pôde ser iniciada agora.",
          "Tente novamente em alguns instantes.",
        ),
        { key: FEEDBACK_KEY.requestAnalysis },
      );
    },
  },
  reprocessAnalysis: {
    processing: () =>
      toast.loading("Reprocessando análise...", { key: FEEDBACK_KEY.reprocessAnalysis }),
    success: () =>
      toast.success("Análise iniciada", { key: FEEDBACK_KEY.reprocessAnalysis }),
    error: (error?: unknown) => {
      const rateLimitMessage = buildAiRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage, { key: FEEDBACK_KEY.reprocessAnalysis });
        return;
      }
      toast.error(
        formatContextError(
          error,
          "A análise não pôde ser reprocessada agora.",
          "Tente novamente em alguns instantes.",
        ),
        { key: FEEDBACK_KEY.reprocessAnalysis },
      );
    },
  },
  moveCandidate: {
    processing: () =>
      toast.loading("Movendo candidato no pipeline...", { key: FEEDBACK_KEY.moveCandidate }),
    success: () =>
      toast.success("Candidato movido no pipeline", { key: FEEDBACK_KEY.moveCandidate }),
    error: (error?: unknown) =>
      toast.error(
        formatContextError(
          error,
          "Não foi possível mover o candidato no pipeline.",
          "Tente novamente.",
        ),
        { key: FEEDBACK_KEY.moveCandidate },
      ),
  },
};
