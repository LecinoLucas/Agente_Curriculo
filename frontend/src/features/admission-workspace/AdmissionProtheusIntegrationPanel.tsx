import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Download,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { formatContextError } from "../../services/errorMessages";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import {
  downloadCsv,
  downloadJson,
  exportErp,
  getPackageByCaseId,
  listErpAttempts,
  retryExportErp,
} from "../../services/admissionPackageService";
import type {
  AdmissionCaseWorkspace,
  AdmissionPackage,
  ErpIntegrationAttempt,
} from "../../types/domain";
import { AdmissionSectionCard } from "./components/AdmissionSectionCard";

type AdmissionProtheusIntegrationPanelProps = {
  caseId: string;
  variant?: "embedded" | "full";
  workspace?: AdmissionCaseWorkspace | null;
};

type ActionKey = "download-json" | "download-csv" | "export" | "retry" | null;

const PACKAGE_STATUS_LABELS: Record<AdmissionPackage["status"], string> = {
  draft: "Pacote com pendências",
  ready_for_review: "Pacote aguardando aprovação",
  approved_for_export: "Pacote aprovado para envio",
  exported: "Pacote exportado",
  cancelled: "Pacote cancelado",
};

const ERP_STATUS_LABELS: Record<string, string> = {
  pending: "Em processamento",
  retry_pending: "Falhou com retry disponível",
  failed: "Falhou",
  exported: "Exportado ao ERP",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function sanitizeErpMessage(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\{[\s\S]*\}/g, "[detalhes técnicos omitidos]")
    .replace(/\[[\s\S]*\]/g, "[detalhes técnicos omitidos]")
    .slice(0, 240);
}

function isExportAttempt(attempt: ErpIntegrationAttempt): boolean {
  return attempt.mode !== "dry_run";
}

function getLatestExportAttempt(attempts: ErpIntegrationAttempt[]): ErpIntegrationAttempt | null {
  const sorted = [...attempts].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  return sorted.find(isExportAttempt) ?? null;
}

function attemptStatusLabel(attempt: ErpIntegrationAttempt | null, pkg: AdmissionPackage | null): string {
  if (attempt?.lifecycle_status) {
    return ERP_STATUS_LABELS[attempt.lifecycle_status] ?? attempt.lifecycle_status;
  }
  if (pkg) {
    return PACKAGE_STATUS_LABELS[pkg.status];
  }
  return "Aguardando pacote";
}

