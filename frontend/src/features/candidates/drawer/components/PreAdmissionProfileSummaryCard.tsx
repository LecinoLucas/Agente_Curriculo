import { ArrowRight, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCards } from "@/components/common/Skeleton";
import { admissionWorkspaceService } from "../../../../services/admissionWorkspaceService";
import { formatContextError } from "../../../../services/errorMessages";
import type {
  AdmissionCaseOverview,
  AdmissionWorkspaceCaseStatus,
} from "../../../../types/domain";

type PreAdmissionProfileSummaryCardProps = {
  caseId: string;
};

type ProtheusSummary = {
  label: string;
  tone: "neutral" | "info" | "success" | "danger";
};

const TITLE_BY_STATUS: Record<string, string> = {
  draft: "Pré-admissão pendente",
  offer_preparing: "Pré-admissão em andamento",
  offer_sent: "Pré-admissão em andamento",
  offer_accepted: "Pré-admissão em andamento",
  offer_declined: "Pré-admissão pendente",
  documents_pending: "Pré-admissão em andamento",
  documents_received: "Pré-admissão em andamento",
  ready_for_admission: "Pré-admissão pronta para exportação",
  admitted: "Pré-admissão concluída",
  cancelled: "Pré-admissão cancelada",
  in_progress: "Pré-admissão em andamento",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  offer_preparing: "Preparando oferta",
  offer_sent: "Oferta enviada",
  offer_accepted: "Oferta aceita",
  offer_declined: "Oferta recusada",
  documents_pending: "Documentos pendentes",
  documents_received: "Documentos recebidos",
  ready_for_admission: "Pronto para admissão",
  admitted: "Admitido",
  cancelled: "Cancelado",
  in_progress: "Em andamento",
};

function resolveTitle(status: AdmissionWorkspaceCaseStatus): string {
  return TITLE_BY_STATUS[status] ?? "Pré-admissão em andamento";
}

function resolveStatusLabel(status: AdmissionWorkspaceCaseStatus): string {
  return STATUS_LABEL[status] ?? "Em andamento";
}

function resolveProtheusSummary(overview: AdmissionCaseOverview): ProtheusSummary {
  const state = overview.integration_status.state;
  if (state === "completed") {
    return { label: overview.integration_status.label, tone: "success" };
  }
  if (state === "error") {
    return { label: overview.integration_status.label, tone: "danger" };
  }
  if (state === "ready") {
    return { label: overview.integration_status.label, tone: "info" };
  }
  return { label: overview.integration_status.label, tone: "neutral" };
}

function StatusChip({ children, tone }: { children: React.ReactNode; tone: ProtheusSummary["tone"] }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/50"
      : tone === "danger"
        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/50"
        : tone === "info"
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700/50"
          : "bg-surface-muted text-text ring-1 ring-[hsl(var(--border))]";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="bg-surface shadow-sm text-text rounded-2xl border border-border p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-muted" />
          <div className="space-y-2">
            <div className="h-4 w-56 animate-pulse rounded bg-surface-muted" />
            <div className="h-3 w-72 animate-pulse rounded bg-surface-muted" />
          </div>
        </div>
      </div>
      <SkeletonCards count={1} columns={1} />
    </div>
  );
}

export function PreAdmissionProfileSummaryCard({ caseId }: PreAdmissionProfileSummaryCardProps) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdmissionCaseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await admissionWorkspaceService.getOverview(caseId);
      setOverview(payload);
    } catch (requestError) {
      setError(
        formatContextError(
          requestError,
          "Não foi possível carregar o resumo da pré-admissão.",
          "Abra a tela dedicada para tentar novamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const targetHref = useMemo(() => `/admissao/${caseId}`, [caseId]);

  if (loading) {
    return <LoadingState />;
  }

  if (error || !overview) {
    return (
      <div
        className="bg-surface shadow-sm text-text rounded-2xl border border-border p-6"
        data-testid="pre-admission-profile-summary-error"
      >
        <EmptyState
          icon="⚠️"
          title="Resumo indisponível"
          description={error ?? "Não foi possível carregar o resumo do caso."}
          action={{
            label: "Abrir tela de pré-admissão",
            onClick: () => navigate(targetHref),
          }}
        />
      </div>
    );
  }

  const title = resolveTitle(overview.case.status);
  const statusLabel = resolveStatusLabel(overview.case.status);
  const protheus = resolveProtheusSummary(overview);
  const jobTitle = overview.job.title || "Vaga vinculada não identificada";
  const checklistTotal = overview.progress.total;
  const checklistApproved = overview.progress.approved;
  const progressPercent =
    checklistTotal > 0 ? Math.round((checklistApproved / checklistTotal) * 100) : 0;
  const mainBlocker = overview.main_blocker;

  return (
    <section
      data-testid="pre-admission-profile-summary"
      className="bg-surface text-text relative overflow-hidden rounded-2xl border border-border p-5 shadow-sm lg:p-6"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-lg font-semibold tracking-tight text-text">
              {title}
            </h3>
            <p className="text-sm text-text-muted">
              Essa etapa possui uma tela própria para checklist, documentos e integração Protheus.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <StatusChip tone="info">{statusLabel}</StatusChip>
          <StatusChip tone={protheus.tone}>Protheus: {protheus.label}</StatusChip>
        </div>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border)/0.6)] py-1.5 md:border-none">
          <dt className="text-text-muted">Vaga vinculada</dt>
          <dd className="truncate text-right font-medium text-text" title={jobTitle}>
            {jobTitle}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border)/0.6)] py-1.5 md:border-none">
          <dt className="text-text-muted">Checklist</dt>
          <dd className="text-right font-medium text-text">
            <span data-testid="pre-admission-summary-progress">
              {checklistApproved}/{checklistTotal}
            </span>{" "}
            <span className="text-text-muted">documentos aprovados</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border)/0.6)] py-1.5 md:border-none">
          <dt className="text-text-muted">Pendência principal</dt>
          <dd className="text-right font-medium text-text">
            {mainBlocker ? mainBlocker.title : "Sem pendências críticas"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-text-muted">Status Protheus</dt>
          <dd className="text-right font-medium text-text">{protheus.label}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-[hsl(var(--primary))] transition-all"
            style={{ width: `${progressPercent}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="mt-1 text-xs text-text-muted">
          {checklistApproved} de {checklistTotal} itens concluídos
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          to={targetHref}
          data-testid="pre-admission-summary-open-cta"
          className="bg-[hsl(var(--primary))] text-white hover:opacity-90 transition inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
        >
          Abrir tela de pré-admissão
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
