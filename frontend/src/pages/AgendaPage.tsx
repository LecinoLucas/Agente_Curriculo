import {
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  Video,
  AlertCircle,
  Loader2,
  MoreVertical,
  Edit2,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

import { PageHeader } from "../components/common/PageHeader";
import { useGoogleCalendarConnection } from "../features/agenda/useGoogleCalendarConnection";
import { cn } from "../lib/utils";
import { agendaService } from "../services/agendaService";
import { toast } from "../shared/utils/toast";
import { InterviewSchedule, AgendaKpis, AgendaListParams } from "../types/agenda";
import { AgendaInterviewModal } from "../features/agenda/AgendaInterviewModal";
import { CancelInterviewModal } from "../features/agenda/CancelInterviewModal";

function dayStart(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function weekDays(base: Date): Date[] {
  const mon = new Date(base);
  mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
  rescheduled: "Remarcada",
  no_show: "Não compareceu",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "text-blue-600",
  completed: "text-emerald-600",
  cancelled: "text-rose-400",
  rescheduled: "text-amber-600",
  no_show: "text-amber-600",
};

interface InterviewRowProps {
  iv: InterviewSchedule;
  onEdit?: (id: string) => void;
  onCancel?: (id: string, name: string) => void;
}

function InterviewRow({ iv, onEdit, onCancel }: InterviewRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const startDate = new Date(iv.scheduled_start);
  const time = startDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const endDate = new Date(iv.scheduled_end);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  const statusColor = STATUS_COLORS[iv.status] || "text-gray-600";
  const statusLabel = STATUS_LABELS[iv.status] || iv.status;

  const initials = iv.candidate_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isCancelled = iv.status === "cancelled";

  return (
    <div
      data-testid="agenda-interview-row"
      className={cn(
        "group flex items-center gap-4 rounded-xl px-3 py-3 transition relative",
        isCancelled
          ? "bg-[hsl(var(--surface-muted))]/20 opacity-60"
          : "hover:bg-[hsl(var(--surface-muted))]/30"
      )}
    >
      {/* Time */}
      <div className="w-12 shrink-0 text-right">
        <p className={cn("text-sm font-bold", isCancelled ? "text-[hsl(var(--text-muted))]" : "text-[hsl(var(--text))]")}>{time}</p>
        <p className="text-[10px] text-[hsl(var(--text-muted))]">{durationMinutes}m</p>
      </div>

      {/* Divider dot */}
      <div className={cn("h-full w-px", isCancelled ? "bg-[hsl(var(--border))]/20" : "bg-[hsl(var(--border))]/40")} />

      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-muted))]/80 text-[11px] font-bold text-[hsl(var(--text-muted))]">
        {initials}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">
          {iv.candidate_name}
        </p>
        <p className="truncate text-xs text-[hsl(var(--text-muted))]">
          {iv.job_title || "-"} · {iv.interview_type}
        </p>
      </div>

      {/* Platform — subtle */}
      {iv.meeting_url && (
        <div className="hidden items-center gap-1 sm:flex">
          <Video className="h-3 w-3 text-[hsl(var(--text-muted))]" />
          <span className="text-xs text-[hsl(var(--text-muted))]">Online</span>
        </div>
      )}

      {/* Google Calendar Sync Indicator */}
      {iv.calendar_provider === "google" && (
        <div className="hidden items-center gap-1 sm:flex">
          <Calendar className={cn("h-3 w-3", 
            iv.calendar_sync_status === "synced" ? "text-emerald-600" :
            iv.calendar_sync_status === "failed" ? "text-rose-600" :
            "text-[hsl(var(--text-muted))]"
          )} />
          {iv.calendar_sync_status === "synced" && iv.external_calendar_html_link ? (
            <a
              href={iv.external_calendar_html_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-600 hover:underline"
            >
              Abrir no Calendar
            </a>
          ) : (
            <span className={cn("text-xs", 
              iv.calendar_sync_status === "synced" ? "text-emerald-600" :
              iv.calendar_sync_status === "failed" ? "text-rose-600" :
              "text-[hsl(var(--text-muted))]"
            )}>
              {iv.calendar_sync_status === "synced" ? "Sincronizado" :
               iv.calendar_sync_status === "failed" ? "Falha" :
               "Não sincronizado"}
            </span>
          )}
        </div>
      )}

      {/* Status */}
      <span className={cn("shrink-0 text-xs font-semibold", statusColor)}>
        {statusLabel}
      </span>

      {/* Actions menu */}
      {!isCancelled && (onEdit || onCancel) && (
        <div className="relative">
          <button
            data-testid="agenda-actions-button"
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-8 w-8 rounded-lg text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))]/50 hover:text-[hsl(var(--text))] transition"
            aria-label="Menu de ações"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-40 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-lg z-10">
              {onEdit && (
                <button
                  data-testid="agenda-edit-action"
                  type="button"
                  onClick={() => {
                    onEdit(iv.id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-[hsl(var(--surface-muted))] flex items-center gap-2 text-[hsl(var(--text))] transition first:rounded-t-lg"
                >
                  <Edit2 className="h-4 w-4" />
                  Editar
                </button>
              )}

              {onCancel && (
                <button
                  data-testid="agenda-cancel-action"
                  type="button"
                  onClick={() => {
                    onCancel(iv.id, iv.candidate_name);
                    setMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-rose-50 flex items-center gap-2 text-rose-600 transition last:rounded-b-lg"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TODAY = new Date();

export function AgendaPage() {
  const [selected, setSelected] = useState(dayStart(TODAY));
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [kpis, setKpis] = useState<AgendaKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<"today" | "week" | "month" | "all">("week");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasInitialized, setHasInitialized] = useState(false);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState<string | undefined>();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelScheduleId, setCancelScheduleId] = useState<string | undefined>();
  const [cancelScheduleName, setCancelScheduleName] = useState<string>("");
  const {
    googleConnected,
    googleAccountEmail,
    loadingGoogleConnection,
    connectingGoogle,
    connectGoogleCalendar,
  } = useGoogleCalendarConnection();

  const days = weekDays(selected);
  const todayTs = dayStart(TODAY).getTime();

  // Debounce search query
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
      // Build date params based on selected period
      let dateFrom: string | undefined;
      let dateTo: string | undefined;
      const now = new Date();

      if (filterPeriod === "today") {
        const today = dayStart(now);
        dateFrom = today.toISOString();
        dateTo = new Date(today.getTime() + 86400000).toISOString();
      } else if (filterPeriod === "week") {
        const weekStart = dayStart(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        dateFrom = weekStart.toISOString();
        dateTo = new Date(weekStart.getTime() + 604800000).toISOString();
      } else if (filterPeriod === "month") {
        const monthStart = dayStart(now);
        monthStart.setDate(1);
        dateFrom = monthStart.toISOString();
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        dateTo = monthEnd.toISOString();
      } else if (filterPeriod === "all") {
        dateFrom = "1970-01-01T00:00:00Z";
        dateTo = "2100-01-01T00:00:00Z";
      }

      const params: AgendaListParams = {
        date_from: dateFrom,
        date_to: dateTo,
        status: filterStatus === "all" ? undefined : filterStatus,
        search: searchQuery || undefined,
        page: 1,
        page_size: 100,
      };

      const [result, kpisResult] = await Promise.all([
        agendaService.listInterviews(params),
        agendaService.getAgendaKpis({
          date_from: dateFrom,
          date_to: dateTo,
          status: filterStatus === "all" ? undefined : filterStatus,
          search: searchQuery || undefined,
        }),
      ]);

      setInterviews(result.data);
      setKpis(kpisResult);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar agenda";
      setError(message);
    } finally {
      setLoading(false);
      setHasInitialized(true);
    }
  }

  useEffect(() => {
    void loadData();
  }, [filterStatus, filterPeriod, searchQuery]);

  const handleEditClick = (scheduleId: string) => {
    setEditScheduleId(scheduleId);
    setIsEditModalOpen(true);
  };

  const handleCancelClick = (scheduleId: string, candidateName: string) => {
    setCancelScheduleId(scheduleId);
    setCancelScheduleName(candidateName);
    setIsCancelModalOpen(true);
  };

  const handleModalSuccess = async () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsCancelModalOpen(false);
    // Reload data
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

  // Group interviews by day for display
  function byDay(day: Date) {
    const t = dayStart(day).getTime();
    return interviews.filter((iv) =>
      dayStart(new Date(iv.scheduled_start)).getTime() === t
    );
  }

  const todayIvs = filterPeriod === 'all'
    ? [...interviews].sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
    : byDay(selected).sort(
        (a, b) =>
          new Date(a.scheduled_start).getTime() -
          new Date(b.scheduled_start).getTime()
      );
  const weekIvs = days.flatMap(byDay);

  const showInitialLoading = loading && !hasInitialized && !error;

  if (showInitialLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-16 pt-6 sm:px-6">
        <PageHeader
          title="Agenda de Entrevistas"
          subtitle="Visão semanal e detalhe diário"
        />
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--text-muted))]" />
            <p className="text-sm text-[hsl(var(--text-muted))]">Carregando agenda...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-16 pt-6 sm:px-6">
        <PageHeader
          title="Agenda de Entrevistas"
          subtitle="Visão semanal e detalhe diário"
        />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600" />
            <div>
              <p className="font-semibold text-rose-900">Erro ao carregar</p>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Agenda de Entrevistas"
          subtitle="Visão semanal e detalhe diário"
        />
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="h-11 px-5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition"
        >
          + Novo agendamento
        </button>
      </div>

      {/* Google Calendar Connection Banner */}
      <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Integração com Google Agenda</p>
            <p className="text-xs text-[hsl(var(--text-muted))]">
              {googleConnected
                ? `Conta conectada${googleAccountEmail ? `: ${googleAccountEmail}` : ""}.`
                : "Conecte sua conta para sincronizar as entrevistas automaticamente."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleConnectGoogle()}
          disabled={connectingGoogle || loadingGoogleConnection}
          className="ui-btn-secondary h-10 rounded-lg border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 text-sm font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))] disabled:opacity-60"
        >
          {connectingGoogle
            ? "Conectando..."
            : loadingGoogleConnection
            ? "Verificando..."
            : googleConnected
            ? "Reconectar Google Agenda"
            : "Conectar Google Agenda"}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total agendadas", value: kpis?.total_scheduled ?? 0, icon: Calendar },
          { label: "Concluídas", value: kpis?.completed_count ?? 0, icon: CheckCircle2 },
          { label: "Hoje", value: kpis?.today_count ?? 0, icon: Clock },
          { label: "Avaliadores", value: kpis?.unique_interviewers_count ?? 0, icon: Users },
        ].map((k) => (
          <div
            key={k.label}
            className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] px-4 py-3"
          >
            <k.icon className="h-4 w-4 shrink-0 text-[hsl(var(--text-muted))]" />
            <div>
              <p className="text-lg font-extrabold text-[hsl(var(--text))]">{k.value}</p>
              <p className="text-[11px] text-[hsl(var(--text-muted))]">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              placeholder="Buscar candidato, vaga, avaliador..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))] pl-3 pr-9 py-2 text-sm text-[hsl(var(--text))] placeholder-[hsl(var(--text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            />
            {loading && (
              <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-[hsl(var(--text-muted))]" />
            )}
          </div>

          {/* Period filter */}
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value as any)}
            className="rounded-lg border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          >
            <option value="today">Hoje</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mês</option>
            <option value="all">Todos</option>
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))] px-3 py-2 text-sm text-[hsl(var(--text))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          >
            <option value="all">Todos os status</option>
            <option value="scheduled">Agendada</option>
            <option value="completed">Concluída</option>
            <option value="cancelled">Cancelada</option>
            <option value="rescheduled">Remarcada</option>
            <option value="no_show">Não compareceu</option>
          </select>
        </div>
      </div>

      {/* Week strip */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-2">
        {days.map((day) => {
          const ts = dayStart(day).getTime();
          const isToday = ts === todayTs;
          const isSelected = ts === selected.getTime();
          const count = byDay(day).length;

          return (
            <button
              key={ts}
              onClick={() => setSelected(dayStart(day))}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition min-w-[44px]",
                isSelected
                  ? "bg-[hsl(var(--primary))] text-white"
                  : isToday
                  ? "border border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))]"
                  : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))]/40"
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {day.toLocaleDateString("pt-BR", { weekday: "short" })}
              </span>
              <span className="text-base font-extrabold">{day.getDate()}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                    isSelected
                      ? "bg-white/25 text-white"
                      : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                  )}
                >
                  {count}
                </span>
              ) : (
                <span className="h-4" />
              )}
            </button>
          );
        })}
      </div>

      {/* Day detail */}
      <div className="rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-[hsl(var(--text))]">
            {selected.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <p className="text-xs text-[hsl(var(--text-muted))]">
            {todayIvs.length === 0
              ? "Sem entrevistas neste dia"
              : `${todayIvs.length} entrevista${todayIvs.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {todayIvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="mb-3 h-8 w-8 text-[hsl(var(--text-muted))]/50" />
            <p className="text-sm text-[hsl(var(--text-muted))]">
              Nenhuma entrevista agendada.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {todayIvs.map((iv) => (
              <InterviewRow
                key={iv.id}
                iv={iv}
                onEdit={handleEditClick}
                onCancel={handleCancelClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Week list */}
      <div className="rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5">
        <h3 className="mb-3 text-sm font-bold text-[hsl(var(--text))]">
          Semana completa
        </h3>
        {weekIvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="mb-2 h-6 w-6 text-[hsl(var(--text-muted))]/50" />
            <p className="text-xs text-[hsl(var(--text-muted))]">
              Nenhuma entrevista neste período.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]/30">
            {days.map((day) => {
              const ivs = byDay(day);
              if (ivs.length === 0) return null;
              return (
                <div key={day.toISOString()} className="py-3 first:pt-0 last:pb-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                    {day.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                    })}
                  </p>
                  <div className="space-y-1">
                    {ivs
                      .sort(
                        (a, b) =>
                          new Date(a.scheduled_start).getTime() -
                          new Date(b.scheduled_start).getTime()
                      )
                      .map((iv) => (
                        <InterviewRow
                          key={iv.id}
                          iv={iv}
                          onEdit={handleEditClick}
                          onCancel={handleCancelClick}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
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
    </div>
  );
}
