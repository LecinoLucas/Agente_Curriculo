import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { SkeletonRows } from "../components/common/Skeleton";
import { useAuth } from "../features/auth/useAuth";
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

type SummaryKey = keyof RhDashboardResponse["summary"];
type FilterKey = "all" | "interviews" | "decisions" | "preAdmission";

type SummaryCard = {
  key: SummaryKey;
  label: string;
  icon: ElementType;
  href: string;
  iconClassName: string;
  borderClassName: string;
};

type QuickAction = {
  label: string;
  href: string;
  icon: ElementType;
  className: string;
};

const EMPTY_SUMMARY: RhDashboardResponse["summary"] = {
  new_candidates: 0,
  interviews_today: 0,
  pending_decisions: 0,
  pending_pre_admissions: 0,
  admitted_this_month: 0,
};

const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: "new_candidates",
    label: "Candidatos novos",
    icon: Users,
    href: "/candidaturas",
    iconClassName: "bg-rose-50 text-rose-700 ring-rose-100",
    borderClassName: "border-b-rose-500",
  },
  {
    key: "interviews_today",
    label: "Entrevistas hoje",
    icon: Calendar,
    href: "/agenda",
    iconClassName: "bg-violet-50 text-violet-700 ring-violet-100",
    borderClassName: "border-b-violet-500",
  },
  {
    key: "pending_decisions",
    label: "Aguardando decisão",
    icon: ClipboardList,
    href: "/pipeline",
    iconClassName: "bg-amber-50 text-amber-700 ring-amber-100",
    borderClassName: "border-b-amber-500",
  },
  {
    key: "pending_pre_admissions",
    label: "Pré-admissões pendentes",
    icon: FileCheck2,
    href: "/admitidos",
    iconClassName: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    borderClassName: "border-b-emerald-500",
  },
  {
    key: "admitted_this_month",
    label: "Admitidos no mês",
    icon: CheckCircle2,
    href: "/admitidos",
    iconClassName: "bg-sky-50 text-sky-700 ring-sky-100",
    borderClassName: "border-b-sky-500",
  },
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Abrir Candidaturas",
    href: "/candidaturas",
    icon: Users,
    className: "bg-rose-50 text-rose-800 hover:bg-rose-100",
  },
  {
    label: "Abrir Agenda",
    href: "/agenda",
    icon: Calendar,
    className: "bg-violet-50 text-violet-800 hover:bg-violet-100",
  },
  {
    label: "Abrir Pipeline",
    href: "/pipeline",
    icon: ClipboardList,
    className: "bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  {
    label: "Abrir Pré-admissão",
    href: "/admitidos",
    icon: FileCheck2,
    className: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
];

