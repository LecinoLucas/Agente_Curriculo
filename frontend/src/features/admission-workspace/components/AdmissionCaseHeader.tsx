import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  Circle,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import type { AdmissionCaseWorkspace } from "../../../types/domain";
import {
  caseStatusLabel,
  formatProgressLabel,
  progressPercent,
  stageLabel,
} from "../utils";

// ─── Sub-component: Page Header (breadcrumb + title + back) ─────────────────

type AdmissionCasePageHeaderProps = {
  candidateName: string;
  backHref?: string | null;
};

export function AdmissionCasePageHeader({
  candidateName,
  backHref,
}: AdmissionCasePageHeaderProps) {
  return (
    <div className="admission-page-header">
      {/* Breadcrumb */}
      <nav className="admission-breadcrumb" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
          <li>Pipeline</li>
          <li aria-hidden="true">
            <ChevronRight className="h-3 w-3" />
          </li>
          <li>Admissão</li>
          <li aria-hidden="true">
            <ChevronRight className="h-3 w-3" />
          </li>
          <li className="font-semibold text-[hsl(var(--text))]">{candidateName}</li>
        </ol>
      </nav>

      {/* Title row */}
      <div className="mt-2 flex items-start gap-3">
        {backHref ? (
          <Link
            to={backHref}
            aria-label="Voltar"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] shadow-sm transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--text))]">
            Admissão de {candidateName}
          </h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--text-muted))]">
            Checklist documental e preparação para integração
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: Horizontal Summary Bar ───────────────────────────────────

type AdmissionCaseSummaryBarProps = {
  workspace: AdmissionCaseWorkspace;
  openPageHref?: string | null;
};

export function AdmissionCaseSummaryBar({
  workspace,
  openPageHref,
}: AdmissionCaseSummaryBarProps) {
  const progress = progressPercent(
    workspace.checklist.approved,
    workspace.checklist.total,
  );

  return (
    <section className="admission-summary-bar" aria-label="Resumo do caso de admissão">
      {/* Candidate block */}
      <div className="admission-summary-bar__block">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-sm font-bold text-[hsl(var(--brand-dark))] ring-2 ring-[hsl(var(--primary))]/12"
          >
            {workspace.candidate.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">
              {workspace.candidate.name}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-[hsl(var(--text-muted))]">
              <BriefcaseBusiness className="h-3 w-3 shrink-0" aria-hidden="true" />
              {workspace.job.title}
            </p>
          </div>
        </div>
      </div>

      <div className="admission-summary-bar__divider" role="separator" />

      {/* Active job block */}
      <div className="admission-summary-bar__block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
          Vaga ativa
        </p>
        <p className="mt-1 text-sm font-medium text-[hsl(var(--text))]">
          {workspace.job.title}
        </p>
      </div>

      <div className="admission-summary-bar__divider" role="separator" />

      {/* Current stage block */}
      <div className="admission-summary-bar__block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
          Etapa atual
        </p>
        <div className="mt-1">
          <Badge variant={workspace.summary.ready_for_export ? "success" : "warning"}>
            {workspace.summary.ready_for_export
              ? "Pronto para exportação"
              : stageLabel(workspace.case.current_stage) + " em andamento"}
          </Badge>
        </div>
      </div>

      <div className="admission-summary-bar__divider" role="separator" />

      {/* Checklist progress block */}
      <div className="admission-summary-bar__block admission-summary-bar__block--progress">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
          Progresso do checklist
        </p>
        <div className="mt-2 flex items-center gap-3">
          {/* Circular progress indicator */}
          <div className="relative h-9 w-9 shrink-0" aria-hidden="true">
            <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="3"
              />
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke="hsl(var(--brand-dark))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(progress / 100) * 94.2} 94.2`}
                className="transition-all duration-500"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[hsl(var(--text))]">
              {formatProgressLabel(workspace.checklist.approved, workspace.checklist.total)}
            </p>
            <p className="text-xs text-[hsl(var(--text-muted))]">
              documentos aprovados
            </p>
          </div>
        </div>
      </div>

      {/* Actions block */}
      <div className="admission-summary-bar__actions">
        {workspace.summary.ready_for_export ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--success-soft))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--success))]">
            <Circle className="h-2 w-2 fill-current" aria-hidden="true" />
            {caseStatusLabel(workspace.case.status)}
          </span>
        ) : null}
        {openPageHref ? (
          <Link
            to={openPageHref}
            className="ui-btn-primary inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold"
          >
            Ver perfil do candidato
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// ─── Main export (legacy compat: wraps both sub-components) ──────────────────

type AdmissionCaseHeaderProps = {
  workspace: AdmissionCaseWorkspace;
  openPageHref?: string | null;
};

export function AdmissionCaseHeader({
  workspace,
  openPageHref,
}: AdmissionCaseHeaderProps) {
  return (
    <div className="space-y-4">
      <AdmissionCasePageHeader candidateName={workspace.candidate.name} />
      <AdmissionCaseSummaryBar workspace={workspace} openPageHref={openPageHref} />
    </div>
  );
}
