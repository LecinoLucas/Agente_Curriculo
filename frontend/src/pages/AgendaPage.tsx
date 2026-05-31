import {
  AlertCircle,
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit2,
  ExternalLink,
  Filter,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  UserRound,
  Users,
  UserX,
  Video,
  X,
} from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { AuthContext } from "../features/auth/AuthContext";
import { useGoogleCalendarConnection } from "../features/agenda/useGoogleCalendarConnection";
import { cn } from "../lib/utils";
import { agendaService } from "../services/agendaService";
import { toast } from "../shared/utils/toast";
import { InterviewSchedule, AgendaKpis, AgendaListParams } from "../types/agenda";
import { AgendaInterviewModal } from "../features/agenda/AgendaInterviewModal";
import { CancelInterviewModal } from "../features/agenda/CancelInterviewModal";
import {
  interviewFormatLabel,
  interviewStatusLabel,
  interviewTypeLabel,
  scorecardActionLabel,
  scorecardStatusLabel,
} from "../features/agenda/interviewDisplay";
import {
  INTERVIEW_FORMAT_BADGE_VARIANTS,
  INTERVIEW_STATUS_BADGE_VARIANTS,
} from "../shared/status/statusLabels";
import { canMutateAgenda } from "../shared/auth/roles";

type AgendaPeriod = "today" | "week" | "month" | "all";
type AgendaSection = {
  key: string;
  title: string;
  description: string;
  interviews: InterviewSchedule[];
  icon: typeof Calendar;
  emptyLabel?: string;
};

const TODAY = new Date();
const OPEN_STATUSES = new Set(["scheduled", "rescheduled", "awaiting_feedback"]);
const CLOSED_STATUSES = new Set(["completed", "cancelled", "no_show"]);

const PERIOD_OPTIONS: Array<{ value: AgendaPeriod; label: string; shortLabel: string }> = [
  { value: "today", label: "Hoje", shortLabel: "Hoje" },
  { value: "week", label: "Semana", shortLabel: "Semana" },
  { value: "month", label: "Mês", shortLabel: "Mês" },
  { value: "all", label: "Todas", shortLabel: "Todas" },
];

function dayStart(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, days: number) {
  const c = dayStart(d);
  c.setDate(c.getDate() + days);
  return c;
}

