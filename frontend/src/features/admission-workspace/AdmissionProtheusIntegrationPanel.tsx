import { ArrowLeft, CheckCircle2, Database, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { AdmissionPackagePanel } from "../candidates/drawer/components/AdmissionPackagePanel";
import { ErpDryRunPanel } from "../candidates/drawer/components/ErpDryRunPanel";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import { formatContextError } from "../../services/errorMessages";
import type {
  AdmissionCaseWorkspace,
  AdmissionPackage,
  PreAdmissionStatus,
} from "../../types/domain";
import { AdmissionSectionCard } from "./components/AdmissionSectionCard";

type AdmissionProtheusIntegrationPanelProps = {
  caseId: string;
};

function IntegrationLoadingState() {
  return (
    <div className="admission-cockpit space-y-5">
      <div className="admission-section-card p-5">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-7 w-72 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
        </div>
      </div>
      <SkeletonCards count={3} columns={2} />
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function resolvePackageCaseStatus(workspace: AdmissionCaseWorkspace): PreAdmissionStatus {
  if (workspace.summary.ready_for_export) return "ready_for_admission";
  const status = workspace.case.status;
  const knownStatuses = new Set<PreAdmissionStatus>([
    "draft",
    "offer_preparing",
    "offer_sent",
    "offer_accepted",
    "offer_declined",
    "documents_pending",
    "documents_received",
    "ready_for_admission",
    "admitted",
    "cancelled",
  ]);
  return knownStatuses.has(status as PreAdmissionStatus)
    ? (status as PreAdmissionStatus)
    : "documents_pending";
}

export function AdmissionProtheusIntegrationPanel({
  caseId,
}: AdmissionProtheusIntegrationPanelProps) {
  const [workspace, setWorkspace] = useState<AdmissionCaseWorkspace | null>(null);
  const [pkg, setPkg] = useState<AdmissionPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workspaceHref = useMemo(() => `/admission/cases/${caseId}`, [caseId]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await admissionWorkspaceService.getWorkspace(caseId);
      setWorkspace(payload);
    } catch (requestError) {
      setError(
        formatContextError(
          requestError,
          "Não foi possível carregar o painel de integração.",
          "Volte ao workspace da pré-admissão e valide o pipeline ativo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  if (loading) {
    return <IntegrationLoadingState />;
  }

  if (error || !workspace) {
    return (
      <div className="admission-section-card p-6">
        <EmptyState
          icon="⚠️"
          title="Integração indisponível"
          description={error ?? "Não foi possível localizar o caso admissional."}
          action={{ label: "Recarregar", onClick: () => void loadWorkspace() }}
        />
      </div>
    );
  }

  const readyForExport = workspace.summary.ready_for_export;
  const caseStatusForPackage = resolvePackageCaseStatus(workspace);

  return (
    <div className="admission-cockpit admission-cockpit-shell space-y-6 p-3 sm:p-4" data-testid="admission-protheus-integration-panel">
      <section className="admission-executive-header overflow-hidden">
        <div className="border-b border-[hsl(var(--border))]/55 bg-[hsl(var(--nav-bg))] px-5 py-4 text-[hsl(var(--nav-text))]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                to={workspaceHref}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar à pré-admissão
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal">
                Integração Protheus
              </h1>
              <p className="mt-1 text-sm text-[hsl(var(--nav-muted))]">
                {workspace.candidate.name} · {workspace.job.title}
              </p>
            </div>
            <span
              className={[
                "inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
                readyForExport
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              ].join(" ")}
            >
              {readyForExport ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              {readyForExport ? "Ready for export" : "Gate bloqueado"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
              Pré-admissão / Integração
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[hsl(var(--text))] tracking-normal">
              Etapa controlada pela prontidão admissional
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[hsl(var(--text-muted))]">
              Dry-run, pacote admissional e histórico ERP ficam disponíveis somente quando o caso não possui bloqueios operacionais.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="ui-btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar gate
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <AdmissionSectionCard
            eyebrow="Gate operacional"
            title={readyForExport ? "Caso liberado para integração" : "Integração bloqueada"}
            description="O painel ERP só opera como consequência da pré-admissão concluída."
            actions={
              <span
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                  readyForExport
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800",
                ].join(" ")}
              >
                {readyForExport ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                {readyForExport ? "Ready for export" : "Pendente"}
              </span>
            }
          >
            {readyForExport ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                Checklist obrigatório aprovado ou dispensado, sem bloqueios ativos. Dry-run e pacote admissional estão liberados.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Conclua as pendências da pré-admissão antes de gerar pacote, preparar dry-run ou abrir qualquer envio ERP.
                </div>
                {workspace.main_blockers.length > 0 ? (
                  <ul className="space-y-2">
                    {workspace.main_blockers.map((blocker) => (
                      <li
                        key={`${blocker.type}-${blocker.title}`}
                        className="admission-row px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-[hsl(var(--text))]">{blocker.title}</p>
                        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{blocker.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </AdmissionSectionCard>

          <AdmissionPackagePanel
            caseId={caseId}
            caseStatus={caseStatusForPackage}
            onPackageChange={setPkg}
          />

          {!readyForExport ? (
            <AdmissionSectionCard
              eyebrow="Protheus"
              title="Dry-run e tentativas"
              description="Prepare payload, simule e audite tentativas sem enviar dados reais nesta fase."
              actions={<Database className="h-5 w-5 text-[hsl(var(--text-muted))]" />}
            >
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Operação bloqueada pelo gate de pré-admissão.
              </div>
            </AdmissionSectionCard>
          ) : !pkg ? (
            <AdmissionSectionCard
              eyebrow="Protheus"
              title="Dry-run e tentativas"
              description="Prepare payload, simule e audite tentativas sem enviar dados reais nesta fase."
              actions={<Database className="h-5 w-5 text-[hsl(var(--text-muted))]" />}
            >
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4 text-sm text-[hsl(var(--text-muted))]">
                Gere e aprove o pacote admissional para habilitar a simulação Protheus.
              </div>
            </AdmissionSectionCard>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                    Protheus
                  </p>
                  <h2 className="text-base font-semibold text-[hsl(var(--text))]">Dry-run e tentativas</h2>
                  <p className="max-w-2xl text-sm text-[hsl(var(--text-muted))]">
                    Prepare payload, simule e audite tentativas sem enviar dados reais nesta fase.
                  </p>
                </div>
                <Database className="h-5 w-5 text-[hsl(var(--text-muted))]" />
              </div>
              <ErpDryRunPanel pkg={pkg} />
            </div>
          )}
        </div>

        <aside className="admission-side-rail space-y-6">
          <AdmissionSectionCard
            eyebrow="Resumo"
            title="Caso admissional"
            description="Referência operacional do gate atual."
          >
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[hsl(var(--text-muted))]">Status</dt>
                <dd className="font-semibold text-[hsl(var(--text))]">{workspace.case.status}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[hsl(var(--text-muted))]">Etapa</dt>
                <dd className="font-semibold text-[hsl(var(--text))]">{workspace.case.current_stage}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[hsl(var(--text-muted))]">Checklist</dt>
                <dd className="font-semibold text-[hsl(var(--text))]">
                  {workspace.checklist.approved}/{workspace.checklist.total}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[hsl(var(--text-muted))]">Última atualização</dt>
                <dd className="font-semibold text-[hsl(var(--text))]">
                  {formatDateTime(workspace.summary.last_update_at)}
                </dd>
              </div>
            </dl>
          </AdmissionSectionCard>

          <AdmissionSectionCard
            eyebrow="Histórico"
            title="Eventos recentes"
            description="Últimos movimentos do caso antes da integração."
          >
            {workspace.recent_events.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-muted))]">Nenhum evento recente.</p>
            ) : (
              <ul className="space-y-3">
                {workspace.recent_events.slice(0, 5).map((event) => (
                  <li key={event.id} className="border-l-2 border-[hsl(var(--border))] pl-3">
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{event.title}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{event.description}</p>
                    <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">
                      {formatDateTime(event.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AdmissionSectionCard>
        </aside>
      </div>
    </div>
  );
}
