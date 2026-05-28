import { AlertTriangle, ChevronDown, ClipboardCheck, History, Loader, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import {
  createHiringDecision,
  getHiringDecision,
  getHiringDecisionHistory,
} from "../../../../services/hiringDecisionService";
import type {
  HiringDecision,
  HiringDecisionOutcome,
  HiringDecisionPayload,
  HiringDecisionReasonCode,
} from "../../../../types/domain";
import { HiringDecisionForm } from "./HiringDecisionForm";

interface CandidateHiringDecisionPanelProps {
  jobId?: string | null;
  candidateId?: string | null;
  title?: string;
  description?: string;
  onDecisionSubmitted?: (decision: HiringDecision) => void | Promise<void>;
}

const outcomeLabels: Record<HiringDecisionOutcome, string> = {
  advance: "Avançar",
  hold: "Manter em espera",
  reject: "Rejeitar",
  hire: "Contratar",
  request_another_interview: "Solicitar outra entrevista",
  keep_under_review: "Manter em revisão",
};

const reasonLabels: Record<HiringDecisionReasonCode, string> = {
  strong_fit: "Forte aderência",
  partial_fit: "Aderência parcial",
  missing_required_skill: "Competência obrigatória ausente",
  salary_mismatch: "Desalinhamento salarial",
  availability_mismatch: "Desalinhamento de disponibilidade",
  behavioral_concern: "Ponto comportamental",
  interview_concern: "Ponto de entrevista",
  better_candidates: "Outros candidatos mais aderentes",
  candidate_withdrew: "Candidato desistiu",
  other: "Outro",
};

function formatDate(value: string | null): string {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusText(value: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    submitted: "Registrada",
    superseded: "Substituída",
  };
  return labels[value] ?? value;
}

function DecisionDetails({ decision }: { decision: HiringDecision }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-border bg-white/80 p-3">
        <div className="text-[11px] font-semibold uppercase text-text-muted">Decisão</div>
        <div className="mt-1 text-sm font-medium text-text">
          {outcomeLabels[decision.decision_outcome]}
        </div>
      </div>
      <div className="rounded-md border border-border bg-white/80 p-3">
        <div className="text-[11px] font-semibold uppercase text-text-muted">Motivo</div>
        <div className="mt-1 text-sm font-medium text-text">
          {reasonLabels[decision.reason_code]}
        </div>
      </div>
      <div className="rounded-md border border-border bg-white/80 p-3">
        <div className="text-[11px] font-semibold uppercase text-text-muted">Status</div>
        <div className="mt-1 text-sm font-medium text-text">
          {statusText(decision.decision_status)}
        </div>
      </div>
    </div>
  );
}

export function CandidateHiringDecisionPanel({
  jobId,
  candidateId,
  title = "Decisão humana auditável",
  description = "Esta é uma decisão humana. A IA é apenas apoio e não aprova ou reprova candidatos automaticamente.",
  onDecisionSubmitted,
}: CandidateHiringDecisionPanelProps) {
  const [decision, setDecision] = useState<HiringDecision | null>(null);
  const [history, setHistory] = useState<HiringDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    if (!jobId || !candidateId) {
      setDecision(null);
      setHistory([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [currentPayload, historyPayload] = await Promise.all([
        getHiringDecision(jobId, candidateId),
        getHiringDecisionHistory(jobId, candidateId),
      ]);
      setDecision(currentPayload.decision);
      setHistory(historyPayload.decisions);
    } catch {
      setError("Não foi possível carregar a decisão final.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [candidateId, jobId]);

  const handleSubmit = async (payload: HiringDecisionPayload) => {
    if (!jobId || !candidateId) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await createHiringDecision(jobId, candidateId, payload);
      setDecision(saved);
      setFormOpen(false);
      await load();
      await onDecisionSubmitted?.(saved);
    } catch {
      setError("Não foi possível registrar a decisão final.");
    } finally {
      setSaving(false);
    }
  };

  if (!jobId || !candidateId) {
    return null;
  }

  if (loading && !decision) {
    return (
      <section className="rounded-lg border border-border bg-white p-4 text-sm text-text-muted">
        <div className="flex items-center gap-2">
          <Loader className="h-4 w-4 animate-spin" />
          Carregando decisão final...
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[hsl(var(--accent-soft))] p-2 text-[hsl(var(--primary))]">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Decisão final
            </p>
            <h3 className="text-base font-semibold text-text">
              {title}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {decision ? "Registrar nova decisão" : "Registrar decisão"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {!decision ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted/30 p-4 text-sm text-text-muted">
          Nenhuma decisão final registrada para esta vaga.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <DecisionDetails decision={decision} />
          {decision.notes ? (
            <div className="rounded-md border border-border bg-white/80 p-3">
              <div className="text-[11px] font-semibold uppercase text-text-muted">
                Observação
              </div>
              <p className="mt-1 text-sm text-text">{decision.notes}</p>
            </div>
          ) : null}
          <div className="text-xs text-text-muted">
            Registrada em {formatDate(decision.submitted_at ?? decision.created_at)}
          </div>
        </div>
      )}

      {formOpen ? (
        <div className="mt-4">
          {decision?.decision_status === "submitted" ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              A nova decisão substituirá a decisão atual e manterá o histórico auditável.
            </div>
          ) : null}
          <HiringDecisionForm
            saving={saving}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setHistoryOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-text"
          >
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico de decisões
            </span>
            <ChevronDown className={`h-4 w-4 transition ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen ? (
            <div className="space-y-3 border-t border-border p-4">
              {history.map((item) => (
                <div key={item.id} className="rounded-md bg-surface-muted/40 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-text">
                      {outcomeLabels[item.decision_outcome]} · {reasonLabels[item.reason_code]}
                    </div>
                    <div className="text-xs text-text-muted">
                      {statusText(item.decision_status)} · {formatDate(item.submitted_at ?? item.created_at)}
                    </div>
                  </div>
                  {item.notes ? (
                    <p className="mt-2 text-sm text-text-muted">{item.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
