import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Field } from "../../shared/components/forms/Field";
import { useGoogleCalendarConnection } from "./useGoogleCalendarConnection";
import { agendaService } from "../../services/agendaService";
import { candidatesService } from "../../services/candidatesService";
import { HttpError } from "../../services/http";
import { listJobs } from "../../services/jobsService";
import { toast } from "../../shared/utils/toast";
import { formatContextError } from "../../services/errorMessages";
import {
  InterviewSchedule,
  InterviewScheduleCreatePayload,
  InterviewScheduleUpdatePayload,
} from "../../types/agenda";
import { CandidateListSummary } from "../../types/domain";
import { Job } from "../../types/domain";

interface AgendaInterviewModalProps {
  isOpen: boolean;
  isEdit: boolean;
  scheduleId?: string;
  initialCandidateId?: string | null;
  initialJobId?: string | null;
  initialPipelineId?: string | null;
  onClose: () => void;
  onSuccess?: (schedule: InterviewSchedule) => Promise<void> | void;
}

const INTERVIEW_TYPES = [
  { value: "screening", label: "Triagem" },
  { value: "technical", label: "Técnica" },
  { value: "manager", label: "Gerente" },
  { value: "hr", label: "RH" },
  { value: "final", label: "Final" },
  { value: "other", label: "Outro" },
];

