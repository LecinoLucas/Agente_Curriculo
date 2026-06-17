import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import type { AdmissionCaseWorkspace } from "../../../types/domain";
import {
  formatProgressLabel,
  progressPercent,
  stageLabel,
} from "../utils";

type AdmissionCaseHeaderProps = {
  workspace: AdmissionCaseWorkspace;
  /** href for the back button and "Ver perfil" link */
  openPageHref?: string | null;
  /** href for the Protheus integration page (used for next-action link) */
  integrationHref?: string | null;
  /** handler called after confirmation; required to enable CTA */
  onMarkReady?: () => void;
  submitting?: boolean;
  actionMessage?: string | null;
  /** quick-reload handler shown as icon button in the header */
  onReload?: () => void;
};

export function AdmissionCaseHeader({
  workspace,
  openPageHref,
  integrationHref: _integrationHref,
  onMarkReady,
  submitting = false,
  actionMessage,
  onReload,
}: AdmissionCaseHeaderProps) {
  const [confirming, setConfirming] = useState(false);

  const { summary, case: caseData, candidate, job, checklist, next_actions } = workspace;
  const isReady = summary.ready_for_export;
  const progress = progressPercent(checklist.approved, checklist.total);
  // First enabled action — or first action as fallback for label display
  const primaryAction = next_actions.find((a) => a.enabled) ?? next_actions[0] ?? null;

  const handleConfirm = () => {
    setConfirming(false);
    onMarkReady?.();
  };

  return (
    <div className="admission-section-card overflow-hidden" data-testid="admission-case-header">
      {/* ── Row 1: candidate identity + status badge ───────────────── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          {openPageHref ? (
            <Link
              to={openPageHref}
              aria-label="Voltar"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted shadow-sm transition-colors hover:bg-surface-muted hover:text-text"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-text">{candidate.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-text-muted">
              <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {job.title}
            </p>
            <p className="mt-0.5 text-xs text-text-muted/70" data-testid="admission-unit-name">
              {job.unit_name ? `Unidade: ${job.unit_name}` : "Unidade não definida"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {onReload ? (
              <button
                type="button"
                onClick={onReload}
                aria-label="Atualizar workspace"
                title="Atualizar workspace"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-text-muted shadow-sm transition-colors hover:bg-surface-muted hover:text-text"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <Badge variant={isReady ? "success" : "warning"}>
              {isReady
                ? "Pronto para exportação"
                : stageLabel(caseData.current_stage) + " em andamento"}
            </Badge>
          </div>
          {openPageHref ? (
            <Link
              to={openPageHref}
              className="text-xs font-medium text-text-muted transition-colors hover:text-text hover:underline"
            >
              Ver perfil
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── Row 2: command strip ────────────────────────────────────── */}
      {isReady ? (
        /* Case is ready — success strip + disabled CTA (testid preserved) */
        <div className="space-y-3 border-t border-[hsl(var(--success))]/20 bg-success-soft/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="text-sm font-semibold text-success">
              Caso pronto — aguardando exportação para o ERP
            </span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              data-testid="mark-ready-btn"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Caso pronto para exportação
            </button>
          </div>
        </div>
      ) : (
        /* Case in progress — show progress + next action + CTA */
        <div className="space-y-3 border-t border-border/50 bg-surface-muted/20 px-5 py-4">
          {/* Progress bar */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Progresso
              </span>
              <span className="text-xs font-semibold text-text">
                {formatProgressLabel(checklist.approved, checklist.total)} documentos aprovados
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${checklist.approved} de ${checklist.total} documentos aprovados`}
                className="h-full rounded-full bg-[hsl(var(--brand-dark))] transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Next action (informational) */}
          {primaryAction ? (
            <div className="flex items-center gap-2 text-sm">
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]"
                aria-hidden="true"
              />
              <span className="font-medium text-text-muted">Próxima ação:</span>
              <span className="font-semibold text-text">{primaryAction.label}</span>
              {primaryAction.disabled_reason ? (
                <span className="text-xs text-text-muted">
                  — {primaryAction.disabled_reason}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Validation / error message from mark-ready attempt */}
          {actionMessage ? (
            <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-warning-soft px-3 py-2.5 text-sm text-text">
              {actionMessage}
            </div>
          ) : null}

          {/* CTA: inline confirmation OR mark-ready button */}
          {confirming ? (
            <div
              role="alertdialog"
              aria-labelledby="mark-ready-confirm-title"
              aria-describedby="mark-ready-confirm-desc"
              className="space-y-3 rounded-xl border border-[hsl(var(--warning))]/40 bg-warning-soft px-4 py-3.5"
            >
              <p
                id="mark-ready-confirm-title"
                className="text-sm font-semibold text-text"
              >
                Confirmar liberação para exportação?
              </p>
              <p
                id="mark-ready-confirm-desc"
                className="text-xs text-text-muted"
              >
                Todos os itens obrigatórios do checklist serão validados. Se
                aprovados, o caso ficará disponível para integração com o ERP.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  data-testid="mark-ready-confirm-btn"
                  className="flex-1 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  data-testid="mark-ready-cancel-btn"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition hover:bg-surface-muted"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={submitting}
                data-testid="mark-ready-btn"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando caso...
                  </>
                ) : (
                  "Marcar pronto para exportação"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
