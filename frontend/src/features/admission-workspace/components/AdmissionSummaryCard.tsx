import { CheckCircle2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdmissionCaseWorkspace } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { formatDate, formatDateTime } from "../utils";

type AdmissionSummaryCardProps = {
  workspace: AdmissionCaseWorkspace;
  onMarkReady: () => void;
  submitting: boolean;
  actionMessage?: string | null;
};

export function AdmissionSummaryCard({
  workspace,
  onMarkReady,
  submitting,
  actionMessage,
}: AdmissionSummaryCardProps) {
  return (
    <AdmissionSectionCard
      eyebrow="Resumo"
      title="Situação do caso"
      description="Gate operacional para liberar a futura integração com Protheus."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="admission-metric p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
              Readiness
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={workspace.summary.ready_for_export ? "success" : "warning"}>
                {workspace.summary.ready_for_export
                  ? "Pronto para exportação"
                  : "Ainda não pronto"}
              </Badge>
              {workspace.summary.ready_for_export ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
              )}
            </div>
          </div>
          <div className="admission-metric p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
              Responsável
            </p>
            <p className="mt-2 text-sm font-medium text-[hsl(var(--text))]">
              {workspace.summary.responsible_name ?? "Não definido"}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 text-sm text-[hsl(var(--text-muted))]">
          <div className="flex items-center justify-between gap-3">
            <dt>Criado em</dt>
            <dd className="text-right text-[hsl(var(--text))]">
              {formatDate(workspace.summary.created_at)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Última atualização</dt>
            <dd className="text-right text-[hsl(var(--text))]">
              {formatDateTime(workspace.summary.last_update_at)}
            </dd>
          </div>
        </dl>

        {actionMessage ? (
          <div className="rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning-soft))] px-3 py-2 text-sm text-[hsl(var(--text))]">
            {actionMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onMarkReady}
          disabled={submitting || workspace.summary.ready_for_export}
          className="ui-btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
        >
          {workspace.summary.ready_for_export
            ? "Caso pronto para exportação"
            : submitting
              ? "Validando caso..."
              : "Marcar pronto para exportação"}
        </button>
      </div>
    </AdmissionSectionCard>
  );
}
