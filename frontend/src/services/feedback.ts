import { toast } from "./toast";
import { formatContextError } from "./errorMessages";

const FEEDBACK_KEY = {
  createCandidate: "feedback-create-candidate",
  uploadResume: "feedback-upload-resume",
  requestAnalysis: "feedback-request-analysis",
  reprocessAnalysis: "feedback-reprocess-analysis",
  moveCandidate: "feedback-move-candidate",
} as const;

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
    error: (error?: unknown) =>
      toast.error(
        formatContextError(
          error,
          "A análise não pôde ser iniciada agora.",
          "Tente novamente em alguns instantes.",
        ),
        { key: FEEDBACK_KEY.requestAnalysis },
      ),
  },
  reprocessAnalysis: {
    processing: () =>
      toast.loading("Reprocessando análise...", { key: FEEDBACK_KEY.reprocessAnalysis }),
    success: () =>
      toast.success("Análise iniciada", { key: FEEDBACK_KEY.reprocessAnalysis }),
    error: (error?: unknown) =>
      toast.error(
        formatContextError(
          error,
          "A análise não pôde ser reprocessada agora.",
          "Tente novamente em alguns instantes.",
        ),
        { key: FEEDBACK_KEY.reprocessAnalysis },
      ),
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
