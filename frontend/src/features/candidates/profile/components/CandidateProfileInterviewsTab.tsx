import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  Check,
  ClipboardCheck,
  Clock,
  Loader,
  NotebookPen,
  Pencil,
  UserX,
  X,
} from "lucide-react";

import { InterviewScorecardPanel } from "../../drawer/components/InterviewScorecardPanel";
import { agendaService } from "../../../../services/agendaService";
import { formatContextError } from "../../../../services/errorMessages";
import { toast } from "../../../../shared/utils/toast";
import type { CandidatePreviewPendencyOverview } from "../../../../types/domain";
import type { InterviewFormat, InterviewSchedule, InterviewType } from "../../../../types/agenda";
import {
  INTERVIEW_TYPE_LABELS,
  formatInterviewDateTime,
  interviewFormatLabel,
  interviewStatusLabel,
  interviewTypeLabel,
  scorecardActionLabel,
  scorecardStatusLabel,
} from "../../../agenda/interviewDisplay";
import { toDatetimeLocal, fromDatetimeLocal } from "../profileFormatters";
import { ActionButton, Badge, EmptyBlock, SectionCard } from "./ProfileSharedUI";
import { CurrentProcessHistoryHint } from "./CandidateProfileHistoryTab";

export function CandidateProfileInterviewsTab({
  jobId,
  candidateId,
  previewPendencies,
  hasTechnicalInterviewPendency,
  focusToken,
  scheduleTechnicalFocusToken,
  focusInterviewId,
  onAfterInterviewChange,
  onOpenHistory,
}: {
  jobId: string | null;
  candidateId: string | null;
  previewPendencies: CandidatePreviewPendencyOverview[];
  hasTechnicalInterviewPendency?: boolean;
  focusToken: number;
  scheduleTechnicalFocusToken?: number;
  focusInterviewId: string | null;
  onAfterInterviewChange: () => void | Promise<void>;
  onOpenHistory: () => void;
}) {
  const [items, setItems] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "reschedule" | null>(null);
  const [editing, setEditing] = useState<InterviewSchedule | null>(null);
  const [scorecardInterviewId, setScorecardInterviewId] = useState<string | null>(null);
  const [feedbackInterviewId, setFeedbackInterviewId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [detailsInterviewId, setDetailsInterviewId] = useState<string | null>(null);
  const [highlightedInterviewId, setHighlightedInterviewId] = useState<string | null>(null);
  const interviewRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const autoOpenedScorecardRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    title: "Entrevista com candidato",
    interview_type: "hr" as InterviewType,
    interview_format: "online" as InterviewFormat,
    scheduled_start: "",
    scheduled_end: "",
    interviewer_name: "",
    interviewer_email: "",
    location: "",
    meeting_url: "",
  });

  const canUseFlow = Boolean(jobId && candidateId);
  const scorecardGatePayload = useMemo(
    () =>
      previewPendencies.find((pendency) => pendency.id === "scorecard_not_submitted")?.action_payload ??
      null,
    [previewPendencies],
  );
  const scorecardGateInterviewId = useMemo(() => {
    const raw = scorecardGatePayload?.interview_id;
    return typeof raw === "string" && raw ? raw : null;
  }, [scorecardGatePayload]);
  const hasScorecardGatePendency = previewPendencies.some((pendency) => pendency.id === "scorecard_not_submitted");

  const load = useCallback(async () => {
    if (!jobId || !candidateId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await agendaService.listCandidateJobInterviews(jobId, candidateId, {
        page: 1,
        page_size: 20,
      });
      setItems(payload.data);
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível carregar entrevistas.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusToken <= 0 || items.length === 0) return;
    const target =
      (focusInterviewId ? items.find((item) => item.id === focusInterviewId) : null) ??
      (scorecardGateInterviewId ? items.find((item) => item.id === scorecardGateInterviewId) : null) ??
      items.find((item) => item.counts_for_current_gate) ??
      items[0];
    const canOpenScorecard = target.status === "completed" || target.status === "awaiting_feedback";
    if (canOpenScorecard) {
      setScorecardInterviewId(target.id);
    }
    setHighlightedInterviewId(target.id);
    window.setTimeout(() => {
      interviewRefs.current[target.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    const timeout = window.setTimeout(() => setHighlightedInterviewId(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [focusInterviewId, focusToken, items, scorecardGateInterviewId]);

  useEffect(() => {
    if (!scorecardGateInterviewId || items.length === 0) return;
    if (autoOpenedScorecardRef.current === scorecardGateInterviewId) return;
    const target = items.find((item) => item.id === scorecardGateInterviewId);
    if (!target || target.scorecard_status === "submitted") return;
    if (target.status !== "completed" && target.status !== "awaiting_feedback") return;
    autoOpenedScorecardRef.current = scorecardGateInterviewId;
    setScorecardInterviewId(target.id);
  }, [items, scorecardGateInterviewId]);

  useEffect(() => {
    if (scheduleTechnicalFocusToken && scheduleTechnicalFocusToken > 0) {
      openForm("technical");
    }
  }, [scheduleTechnicalFocusToken]);

  const openForm = (initialType: InterviewType = "hr") => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    setForm({
      title: initialType === "technical" ? "Agendar entrevista técnica" : "Entrevista com candidato",
      interview_type: initialType,
      interview_format: "online",
      scheduled_start: toDatetimeLocal(start.toISOString()),
      scheduled_end: toDatetimeLocal(end.toISOString()),
      interviewer_name: "",
      interviewer_email: "",
      location: "",
      meeting_url: "",
    });
    setEditing(null);
    setFormMode("create");
  };

  const openReschedule = (interview: InterviewSchedule) => {
    setEditing(interview);
    setForm({
      title: interview.title,
      interview_type: interview.interview_type,
      interview_format: interview.interview_format,
      scheduled_start: toDatetimeLocal(interview.scheduled_start),
      scheduled_end: toDatetimeLocal(interview.scheduled_end),
      interviewer_name: interview.interviewer_name ?? "",
      interviewer_email: interview.interviewer_email ?? "",
      location: interview.location ?? "",
      meeting_url: interview.meeting_url ?? "",
    });
    setFormMode("reschedule");
  };

  const openFeedback = (interview: InterviewSchedule) => {
    setScorecardInterviewId(null);
    setFeedbackInterviewId((current) => {
      if (current === interview.id) {
        setFeedbackDraft("");
        return null;
      }
      setFeedbackDraft(interview.internal_notes ?? "");
      return interview.id;
    });
  };

  const submit = async () => {
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
        });
        toast.success("Entrevista reagendada.");
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
        });
        toast.success("Entrevista agendada.");
      }
      setFormMode(null);
      setEditing(null);
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível salvar a entrevista.",
          "Revise data, horário e vínculo com a vaga.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    action: () => Promise<InterviewSchedule>,
    successMessage: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      toast.success(successMessage);
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível aplicar a ação.",
          "Tente novamente ou revise o status atual da entrevista.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleScorecardSubmitted = async () => {
    await load();
    await onAfterInterviewChange();
  };

  const handleScorecardChanged = async () => {
    await load();
    await onAfterInterviewChange();
  };

  const saveFeedback = async (interview: InterviewSchedule) => {
    setSaving(true);
    setError(null);
    try {
      await agendaService.completeInterview(interview.id, {
        internal_notes: feedbackDraft.trim() || null,
      });
      toast.success("Feedback da entrevista salvo.");
      setFeedbackInterviewId(null);
      setFeedbackDraft("");
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível registrar o feedback.",
          "Tente novamente ou revise o status atual da entrevista.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canUseFlow) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para agendar entrevistas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <CurrentProcessHistoryHint
        candidateId={candidateId}
        jobId={jobId}
        onOpenHistory={onOpenHistory}
      />
      <SectionCard title="Entrevistas">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Agenda operacional do processo atual nesta vaga. Entrevistas de ciclos anteriores ficam no histórico.
          </p>
          <ActionButton onClick={() => openForm()} primary>
            <CalendarPlus className="h-4 w-4" />
            Agendar entrevista
          </ActionButton>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {formMode ? (
          <div className="mt-4 rounded-xl border border-border bg-[hsl(var(--bg))] p-4">
            <p className="mb-3 text-sm font-bold text-text">
              {formMode === "reschedule" ? "Reagendar entrevista" : form.title}
            </p>
            {hasTechnicalInterviewPendency && formMode === "create" && (
              <p className="mb-4 text-sm font-semibold text-[hsl(var(--primary))]">
                Esta entrevista é necessária para avançar o candidato.
              </p>
            )}
            {hasTechnicalInterviewPendency && formMode === "create" && form.interview_type !== "technical" && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Atenção: uma entrevista de RH não resolverá a pendência técnica.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="font-semibold text-text">Título</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Tipo</span>
                <select
                  value={form.interview_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interview_type: event.target.value as InterviewType }))
                  }
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {Object.entries(INTERVIEW_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Formato</span>
                <select
                  value={form.interview_format}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interview_format: event.target.value as InterviewFormat }))
                  }
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  <option value="online">Online</option>
                  <option value="presencial">Presencial</option>
                  <option value="telefone">Telefone</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Entrevistador</span>
                <input
                  value={form.interviewer_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interviewer_name: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">E-mail do entrevistador</span>
                <input
                  type="email"
                  value={form.interviewer_email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interviewer_email: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Início</span>
                <input
                  type="datetime-local"
                  value={form.scheduled_start}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_start: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Fim</span>
                <input
                  type="datetime-local"
                  value={form.scheduled_end}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_end: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Local</span>
                <input
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Link da reunião</span>
                <input
                  value={form.meeting_url}
                  onChange={(event) => setForm((current) => ({ ...current, meeting_url: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton onClick={() => void submit()} disabled={saving} primary>
                {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {formMode === "reschedule" ? "Salvar reagendamento" : "Salvar entrevista"}
              </ActionButton>
              <ActionButton
                onClick={() => {
                  setFormMode(null);
                  setEditing(null);
                }}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                Cancelar
              </ActionButton>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Entrevistas do processo atual">
        {loading ? (
          <p className="text-sm text-text-muted">Carregando entrevistas...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma entrevista registrada no processo atual.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const isScheduled = item.status === "scheduled" || item.status === "rescheduled";
              const canScorecard = item.status === "completed" || item.status === "awaiting_feedback";
              const isTerminal = item.status === "cancelled" || item.status === "no_show";
              const detailsOpen = detailsInterviewId === item.id;
              const isScorecardGateInterview =
                item.id === scorecardGateInterviewId ||
                (!scorecardGateInterviewId &&
                  hasScorecardGatePendency &&
                  item.counts_for_current_gate &&
                  item.status !== "cancelled" &&
                  item.status !== "no_show");
              const needsScorecardForGate =
                isScorecardGateInterview && item.scorecard_status !== "submitted";
              const scorecardOpen = scorecardInterviewId === item.id;
              const feedbackOpen = feedbackInterviewId === item.id;
              return (
                <li
                  key={item.id}
                  ref={(node) => {
                    interviewRefs.current[item.id] = node;
                  }}
                  className={[
                    "rounded-xl border bg-[hsl(var(--bg))] p-4 transition",
                    highlightedInterviewId === item.id
                      ? "border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/0.20)]"
                      : item.counts_for_current_gate || needsScorecardForGate
                      ? "border-[hsl(var(--primary)/0.35)]"
                      : "border-[hsl(var(--border)/0.7)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.counts_for_current_gate ? "primary" : "neutral"}>
                          {item.counts_for_current_gate ? "Conta para o gate atual" : "Não conta para o gate técnico"}
                        </Badge>
                        <Badge tone="info">{interviewTypeLabel(item.interview_type)}</Badge>
                        <Badge tone={item.status === "completed" ? "success" : item.status === "cancelled" || item.status === "no_show" ? "danger" : "neutral"}>
                          {interviewStatusLabel(item.status)}
                        </Badge>
                      </div>
                      <p className="mt-3 font-semibold text-text">{item.title}</p>
                      <div className="mt-2 grid gap-2 text-sm text-text-muted md:grid-cols-2">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {formatInterviewDateTime(item.scheduled_start)}
                        </span>
                        <span>Formato: {interviewFormatLabel(item.interview_format)}</span>
                        <span>Entrevistador: {item.interviewer_name || item.interviewer_email || "não definido"}</span>
                        <span>Scorecard: {scorecardStatusLabel(item)}</span>
                      </div>
                      {item.counts_for_current_gate ? (
                        <p className="mt-3 rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.06)] px-3 py-2 text-sm font-medium text-text">
                          Esta entrevista é necessária para avançar o candidato.
                        </p>
                      ) : null}
                      {needsScorecardForGate ? (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                          Esta entrevista precisa de scorecard para avançar.
                        </p>
                      ) : null}
                      {isScheduled && (item.counts_for_current_gate || isScorecardGateInterview) ? (
                        <p className="mt-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm text-text-muted">
                          A entrevista precisa ser concluída antes do scorecard.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      {isScheduled ? (
                        <>
                          <ActionButton onClick={() => openReschedule(item)} disabled={saving}>
                            <Pencil className="h-4 w-4" />
                            Reagendar
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.cancelInterviewOperational(item.id, { cancel_reason: "Cancelada pelo recrutador." }),
                                "Entrevista cancelada.",
                              )
                            }
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                            Cancelar
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.completeInterview(item.id),
                                "Entrevista marcada como concluída.",
                              )
                            }
                            disabled={saving}
                            primary
                          >
                            <Check className="h-4 w-4" />
                            Marcar como concluída
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.markNoShow(item.id, { reason: "Candidato não compareceu." }),
                                "Entrevista marcada como não comparecimento.",
                              )
                            }
                            disabled={saving}
                          >
                            <UserX className="h-4 w-4" />
                            Não compareceu
                          </ActionButton>
                        </>
                      ) : null}

                      {canScorecard ? (
                        <>
                          <ActionButton
                            onClick={() => openFeedback(item)}
                            disabled={saving}
                          >
                            <NotebookPen className="h-4 w-4" />
                            Registrar feedback
                          </ActionButton>
                          <ActionButton
                            onClick={() => {
                              setFeedbackInterviewId(null);
                              setFeedbackDraft("");
                              setScorecardInterviewId((current) => (current === item.id ? null : item.id));
                            }}
                            disabled={saving}
                            primary
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            {scorecardActionLabel(item)}
                          </ActionButton>
                        </>
                      ) : null}

                      {isTerminal ? (
                        <>
                          <ActionButton onClick={() => openReschedule(item)} disabled={saving}>
                            <Pencil className="h-4 w-4" />
                            Reagendar
                          </ActionButton>
                          <ActionButton
                            onClick={() => setDetailsInterviewId((current) => (current === item.id ? null : item.id))}
                            disabled={saving}
                          >
                            Ver detalhes
                          </ActionButton>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {detailsOpen ? (
                    <div className="mt-4 rounded-lg border border-border bg-surface p-3 text-sm text-text-muted">
                      <p>Status: {interviewStatusLabel(item.status)}</p>
                      {item.cancel_reason ? <p>Motivo: {item.cancel_reason}</p> : null}
                      {item.internal_notes ? <p>Observações internas: {item.internal_notes}</p> : null}
                    </div>
                  ) : null}

                  {feedbackOpen ? (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                      <label className="block text-sm">
                        <span className="font-semibold text-text">Feedback da entrevista</span>
                        <textarea
                          value={feedbackDraft}
                          onChange={(event) => setFeedbackDraft(event.target.value)}
                          rows={4}
                          className="mt-2 w-full resize-none rounded-lg border border-border bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton onClick={() => void saveFeedback(item)} disabled={saving} primary>
                          {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Salvar feedback
                        </ActionButton>
                        <ActionButton
                          onClick={() => {
                            setFeedbackInterviewId(null);
                            setFeedbackDraft("");
                          }}
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}

                  {scorecardOpen && canScorecard ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-text">
                            {item.scorecard_status === "submitted" ? "Scorecard enviado" : "Scorecard da entrevista"}
                          </p>
                          <p className="text-xs text-text-muted">
                            {interviewTypeLabel(item.interview_type)} · {formatInterviewDateTime(item.scheduled_start)}
                          </p>
                        </div>
                        <ActionButton onClick={() => setScorecardInterviewId(null)}>
                          <X className="h-4 w-4" />
                          Fechar
                        </ActionButton>
                      </div>
                      <InterviewScorecardPanel
                        jobId={jobId}
                        candidateId={candidateId}
                        interviewId={item.id}
                        onChanged={handleScorecardChanged}
                        onSubmitted={handleScorecardSubmitted}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
