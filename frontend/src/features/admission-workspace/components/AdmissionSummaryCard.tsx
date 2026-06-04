import {
  CalendarDays,
  Clock,
  UserRound,
} from "lucide-react";

import type { AdmissionCaseWorkspace } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { formatDate, formatDateTime } from "../utils";

type AdmissionSummaryCardProps = {
  workspace: AdmissionCaseWorkspace;
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
}: AdmissionSummaryCardProps) {
  const { summary } = workspace;

  return (
    <AdmissionSectionCard title="Informações do caso">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <MiniCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Criação do caso"
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
    </AdmissionSectionCard>
  );
}
