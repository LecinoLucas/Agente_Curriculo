import { AlertCircle, Inbox, Mail, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { communicationService } from "../../../../services/communicationService";
import type { CandidateCommunication, CommunicationStatus } from "../../../../types/domain";

interface CandidateCommunicationsPanelProps {
  jobId: string | null;
  candidateId: string | null;
}

const STATUS_LABELS: Record<CommunicationStatus, string> = {
  draft: "Rascunho",
  queued: "Na fila",
  sent: "Enviada",
  failed: "Falhou",
  read: "Lida",
  cancelled: "Cancelada",
};

function formatDateTime(value: string | null): string {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: CommunicationStatus): string {
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "read") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "sent") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";
}

export function CandidateCommunicationsPanel({
  jobId,
  candidateId,
}: CandidateCommunicationsPanelProps) {
  const [communications, setCommunications] = useState<CandidateCommunication[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCommunications = useCallback(async () => {
    if (!jobId || !candidateId) {
      setCommunications([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await communicationService.getRecruiterCommunications(jobId, candidateId);
      setCommunications(payload.communications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar comunicações.");
    } finally {
      setLoading(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    void loadCommunications();
  }, [loadCommunications]);

  const handleRetry = async (communicationId: string) => {
    setRetryingId(communicationId);
    setError(null);
    try {
      await communicationService.retryCommunication(communicationId);
      await loadCommunications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reenviar a comunicação.");
    } finally {
      setRetryingId(null);
    }
  };

  if (!jobId || !candidateId) {
    return (
      <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-sm text-[hsl(var(--text-muted))]">
        Vincule o candidato a uma vaga para consultar comunicações.
      </div>
    );
  }

  return (
    <section aria-label="Comunicações do candidato" className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[hsl(var(--text))]">Comunicações</h3>
        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
          Histórico operacional de mensagens e tentativas de entrega.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[hsl(var(--border))] p-5 text-sm text-[hsl(var(--text-muted))]">
          Carregando comunicações...
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && !error && communications.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-sm text-[hsl(var(--text-muted))]">
          <Inbox className="h-5 w-5" />
          Nenhuma comunicação registrada.
        </div>
      ) : null}

      {!loading && communications.length > 0 ? (
        <ol className="space-y-3">
          {communications.map((communication) => (
            <li
              key={communication.id}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail className="h-4 w-4 text-[hsl(var(--primary))]" />
                    <p className="font-semibold text-[hsl(var(--text))]">
                      {communication.subject || communication.template_key || "Comunicação"}
                    </p>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        statusClass(communication.status),
                      ].join(" ")}
                    >
                      {STATUS_LABELS[communication.status] ?? communication.status}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[hsl(var(--text-muted))]">
                    {communication.body}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-[hsl(var(--text-muted))]">
                    <span>{formatDateTime(communication.created_at)}</span>
                    <span>Canal: {communication.channel}</span>
                    <span>Público: {communication.audience}</span>
                  </div>
                  {communication.error_message ? (
                    <p className="text-xs font-medium text-rose-700">
                      {communication.error_message}
                    </p>
                  ) : null}
                </div>

                {communication.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void handleRetry(communication.id)}
                    disabled={retryingId === communication.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={[
                        "h-3.5 w-3.5",
                        retryingId === communication.id ? "animate-spin" : "",
                      ].join(" ")}
                    />
                    Reenviar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
