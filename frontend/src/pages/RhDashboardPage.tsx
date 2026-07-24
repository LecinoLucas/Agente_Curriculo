import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Loader2,
  RefreshCw,
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
import { RhBiSummaryCards } from "../features/rh-dashboard/components/RhBiSummaryCards";
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

type FilterKey = "all" | "interviews" | "decisions" | "preAdmission";

type QuickAction = {
  label: string;
  href: string;
  icon: ElementType;
};

const EMPTY_SUMMARY: RhDashboardResponse["summary"] = {
  new_candidates: 0,
  interviews_today: 0,
  pending_decisions: 0,
  pending_pre_admissions: 0,
  admitted_this_month: 0,
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Abrir Candidaturas",
    href: "/candidaturas",
    icon: Users,
  },
  {
    label: "Abrir Agenda",
    href: "/agenda",
    icon: Calendar,
  },
  {
    label: "Abrir Pipeline",
    href: "/pipeline",
    icon: ClipboardList,
  },
  {
    label: "Abrir Pré-admissão",
    href: "/admitidos",
    icon: FileCheck2,
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

function StaffSidebarMarkers() {
  return (
    <div className="sr-only" aria-hidden="true">
      {STAFF_MENU.map((item) => (
        <span key={item.href}>{item.label}</span>
      ))}
      <span>Sair</span>
    </div>
  );
}

function DashboardHeader({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing: boolean }) {
  const { user } = useAuth();
  const profileName = user?.full_name || user?.email || "RH";
  const initials = getInitials(profileName) || "RH";

  return (
    <header className="flex flex-col gap-4 pt-10 lg:pt-2 xl:flex-row xl:items-center xl:justify-between border-b border-border pb-5">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Painel de Controle</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">Central RH</h1>
        <p className="mt-1 text-sm text-text-muted">Veja o que precisa de atenção hoje.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <label className="relative block min-w-0 sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <span className="sr-only">Busca global</span>
          <input
            type="search"
            placeholder="Buscar candidatos, vagas..."
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Atualizar dados"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-brand")} />
        </button>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notificações"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Profile */}
        <Link
          to="/perfil"
          aria-label={`Perfil de ${profileName}`}
          className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
            {initials}
          </span>
          <span className="hidden max-w-32 truncate sm:block">{profileName}</span>
        </Link>
      </div>
    </header>
  );
}

function PendingBadge({ type }: { type: string }) {
  const tone = DASHBOARD_PENDING_ACTION_TONE_CLASSES[type] ?? "border-border bg-surface-muted text-text-muted";

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
      className="grid gap-3 border-b border-border/70 px-4 py-3.5 transition-colors hover:bg-surface-muted/40 last:border-b-0 md:grid-cols-[minmax(13rem,1.15fr)_minmax(11rem,1fr)_minmax(9rem,0.9fr)_minmax(12rem,1fr)_auto] md:items-center"
      data-testid={`rh-pending-${action.type}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-xs font-bold text-text">
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
        className="inline-flex h-8 w-fit items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand/20"
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
    <article className="rounded-lg border border-border bg-surface p-4" data-testid={`rh-pending-mobile-${action.type}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-xs font-bold text-text">
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
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand/20"
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
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-bold tracking-tight text-text">Pendências do dia</h2>
          <p className="mt-0.5 text-xs text-text-muted">Candidaturas, entrevistas e decisões que pedem atenção.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Filtros de pendências">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setFilter(item.key);
                setShowAll(false);
              }}
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand/20",
                filter === item.key
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              {item.label}
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", filter === item.key ? "bg-white/20 text-white" : "bg-surface-muted text-text-muted")}>
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
              <div className="grid grid-cols-[minmax(13rem,1.15fr)_minmax(11rem,1fr)_minmax(9rem,0.9fr)_minmax(12rem,1fr)_auto] gap-3 border-b border-border/70 bg-surface-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
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
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand/20"
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
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-base font-bold tracking-tight text-text">Ações rápidas</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              to={action.href}
              className="group flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-xs font-semibold text-text transition hover:bg-surface-muted hover:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-text-muted group-hover:text-brand" aria-hidden="true" />
                <span className="truncate">{action.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
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
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-base font-bold tracking-tight text-text">Alertas</h2>
      {alerts.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {alerts.map((alert) => (
            <li key={alert} className="flex gap-2.5 rounded-lg border border-border bg-surface-muted/60 p-3 text-xs font-medium text-text">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>{alert}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-surface-muted px-3 py-3 text-xs text-text-muted">
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
      <div className="h-20 animate-pulse rounded-xl bg-surface-muted/60" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-muted/60" />
        ))}
      </div>
      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
            Carregando Central RH...
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    rhDashboardService
      .getDashboard()
      .then((response) => {
        setData(response);
      })
      .catch((err) => {
        setError(formatContextError(err, "Não conseguimos carregar a Central RH agora."));
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const pendingActions = data?.pending_actions ?? [];
  const summary = data?.summary ?? EMPTY_SUMMARY;

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-14">
        <StaffSidebarMarkers />
        <DashboardHeader onRefresh={() => fetchDashboardData(true)} isRefreshing={refreshing} />
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon="!"
            title="Não conseguimos carregar a Central RH agora."
            description={error}
            action={{ label: "Tentar novamente", onClick: () => fetchDashboardData() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-14">
      <StaffSidebarMarkers />
      <DashboardHeader onRefresh={() => fetchDashboardData(true)} isRefreshing={refreshing} />

      {/* Summary Scorecards with 100% Real Data */}
      <RhBiSummaryCards summary={summary} />

      {/* Main Pending Grid & Sidebar */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DailyPendingTasksCard actions={pendingActions} />
        <aside className="grid auto-rows-max gap-4">
          <QuickActionsCard />
          <AlertsCard summary={summary} />
        </aside>
      </div>
    </div>
  );
}