function startOfWeek(base: Date) {
  const d = dayStart(base);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function startOfMonth(base: Date) {
  const d = dayStart(base);
  d.setDate(1);
  return d;
}

function addMonths(base: Date, months: number) {
  const d = startOfMonth(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", options).format(
    typeof value === "string" ? new Date(value) : value
  );
}

function formatTimeRange(iv: InterviewSchedule) {
  const start = new Date(iv.scheduled_start);
  const end = new Date(iv.scheduled_end);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${time.format(start)}-${time.format(end)}`;
}

function formatPeriodLabel(period: AgendaPeriod, selected: Date) {
  if (period === "all") return "Todo o histórico";

  if (period === "today") {
    return formatDate(selected, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  if (period === "week") {
    const start = startOfWeek(selected);
    const end = addDays(start, 6);
    const startLabel = formatDate(start, { day: "2-digit", month: "short" });
    const endLabel = formatDate(end, { day: "2-digit", month: "short", year: "numeric" });
    return `${startLabel} a ${endLabel}`;
  }

  return formatDate(selected, { month: "long", year: "numeric" });
}

function buildDateParams(period: AgendaPeriod, selected: Date) {
  if (period === "all") return {};

  if (period === "today") {
    const start = dayStart(selected);
    return {
      date_from: start.toISOString(),
      date_to: addDays(start, 1).toISOString(),
    };
  }

  if (period === "week") {
    const start = startOfWeek(selected);
    return {
      date_from: start.toISOString(),
      date_to: addDays(start, 7).toISOString(),
    };
  }

  const start = startOfMonth(selected);
  return {
    date_from: start.toISOString(),
    date_to: addMonths(start, 1).toISOString(),
  };
}

function sortInterviews(interviews: InterviewSchedule[]) {
  return [...interviews].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );
}

function isSameDay(a: Date | string, b: Date) {
  return dayStart(typeof a === "string" ? new Date(a) : a).getTime() === dayStart(b).getTime();
}

function groupByDate(interviews: InterviewSchedule[]) {
  return sortInterviews(interviews).reduce<Array<{ dateKey: string; date: Date; interviews: InterviewSchedule[] }>>(
    (groups, interview) => {
      const date = dayStart(new Date(interview.scheduled_start));
      const dateKey = date.toISOString();
      const current = groups[groups.length - 1];

      if (current?.dateKey === dateKey) {
        current.interviews.push(interview);
      } else {
        groups.push({ dateKey, date, interviews: [interview] });
      }

      return groups;
    },
    []
  );
}

function getPeriodSections(interviews: InterviewSchedule[], selected: Date): AgendaSection[] {
  const now = new Date();
  const selectedDay = dayStart(selected);
  const today = sortInterviews(interviews.filter((iv) => isSameDay(iv.scheduled_start, selectedDay)));
  const overdue = sortInterviews(
    interviews.filter(
      (iv) =>
        OPEN_STATUSES.has(iv.status) &&
        new Date(iv.scheduled_start) < now &&
        !isSameDay(iv.scheduled_start, selectedDay)
    )
  );
  const upcoming = sortInterviews(
    interviews.filter(
      (iv) =>
        OPEN_STATUSES.has(iv.status) &&
        new Date(iv.scheduled_start) >= now &&
        !isSameDay(iv.scheduled_start, selected)
    )
  );
  const closed = sortInterviews(interviews.filter((iv) => CLOSED_STATUSES.has(iv.status)));

  return [
    {
      key: "today",
      title: "Hoje",
      description: "Entrevistas do dia selecionado.",
      interviews: today,
      icon: Clock,
      emptyLabel: "Sem entrevistas hoje.",
    },
    {
      key: "upcoming",
      title: "Próximas",
      description: "Compromissos ainda em aberto no período.",
      interviews: upcoming,
      icon: CalendarDays,
      emptyLabel: "Sem próximas entrevistas neste período.",
    },
    {
      key: "overdue",
      title: "Atrasadas/pendentes",
      description: "Entrevistas em aberto com horário já vencido.",
      interviews: overdue,
      icon: AlertCircle,
      emptyLabel: "Nenhuma pendência atrasada.",
    },
    {
      key: "closed",
      title: "Realizadas/canceladas",
      description: "Histórico operacional do período.",
      interviews: closed,
      icon: CheckCircle2,
      emptyLabel: "Sem entrevistas finalizadas no período.",
    },
  ];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface InterviewRowProps {
  iv: InterviewSchedule;
  canMutate: boolean;
  onEdit?: (id: string) => void;
  onCancel?: (id: string, name: string) => void;
  onComplete?: (iv: InterviewSchedule) => void;
  onNoShow?: (iv: InterviewSchedule) => void;
  onScorecard?: (iv: InterviewSchedule) => void;
  onOpenCandidate: (candidateId: string) => void;
  onOpenPipeline: (iv: InterviewSchedule) => void;
}

function InterviewRow({
  iv,
  canMutate,
  onEdit,
  onCancel,
  onComplete,
  onNoShow,
  onScorecard,
  onOpenCandidate,
  onOpenPipeline,
}: InterviewRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCancelled = iv.status === "cancelled";
  const canComplete = canMutate && (iv.status === "scheduled" || iv.status === "rescheduled");
  const canNoShow = canMutate && (iv.status === "scheduled" || iv.status === "rescheduled");
  const canScorecard = canMutate && (iv.status === "completed" || iv.status === "awaiting_feedback");
  const canOpenPipeline = Boolean(iv.job_id || iv.pipeline_id);
  const hasMutableActions = Boolean(onEdit || onCancel || onComplete || onNoShow || onScorecard);

  return (
    <article
      data-testid="agenda-interview-row"
      className={cn(
        "group flex flex-col sm:flex-row gap-4 rounded-xl border border-border/40 bg-surface p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md",
        isCancelled ? "opacity-70" : ""
      )}
    >
      <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:w-28 shrink-0 border-b sm:border-b-0 sm:border-r border-border/40 pb-3 sm:pb-0 sm:pr-4">
        <div className="text-left">
          <p className="text-base font-extrabold text-text">{formatTimeRange(iv)}</p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">
            {formatDate(iv.scheduled_start, { day: "2-digit", month: "short" })}
          </p>
        </div>
        <Badge variant={INTERVIEW_FORMAT_BADGE_VARIANTS[iv.interview_format] ?? "outline"} className="ml-auto sm:ml-0 sm:mt-auto">
          {interviewFormatLabel(iv.interview_format)}
        </Badge>
      </div>

      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-xs font-bold text-[hsl(var(--primary))]">
              {getInitials(iv.candidate_name)}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-text truncate" title={iv.candidate_name}>
                {iv.candidate_name}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={INTERVIEW_STATUS_BADGE_VARIANTS[iv.status] ?? "neutral"}>
              {interviewStatusLabel(iv.status)}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
          <span className="flex max-w-[200px] items-center gap-1.5 truncate">
            <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={iv.job_title || "Vaga não informada"}>
              {iv.job_title || "Vaga não informada"}
            </span>
          </span>
          <span className="flex max-w-[200px] items-center gap-1.5 truncate">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={iv.interviewer_name || iv.interviewer_email || "Responsável não informado"}>
              {iv.interviewer_name || iv.interviewer_email || "Responsável não informado"}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {iv.meeting_url ? <Video className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
            <span className="max-w-[150px] truncate" title={iv.location || "Local a definir"}>
              {iv.meeting_url ? "Online com link" : iv.location || "Local a definir"}
            </span>
          </span>
          <span className="hidden sm:inline">•</span>
          <span>{interviewTypeLabel(iv.interview_type)}</span>
          <span className="hidden sm:inline">•</span>
          <span>{scorecardStatusLabel(iv)}</span>
        </div>

        {iv.public_notes ? (
          <div className="mt-3 rounded-lg border border-border/30 bg-surface-muted/30 px-3 py-2 text-sm text-text-muted">
            <span className="font-semibold text-text">Nota: </span>
            {iv.public_notes}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs bg-surface"
              onClick={() => onOpenCandidate(iv.candidate_id)}
            >
              <UserRound className="mr-1.5 h-3.5 w-3.5" />
              Abrir candidato
            </Button>
            {canOpenPipeline ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs bg-surface"
                onClick={() => onOpenPipeline(iv)}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Abrir pipeline
              </Button>
            ) : null}
          </div>

          <div className="flex items-center justify-end">
            {hasMutableActions ? (
              <div className="relative">
                <Button
                  data-testid="agenda-actions-button"
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setMenuOpen((current) => !current)}
                  aria-label="Menu de ações"
                  aria-expanded={menuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>

                {menuOpen ? (
                  <div className="absolute right-0 bottom-full mb-1 z-20 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                    {onEdit ? (
                      <button
                        data-testid="agenda-edit-action"
                        type="button"
                        onClick={() => {
                          onEdit(iv.id);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text transition hover:bg-surface-muted"
                      >
                        <Edit2 className="h-4 w-4" />
                        {isCancelled || iv.status === "no_show" ? "Reagendar" : "Editar/remarcar"}
                      </button>
                    ) : null}

                    {canComplete && onComplete ? (
                      <button
                        type="button"
                        onClick={() => {
                          onComplete(iv);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text transition hover:bg-surface-muted"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar como concluída
                      </button>
                    ) : null}

                    {canNoShow && onNoShow ? (
                      <button
                        type="button"
                        onClick={() => {
                          onNoShow(iv);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text transition hover:bg-surface-muted"
                      >
                        <UserX className="h-4 w-4" />
                        Não compareceu
                      </button>
                    ) : null}

                    {canScorecard && onScorecard ? (
                      <button
                        type="button"
                        onClick={() => {
                          onScorecard(iv);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text transition hover:bg-surface-muted"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        {scorecardActionLabel(iv)}
                      </button>
                    ) : null}

                    {!isCancelled && onCancel ? (
                      <button
                        data-testid="agenda-cancel-action"
                        type="button"
                        onClick={() => {
                          onCancel(iv.id, iv.candidate_name);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger transition hover:bg-danger-soft"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Leitura
              </Badge>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// FiltersContent removido, integrado no layout principal

export function AgendaPage() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const userRole = auth?.user?.role ?? "admin";
  const canMutateAgendaActions = canMutateAgenda(userRole);
  const [selected, setSelected] = useState(dayStart(TODAY));
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [kpis, setKpis] = useState<AgendaKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<AgendaPeriod>("week");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState<string | undefined>();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelScheduleId, setCancelScheduleId] = useState<string | undefined>();
  const [cancelScheduleName, setCancelScheduleName] = useState("");
  const {
    googleConnected,
    googleAccountEmail,
    loadingGoogleConnection,
    connectingGoogle,
    connectGoogleCalendar,
  } = useGoogleCalendarConnection();

  const periodLabel = formatPeriodLabel(filterPeriod, selected);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const dateParams = buildDateParams(filterPeriod, selected);
      const params: AgendaListParams = {
        ...dateParams,
        status: filterStatus === "all" ? undefined : filterStatus,
        search: searchQuery || undefined,
        page: 1,
        page_size: 100,
      };

      const [result, kpisResult] = await Promise.all([
        agendaService.listInterviews(params),
        agendaService.getAgendaKpis({
          ...dateParams,
          status: filterStatus === "all" ? undefined : filterStatus,
          search: searchQuery || undefined,
        }),
      ]);

      setInterviews(result.data);
      setKpis(kpisResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar agenda";
      setError(message);
    } finally {
      setLoading(false);
      setHasInitialized(true);
    }
  }

  useEffect(() => {
    void loadData();
  }, [filterStatus, filterPeriod, searchQuery, selected]);

  const handlePeriodChange = (period: AgendaPeriod) => {
    setFilterPeriod(period);
    if (period === "today") setSelected(dayStart(TODAY));
  };

  const handlePreviousPeriod = () => {
    if (filterPeriod === "all") return;
    if (filterPeriod === "today") setSelected((current) => addDays(current, -1));
    if (filterPeriod === "week") setSelected((current) => addDays(current, -7));
    if (filterPeriod === "month") setSelected((current) => addMonths(current, -1));
  };

  const handleNextPeriod = () => {
    if (filterPeriod === "all") return;
    if (filterPeriod === "today") setSelected((current) => addDays(current, 1));
    if (filterPeriod === "week") setSelected((current) => addDays(current, 7));
    if (filterPeriod === "month") setSelected((current) => addMonths(current, 1));
  };

  const handleEditClick = (scheduleId: string) => {
    setEditScheduleId(scheduleId);
    setIsEditModalOpen(true);
  };

  const handleCancelClick = (scheduleId: string, candidateName: string) => {
    setCancelScheduleId(scheduleId);
    setCancelScheduleName(candidateName);
    setIsCancelModalOpen(true);
  };

  const handleCompleteClick = async (interview: InterviewSchedule) => {
    try {
      await agendaService.completeInterview(interview.id);
      toast.success("Entrevista marcada como concluída.");
      await loadData();
    } catch {
      toast.error("Não foi possível concluir a entrevista.");
    }
  };

  const handleNoShowClick = async (interview: InterviewSchedule) => {
    try {
      await agendaService.markNoShow(interview.id, { reason: "Candidato não compareceu." });
      toast.success("Entrevista marcada como não comparecimento.");
      await loadData();
    } catch {
      toast.error("Não foi possível registrar o não comparecimento.");
    }
  };

  const handleScorecardClick = (interview: InterviewSchedule) => {
    navigate(`/candidatos/${interview.candidate_id}?tab=interviews&focus=scorecard&interview_id=${interview.id}`);
  };

  const handleOpenCandidate = (candidateId: string) => {
    navigate(`/candidatos/${candidateId}`);
  };

  const handleOpenPipeline = (interview: InterviewSchedule) => {
    if (interview.job_id) {
      navigate(`/pipeline/${interview.job_id}?candidateId=${interview.candidate_id}`);
      return;
    }
    navigate(`/pipeline?candidateId=${interview.candidate_id}`);
  };

  const handleModalSuccess = async () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsCancelModalOpen(false);
    await loadData();
  };

  const handleConnectGoogle = async () => {
    try {
      await connectGoogleCalendar();
    } catch (err) {
      console.error("Erro ao obter URL de autenticação:", err);
      toast.error("Não foi possível iniciar a conexão com o Google Calendar.");
    }
  };

  const sortedInterviews = useMemo(() => sortInterviews(interviews), [interviews]);
  const groupedInterviews = useMemo(() => groupByDate(sortedInterviews), [sortedInterviews]);
  const sections = useMemo(
    () => getPeriodSections(sortedInterviews, filterPeriod === "today" ? selected : dayStart(TODAY)),
    [sortedInterviews, filterPeriod, selected]
  );
  const overdueCount = sections.find((section) => section.key === "overdue")?.interviews.length ?? 0;
  const hasActiveFilters = filterStatus !== "all" || Boolean(searchQuery);
  const showInitialLoading = loading && !hasInitialized && !error;

  const renderInterviewRow = (iv: InterviewSchedule) => (
    <InterviewRow
      key={iv.id}
      iv={iv}
      canMutate={canMutateAgendaActions}
      onEdit={canMutateAgendaActions ? handleEditClick : undefined}
      onCancel={canMutateAgendaActions ? handleCancelClick : undefined}
      onComplete={canMutateAgendaActions ? (interview) => void handleCompleteClick(interview) : undefined}
      onNoShow={canMutateAgendaActions ? (interview) => void handleNoShowClick(interview) : undefined}
      onScorecard={canMutateAgendaActions ? handleScorecardClick : undefined}
      onOpenCandidate={handleOpenCandidate}
      onOpenPipeline={handleOpenPipeline}
    />
  );

  if (showInitialLoading) {
    return (
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-32 w-full animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pb-16 pt-6 sm:px-6">
        <div className="rounded-2xl border border-danger/25 bg-danger-soft p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-danger" />
            <div>
              <p className="font-semibold text-danger">Erro ao carregar</p>
              <p className="text-sm text-danger">{error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4 bg-surface" onClick={() => void loadData()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Tentar novamente
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-4 lg:space-y-5 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* HEADER & METRICS */}
      <section className="flex flex-col gap-6 rounded-2xl border border-border/40 bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-text">Agenda</h1>
              <Badge variant={canMutateAgendaActions ? "success" : "outline"} className="rounded-full px-2.5 py-0.5 text-xs">
                {canMutateAgendaActions ? "Operação" : "Somente leitura"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Gerencie entrevistas e compromissos do processo seletivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canMutateAgendaActions ? (
              <Button type="button" className="shadow-sm" onClick={() => setIsCreateModalOpen(true)}>
                <Calendar className="mr-2 h-4 w-4" />
                Nova entrevista
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadData()}
              disabled={loading}
              className="bg-surface shadow-sm"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading ? "animate-spin" : "")} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Hoje", value: kpis?.today_count ?? 0, icon: Clock },
            { label: "Próximas", value: kpis?.upcoming_count ?? 0, icon: CalendarDays },
            { label: "Pendentes", value: overdueCount, icon: AlertCircle },
            { label: "Canceladas", value: kpis?.cancelled_count ?? 0, icon: X },
          ].map((kpi) => (
            <div key={kpi.label} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface-muted/20 p-3 transition-colors hover:bg-surface-muted/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-text-muted shadow-sm">
                <kpi.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold leading-none text-text">{kpi.value}</p>
                <p className="mt-1 truncate text-xs font-medium text-text-muted">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CONTROLS */}
      <section className="rounded-2xl border border-border/40 bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex overflow-x-auto rounded-xl border border-border/40 bg-surface-muted/30 p-1 custom-scrollbar">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePeriodChange(option.value)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  filterPeriod === option.value
                    ? "bg-[hsl(var(--primary))] text-primary-foreground shadow-sm"
                    : "text-text-muted hover:bg-surface hover:text-text"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handlePreviousPeriod}
              disabled={filterPeriod === "all"}
              aria-label="Período anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-10 min-w-[200px] flex-1 items-center justify-center rounded-xl border border-border/40 bg-surface px-4 text-sm font-bold text-text shadow-sm sm:flex-none">
              {periodLabel}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleNextPeriod}
              disabled={filterPeriod === "all"}
              aria-label="Próximo período"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/40 pt-4 md:grid-cols-[1fr_200px_minmax(220px,auto)]">
          <label className="relative block">
            <span className="sr-only">Buscar entrevistas</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar candidato, vaga, avaliador..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/60 bg-surface px-10 text-sm text-text placeholder:text-text-muted transition focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
            ) : null}
          </label>

          <label className="block">
            <span className="sr-only">Filtrar por status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl border border-border/60 bg-surface px-3 text-sm text-text transition focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
            >
              <option value="all">Todos os status</option>
              <option value="scheduled">Agendada</option>
              <option value="completed">Concluída</option>
              <option value="awaiting_feedback">Aguardando feedback</option>
              <option value="cancelled">Cancelada</option>
              <option value="rescheduled">Reagendada</option>
              <option value="no_show">Não compareceu</option>
            </select>
          </label>

          <div className="flex h-10 items-center justify-between rounded-xl border border-border/40 bg-surface-muted/20 px-3 transition-colors hover:bg-surface-muted/40">
            <div className="flex items-center gap-2 overflow-hidden">
              <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-muted">Integração</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {googleConnected ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                    </span>
                  ) : null}
                  {googleConnected && googleAccountEmail && (
                    <span className="sr-only">Conta conectada: {googleAccountEmail}.</span>
                  )}
                  <span className="truncate text-xs font-semibold text-text" title={googleAccountEmail || "Google Agenda"}>
                    {googleConnected && googleAccountEmail ? googleAccountEmail : "Google Agenda"}
                  </span>
                </div>
              </div>
            </div>
            {canMutateAgendaActions ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 h-7 px-2 text-[10px] font-bold uppercase tracking-wider"
                onClick={() => void handleConnectGoogle()}
                disabled={connectingGoogle || loadingGoogleConnection}
              >
                {connectingGoogle ? "Conectando..." : loadingGoogleConnection ? "Verificando..." : googleConnected ? "Reconectar Google Agenda" : "Conectar Google Agenda"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <h2 className="sr-only">
        {filterPeriod === "all" ? "Todas as entrevistas" : "Blocos operacionais"}
      </h2>
      {sortedInterviews.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface p-8 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted/50">
            <Calendar className="h-8 w-8 text-text-muted" />
          </div>
          <h3 className="text-lg font-bold text-text">
            {hasActiveFilters ? "Sem resultados" : filterPeriod === "today" ? "Sem entrevistas hoje" : "Sem entrevistas no período"}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-text-muted">
            {hasActiveFilters
              ? "Tente ajustar sua busca, status ou período para encontrar o que procura."
              : "Nenhuma entrevista marcada. Quando houver, elas aparecerão aqui."}
          </p>
        </div>
      ) : filterPeriod === "all" ? (
        <div className="space-y-6">
          {groupedInterviews.map((group) => (
            <section key={group.dateKey} className="space-y-4 rounded-2xl border border-border/40 bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-text">
                  {formatDate(group.date, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                </h3>
                <Badge variant="neutral">{group.interviews.length}</Badge>
              </div>
              <div className="grid gap-3">{group.interviews.map(renderInterviewRow)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
          {sections.map((section) => {
            const Icon = section.icon;
            const isPrimary = section.key === "today" || section.key === "upcoming";
            const isToday = section.key === "today";

            return (
              <section
                key={section.key}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-border/40 p-4 shadow-sm",
                  isToday ? "bg-surface ring-1 ring-[hsl(var(--primary))]/10" : "bg-surface-muted/10"
                )}
              >
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isPrimary ? "text-[hsl(var(--primary))]" : "text-text-muted"
                      )}
                    />
                    <h3 className="text-base font-extrabold text-text">{section.title}</h3>
                  </div>
                  <Badge variant="neutral" className="h-6 px-2 text-xs">
                    {section.interviews.length}
                  </Badge>
                </div>

                {section.interviews.length === 0 ? (
                  <div className="flex py-6 mt-1 items-center justify-center rounded-xl border border-dashed border-border/60 bg-surface-muted/20 text-sm font-medium text-text-muted">
                    {section.emptyLabel}
                  </div>
                ) : (
                  <div className="grid gap-3 mt-1">{section.interviews.map(renderInterviewRow)}</div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AgendaInterviewModal
        isOpen={isCreateModalOpen}
        isEdit={false}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleModalSuccess}
      />

      <AgendaInterviewModal
        isOpen={isEditModalOpen}
        isEdit={true}
        scheduleId={editScheduleId}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditScheduleId(undefined);
        }}
        onSuccess={handleModalSuccess}
      />

      <CancelInterviewModal
        isOpen={isCancelModalOpen}
        scheduleId={cancelScheduleId}
        candidateName={cancelScheduleName}
        onClose={() => {
          setIsCancelModalOpen(false);
          setCancelScheduleId(undefined);
          setCancelScheduleName("");
        }}
        onSuccess={handleModalSuccess}
      />
    </main>
  );
}
