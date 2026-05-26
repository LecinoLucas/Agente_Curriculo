export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  waiting_extraction: { label: "Aguardando extração", cls: "ui-badge-warning" },
  pending: { label: "Na fila", cls: "ui-badge-neutral" },
  processing: { label: "Processando", cls: "ui-badge-info" },
  retry_scheduled: { label: "Retry agendado", cls: "ui-badge-warning" },
  completed: { label: "Concluída", cls: "ui-badge-success" },
  failed: { label: "Falhou", cls: "ui-badge-danger" },
  cancelled: { label: "Cancelado", cls: "ui-badge-warning" },
  discarded: { label: "Descartada", cls: "ui-badge-warning" },
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
  unexpected_error: "Falha inesperada na IA comportamental.",
};

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
