import {
  AlertCircle,
  Briefcase,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  Mail,
  RefreshCw,
  Shield,
  User,
  UserCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { communicationService } from "../../../../services/communicationService";
import type { CandidateCommunication, CommunicationStatus } from "../../../../types/domain";

interface CandidateCommunicationsPanelProps {
  jobId: string | null;
  candidateId: string | null;
}

const STATUS_CONFIG: Record<
  CommunicationStatus,
  { label: string; bgClass: string; icon?: React.ReactNode }
> = {
  draft: {
    label: "Rascunho",
    bgClass: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400",
    icon: <Clock className="h-3 w-3" />,
  },
  queued: {
    label: "Na fila",
    bgClass: "border-amber-200 bg-amber-50 text-amber-700 animate-pulse dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400",
    icon: <Clock className="h-3 w-3 animate-spin" />,
  },
  sent: {
    label: "Enviada",
    bgClass: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-400",
    icon: <Check className="h-3 w-3" />,
  },
  failed: {
    label: "Falhou",
    bgClass: "border-rose-200 bg-rose-50 text-rose-700 animate-pulse dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  read: {
    label: "Lida",
    bgClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400",
    icon: <CheckCheck className="h-3.5 w-3.5" />,
  },
  cancelled: {
    label: "Cancelada",
    bgClass: "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400",
    icon: <Inbox className="h-3 w-3" />,
  },
};

function formatDateTime(value: string | null): string {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getFloatingIconStyles(status: CommunicationStatus): { wrapper: string; iconColor: string } {
  if (status === "failed") {
    return {
      wrapper: "bg-rose-50 border-rose-200 text-rose-600 shadow-sm shadow-rose-100/50 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 dark:shadow-none",
      iconColor: "text-rose-600 dark:text-rose-400",
    };
  }
  if (status === "read") {
    return {
      wrapper: "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm shadow-emerald-100/50 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400 dark:shadow-none",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (status === "sent") {
    return {
      wrapper: "bg-sky-50 border-sky-200 text-sky-600 shadow-sm shadow-sky-100/50 dark:bg-sky-950/30 dark:border-sky-900/50 dark:text-sky-400 dark:shadow-none",
      iconColor: "text-sky-600 dark:text-sky-400",
    };
  }
  return {
    wrapper: "bg-[hsl(var(--surface-muted))] border-[hsl(var(--border))] text-[hsl(var(--text-muted))] shadow-sm shadow-[hsl(var(--border)/0.1)]",
    iconColor: "text-[hsl(var(--text-muted))]",
  };
}

function renderChannelBadge(channel: string) {
  const isEmail = channel === "email";
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]">
      <Mail className="h-3 w-3 text-[hsl(var(--primary))]" />
      {isEmail ? "E-mail" : "Portal Interno"}
    </span>
  );
}

function renderAudienceBadge(audience: string) {
  let label = audience;
  let icon = <User className="h-3 w-3" />;
  if (audience === "candidate") {
    label = "Candidato";
    icon = <User className="h-3 w-3" />;
  } else if (audience === "recruiter") {
    label = "Recrutador";
    icon = <UserCheck className="h-3 w-3" />;
  } else if (audience === "manager") {
    label = "Gestor";
    icon = <Briefcase className="h-3 w-3" />;
  } else if (audience === "hr") {
    label = "RH";
    icon = <Shield className="h-3 w-3" />;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]">
      {icon}
      {label}
    </span>
  );
}

function CommunicationSkeleton() {
  return (
    <div className="space-y-6 pl-8 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[hsl(var(--border)/0.3)] animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="relative flex flex-col gap-2">
          {/* Shimmer Circle Icon */}
          <div className="absolute left-[-32px] top-1.5 h-8 w-8 rounded-full bg-[hsl(var(--surface-muted))] border-2 border-[hsl(var(--border)/0.5)]" />
          {/* Card skeleton */}
          <div className="flex-1 rounded-xl border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface))] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <div className="h-4 w-32 rounded bg-[hsl(var(--surface-muted))]" />
                <div className="h-4 w-12 rounded-full bg-[hsl(var(--surface-muted))]" />
              </div>
              <div className="h-4 w-20 rounded bg-[hsl(var(--surface-muted))]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-[hsl(var(--surface-muted))]" />
              <div className="h-3 w-5/6 rounded bg-[hsl(var(--surface-muted))]" />
            </div>
            <div className="flex gap-3 pt-2">
              <div className="h-5 w-16 rounded bg-[hsl(var(--surface-muted))]" />
              <div className="h-5 w-20 rounded bg-[hsl(var(--surface-muted))]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineItemBody({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <div className="space-y-2">
      <p
        className={[
          "text-sm leading-relaxed text-[hsl(var(--text-muted))] whitespace-pre-line transition-all duration-300",
          !isExpanded && isLong ? "line-clamp-3" : "",
        ].join(" ")}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary-hover))] transition hover:underline"
        >
          {isExpanded ? (
            <>
              Mostrar menos <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Ler mais <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function CandidateCommunicationsPanel({
  jobId,
  candidateId,
}: CandidateCommunicationsPanelProps) {
  const [communications, setCommunications] = useState<CandidateCommunication[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom Message Compose States
  const [isComposing, setIsComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"email" | "internal">("email");
  const [audience, setAudience] = useState<"candidate" | "manager" | "hr">("candidate");
  const [sending, setSending] = useState(false);

  const loadCommunications = useCallback(async () => {
    if (!jobId || !candidateId) {
      setCommunications([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await communicationService.getRecruiterCommunications(jobId, candidateId);
      const uniqueComms = Array.from(
        new Map(payload.communications.map((c) => [c.id, c])).values()
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCommunications(uniqueComms);
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim() || !jobId || !candidateId) return;

    setSending(true);
    setError(null);
    try {
      await communicationService.sendCustomMessage(jobId, candidateId, {
        subject,
        body,
        channel,
        audience,
      });
      setSubject("");
      setBody("");
      setChannel("email");
      setAudience("candidate");
      setIsComposing(false);
      await loadCommunications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  if (!jobId || !candidateId) {
    return (
      <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-sm text-[hsl(var(--text-muted))] flex items-center justify-center bg-[hsl(var(--surface-muted))/0.2]">
        Vincule o candidato a uma vaga para consultar comunicações.
      </div>
    );
  }

  return (
    <section aria-label="Comunicações do candidato" className="space-y-6 p-5 pb-24">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))/0.6] pb-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-[hsl(var(--text))]">Comunicações</h3>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Histórico de entrega de mensagens automatizadas e contatos.
          </p>
        </div>
        {!isComposing && (
          <button
            type="button"
            onClick={() => setIsComposing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition"
          >
            Falar com Candidato
          </button>
        )}
      </div>

      {/* Custom Message Composition Box */}
      {isComposing ? (
        <form onSubmit={handleSend} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 shadow-sm space-y-4 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))/0.5] pb-2">
            <h4 className="text-sm font-bold text-[hsl(var(--text))]">Nova Comunicação Direta</h4>
            <span className="text-xs text-[hsl(var(--text-muted))]">Escreva e envie uma mensagem direta</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="comm-channel" className="text-xs font-semibold text-[hsl(var(--text))]">Canal de Envio</label>
              <select
                id="comm-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as "email" | "internal")}
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))] outline-none transition"
              >
                <option value="email">E-mail</option>
                <option value="internal">Portal Interno (Notificação)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="comm-audience" className="text-xs font-semibold text-[hsl(var(--text))]">Público Alvo</label>
              <select
                id="comm-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as "candidate" | "manager" | "hr")}
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))] outline-none transition"
              >
                <option value="candidate">Candidato</option>
                <option value="manager">Gestor da Vaga</option>
                <option value="hr">Equipe de RH</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="comm-subject" className="text-xs font-semibold text-[hsl(var(--text))]">Assunto</label>
            <input
              id="comm-subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Digite o assunto da mensagem..."
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))] outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="comm-body" className="text-xs font-semibold text-[hsl(var(--text))]">Mensagem</label>
            <textarea
              id="comm-body"
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua mensagem aqui..."
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-xs text-[hsl(var(--text))] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))] outline-none transition resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--border))/0.5]">
            <button
              type="button"
              onClick={() => setIsComposing(false)}
              disabled={sending}
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold text-[hsl(var(--text))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-muted))] transition disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending || !subject.trim() || !body.trim()}
              className="rounded-lg bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary-hover))] px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sending ? "Enviando..." : "Enviar Mensagem"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <CommunicationSkeleton /> : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/50 bg-rose-50/50 dark:border-rose-950/30 dark:bg-rose-950/10 p-4 text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      ) : null}

      {!loading && !error && communications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] p-10 text-center text-sm text-[hsl(var(--text-muted))] bg-[hsl(var(--surface-muted))/0.1]">
          <Inbox className="h-8 w-8 text-[hsl(var(--text-muted))/0.6]" />
          <div>
            <p className="font-semibold text-[hsl(var(--text))]">Nenhuma comunicação registrada</p>
            <p className="text-xs text-[hsl(var(--text-muted))] mt-1">Este candidato não possui notificações enviadas até o momento.</p>
          </div>
        </div>
      ) : null}

      {!loading && communications.length > 0 ? (
        <ol className="relative pl-8 space-y-6 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-[hsl(var(--border))] before:via-[hsl(var(--border)/0.6)] before:to-transparent">
          {communications.map((communication) => {
            const iconStyles = getFloatingIconStyles(communication.status);
            const statusStyle = STATUS_CONFIG[communication.status] || {
              label: communication.status,
              bgClass: "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]",
              icon: null,
            };

            return (
              <li key={communication.id} className="relative group">
                {/* Timeline Icon */}
                <div
                  className={[
                    "absolute left-[-32px] top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 group-hover:scale-105",
                    iconStyles.wrapper,
                  ].join(" ")}
                >
                  <Mail className={["h-3.5 w-3.5", iconStyles.iconColor].join(" ")} />
                </div>

                {/* Timeline Card */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-[hsl(var(--border)/1.5)] dark:shadow-none">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-3 flex-1">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[hsl(var(--text))] text-sm sm:text-base leading-snug">
                          {communication.subject || communication.template_key || "Comunicação"}
                        </p>
                        <span
                          className={[
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            statusStyle.bgClass,
                          ].join(" ")}
                        >
                          {statusStyle.icon}
                          {statusStyle.label}
                        </span>
                      </div>

                      {/* Message Body */}
                      <TimelineItemBody text={communication.body} />

                      {/* Footer Row (metadata & error messages) */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs text-[hsl(var(--text-muted))] font-medium pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-[hsl(var(--text-muted))/0.8]" />
                            {formatDateTime(communication.created_at)}
                          </span>
                          <span>•</span>
                          {renderChannelBadge(communication.channel)}
                          <span>•</span>
                          {renderAudienceBadge(communication.audience)}
                        </div>

                        {communication.error_message ? (
                          <div className="flex items-start gap-1.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/30 p-2 text-xs text-rose-700 dark:text-rose-400">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium leading-relaxed">
                              {communication.error_message}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Retry Action */}
                    {communication.status === "failed" ? (
                      <button
                        type="button"
                        onClick={() => void handleRetry(communication.id)}
                        disabled={retryingId === communication.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold text-[hsl(var(--text))] bg-[hsl(var(--surface))] transition hover:bg-[hsl(var(--surface-muted))] hover:border-[hsl(var(--border)/1.5)] disabled:cursor-not-allowed disabled:opacity-60 shadow-sm shrink-0 sm:self-start"
                      >
                        <RefreshCw
                          className={[
                            "h-3.5 w-3.5 text-[hsl(var(--primary))]",
                            retryingId === communication.id ? "animate-spin" : "",
                          ].join(" ")}
                        />
                        Reenviar
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
