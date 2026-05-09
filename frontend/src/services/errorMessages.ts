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

function sanitizeDetail(message: string): string | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.startsWith("Erro inesperado (HTTP ")) return null;
  if (GENERIC_MESSAGES.has(normalized)) return null;
  if (/traceback|exception:|stack|^\s*<!doctype html|^\s*<html/i.test(normalized)) return null;
  if (/\sat\s.+:\d+:\d+/.test(normalized)) return null;
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function extractDetail(error: unknown): string | null {
  if (error instanceof HttpError) {
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