function attemptToneClass(attempt: ErpIntegrationAttempt | null, pkg: AdmissionPackage | null): string {
  const lifecycleStatus = attempt?.lifecycle_status;
  if (lifecycleStatus === "exported" || pkg?.status === "exported") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (lifecycleStatus === "failed" || lifecycleStatus === "retry_pending" || pkg?.status === "draft") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (pkg?.status === "approved_for_export") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function IntegrationLoadingState({ variant }: { variant: "embedded" | "full" }) {
  const body = (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
      <div className="h-6 w-64 animate-pulse rounded bg-surface-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
    </div>
  );

  if (variant === "embedded") {
    return (
      <AdmissionSectionCard
        eyebrow="ERP"
        title="Exportação ERP"
        description="Carregando status operacional do envio."
      >
        {body}
      </AdmissionSectionCard>
    );
  }

  return <div className="admission-cockpit space-y-5">{body}</div>;
}

export function AdmissionProtheusIntegrationPanel({
  caseId,
  variant = "full",
  workspace: providedWorkspace = null,
}: AdmissionProtheusIntegrationPanelProps) {
  const [loadedWorkspace, setLoadedWorkspace] = useState<AdmissionCaseWorkspace | null>(providedWorkspace);
  const [pkg, setPkg] = useState<AdmissionPackage | null>(null);
  const [attempts, setAttempts] = useState<ErpIntegrationAttempt[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(!providedWorkspace);
  const [loadingPanel, setLoadingPanel] = useState(Boolean(providedWorkspace?.summary.ready_for_export));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<ActionKey>(null);

  useEffect(() => {
    if (providedWorkspace) {
      setLoadedWorkspace(providedWorkspace);
      setLoadingWorkspace(false);
      setLoadError(null);
    }
  }, [providedWorkspace]);

  const workspace = providedWorkspace ?? loadedWorkspace;
  const readyForExport = Boolean(workspace?.summary.ready_for_export);
  const workspaceHref = useMemo(() => `/admission/cases/${caseId}`, [caseId]);

  const loadWorkspace = useCallback(async () => {
    if (providedWorkspace) return providedWorkspace;

    setLoadingWorkspace(true);
    setLoadError(null);
    try {
      const payload = await admissionWorkspaceService.getWorkspace(caseId);
      setLoadedWorkspace(payload);
      return payload;
    } catch (requestError) {
      const message = formatContextError(
        requestError,
        "Não foi possível carregar a integração ERP.",
        "Volte ao cockpit e valide o caso admissional.",
      );
      setLoadError(message);
      return null;
    } finally {
      setLoadingWorkspace(false);
    }
  }, [caseId, providedWorkspace]);

  const loadPackageState = useCallback(
    async (baseWorkspace?: AdmissionCaseWorkspace | null) => {
      const currentWorkspace = baseWorkspace ?? null;
      if (!currentWorkspace?.summary.ready_for_export) {
        setPkg(null);
        setAttempts([]);
        setLoadingPanel(false);
        return;
      }

      setLoadingPanel(true);
      setLoadError(null);
      try {
        const currentPackage = await getPackageByCaseId(caseId);
        setPkg(currentPackage);

        if (!currentPackage) {
          setAttempts([]);
          return;
        }

        const attemptsResponse = await listErpAttempts(currentPackage.id);
        setAttempts(
          attemptsResponse.attempts
            .filter(isExportAttempt)
            .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
        );
      } catch (requestError) {
        setLoadError(
          formatContextError(
            requestError,
            "Não foi possível carregar o status de exportação ERP.",
            "Tente novamente em alguns instantes.",
          ),
        );
      } finally {
        setLoadingPanel(false);
      }
    },
    [caseId],
  );

  const reload = useCallback(async () => {
    const currentWorkspace = providedWorkspace ?? (await loadWorkspace());
    await loadPackageState(currentWorkspace);
  }, [loadPackageState, loadWorkspace, providedWorkspace]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const latestAttempt = useMemo(() => getLatestExportAttempt(attempts), [attempts]);
  const latestErrorSummary = latestAttempt?.error_summary;
  const downloadEnabled = pkg?.status === "approved_for_export" || pkg?.status === "exported";
  const canRetry = Boolean(latestAttempt?.retryable);
  const canExport =
    readyForExport &&
    pkg?.status === "approved_for_export" &&
    latestAttempt?.lifecycle_status !== "failed" &&
    latestAttempt?.lifecycle_status !== "retry_pending";

  const runAction = useCallback(
    async (key: Exclude<ActionKey, null>, action: () => Promise<void>) => {
      setActionKey(key);
      setActionError(null);
      try {
        await action();
      } catch (requestError) {
        setActionError(
          formatContextError(
            requestError,
            "Não foi possível concluir a operação ERP.",
            "Tente novamente e revise o status do pacote.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    },
    [],
  );

  const handleDownloadJson = useCallback(async () => {
    if (!pkg) return;
    await runAction("download-json", async () => {
      const blob = await downloadJson(pkg.id);
      triggerDownload(blob, `admission-package-${pkg.id}.json`);
      const refreshed = await getPackageByCaseId(caseId);
      setPkg(refreshed);
    });
  }, [caseId, pkg, runAction]);

  const handleDownloadCsv = useCallback(async () => {
    if (!pkg) return;
    await runAction("download-csv", async () => {
      const blob = await downloadCsv(pkg.id);
      triggerDownload(blob, `admission-package-${pkg.id}.csv`);
      const refreshed = await getPackageByCaseId(caseId);
      setPkg(refreshed);
    });
  }, [caseId, pkg, runAction]);

  const handleExport = useCallback(async () => {
    if (!pkg) return;
    await runAction("export", async () => {
      const attempt = await exportErp(pkg.id);
      setAttempts((current) => [attempt, ...current.filter((item) => item.id !== attempt.id)]);
      const refreshed = await getPackageByCaseId(caseId);
      setPkg(refreshed);
    });
  }, [caseId, pkg, runAction]);

  const handleRetry = useCallback(async () => {
    if (!pkg) return;
    await runAction("retry", async () => {
      const attempt = await retryExportErp(pkg.id);
      setAttempts((current) => [attempt, ...current.filter((item) => item.id !== attempt.id)]);
      const refreshed = await getPackageByCaseId(caseId);
      setPkg(refreshed);
    });
  }, [caseId, pkg, runAction]);

  if (loadingWorkspace || (!workspace && !loadError)) {
    return <IntegrationLoadingState variant={variant} />;
  }

  if (loadError || !workspace) {
    const body = (
      <EmptyState
        icon="⚠️"
        title="Integração ERP indisponível"
        description={loadError ?? "Não foi possível localizar o caso admissional."}
        action={{ label: "Recarregar", onClick: () => void reload() }}
      />
    );

    if (variant === "embedded") {
      return (
        <AdmissionSectionCard
          eyebrow="ERP"
          title="Exportação ERP"
          description="Operação staff indisponível no momento."
        >
          {body}
        </AdmissionSectionCard>
      );
    }

    return <div className="admission-section-card p-6">{body}</div>;
  }

  const content = (
    <div className="space-y-4" data-testid="admission-protheus-integration-panel">
      <AdmissionSectionCard
        eyebrow="ERP"
        title="Exportação ERP"
        description="Envio operacional do snapshot aprovado da pré-admissão."
        actions={
          <button
            type="button"
            onClick={() => void reload()}
            className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        }
      >
        <div className="space-y-4">
          <div
            className={[
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
              attemptToneClass(latestAttempt, pkg),
            ].join(" ")}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">Status da exportação</p>
              <p className="mt-1 text-sm font-semibold">
                {attemptStatusLabel(latestAttempt, pkg)}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>
                {pkg ? `Pacote: ${PACKAGE_STATUS_LABELS[pkg.status]}` : "Pacote ainda não disponível"}
              </p>
              <p className="mt-1">
                {latestAttempt
                  ? `Última tentativa: ${formatDateTime(latestAttempt.created_at)}`
                  : `Caso atualizado em ${formatDateTime(workspace.summary.last_update_at)}`}
              </p>
            </div>
          </div>

          {!readyForExport ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Envio ERP bloqueado</p>
                  <p>Finalize o checklist obrigatório e remova pendências antes de enviar ao ERP.</p>
                </div>
              </div>
            </div>
          ) : loadingPanel ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
              <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
            </div>
          ) : !pkg ? (
            <div className="rounded-xl border border-border bg-surface-muted/45 p-4 text-sm text-text-muted">
              O caso está pronto, mas ainda não existe pacote admissional aprovado para operar a exportação ERP.
            </div>
          ) : (
            <>
              <div
                className="rounded-xl border border-border bg-surface p-4"
                data-testid="erp-send-section"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Envio ao ERP</p>
                    <p className="mt-1 text-sm text-text-muted">
                      Esta ação envia o snapshot aprovado para o ERP. Não use os downloads abaixo como substituto do envio.
                    </p>
                  </div>
                  {latestAttempt?.lifecycle_status === "exported" || pkg.status === "exported" ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Exportado
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {canExport ? (
                    <button
                      type="button"
                      onClick={() => void handleExport()}
                      disabled={actionKey !== null}
                      className="bg-[hsl(var(--primary))] text-white hover:opacity-90 transition inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {actionKey === "export" ? "Enviando..." : "Enviar para ERP"}
                    </button>
                  ) : null}

                  {canRetry ? (
                    <button
                      type="button"
                      onClick={() => void handleRetry()}
                      disabled={actionKey !== null}
                      className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {actionKey === "retry" ? "Tentando novamente..." : "Tentar novamente"}
                    </button>
                  ) : null}
                </div>

                {latestErrorSummary ? (
                  <div
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                    data-testid="erp-error-summary"
                  >
                    <p className="font-semibold">Falha mais recente</p>
                    <p className="mt-1">{sanitizeErpMessage(latestErrorSummary.message)}</p>
                    <p className="mt-2 text-xs">
                      Código: {latestErrorSummary.code}
                      {latestErrorSummary.stage ? ` · Etapa: ${latestErrorSummary.stage}` : ""}
                    </p>
                  </div>
                ) : latestAttempt?.error_message ? (
                  <div
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                    data-testid="erp-error-summary"
                  >
                    <p className="font-semibold">Falha mais recente</p>
                    <p className="mt-1">{sanitizeErpMessage(latestAttempt.error_message)}</p>
                  </div>
                ) : null}

                {!canExport && !canRetry && pkg.status === "approved_for_export" && latestAttempt?.lifecycle_status === "failed" ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    A última tentativa falhou sem retry disponível. Revise o pacote e gere um novo snapshot antes de reenviar.
                  </div>
                ) : null}
              </div>

              <div
                className="rounded-xl border border-dashed border-border bg-surface-muted/30 p-4"
                data-testid="erp-downloads-section"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Conferência do pacote</p>
                    <p className="mt-1 text-sm text-text-muted">
                      Baixar JSON ou CSV serve apenas para conferência. Isso não envia dados ao ERP nem altera o status de exportação.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleDownloadJson()}
                    disabled={!downloadEnabled || actionKey !== null}
                    className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {actionKey === "download-json" ? "Baixando..." : "Baixar JSON (conferência)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadCsv()}
                    disabled={!downloadEnabled || actionKey !== null}
                    className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {actionKey === "download-csv" ? "Baixando..." : "Baixar CSV (conferência)"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-text">Tentativas recentes</p>
                {attempts.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">
                    Nenhuma tentativa de envio ERP foi registrada para este pacote.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {attempts.slice(0, 3).map((attempt) => (
                      <li
                        key={attempt.id}
                        className="rounded-lg border border-border bg-surface-muted/35 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-text">
                              Tentativa #{attempt.attempt_number ?? 1}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                              {attemptStatusLabel(attempt, pkg)} · {formatDateTime(attempt.created_at)}
                            </p>
                          </div>
                          {attempt.external_reference ? (
                            <span className="text-xs font-medium text-text-muted">
                              Ref. {attempt.external_reference}
                            </span>
                          ) : null}
                        </div>
                        {attempt.error_summary?.message ? (
                          <p className="mt-2 text-xs text-red-700">
                            {sanitizeErpMessage(attempt.error_summary.message)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {actionError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{actionError}</p>
              </div>
            </div>
          ) : null}
        </div>
      </AdmissionSectionCard>
    </div>
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    <div className="admission-cockpit admission-cockpit-shell space-y-6 p-3 sm:p-4">
      <section className="admission-executive-header overflow-hidden">
        <div className="border-b border-border/55 bg-[hsl(var(--nav-bg))] px-5 py-4 text-[hsl(var(--nav-text))]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                to={workspaceHref}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar à pré-admissão
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal">Exportação ERP</h1>
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
              {readyForExport ? "Caso apto para operação ERP" : "Gate admissional bloqueado"}
            </span>
          </div>
        </div>
      </section>

      {content}
    </div>
  );
}
