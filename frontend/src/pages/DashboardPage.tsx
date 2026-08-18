import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { RecruitmentTrendsChartCard } from "../features/dashboard/components/RecruitmentTrendsChartCard";
import { RhBiSummaryCards } from "../features/rh-dashboard/components/RhBiSummaryCards";
import { RecruitmentPipelineFunnelCard } from "../features/rh-dashboard/components/RecruitmentPipelineFunnelCard";
import { UpcomingInterviewsCard } from "../features/rh-dashboard/components/UpcomingInterviewsCard";
import { ActiveJobsCard } from "../features/rh-dashboard/components/ActiveJobsCard";
import { PendingApprovalsCard } from "../features/rh-dashboard/components/PendingApprovalsCard";
import { EmptyState } from "../components/common/EmptyState";
import {
  rhDashboardService,
  type RhDashboardPipelineFunnelResponse,
  type RhDashboardResponse,
  type RhDashboardTrendsResponse,
} from "../services/rhDashboardService";
import { pipelineService, type PipelineJobSummary } from "../services/pipelineService";
import { agendaService } from "../services/agendaService";
import type { InterviewSchedule } from "../types/agenda";
import { cn } from "../lib/utils";

const UPCOMING_INTERVIEW_STATUSES = new Set(["scheduled", "rescheduled"]);

function upcomingInterviewsQuery() {
  return { date_from: new Date().toISOString(), page_size: 20 };
}

function selectUpcomingInterviews(interviews: InterviewSchedule[]) {
  return interviews
    .filter((interview) => UPCOMING_INTERVIEW_STATUSES.has(interview.status))
    .slice(0, 5);
}

export function DashboardPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14);

  const [trendsData, setTrendsData] = useState<RhDashboardTrendsResponse | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState(false);

  const [funnelData, setFunnelData] = useState<RhDashboardPipelineFunnelResponse | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelError, setFunnelError] = useState(false);

  const [dashboardData, setDashboardData] = useState<RhDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);

  const [jobs, setJobs] = useState<PipelineJobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(false);

  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [interviewsError, setInterviewsError] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const loadTrends = (selectedDays: 7 | 14 | 30, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setTrendsLoading(true);
    setTrendsError(false);

    rhDashboardService
      .getTrends(selectedDays)
      .then(setTrendsData)
      .catch(() => setTrendsError(true))
      .finally(() => {
        setTrendsLoading(false);
      });
  };

  const loadFunnel = () => {
    setFunnelLoading(true);
    setFunnelError(false);

    rhDashboardService
      .getPipelineFunnel()
      .then(setFunnelData)
      .catch(() => setFunnelError(true))
      .finally(() => setFunnelLoading(false));
  };

  const loadDashboard = () => {
    setDashboardLoading(true);
    setDashboardError(false);

    return rhDashboardService
      .getDashboard()
      .then(setDashboardData)
      .catch(() => setDashboardError(true))
      .finally(() => setDashboardLoading(false));
  };

  const loadJobs = () => {
    setJobsLoading(true);
    setJobsError(false);

    return pipelineService
      .listPipelineJobs()
      .then(setJobs)
      .catch(() => setJobsError(true))
      .finally(() => setJobsLoading(false));
  };

  const loadInterviews = () => {
    setInterviewsLoading(true);
    setInterviewsError(false);

    return agendaService
      .listInterviews(upcomingInterviewsQuery())
      .then((response) => setInterviews(selectUpcomingInterviews(response.data)))
      .catch(() => setInterviewsError(true))
      .finally(() => setInterviewsLoading(false));
  };

  useEffect(() => {
    loadTrends(days);
  }, [days]);

  useEffect(() => {
    loadFunnel();
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadJobs();
    void loadInterviews();
  }, []);

  const handleRefreshAll = () => {
    setRefreshing(true);
    void Promise.allSettled([
      rhDashboardService.getTrends(days).then(setTrendsData),
      rhDashboardService.getPipelineFunnel().then(setFunnelData),
      rhDashboardService.getDashboard().then(setDashboardData),
      pipelineService.listPipelineJobs().then(setJobs),
      agendaService
        .listInterviews(upcomingInterviewsQuery())
        .then((response) => setInterviews(selectUpcomingInterviews(response.data))),
    ]).finally(() => setRefreshing(false));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-12">
      {/* Top Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl flex items-center gap-2">
            Dashboard de recrutamento
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            Acompanhe o que precisa de atenção, com dados atualizados da operação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={refreshing}
            aria-label="Atualizar dados do dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-50"
            title="Atualizar dados em tempo real"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-indigo-600")} />
          </button>
          <Link
            to="/vagas"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--brand))] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[hsl(var(--brand-dark))]"
          >
            <Plus className="h-4 w-4" />
            Nova vaga
          </Link>
        </div>
      </div>

      {/* First visual: activity trend overview */}
      <RecruitmentTrendsChartCard
        data={trendsData}
        days={days}
        loading={trendsLoading}
        error={trendsError}
        onSelectDays={setDays}
        onRetry={() => loadTrends(days)}
      />

      {dashboardLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Carregando indicadores">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl border border-border/80 bg-surface-muted" />
          ))}
        </div>
      ) : dashboardError ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
          <EmptyState
            icon="!"
            title="Não foi possível carregar os indicadores operacionais."
            description="Tente atualizar os dados novamente."
            action={{ label: "Tentar novamente", onClick: () => void loadDashboard() }}
          />
        </section>
      ) : dashboardData ? (
        <RhBiSummaryCards summary={dashboardData.summary} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <UpcomingInterviewsCard
          interviews={interviews}
          loading={interviewsLoading}
          error={interviewsError}
          onRetry={() => void loadInterviews()}
        />

        {dashboardLoading ? (
          <div className="h-80 animate-pulse rounded-xl border border-border/80 bg-surface-muted" />
        ) : dashboardError || !dashboardData ? (
          <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <EmptyState
              icon="!"
              title="Não foi possível carregar as pendências do dia."
              description="Tente atualizar os dados novamente."
              action={{ label: "Tentar novamente", onClick: () => void loadDashboard() }}
            />
          </section>
        ) : (
          <PendingApprovalsCard actions={dashboardData.pending_actions} />
        )}
      </div>

      <ActiveJobsCard
        jobs={jobs}
        loading={jobsLoading}
        error={jobsError}
        onRetry={() => void loadJobs()}
      />

      {/* Pipeline funnel */}
      <RecruitmentPipelineFunnelCard
        data={funnelData}
        loading={funnelLoading}
        error={funnelError}
        onRetry={loadFunnel}
      />
    </div>
  );
}