const STATUSES = [
  { value: "scheduled", label: "Agendada" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
  { value: "rescheduled", label: "Remarcada" },
  { value: "no_show", label: "Não compareceu" },
];

const INTERVIEW_FORMATS = [
  { value: "online", label: "Online" },
  { value: "presencial", label: "Presencial" },
  { value: "telefone", label: "Telefone" },
];

interface FormState {
  candidate_id: string;
  job_id: string;
  pipeline_id: string;
  title: string;
  description: string;
  public_notes: string;
  internal_notes: string;
  scheduled_start: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  timezone: string;
  interview_type: string;
  interview_format: string;
  status: string;
  location: string;
  meeting_url: string;
  interviewer_name: string;
  interviewer_email: string;
  create_google_event: boolean;
  create_google_meet: boolean;
}

interface EditSnapshot {
  status: string;
  scheduled_start: string;
  scheduled_end: string;
}

function formatAgendaModalError(error: unknown, isEdit: boolean): string {
  if (error instanceof HttpError && error.status === 409 && error.message.trim()) {
    return error.message;
  }

  return formatContextError(
    error,
    isEdit
      ? "Não foi possível atualizar a entrevista."
      : "Não foi possível criar a entrevista.",
    "Verifique os dados e tente novamente."
  );
}

export function AgendaInterviewModal({
  isOpen,
  isEdit,
  scheduleId,
  initialCandidateId,
  initialJobId,
  initialPipelineId,
  onClose,
  onSuccess,
}: AgendaInterviewModalProps) {
  const [form, setForm] = useState<FormState>({
    candidate_id: "",
    job_id: "",
    pipeline_id: "",
    title: "",
    description: "",
    public_notes: "",
    internal_notes: "",
    scheduled_start: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
    timezone: "America/Recife",
    interview_type: "technical",
    interview_format: "online",
    status: "scheduled",
    location: "",
    meeting_url: "",
    interviewer_name: "",
    interviewer_email: "",
    create_google_event: false,
    create_google_meet: false,
  });

  const [candidates, setCandidates] = useState<CandidateListSummary[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null);
  const {
    googleConnected,
    googleAccountEmail,
    connectingGoogle,
    connectGoogleCalendar,
  } = useGoogleCalendarConnection({ enabled: isOpen });

  // Load candidates and jobs on mount
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadData = async () => {
      setLoadingData(true);
      try {
        const [candidatesRes, jobsRes] = await Promise.all([
          candidatesService.listSummaries(1, 100, undefined, undefined, undefined, false),
          listJobs(1, 100, { statusFilter: "published" }),
        ]);

        if (cancelled) return;

        setCandidates(candidatesRes.data);
        setJobs(jobsRes.data);
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar dados:", err);
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    loadData();

    // Load existing interview if editing
    if (isEdit && scheduleId) {
      agendaService
        .getInterview(scheduleId)
        .then((schedule) => {
          if (cancelled) return;

          const startDate = new Date(schedule.scheduled_start);
          const endDate = new Date(schedule.scheduled_end);

          setForm({
            candidate_id: schedule.candidate_id,
            job_id: schedule.job_id || "",
            pipeline_id: "",
            title: schedule.title,
            description: schedule.description || "",
            public_notes: schedule.public_notes || "",
            internal_notes: schedule.internal_notes || "",
            scheduled_start: startDate.toISOString().split("T")[0],
            scheduled_start_time: startDate.toTimeString().slice(0, 5),
            scheduled_end_time: endDate.toTimeString().slice(0, 5),
            timezone: schedule.timezone,
            interview_type: schedule.interview_type,
            interview_format: schedule.interview_format,
            status: schedule.status,
            location: schedule.location || "",
            meeting_url: schedule.meeting_url || "",
            interviewer_name: schedule.interviewer_name || "",
            interviewer_email: schedule.interviewer_email || "",
          });
          setEditSnapshot({
            status: schedule.status,
            scheduled_start: schedule.scheduled_start,
            scheduled_end: schedule.scheduled_end,
          });
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(
            formatContextError(
              err,
              "Não foi possível carregar a entrevista.",
              "Tente novamente."
            )
          );
          setLoading(false);
        });
    } else {
      setForm((current) => ({
        ...current,
        candidate_id: initialCandidateId ?? "",
        job_id: initialJobId ?? "",
        pipeline_id: initialPipelineId ?? "",
      }));
      setEditSnapshot(null);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [initialCandidateId, initialJobId, initialPipelineId, isOpen, isEdit, scheduleId]);

  const handleFormChange = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setValidationError(null);
  };

  const validateForm = (): boolean => {
    if (!form.candidate_id) {
      setValidationError("Candidato é obrigatório");
      return false;
    }
    if (!form.title) {
      setValidationError("Título é obrigatório");
      return false;
    }
    if (!form.scheduled_start) {
      setValidationError("Data é obrigatória");
      return false;
    }
    if (!form.scheduled_start_time) {
      setValidationError("Hora de início é obrigatória");
      return false;
    }
    if (!form.scheduled_end_time) {
      setValidationError("Hora de fim é obrigatória");
      return false;
    }
    if (!form.interview_type) {
      setValidationError("Tipo de entrevista é obrigatório");
      return false;
    }

    // Validate past date
    const startDatetime = new Date(buildDatetimeString(form.scheduled_start, form.scheduled_start_time));
    if (startDatetime < new Date()) {
      setValidationError("Não é possível agendar uma entrevista no passado");
      return false;
    }

    // Validate time range
    const startMinutes = parseInt(form.scheduled_start_time.split(":")[0]) * 60 +
      parseInt(form.scheduled_start_time.split(":")[1]);
    const endMinutes = parseInt(form.scheduled_end_time.split(":")[0]) * 60 +
      parseInt(form.scheduled_end_time.split(":")[1]);

    if (endMinutes <= startMinutes) {
      setValidationError("Hora de fim deve ser maior que hora de início");
      return false;
    }

    return true;
  };

  const buildDatetimeString = (date: string, time: string): string => {
    const [year, month, day] = date.split("-");
    const [hours, minutes] = time.split(":");
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      0
    ).toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scheduled_start = buildDatetimeString(
        form.scheduled_start,
        form.scheduled_start_time
      );
      const scheduled_end = buildDatetimeString(
        form.scheduled_start,
        form.scheduled_end_time
      );

      if (isEdit && scheduleId) {
        const statusWasManuallyChanged =
          editSnapshot != null && form.status !== editSnapshot.status;
        const timeWasChanged =
          editSnapshot != null &&
          (scheduled_start !== editSnapshot.scheduled_start ||
            scheduled_end !== editSnapshot.scheduled_end);
        const payload: InterviewScheduleUpdatePayload = {
          title: form.title || undefined,
          description: form.description || null,
          public_notes: form.public_notes || null,
          internal_notes: form.internal_notes || null,
          scheduled_start,
          scheduled_end,
          timezone: form.timezone,
          interview_type: form.interview_type as any,
          interview_format: form.interview_format as any,
          status:
            statusWasManuallyChanged || !timeWasChanged
              ? (form.status as any)
              : undefined,
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
          sync_google_event: form.create_google_event,
          create_google_meet: form.create_google_meet,
        };

        const result = await agendaService.updateInterview(scheduleId, payload);
        toast.success("Entrevista atualizada com sucesso!");
        await onSuccess?.(result);
      } else {
        const payload: InterviewScheduleCreatePayload = {
          candidate_id: form.candidate_id,
          job_id: form.job_id || null,
          pipeline_id: form.pipeline_id || null,
          title: form.title,
          description: form.description || null,
          public_notes: form.public_notes || null,
          internal_notes: form.internal_notes || null,
          scheduled_start,
          scheduled_end,
          timezone: form.timezone,
          interview_type: form.interview_type as any,
          interview_format: form.interview_format as any,
          status: form.status as any,
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
          create_google_event: form.create_google_event,
          create_google_meet: form.create_google_meet,
        };

        const result = await agendaService.createInterview(payload);
        toast.success("Entrevista criada com sucesso!");
        await onSuccess?.(result);
      }

      onClose();
    } catch (err) {
      setError(formatAgendaModalError(err, isEdit));
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      await connectGoogleCalendar();
    } catch (err) {
      console.error("Erro ao obter URL de autenticação:", err);
      toast.error("Não foi possível iniciar a conexão com o Google Calendar.");
    }
  };

  if (!isOpen) return null;

  if (loadingData) {
    return (
      <Modal
        title={isEdit ? "Editar entrevista" : "Nova entrevista"}
        onClose={onClose}
      >
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--text-muted))]" />
            <p className="text-sm text-[hsl(var(--text-muted))]">
              Carregando dados...
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={isEdit ? "Editar entrevista" : "Nova entrevista"}
      onClose={onClose}
    >
      <form
        data-testid="agenda-interview-modal"
        onSubmit={handleSubmit}
        className="flex flex-col overflow-hidden"
      >
        {/* Error banner */}
        {error && (
          <div className="border-b border-[hsl(var(--border))] bg-rose-50 px-6 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-900">{error}</p>
              </div>
            </div>
          </div>
        )}

        {validationError && (
          <div className="border-b border-[hsl(var(--border))] bg-amber-50 px-6 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="text-sm font-medium text-amber-900">{validationError}</p>
            </div>
          </div>
        )}

        {/* Form fields */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Candidate */}
            <Field label="Candidato *">
              <select
                value={form.candidate_id}
                onChange={(e) =>
                  handleFormChange({ candidate_id: e.target.value })
                }
                disabled={isEdit}
                className="ui-input h-11 rounded-xl px-3 text-sm disabled:opacity-60"
              >
                <option value="">Selecione um candidato</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Job (optional) */}
            <Field label="Vaga (opcional)">
              <select
                value={form.job_id}
                onChange={(e) =>
                  handleFormChange({ job_id: e.target.value })
                }
                className="ui-input h-11 rounded-xl px-3 text-sm"
              >
                <option value="">Nenhuma vaga</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </Field>

            {/* Title */}
            <Field label="Título *">
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  handleFormChange({ title: e.target.value })
                }
                placeholder="Ex: Entrevista técnica com o candidato"
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </Field>

            {/* Interview Type */}
            <Field label="Tipo de entrevista *">
              <select
                value={form.interview_type}
                onChange={(e) =>
                  handleFormChange({ interview_type: e.target.value })
                }
                className="ui-input h-11 rounded-xl px-3 text-sm"
              >
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Status */}
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) =>
                  handleFormChange({ status: e.target.value })
                }
                className="ui-input h-11 rounded-xl px-3 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Formato">
              <select
                value={form.interview_format}
                onChange={(e) =>
                  handleFormChange({ interview_format: e.target.value })
                }
                className="ui-input h-11 rounded-xl px-3 text-sm"
              >
                {INTERVIEW_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Date */}
            <Field label="Data *">
              <input
                type="date"
                value={form.scheduled_start}
                onChange={(e) =>
                  handleFormChange({ scheduled_start: e.target.value })
                }
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </Field>

            {/* Time range */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Início *">
                <input
                  type="time"
                  value={form.scheduled_start_time}
                  onChange={(e) =>
                    handleFormChange({ scheduled_start_time: e.target.value })
                  }
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                />
              </Field>

              <Field label="Fim *">
                <input
                  type="time"
                  value={form.scheduled_end_time}
                  onChange={(e) =>
                    handleFormChange({ scheduled_end_time: e.target.value })
                  }
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                />
              </Field>
            </div>

            {/* Timezone */}
            <Field label="Timezone">
              <input
                type="text"
                value={form.timezone}
                onChange={(e) =>
                  handleFormChange({ timezone: e.target.value })
                }
                placeholder="America/Recife"
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </Field>

            {/* Interviewer */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Avaliador (nome)">
                <input
                  type="text"
                  value={form.interviewer_name}
                  onChange={(e) =>
                    handleFormChange({ interviewer_name: e.target.value })
                  }
                  placeholder="Ex: João Silva"
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                />
              </Field>

              <Field label="Avaliador (e-mail)">
                <input
                  type="email"
                  value={form.interviewer_email}
                  onChange={(e) =>
                    handleFormChange({ interviewer_email: e.target.value })
                  }
                  placeholder="joao@example.com"
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                />
              </Field>
            </div>

            {/* Location */}
            <Field label="Local">
              <input
                type="text"
                value={form.location}
                onChange={(e) =>
                  handleFormChange({ location: e.target.value })
                }
                placeholder="Ex: Sala de reunião 3 / Presencial / Online"
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </Field>

            {/* Meeting URL */}
            <Field label="Link da reunião">
              <input
                type="url"
                value={form.meeting_url}
                onChange={(e) =>
                  handleFormChange({ meeting_url: e.target.value })
                }
                placeholder="https://meet.google.com/..."
                className="ui-input h-11 rounded-xl px-3 text-sm"
              />
            </Field>

            {/* Sincronização com calendário */}
            <div className="pt-2">
              <h4 className="text-sm font-medium text-[hsl(var(--text))] mb-2">Sincronização com calendário</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[hsl(var(--text))]">
                  <input
                    type="checkbox"
                    checked={form.create_google_event}
                    onChange={(e) =>
                      handleFormChange({ create_google_event: e.target.checked })
                    }
                    disabled={!googleConnected}
                    className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
                  />
                  <span>Adicionar ao Google Calendar</span>
                </label>
                
                <label className="flex items-center gap-2 text-sm text-[hsl(var(--text))]">
                  <input
                    type="checkbox"
                    checked={form.create_google_meet}
                    onChange={(e) =>
                      handleFormChange({ create_google_meet: e.target.checked })
                    }
                    disabled={!googleConnected || !form.create_google_event}
                    className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
                  />
                  <span>Criar link do Google Meet</span>
                </label>
                
                {!googleConnected && (
                  <p className="text-sm text-[hsl(var(--text-muted))]">
                    <button
                      type="button"
                      onClick={() => void handleConnectGoogle()}
                      disabled={connectingGoogle}
                      className="text-[hsl(var(--primary))] hover:underline"
                    >
                      {connectingGoogle ? "Conectando..." : "Conectar Google Calendar"}
                    </button>{" "}
                    para habilitar a sincronização.
                  </p>
                )}
                
                {googleConnected && (
                  <p className="text-sm text-green-600">
                    Google Calendar conectado{googleAccountEmail ? `: ${googleAccountEmail}` : ""}.
                  </p>
                )}
              </div>
            </div>

            <Field label="Observação pública para o candidato">
              <textarea
                value={form.public_notes}
                onChange={(e) =>
                  handleFormChange({ public_notes: e.target.value })
                }
                placeholder="Mensagem visível no portal do candidato"
                className="ui-input rounded-xl px-3 py-2 text-sm resize-none"
                rows={3}
              />
            </Field>

            <Field label="Observações internas">
              <textarea
                value={form.internal_notes}
                onChange={(e) =>
                  handleFormChange({ internal_notes: e.target.value })
                }
                placeholder="Notas privadas da equipe de recrutamento"
                className="ui-input rounded-xl px-3 py-2 text-sm resize-none"
                rows={3}
              />
            </Field>

            {/* Description */}
            <Field label="Descrição">
              <textarea
                value={form.description}
                onChange={(e) =>
                  handleFormChange({ description: e.target.value })
                }
                placeholder="Notas adicionais sobre a entrevista"
                className="ui-input rounded-xl px-3 py-2 text-sm resize-none"
                rows={3}
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-6 py-4 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-sm font-medium text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))] transition disabled:opacity-50"
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="h-11 px-6 rounded-xl bg-[hsl(var(--primary))] text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Atualizar" : "Criar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
