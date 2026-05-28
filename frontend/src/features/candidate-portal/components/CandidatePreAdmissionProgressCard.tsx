import { CheckCircle2, ClipboardList, RefreshCcw } from "lucide-react";

import type {
  CandidatePortalPreAdmissionCase,
  CandidatePortalPreAdmissionSummary,
} from "../../../services/candidatePortalService";
import {
  processStatusLabel,
  processNextStepHint,
} from "../preAdmissionLabels";

interface CandidatePreAdmissionProgressCardProps {
  caseData: CandidatePortalPreAdmissionCase | null;
  summary: CandidatePortalPreAdmissionSummary | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function CandidatePreAdmissionProgressCard({
  caseData,
  summary,
  onRefresh,
  refreshing = false,
}: CandidatePreAdmissionProgressCardProps) {
  const total = summary?.documents_total ?? caseData?.checklist_items.length ?? 0;
  const approved = summary?.documents_approved ?? 0;
  const submitted = summary?.documents_submitted ?? 0;
  const pending = summary?.documents_pending ?? Math.max(total - approved, 0);
  const percent = total > 0 ? Math.round((approved / total) * 100) : 0;
  const headline = processStatusLabel(caseData, summary);
  const hint = processNextStepHint(caseData, summary);

  return (
    <section
      data-testid="candidate-pre-admission-progress"
      className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              Status atual
            </p>
            <h2
              data-testid="candidate-pre-admission-process-status"
              className="mt-1 text-2xl font-black tracking-tight text-text"
            >
              {headline}
            </h2>
            <p className="mt-2 text-sm text-text-muted">{hint}</p>
          </div>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="candidate-pre-admission-refresh"
            className="inline-flex h-10 items-center gap-2 self-start rounded-xl border border-border bg-white px-3 text-xs font-bold text-text transition hover:bg-surface-muted/50 disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Sincronizar
          </button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="candidate-pre-admission-counters">
        <CounterTile label="Pendentes" value={pending} tone="pending" />
        <CounterTile label="Enviados" value={submitted} tone="info" />
        <CounterTile label="Aprovados" value={approved} tone="approved" />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-semibold text-text-muted">
          <span data-testid="candidate-pre-admission-progress-counts">
            {approved} de {total} documentos aprovados
          </span>
          <span>{percent}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-[hsl(var(--primary))] transition-all"
            style={{ width: `${percent}%` }}
            aria-hidden="true"
          />
        </div>
        {summary?.next_pending_document ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-muted/40 px-3 py-1.5 text-xs font-semibold text-text">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" />
            Próximo: {summary.next_pending_document}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CounterTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pending" | "info" | "approved";
}) {
  const toneClass =
    tone === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