const STAFF_MENU = [
  { label: "Dashboard", href: "/rh", icon: LayoutDashboard, active: true },
  { label: "Candidaturas", href: "/candidaturas", icon: Users },
  { label: "Agenda", href: "/agenda", icon: Calendar },
  { label: "Pipeline", href: "/pipeline", icon: ClipboardList },
  { label: "Pré-admissão", href: "/admitidos", icon: FileCheck2 },
  { label: "Segurança", href: "/admin/auditoria", icon: ShieldCheck },
  { label: "Configurações", href: "/admin/cadastros", icon: Settings },
  { label: "Relatórios", href: "/admin/bi", icon: BarChart3 },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isInterviewAction(action: RhDashboardPendingAction) {
  return action.type === "interview_today" || action.type === "schedule_interview";
}

function isDecisionAction(action: RhDashboardPendingAction) {
  return action.type === "register_decision";
}

function isPreAdmissionAction(action: RhDashboardPendingAction) {
  return action.type === "start_pre_admission" || action.type === "document_pending";
}

function filterActions(actions: RhDashboardPendingAction[], filter: FilterKey) {
  if (filter === "interviews") return actions.filter(isInterviewAction);
  if (filter === "decisions") return actions.filter(isDecisionAction);
  if (filter === "preAdmission") return actions.filter(isPreAdmissionAction);
  return actions;
}

function buildFilterCounts(actions: RhDashboardPendingAction[]) {
  return {
    all: actions.length,
    interviews: actions.filter(isInterviewAction).length,
    decisions: actions.filter(isDecisionAction).length,
    preAdmission: actions.filter(isPreAdmissionAction).length,
  };
}

function buildFlowItems(summary: RhDashboardResponse["summary"], actions: RhDashboardPendingAction[]) {
  const items = [
    {
      label: "Triagem",
      value: summary.new_candidates + actions.filter((action) => action.type === "awaiting_ai").length,
      className: "bg-rose-500",
    },
    {
      label: "Entrevista",
      value: summary.interviews_today + actions.filter(isInterviewAction).length,
      className: "bg-violet-500",
    },
    {
      label: "Decisão",
      value: summary.pending_decisions + actions.filter(isDecisionAction).length,
      className: "bg-amber-500",
    },
    {
      label: "Pré-admissão",
      value: summary.pending_pre_admissions + actions.filter(isPreAdmissionAction).length,
      className: "bg-emerald-500",
    },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return { items, total };
}

function StaffSidebarMarkers() {
  return (
    <div className="sr-only" aria-hidden="true">
      {STAFF_MENU.map((item) => (
        <span key={item.href}>
          {item.label}
        </span>
      ))}
      <span>Sair</span>
    </div>
  );
}

function DashboardHeader() {
  const { user } = useAuth();
  const profileName = user?.full_name || user?.email || "RH";
  const initials = getInitials(profileName) || "RH";

  return (
    <header className="flex flex-col gap-4 pt-12 lg:pt-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-700">Dashboard operacional</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text sm:text-3xl">Central RH</h1>
        <p className="mt-1 text-sm text-text-muted sm:text-base">Veja o que precisa de atenção hoje.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <span className="sr-only">Busca global</span>
          <input
            type="search"
            placeholder="Buscar candidatos, vagas..."
            className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
          />
        </label>
        <button
          type="button"
          aria-label="Notificações"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-rose-100"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
        <Link
          to="/perfil"
          aria-label={`Perfil de ${profileName}`}
          className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-rose-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-700 text-xs font-bold text-white">
            {initials}
          </span>
          <span className="hidden max-w-32 truncate sm:block">{profileName}</span>
        </Link>
      </div>
    </header>
  );
}

function DashboardMetricCard({ card, value }: { card: SummaryCard; value: number }) {
  const Icon = card.icon;

  return (
    <Link
      to={card.href}
      className={cn(
        "group flex min-h-[9rem] flex-col justify-between rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-100 border-b-4",
        card.borderClassName,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", card.iconClassName)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight
          className="h-4 w-4 text-text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div>
        <strong className="block text-3xl font-semibold tracking-tight text-text">{value}</strong>
        <span className="mt-1 block text-sm font-semibold text-text">{card.label}</span>
        <span className="mt-1 block text-xs text-text-muted">Sem alteração</span>
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

function ActionIcon({ type }: { type: string }) {
  const Icon = isInterviewAction({ type } as RhDashboardPendingAction)
    ? Calendar
    : isDecisionAction({ type } as RhDashboardPendingAction)
      ? Check
      : ClipboardCheck;

  return <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />;
}

function PendingTaskRow({ action }: { action: RhDashboardPendingAction }) {
  const initials = getInitials(action.candidate_name) || "RH";

  return (
    <div
      className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(13rem,1.15fr)_minmax(11rem,1fr)_minmax(9rem,0.9fr)_minmax(12rem,1fr)_auto] md:items-center"
      data-testid={`rh-pending-${action.type}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-bold text-text">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{action.candidate_name}</p>
          <p className="mt-0.5 truncate text-xs text-text-muted">{action.label}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{action.job_title ?? "Sem vaga vinculada"}</p>
        <p className="mt-0.5 text-xs text-text-muted">Vaga</p>
      </div>
      <PendingBadge type={action.type} />
      <div className="flex min-w-0 items-center gap-2">
        <ActionIcon type={action.type} />
        <p className="truncate text-sm font-medium text-text">{action.label}</p>
      </div>
      <Link
        to={action.href}
        className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-rose-100"
      >
        {action.action_label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function PendingTaskCard({ action }: { action: RhDashboardPendingAction }) {
  const initials = getInitials(action.candidate_name) || "RH";

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm" data-testid={`rh-pending-mobile-${action.type}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-bold text-text">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{action.candidate_name}</p>
          <p className="mt-0.5 truncate text-xs text-text-muted">{action.job_title ?? "Sem vaga vinculada"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PendingBadge type={action.type} />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
          <ActionIcon type={action.type} />
          {action.label}
        </span>
      </div>
      <Link
        to={action.href}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-200"
      >
        {action.action_label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}

function DailyPendingTasksCard({ actions }: { actions: RhDashboardPendingAction[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAll, setShowAll] = useState(false);
  const counts = useMemo(() => buildFilterCounts(actions), [actions]);
  const filteredActions = useMemo(() => filterActions(actions, filter), [actions, filter]);
  const visibleActions = showAll ? filteredActions : filteredActions.slice(0, 6);
  const hasHiddenActions = filteredActions.length > visibleActions.length;

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "Todas" },
    { key: "interviews", label: "Entrevistas" },
    { key: "decisions", label: "Decisões" },
    { key: "preAdmission", label: "Pré-admissão" },
  ];

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text">Pendências do dia</h2>
          <p className="mt-1 text-sm text-text-muted">Candidaturas, entrevistas e decisões que pedem atenção.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filtros de pendências">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setFilter(item.key);
                setShowAll(false);
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-rose-100",
                filter === item.key
                  ? "border-rose-700 bg-rose-700 text-white"
                  : "border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", filter === item.key ? "bg-white/20" : "bg-surface-muted")}>
                {counts[item.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visibleActions.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block" data-testid="rh-pending-list">
            <div className="min-w-[58rem] xl:min-w-0">
              <div className="grid grid-cols-[minmax(13rem,1.15fr)_minmax(11rem,1fr)_minmax(9rem,0.9fr)_minmax(12rem,1fr)_auto] gap-3 border-b border-border/70 bg-surface-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span>Candidato</span>
                <span>Vaga</span>
                <span>Pendência</span>
                <span>Próxima ação</span>
                <span>Atalho</span>
              </div>
              {visibleActions.map((action) => (
                <PendingTaskRow key={`${action.type}-${action.candidate_id}-${action.href}`} action={action} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {visibleActions.map((action) => (
              <PendingTaskCard key={`${action.type}-${action.candidate_id}-${action.href}`} action={action} />
            ))}
          </div>

          {hasHiddenActions ? (
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                Ver todas as pendências
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon="0"
          title="Nenhuma pendência para hoje."
          description="Tudo certo por enquanto."
        />
      )}
    </section>
  );
}

function QuickActionsCard() {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight text-text">Ações rápidas</h2>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              to={action.href}
              className={cn(
                "group flex min-h-16 items-center justify-between gap-3 rounded-lg border border-transparent p-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-rose-100",
                action.className,
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{action.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FlowSummaryCard({ summary, actions }: { summary: RhDashboardResponse["summary"]; actions: RhDashboardPendingAction[] }) {
  const flow = useMemo(() => buildFlowItems(summary, actions), [summary, actions]);

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight text-text">Resumo do fluxo</h2>
      {flow.total > 0 ? (
        <div className="mt-4 space-y-4">
          {flow.items.map((item) => {
            const percentage = Math.round((item.value / flow.total) * 100);

            return (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-text">{item.label}</span>
                  <span className="text-xs font-semibold text-text-muted">{percentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className={cn("h-full rounded-full", item.className)} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-muted px-3 py-4 text-sm text-text-muted">
          Resumo indisponível no momento.
        </p>
      )}
    </section>
  );
}

function AlertsCard({ summary }: { summary: RhDashboardResponse["summary"] }) {
  const alerts = [
    summary.pending_decisions > 0 ? `${summary.pending_decisions} candidatura(s) aguardando decisão.` : null,
    summary.interviews_today > 0 ? `${summary.interviews_today} entrevista(s) agendada(s) para hoje.` : null,
    summary.pending_pre_admissions > 0 ? `${summary.pending_pre_admissions} pré-admissão(ões) pendente(s).` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight text-text">Alertas</h2>
      {alerts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <li key={alert} className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{alert}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-muted px-3 py-4 text-sm text-text-muted">
          Nenhum alerta crítico no momento.
        </p>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-14">
      <StaffSidebarMarkers />
      <DashboardHeader />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.key} className="h-36 animate-pulse rounded-lg bg-surface-muted/70" />
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
          setError(formatContextError(err, "Não conseguimos carregar a Central RH agora."));
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
  const summary = data?.summary ?? EMPTY_SUMMARY;

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-14">
        <StaffSidebarMarkers />
        <DashboardHeader />
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon="!"
            title="Não conseguimos carregar a Central RH agora."
            description={error}
            action={{ label: "Tentar novamente", onClick: () => window.location.reload() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-14">
      <StaffSidebarMarkers />
      <DashboardHeader />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="rh-summary-cards">
        {SUMMARY_CARDS.map((card) => (
          <DashboardMetricCard key={card.key} card={card} value={summary[card.key]} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DailyPendingTasksCard actions={pendingActions} />
        <aside className="grid auto-rows-max gap-4">
          <QuickActionsCard />
          <FlowSummaryCard summary={summary} actions={pendingActions} />
          <AlertsCard summary={summary} />
        </aside>
      </div>
    </div>
  );
}
