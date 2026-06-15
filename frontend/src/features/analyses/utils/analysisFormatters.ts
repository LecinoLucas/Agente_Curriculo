export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  waiting_extraction: { label: "Aguardando extração", cls: "bg-warning-soft text-warning px-2 py-0.5 rounded-full text-xs font-medium" },
  pending: { label: "Na fila", cls: "bg-surface-muted text-text-muted border border-border px-2 py-0.5 rounded-full text-xs font-medium" },
  processing: { label: "Processando", cls: "bg-info-soft text-info px-2 py-0.5 rounded-full text-xs font-medium" },
  retry_scheduled: { label: "Retry agendado", cls: "bg-warning-soft text-warning px-2 py-0.5 rounded-full text-xs font-medium" },
  completed: { label: "Concluída", cls: "bg-success-soft text-success px-2 py-0.5 rounded-full text-xs font-medium" },
  failed: { label: "Falhou", cls: "bg-danger-soft text-danger px-2 py-0.5 rounded-full text-xs font-medium" },
  cancelled: { label: "Cancelado", cls: "bg-warning-soft text-warning px-2 py-0.5 rounded-full text-xs font-medium" },
  discarded: { label: "Descartada", cls: "bg-warning-soft text-warning px-2 py-0.5 rounded-full text-xs font-medium" },
};

const SAFE_FAILURE_BY_TYPE: Record<string, string> = {
  no_ai_credential_available: "Credencial IA indisponível.",
  ai_credential_invalid: "Credencial IA inválida ou indisponível.",
  rate_limited: "Rate limit temporário do provedor IA.",
  ai_rate_limited: "Rate limit temporário do provedor IA.",
  enqueue_failed: "Falha ao enfileirar avaliação.",
  behavioral_answers_missing: "Respostas comportamentais ausentes.",
  provider_response_invalid: "Resposta inválida do provedor IA.",
  provider_timeout: "Tempo limite no provedor IA.",
  connection_error: "Falha temporária de conexão com o provedor IA.",
  provider_unavailable: "Provedor IA temporariamente indisponível.",
  provider_http_error: "Falha temporária no provedor IA.",
  unexpected_error: "Falha inesperada.",
};

export function isExtractionFailure(
  providerErrorType: string | null,
  failureReason: string | null,
): boolean {
  if (providerErrorType === "extraction_failed" || providerErrorType === "ocr_failed") {
    return true;
  }
  if (!failureReason) return false;
  return /(extract|extraction|extraç|ocr|currículo.*ileg|arquivo.*ileg|pdf inválido)/i.test(failureReason);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function formatSafeFailureReason(
  providerErrorType: string | null,
  failureReason: string | null,
): string | null {
  if (isExtractionFailure(providerErrorType, failureReason)) {
    return "Não foi possível extrair o texto do currículo. Verifique se o arquivo está legível ou envie um novo currículo.";
  }
  if (providerErrorType && SAFE_FAILURE_BY_TYPE[providerErrorType]) {
    return SAFE_FAILURE_BY_TYPE[providerErrorType];
  }
  if (!failureReason) return null;
  const normalized = failureReason.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/api[_-]?key|encrypted_api_key|authorization|bearer\s+[a-z0-9._-]+|traceback|stack|prompt/i.test(normalized)) {
    return "Erro operacional seguro disponível apenas nos logs.";
  }
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}
