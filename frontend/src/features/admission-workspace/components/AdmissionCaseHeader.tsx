import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  FolderClock,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import type { AdmissionCaseWorkspace } from "../../../types/domain";
import {
  caseStatusLabel,
  formatDateTime,
  formatProgressLabel,
  progressPercent,
  stageLabel,
} from "../utils";

type AdmissionCaseHeaderProps = {
  workspace: AdmissionCaseWorkspace;
  openPageHref?: string | null;
};

export function AdmissionCaseHeader({
  workspace,
  openPageHref,
}: AdmissionCaseHeaderProps) {
  const progress = progressPercent(
    workspace.checklist.approved,
    workspace.checklist.total,
  );

  return (
    <section className="admission-executive-header overflow-hidden">
      <div className="border-b border-[hsl(var(--border))]/55 bg-[hsl(var(--nav-bg))] px-5 py-4 text-[hsl(var(--nav-text))]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--nav-muted))]">
              Cockpit admissional
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              {workspace.candidate.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={workspace.summary.ready_for_export ? "success" : "warning"}>
              {workspace.summary.ready_for_export ? "Pronto para exportação" : "Em preparação"}
            </Badge>
            <Badge variant="outline">{caseStatusLabel(workspace.case.status)}</Badge>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[hsl(var(--accent-soft))] text-lg font-semibold text-[hsl(var(--brand-dark))] ring-1 ring-[hsl(var(--primary))]/15">
                {workspace.candidate.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[hsl(var(--text-muted))]">
                  <span className="inline-flex items-center gap-2">
                    <BriefcaseBusiness className="h-4 w-4" />
                    {workspace.job.title}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <FolderClock className="h-4 w-4" />
                    Etapa atual: {stageLabel(workspace.case.current_stage)}
                  </span>
                  {workspace.summary.responsible_name ? (
                    <span className="inline-flex items-center gap-2">
                      <UserRound className="h-4 w-4" />
                      Responsável: {workspace.summary.responsible_name}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="admission-row-strong mt-5 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                    Progresso do checklist
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-[hsl(var(--text))]">
                      {formatProgressLabel(
                        workspace.checklist.approved,
                        workspace.checklist.total,
                      )}
                    </span>
                    <span className="text-sm text-[hsl(var(--text-muted))]">
                      itens concluídos
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm text-[hsl(var(--text-muted))]">
                  <p className="inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Atualizado em {formatDateTime(workspace.case.updated_at)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[hsl(var(--border))]/60">
                <div
                  className="h-full rounded-full bg-[hsl(var(--brand-dark))] transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="admission-metric p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                  Documentos
                </p>
                <p className="mt-1 text-xl font-semibold text-[hsl(var(--text))]">
                  {workspace.documents.length}
                </p>
              </div>
              <div className="admission-metric p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                  Pendências
                </p>
                <p className="mt-1 text-xl font-semibold text-[hsl(var(--text))]">
                  {workspace.main_blockers.length}
                </p>
              </div>
              <div className="admission-metric p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                  Gate
                </p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text))]">
                  <ShieldCheck className="h-4 w-4 text-[hsl(var(--primary))]" />
                  {workspace.summary.ready_for_export ? "Liberado" : "Bloqueado"}
                </p>
              </div>
            </div>
          </div>

          {openPageHref ? (
            <Link
              to={openPageHref}
              className="ui-btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
            >
              Abrir tela
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
