"use client";

import { ExternalLink, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { formatContextError } from "../../services/errorMessages";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import type { AdmissionProtheusBridgeSummary } from "../../types/domain";
import { AdmissionSectionCard } from "./components/AdmissionSectionCard";

type AdmissionProtheusBridgeSummaryPanelProps = {
  caseId: string;
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Pronta",
  warning: "Atenção",
  blocked: "Bloqueada",
  unavailable: "Indisponível",
  disabled: "Desativada",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function statusTone(status: string): string {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function SafetyRow({
  label,
  active,
  value,
}: {
  label: string;
  active: boolean;
  value: string;
}) {
  const Icon = active ? ShieldX : ShieldCheck;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/35 px-3 py-2">
      <span className="text-sm text-text">{label}</span>
      <span
        className={[
          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
          active ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
        ].join(" ")}
      >
        <Icon className="h-3.5 w-3.5" />
        {value}
      </span>
    </div>
  );
}

export function AdmissionProtheusBridgeSummaryPanel({
  caseId,
}: AdmissionProtheusBridgeSummaryPanelProps) {
  const [summary, setSummary] = useState<AdmissionProtheusBridgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await admissionWorkspaceService.getProtheusBridgeSummary(caseId);
      setSummary(payload);
    } catch (requestError) {
      setError(
        formatContextError(
          requestError,
          "Não foi possível carregar o status da Protheus Bridge.",
          "Recarregue o workspace ou valide o backend do Admissão RH.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  if (loading && !summary) {
    return (
      <AdmissionSectionCard
        eyebrow="Bridge"
        title="Status Protheus"
        description="Carregando o resumo read-only da bridge."
      >
        <div className="space-y-3">
          <div className="h-5 w-36 animate-pulse rounded bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      </AdmissionSectionCard>
    );
  }

  if (error || !summary) {
    return (
      <AdmissionSectionCard
        eyebrow="Bridge"
        title="Status Protheus"
        description="Resumo read-only da integração técnica com a bridge."
      >
        <EmptyState
          icon="⚠️"
          title="Bridge indisponível"
          description={error ?? "Resumo técnico não disponível no momento."}
          action={{ label: "Tentar novamente", onClick: () => void loadSummary() }}
        />
      </AdmissionSectionCard>
    );
  }

  const latestTrace = summary.latest_trace;

  return (
    <AdmissionSectionCard
      eyebrow="Bridge"
      title="Status Protheus"
      description="Resumo read-only da integração técnica com a bridge."
      actions={
        <button
          type="button"
          onClick={() => void loadSummary()}
          className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </button>
      }
    >
      <div className="space-y-4" data-testid="admission-protheus-bridge-summary-panel">
        <div
          className={[
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
            statusTone(summary.status),
          ].join(" ")}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">Status geral</p>
            <p className="mt-1 text-sm font-semibold">{STATUS_LABELS[summary.status] ?? summary.status}</p>
          </div>
          <div className="text-right text-xs">
            <p>Enabled: {summary.enabled ? "Sim" : "Não"}</p>
            <p className="mt-1">Available: {summary.available ? "Sim" : "Não"}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Contexto</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Ambiente</dt>
                <dd className="font-medium text-text">{summary.environment ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Storage mode</dt>
                <dd className="font-medium text-text">{summary.storage_mode ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Readiness</dt>
                <dd className="font-medium text-text">{summary.readiness ?? "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Último trace</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Trace ID</dt>
                <dd className="font-medium text-text">{latestTrace?.trace_id ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Ação</dt>
                <dd className="font-medium text-text">{latestTrace?.action_type ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Status</dt>
                <dd className="font-medium text-text">{latestTrace?.status ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-muted">Atualizado</dt>
                <dd className="font-medium text-text">{formatDateTime(latestTrace?.created_at)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Segurança</p>
          <div className="mt-3 space-y-2">
            <SafetyRow
              label="would_execute"
              active={summary.safety.would_execute}
              value={summary.safety.would_execute ? "true" : "false"}
            />
            <SafetyRow
              label="erp_send_attempted"
              active={summary.safety.erp_send_attempted}
              value={summary.safety.erp_send_attempted ? "true" : "false"}
            />
            <SafetyRow
              label="registration_routine_called"
              active={summary.safety.registration_routine_called}
              value={summary.safety.registration_routine_called ? "true" : "false"}
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/35 px-3 py-2">
              <span className="text-sm text-text">protheus_registration</span>
              <span className="text-xs font-semibold text-text-muted">
                {summary.safety.protheus_registration ?? "null"}
              </span>
            </div>
          </div>
        </div>

        {summary.message ? (
          <div className="rounded-xl border border-border bg-surface-muted/35 p-4 text-sm text-text">
            <p className="font-semibold">Mensagem</p>
            <p className="mt-1">{summary.message}</p>
          </div>
        ) : null}

        {latestTrace?.blocked_reason || latestTrace?.error_code ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text">
            <p className="font-semibold">Último bloqueio ou erro</p>
            <p className="mt-2">blocked_reason: {latestTrace?.blocked_reason ?? "—"}</p>
            <p className="mt-1">error_code: {latestTrace?.error_code ?? "—"}</p>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text">Próxima ação</p>
          <p className="mt-2 text-sm text-text-muted">{summary.next_action}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface-muted/25 p-4">
          <p className="text-sm text-text-muted">
            Este painel é somente leitura. Nenhum envio real, ExecAuto ou cadastro é executado a partir daqui.
          </p>
          <a
            href={summary.dashboard_url}
            target="_blank"
            rel="noreferrer"
            className="bg-[hsl(var(--primary))] text-white hover:opacity-90 transition inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir cockpit técnico
          </a>
        </div>
      </div>
    </AdmissionSectionCard>
  );
}
