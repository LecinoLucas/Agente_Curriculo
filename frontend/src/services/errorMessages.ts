import { HttpError } from "./http";

const GENERIC_MESSAGES = new Set([
  "Requisição inválida",
  "Não autorizado",
  "Sem permissão para esta operação",
  "Recurso não encontrado",
  "Conflito: registro já existe ou em uso",
  "Dados inválidos — verifique os campos preenchidos",
  "Muitas requisições. Aguarde um momento",
  "Erro interno do servidor",
  "Serviço temporariamente indisponível",
  "Tempo de resposta do servidor esgotado",
]);

const SAFE_OPERATIONAL_MESSAGES: Record<string, string> = {
  no_ai_credential_available: "Credencial IA indisponível para este provider/modelo.",
  ai_credential_invalid: "Credencial IA inválida ou indisponível.",
  ai_rate_limited: "Rate limit temporário do provedor IA.",
  enqueue_failed: "Falha ao enfileirar a avaliação comportamental.",
  behavioral_answers_missing: "O teste comportamental não possui respostas suficientes para análise IA.",
  evaluation_already_processing: "A IA comportamental já está em andamento.",
  provider_response_invalid: "O provedor IA retornou uma resposta inválida.",
  provider_timeout: "Tempo limite ao chamar o provedor IA.",
  retry_not_allowed: "Retry não permitido para o estado atual.",
  unexpected_error: "Erro inesperado ao solicitar IA comportamental.",
};

function sanitizeDetail(message: string): string | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized === "Evaluation failed") return null;
  if (normalized.startsWith("Erro inesperado (HTTP ")) return null;
  if (GENERIC_MESSAGES.has(normalized)) return null;
  if (/traceback|exception:|stack|^\s*<!doctype html|^\s*<html/i.test(normalized)) return null;
  if (/\sat\s.+:\d+:\d+/.test(normalized)) return null;
  if (/api[_-]?key|encrypted_api_key|authorization|bearer\s+[a-z0-9._-]+|prompt bruto|raw response/i.test(normalized)) {
    return null;
  }
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function extractDetail(error: unknown): string | null {
  if (error instanceof HttpError) {
    if (error.code && SAFE_OPERATIONAL_MESSAGES[error.code]) {
      return SAFE_OPERATIONAL_MESSAGES[error.code];
    }
    return sanitizeDetail(error.message);
  }
  if (error instanceof Error) {
    return sanitizeDetail(error.message);
  }
  return null;
}

export function formatContextError(
  error: unknown,
  defaultMessage: string,
  nextStep?: string,
): string {
  const detail = extractDetail(error);
  const base = nextStep ? `${defaultMessage} ${nextStep}` : defaultMessage;
  if (!detail) return base;
  if (detail.endsWith(".") || detail.endsWith("!") || detail.endsWith("?")) {
    return `${base} Detalhe: ${detail}`;
  }
  return `${base} Detalhe: ${detail}.`;
}
