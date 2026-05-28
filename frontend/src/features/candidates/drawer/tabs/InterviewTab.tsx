import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Clock, ExternalLink, Loader, Pencil, RotateCcw, UserX, X } from "lucide-react";

import { agendaService } from "../../../../services/agendaService";
import type { InterviewSchedule, InterviewStatus, InterviewType } from "../../../../types/agenda";
import { InterviewScorecardPanel } from "../components/InterviewScorecardPanel";

interface InterviewTabProps {
  jobId: string | null;
  candidateId: string | null;
  onScorecardSubmitted?: () => void | Promise<void>;
}

type FormMode = "create" | "reschedule";

const STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Agendada",
  rescheduled: "Reagendada",
  completed: "Concluída",
  awaiting_feedback: "Aguardando feedback",
  no_show: "Não compareceu",
  cancelled: "Cancelada",
};

const TYPE_LABELS: Record<InterviewType, string> = {
  screening: "Triagem",
  technical: "Técnica",
  manager: "Gestor",
  hr: "RH",
  final: "Final",
  other: "Outra",
};

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function defaultEnd(start: string): string {
  const date = new Date(start);
  date.setHours(date.getHours() + 1);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InterviewTab({ jobId, candidateId, onScorecardSubmitted }: InterviewTabProps) {
  const [items, setItems] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editing, setEditing] = useState<InterviewSchedule | null>(null);
  const [scorecardInterviewId, setScorecardInterviewId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "Entrevista com candidato",
    interview_type: "hr" as InterviewType,
    interview_format: "online" as const,
    scheduled_start: "",
    scheduled_end: "",
    interviewer_name: "",
    interviewer_email: "",
    location: "",
    meeting_url: "",
    create_google_event: false,
    create_google_meet: false,
    cancel_reason: "",
  });

  const canUseFlow = Boolean(jobId && candidateId);

  const load = async () => {
    if (!jobId || !candidateId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await agendaService.listCandidateJobInterviews(jobId, candidateId, {
        page: 1,
        page_size: 50,
      });
      setItems(payload.data);
    } catch {
      setError("Não foi possível carregar entrevistas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [jobId, candidateId]);

  const selectedScorecardInterview = useMemo(
    () => items.find((item) => item.id === scorecardInterviewId) ?? null,
    [items, scorecardInterviewId],
  );

  const handleScorecardSubmitted = async () => {
    setScorecardInterviewId(null);
    await onScorecardSubmitted?.();
  };

  const openCreate = () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setMinutes(0, 0, 0);
    const startLocal = toDatetimeLocal(start.toISOString());
    setEditing(null);
    setFormMode("create");
    setForm({
      title: "Entrevista com candidato",
      interview_type: "hr",
      interview_format: "online",
      scheduled_start: startLocal,
      scheduled_end: defaultEnd(start.toISOString()),
      interviewer_name: "",
      interviewer_email: "",
      location: "",
      meeting_url: "",
      create_google_event: false,
      create_google_meet: false,
      cancel_reason: "",
    });
  };

  const openReschedule = (interview: InterviewSchedule) => {
    setEditing(interview);
    setFormMode("reschedule");
    setForm((current) => ({
      ...current,
      title: interview.title,
      interview_type: interview.interview_type,
      interview_format: interview.interview_format,
      scheduled_start: toDatetimeLocal(interview.scheduled_start),
      scheduled_end: toDatetimeLocal(interview.scheduled_end),
      interviewer_name: interview.interviewer_name ?? "",
      interviewer_email: interview.interviewer_email ?? "",
      location: interview.location ?? "",
      meeting_url: interview.meeting_url ?? "",
      create_google_event: interview.calendar_provider === "google",
      create_google_meet: interview.meeting_provider === "google_meet",
      cancel_reason: "",
    }));
  };

  const submitForm = async () => {
    if (!jobId || !candidateId || !form.scheduled_start || !form.scheduled_end) return;
    setSaving(true);
    setError(null);
    try {
      if (formMode === "reschedule" && editing) {
        await agendaService.rescheduleInterview(editing.id, {
          scheduled_start: fromDatetimeLocal(form.scheduled_start),
          scheduled_end: fromDatetimeLocal(form.scheduled_end),
          timezone: "America/Recife",
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
          sync_google_event: form.create_google_event,
          create_google_meet: form.create_google_meet,
        });
      } else {
        await agendaService.createCandidateJobInterview(jobId, candidateId, {
          title: form.title,
          interview_type: form.interview_type,
          interview_format: form.interview_format,
          status: "scheduled",
          scheduled_start: fromDatetimeLocal(form.scheduled_start),
          scheduled_end: fromDatetimeLocal(form.scheduled_end),
          timezone: "America/Recife",
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
          create_google_event: form.create_google_event,
          create_google_meet: form.create_google_meet,
        });
      }
      setFormMode(null);
      setEditing(null);
      await load();
    } catch {
      setError("Não foi possível salvar a entrevista.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: () => Promise<InterviewSchedule>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      await load();
    } catch {
      setError("Não foi possível aplicar a ação.");
    } finally {
      setSaving(false);
    }
  };

  if (!canUseFlow) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-surface-muted/30 p-5 text-sm text-text-muted">
          Vincule o candidato a uma vaga ativa para gerenciar entrevistas.
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">Entrevistas</h3>
          <p className="mt-1 text-sm text-text-muted">Agenda, execução, presença e feedback.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <CalendarPlus className="h-4 w-4" />
          Agendar
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}

      {formMode ? (
        <div className="mb-5 rounded-lg border border-border bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">Título</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                disabled={formMode === "reschedule"}
                className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-60"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">Tipo</span>
              <select
                value={form.interview_type}
                onChange={(event) => setForm((current) => ({ ...current, interview_type: event.target.value as InterviewType }))}
                disabled={formMode === "reschedule"}
                className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-60"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">Início</span>
              <input
                type="datetime-local"
                value={form.scheduled_start}
                onChange={(event) => setForm((current) => ({ ...current, scheduled_start: event.target.value }))}
                className="ui-input h-10 rounded-lg px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">Fim</span>
              <input
                type="datetime-local"
                value={form.scheduled_end}
                onChange={(event) => setForm((current) => ({ ...current, scheduled_end: event.target.value }))}
                className="ui-input h-10 rounded-lg px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">Entrevistador</span>
              <input
                value={form.interviewer_name}
                onChange={(event) => setForm((current) => ({ ...current, interviewer_name: event.target.value }))}
                className="ui-input h-10 rounded-lg px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase text-text-muted">E-mail</span>
              <input
                type="email"
                value={form.interviewer_email}
                onChange={(event) => setForm((current) => ({ ...current, interviewer_email: event.target.value }))}
                className="ui-input h-10 rounded-lg px-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.create_google_event}
                onChange={(event) => setForm((current) => ({ ...current, create_google_event: event.target.checked }))}
              />
              Google Calendar
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.create_google_meet}
                onChange={(event) => setForm((current) => ({ ...current, create_google_meet: event.target.checked }))}
              />
              Google Meet
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void submitForm()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {formMode === "reschedule" ? "Reagendar" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setFormMode(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              <X className="h-4 w-4" />
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center p-8" role="status" aria-label="Carregando entrevistas">
          <Loader className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted/30 p-5 text-sm text-text-muted">
          Nenhuma entrevista registrada.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((interview) => (
            <div key={interview.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold">
                      {TYPE_LABELS[interview.interview_type]}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold">
                      {STATUS_LABELS[interview.status]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateTime(interview.scheduled_start)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-text">{interview.title}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {interview.interviewer_name || interview.interviewer_email || "Sem entrevistador definido"}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Calendar: {interview.calendar_sync_status ?? "not_synced"}
                    {interview.external_calendar_html_link ? (
                      <a
                        href={interview.external_calendar_html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-[hsl(var(--primary))]"
                      >
                        abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openReschedule(interview)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium">
                    <Pencil className="h-3.5 w-3.5" /> Reagendar
                  </button>
                  <button type="button" onClick={() => void runAction(() => agendaService.cancelInterviewOperational(interview.id, { cancel_reason: "Cancelada pelo recrutador." }))} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium">
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                  <button type="button" onClick={() => void runAction(() => agendaService.completeInterview(interview.id))} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium">
                    <Check className="h-3.5 w-3.5" /> Concluir
                  </button>
                  <button type="button" onClick={() => void runAction(() => agendaService.markNoShow(interview.id, { reason: "Candidato não compareceu." }))} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium">
                    <UserX className="h-3.5 w-3.5" /> Não compareceu
                  </button>
                  <button type="button" onClick={() => setScorecardInterviewId(interview.id)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium">
                    <RotateCcw className="h-3.5 w-3.5" /> Scorecard
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {scorecardInterviewId ? (
        <div className="mt-6 rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">
              Scorecard vinculado {selectedScorecardInterview ? `- ${formatDateTime(selectedScorecardInterview.scheduled_start)}` : ""}
            </p>
          </div>
          <InterviewScorecardPanel
            jobId={jobId}
            candidateId={candidateId}
            interviewId={scorecardInterviewId}
            onSubmitted={handleScorecardSubmitted}
          />
        </div>
      ) : null}
    </div>
  );
}
