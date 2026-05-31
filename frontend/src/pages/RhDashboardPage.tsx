import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Loader2,
  Users,
} from "lucide-react";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SkeletonRows } from "../components/common/Skeleton";
import { cn } from "../lib/utils";
import { formatContextError } from "../services/errorMessages";
import {
  rhDashboardService,
  type RhDashboardPendingAction,
  type RhDashboardResponse,
} from "../services/rhDashboardService";
import {
  DASHBOARD_PENDING_ACTION_LABELS,
  DASHBOARD_PENDING_ACTION_TONE_CLASSES,
} from "../shared/status/statusLabels";

type SummaryCard = {
  key: keyof RhDashboardResponse["summary"];
  label: string;
  icon: ElementType;
  href: string;
  accent: string;
};

const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: "new_candidates",
    label: "Candidatos novos",
    icon: Users,
    href: "/candidaturas",
    accent: "bg-sky-500",
  },
  {
    key: "interviews_today",
    label: "Entrevistas de hoje",
    icon: Calendar,
    href: "/agenda",
    accent: "bg-violet-500",
  },
  {
    key: "pending_decisions",
    label: "Aguardando decisão",
    icon: ClipboardList,
    href: "/pipeline",
    accent: "bg-amber-500",
  },
  {
    key: "pending_pre_admissions",
    label: "Pré-admissões pendentes",
    icon: FileCheck2,
    href: "/admitidos",
    accent: "bg-emerald-600",
  },
  {
    key: "admitted_this_month",
    label: "Admitidos no mês",
    icon: CheckCircle2,
    href: "/admitidos",
    accent: "bg-indigo-600",
  },
];

const QUICK_LINKS = [
  { label: "Abrir Candidaturas", href: "/candidaturas" },
  { label: "Abrir Agenda", href: "/agenda" },
  { label: "Abrir Pipeline", href: "/pipeline" },
  { label: "Abrir Pré-admissão", href: "/admitidos" },
];

function SummaryTile({
  label,
  value,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: number;
  icon: ElementType;
  href: string;
  accent: string;
}) {
  return (
    <Link
      to={href}
      className="group flex min-h-[8rem] flex-col justify-between rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition hover:border-[hsl(var(--primary))]/35 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white", accent)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <ArrowRight
          className="h-4 w-4 text-text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div>
        <strong className="block text-2xl font-semibold tracking-tight text-text">{value}</strong>
        <span className="mt-1 block text-sm font-medium text-text-muted">{label}</span>
      </div>
    </Link>
  );
}

function PendingBadge({ type }: { type: string }) {
  const tone = DASHBOARD_PENDING_ACTION_TONE_CLASSES[type] ?? "border-sky-200 bg-sky-50 text-sky-700";

  return (
    <span className={cn("inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tone)}>
      {DASHBOARD_PENDING_ACTION_LABELS[type] ?? "Pendência"}
    </span>
  );
}

function PendingActionRow({ action }: { action: RhDashboardPendingAction }) {
  return (
    <div
      className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] md:items-center"
      data-testid={`rh-pending-${action.type}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{action.candidate_name}</p>
        <p className="mt-0.5 text-xs text-text-muted">Candidato</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{action.job_title ?? "Sem vaga vinculada"}</p>
        <p className="mt-0.5 text-xs text-text-muted">Vaga</p>
      </div>
      <PendingBadge type={action.type} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{action.label}</p>
        <p className="mt-0.5 text-xs text-text-muted">Próxima ação</p>
      </div>
      <Link
        to={action.href}
        className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/35"
      >
        {action.action_label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-2 pb-14 sm:px-0">
      <PageHeader title="Central RH" subtitle="Veja o que precisa de atenção hoje." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.key} className="h-32 animate-pulse rounded-lg bg-surface-muted/70" />
        ))}
      </div>
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando lista
          </div>
        </div>
        <SkeletonRows rows={5} />
      </section>
    </div>
  );
}

export function RhDashboardPage() {
  const [data, setData] = useState<RhDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    rhDashboardService
      .getDashboard()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatContextError(err, "Não foi possível carregar a Central RH."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const pendingActions = data?.pending_actions ?? [];
  const hasPendingActions = pendingActions.length > 0;

  const summary = useMemo(
    () =>
      data?.summary ?? {
        new_candidates: 0,
        interviews_today: 0,
        pending_decisions: 0,
        pending_pre_admissions: 0,
        admitted_this_month: 0,
      },
    [data],
  );

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-2 pb-14 sm:px-0">
        <PageHeader title="Central RH" subtitle="Veja o que precisa de atenção hoje." />
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon="!"
            title="Erro ao carregar"
            description={error}
            action={{ label: "Tentar novamente", onClick: () => window.location.reload() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-2 pb-14 sm:px-0">
      <PageHeader title="Central RH" subtitle="Veja o que precisa de atenção hoje." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="rh-summary-cards">
        {SUMMARY_CARDS.map((card) => (
          <SummaryTile
            key={card.key}
            label={card.label}
            value={summary[card.key]}
            icon={card.icon}
            href={card.href}
            accent={card.accent}
          />
        ))}
      </div>

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-text">Pendências do dia</h2>
            <p className="mt-1 text-sm text-text-muted">
              Candidaturas, entrevistas e decisões que pedem atenção.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/35"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {hasPendingActions ? (
          <div className="overflow-x-auto" data-testid="rh-pending-list">
            <div className="min-w-[56rem] md:min-w-0">
              <div className="hidden grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] gap-3 border-b border-border/70 bg-surface-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted md:grid">
                <span>Candidato</span>
                <span>Vaga</span>
                <span>Pendência</span>
                <span>Próxima ação</span>
                <span>Atalho</span>
              </div>
              {pendingActions.map((action) => (
                <PendingActionRow key={`${action.type}-${action.candidate_id}-${action.href}`} action={action} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon="0"
            title="Nenhuma pendência para hoje"
            description="Não há candidatos, entrevistas ou decisões pedindo ação neste momento."
          />
        )}
      </section>

    </div>
  );
}
