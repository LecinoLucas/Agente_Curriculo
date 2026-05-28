import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import type { AdmissionCaseWorkspace } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { caseStatusLabel, formatDate, formatDateTime } from "../utils";

type AdmissionSummaryCardProps = {
  workspace: AdmissionCaseWorkspace;
  onMarkReady: () => void;
  submitting: boolean;
  actionMessage?: string | null;
};

type MiniCardProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
};

function MiniCard({ icon, label, value }: MiniCardProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-surface p-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.6)]">
      <span
        className="mt-0.5 shrink-0 text-text-muted"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-semibold text-text">
          {value}
        </div>
      </div>
    </div>
  );
}

export function AdmissionSummaryCard({
  workspace,
  onMarkReady,
  submitting,
  actionMessage,
}: AdmissionSummaryCardProps) {
  const { summary, case: caseData } = workspace;

  return (
    <AdmissionSectionCard title="Resumo do caso">
      <div className="space-y-4">
        {/* 2x2 mini card grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <MiniCard
            icon={
              summary.ready_for_export ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-warning" />
              )
            }
            label="Status do caso"
            value={caseStatusLabel(caseData.status)}
          />
          <MiniCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Data de criação"
            value={formatDate(summary.created_at)}
          />
          <MiniCard
            icon={<UserRound className="h-4 w-4" />}
            label="Responsável"
            value={summary.responsible_name ?? "—"}
          />
          <MiniCard
            icon={<Clock className="h-4 w-4" />}
            label="Última atualização"
            value={
              <span className="leading-snug">
                {formatDateTime(summary.last_update_at)}
              </span>
            }
          />
        </div>

        {/* Action message */}
        {actionMessage ? (
          <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-warning-soft px-3 py-2.5 text-sm text-text">
            {actionMessage}
          </div>
        ) : null}

        {/* Mark ready button */}
        <button
          type="button"
          onClick={onMarkReady}
          disabled={submitting || summary.ready_for_export}
          className="bg-[hsl(var(--primary))] text-white hover:opacity-90 transition inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
        >
          {summary.ready_for_export ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Caso pronto para exportação
            </>
          ) : submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando caso...
            </>
          ) : (
            "Marcar pronto para exportação"
          )}
        </button>
      </div>
    </AdmissionSectionCard>
  );
}
