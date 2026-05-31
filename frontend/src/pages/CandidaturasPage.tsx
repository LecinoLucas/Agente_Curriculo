import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileSearch,
  Kanban,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ThumbsDown,
  User,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";

import { useAuth } from "../features/auth/useAuth";
import { STAGE_LABEL } from "../features/candidates/utils/profile";
import { deriveScoreSemantics } from "../features/candidates/utils/scoreSemantics";
import { AddCandidateModal } from "../features/candidates/components/AddCandidateModal";
import { candidatesService } from "../services/candidatesService";
import { pipelineService } from "../services/pipelineService";
import { canUseCandidaturasWriteActions } from "../shared/auth/roles";
import { toast } from "../shared/utils/toast";
import type { CandidateListSummary, PipelineStage } from "../types/domain";
import type { InterviewFormat } from "../types/agenda";
import { Button } from "../components/ui/button";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const SCHEDULE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const INTERVIEW_STAGES = new Set<PipelineStage>(["hr_interview", "technical_interview"]);
const DECISION_STAGES = new Set<PipelineStage>(["final", "offer"]);
const CLOSED_STAGES = new Set<PipelineStage>(["rejected", "admitted"]);
const ADMISSION_STAGES = new Set<PipelineStage>(["hired", "pre_admission", "protheus"]);

const WHATSAPP_MSG_GENERIC = (name: string, job: string) =>
  `Olá, ${name}! Tudo bem? Somos do RH da Rede de Postos Marajó. Gostaríamos de falar com você sobre a vaga de ${job}. Podemos conversar por aqui?`;

const WHATSAPP_MSG_INTERVIEW = (name: string, job: string, date: string, time: string) =>
  `Olá, ${name}! Tudo bem? Sua entrevista para a vaga de ${job} está marcada para ${date} às ${time}. Podemos confirmar por aqui?`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScheduledStart(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function addMinutes(isoStart: string, minutes: number): string {
  const d = new Date(isoStart);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function formatInterviewDateTime(isoStart: string): { date: string; time: string } {
  const d = new Date(isoStart);
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API not available");
  }
  await navigator.clipboard.writeText(text);
}

type NextActionLabel =
  | "Marcar entrevista"
  | "Registrar decisão"
  | "Revisar aderência"
  | "Abrir pipeline"
  | "Aguardar análise IA"
  | "Acompanhar admissão"
  | "Sem ação pendente";

type NextAction = {
  label: NextActionLabel;
  description: string;
  tone: "primary" | "success" | "warning" | "danger" | "muted";
};

type ScheduledInterview = {
  scheduled_start: string;
  scheduled_end: string;
};

type OperationalPriorityLabel =
  | "Alta aderência"
  | "Ação pendente"
  | "Entrevista não marcada"
  | "Decisão pendente"
  | "Baixa aderência";

type OperationalPriority = {
  label: OperationalPriorityLabel;
  description: string;
  markerClass: string;
  dotClass: string;
};

function getScheduledInterviewLabel(scheduledInterview: ScheduledInterview | null): string {
  if (!scheduledInterview) return "Não marcada";
  const { date, time } = formatInterviewDateTime(scheduledInterview.scheduled_start);
  return `${date} às ${time}`;
}

function getScoreSemantics(candidate: CandidateListSummary) {
  return deriveScoreSemantics({
    jobFitScore: candidate.active_job_job_fit_score,
    aiStatus: candidate.ai_status,
    hasActiveJob: Boolean(candidate.active_job_id),
  });
}

function getPrimaryScore(candidate: CandidateListSummary): number | null {
  return getScoreSemantics(candidate).primaryScore;
}

function deriveNextAction(
  candidate: CandidateListSummary,
  scheduledInterview: ScheduledInterview | null,
): NextAction {
  const stage = candidate.active_job_stage;
  const score = getPrimaryScore(candidate);

  if (stage && CLOSED_STAGES.has(stage as PipelineStage)) {
    return {
      label: "Sem ação pendente",
      description: "Processo encerrado para esta candidatura.",
      tone: "muted",
    };
  }

  if (stage && ADMISSION_STAGES.has(stage as PipelineStage)) {
    return {
      label: "Acompanhar admissão",
      description: "Candidato já avançou para a rotina de admissão.",
      tone: "success",
    };
  }

  if (stage && DECISION_STAGES.has(stage as PipelineStage)) {
    return {
      label: "Registrar decisão",
      description: "Há uma decisão do RH pendente no fluxo.",
      tone: "warning",
    };
  }

  if (stage && INTERVIEW_STAGES.has(stage as PipelineStage) && !scheduledInterview) {
    return {
      label: "Marcar entrevista",
      description: "Etapa de entrevista sem horário registrado nesta lista.",
      tone: "primary",
    };
  }

  if (scheduledInterview) {
    return {
      label: "Abrir pipeline",
      description: "A entrevista já está marcada. Acompanhe o andamento do processo.",
      tone: "success",
    };
  }

  if (!candidate.active_job_id || score == null || candidate.ai_status !== "completed") {
    return {
      label: "Aguardar análise IA",
      description: "A aderência ainda não está pronta para orientar a próxima decisão.",
      tone: "warning",
    };
  }

  if (score < 60) {
    return {
      label: "Revisar aderência",
      description: "A compatibilidade está baixa e pede revisão antes de avançar.",
      tone: "warning",
    };
  }

  if (score >= 80) {
    return {
      label: "Marcar entrevista",
      description: "A candidatura já tem aderência suficiente para avançar.",
      tone: "primary",
    };
  }

  return {
    label: "Revisar aderência",
    description: "Há contexto suficiente para validar a aderência antes de decidir o próximo passo.",
    tone: "primary",
  };
}

function deriveOperationalPriority(
  candidate: CandidateListSummary,
  scheduledInterview: ScheduledInterview | null,
): OperationalPriority {
  const stage = candidate.active_job_stage;
  const score = getPrimaryScore(candidate);

  if (stage && DECISION_STAGES.has(stage as PipelineStage)) {
    return {
      label: "Decisão pendente",
      description: "O candidato já chegou ao ponto de decisão.",
      markerClass: "bg-[hsl(var(--warning)/0.78)]",
      dotClass: "bg-[hsl(var(--warning)/0.78)]",
    };
  }

  if (stage && INTERVIEW_STAGES.has(stage as PipelineStage) && !scheduledInterview) {
    return {
      label: "Entrevista não marcada",
      description: "A etapa de entrevista está aberta, mas ainda sem horário.",
      markerClass: "bg-[hsl(var(--primary))/0.76]",
      dotClass: "bg-[hsl(var(--primary))/0.76]",
    };
  }

  if (score != null && score >= 80) {
    return {
      label: "Alta aderência",
      description: "Aderência alta para a vaga ativa.",
      markerClass: "bg-[hsl(var(--success)/0.76)]",
      dotClass: "bg-[hsl(var(--success)/0.76)]",
    };
  }

  if (score != null && score < 60) {
    return {
      label: "Baixa aderência",
      description: "Compatibilidade baixa para a vaga ativa.",
      markerClass: "bg-[hsl(var(--danger)/0.72)]",
      dotClass: "bg-[hsl(var(--danger)/0.72)]",
    };
  }

  return {
    label: "Ação pendente",
    description: "A candidatura precisa de acompanhamento operacional.",
    markerClass: "bg-[hsl(var(--text-muted)/0.38)]",
    dotClass: "bg-[hsl(var(--text-muted)/0.58)]",
  };
}

function toneClasses(tone: NextAction["tone"]): string {
  switch (tone) {
    case "success":
      return "border-border/70 bg-surface-muted/35 text-text";
    case "warning":
      return "border-border/70 bg-surface-muted/35 text-text";
    case "danger":
      return "border-border/70 bg-surface-muted/35 text-text";
    case "primary":
      return "border-border/70 bg-surface-muted/35 text-text";
    case "muted":
    default:
      return "border-border/70 bg-surface-muted/25 text-text-muted";
  }
}

function toneDotClasses(tone: NextAction["tone"]): string {
  switch (tone) {
    case "success":
      return "bg-[hsl(var(--success)/0.8)]";
    case "warning":
      return "bg-[hsl(var(--warning)/0.8)]";
    case "danger":
      return "bg-[hsl(var(--danger)/0.8)]";
    case "primary":
      return "bg-[hsl(var(--primary))]/80";
    case "muted":
    default:
      return "bg-[hsl(var(--text-muted)/0.6)]";
  }
}

// ── Score chip ─────────────────────────────────────────────────────────────────

function ScoreChip({ candidate }: { candidate: CandidateListSummary }) {
  const s = getScoreSemantics(candidate);

  if (s.primaryScore === null) {
    return (
      <span
        className="inline-flex w-fit items-center rounded-md border border-border/70 bg-surface-muted/30 px-2 py-1 text-[11px] font-medium text-text-muted"
        data-testid="score-awaiting"
      >
        Aguardando IA
      </span>
    );
  }

  const label =
    s.primaryScore >= 80
      ? "Alta"
      : s.primaryScore >= 60
        ? "Média"
        : "Baixa";

  const colorClass =
    s.statusTone === "high"
      ? "text-success"
      : s.statusTone === "mid"
        ? "text-warning"
        : "text-danger";

  return (
    <div
      className="inline-flex min-w-[5.5rem] flex-col rounded-lg border border-border/70 bg-surface-muted/30 px-2 py-1 leading-tight"
      data-testid="score-chip"
    >
      <span className={`text-sm font-semibold tabular-nums ${colorClass}`}>{s.primaryDisplay}</span>
      <span className="text-[10px] font-medium uppercase text-text-muted">
        {label}
      </span>
    </div>
  );
}

// ── Stage badge ────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string | null }) {
  const label = stage ? (STAGE_LABEL[stage as PipelineStage] ?? stage) : "—";
  const dotCls =
    stage === "rejected"
      ? "bg-[hsl(var(--danger)/0.8)]"
      : stage === "admitted" || stage === "hired"
        ? "bg-[hsl(var(--success)/0.8)]"
        : stage === "pre_admission" || stage === "protheus"
          ? "bg-[hsl(var(--primary))]/80"
          : "bg-[hsl(var(--text-muted)/0.6)]";
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border/70 bg-surface-muted/30 px-2 py-0.5 text-[11px] font-medium text-text">
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function NextActionBadge({ action }: { action: NextAction }) {
  return (
    <span
      className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneClasses(action.tone)}`}
      title={action.description}
      data-testid="next-action"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${toneDotClasses(action.tone)}`} aria-hidden="true" />
      <span className="truncate">{action.label}</span>
    </span>
  );
}

function PriorityBadge({ priority }: { priority: OperationalPriority }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-surface-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted"
      title={priority.description}
      data-testid="candidate-priority"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${priority.dotClass}`} aria-hidden="true" />
      <span className="truncate">{priority.label}</span>
    </span>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-surface-muted/35 text-[11px] font-semibold text-text">
      {initials || "?"}
    </div>
  );
}

function MoreActionsMenu({
  candidate,
  isReadOnly,
  canCopyWhatsApp,
  onOpenProfile,
  onCopyWhatsApp,
  onOpenPipeline,
  onReject,
}: {
  candidate: CandidateListSummary;
  isReadOnly: boolean;
  canCopyWhatsApp: boolean;
  onOpenProfile: () => void;
  onCopyWhatsApp: () => void;
  onOpenPipeline: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({
        position: "fixed",
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        title="Mais ações"
        aria-label={`Mais ações de ${candidate.full_name}`}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        data-testid={`action-more-${candidate.id}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar menu"
                className="fixed inset-0 z-[9998] cursor-default"
                onClick={() => setOpen(false)}
              />
              <div
                className="z-[9999] w-56 overflow-hidden rounded-xl border border-border bg-surface text-sm text-text shadow-xl"
                style={style}
                data-testid={`actions-menu-${candidate.id}`}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
                  onClick={() => run(onOpenProfile)}
                  data-testid={`action-profile-${candidate.id}`}
                >
                  <User className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  Abrir candidato
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canCopyWhatsApp}
                  onClick={() => run(onCopyWhatsApp)}
                  data-testid={`action-whatsapp-${candidate.id}`}
                >
                  <Copy className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  Copiar WhatsApp
                </button>
                {candidate.active_job_id && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
                    onClick={() => run(onOpenPipeline)}
                    data-testid={`action-pipeline-${candidate.id}`}
                  >
                    <ExternalLink className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    Abrir Pipeline
                  </button>
                )}
                {!isReadOnly && (
                  <div className="border-t border-border">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-danger transition-colors hover:bg-danger-soft/60"
                      onClick={() => run(onReject)}
                      data-testid={`action-reject-${candidate.id}`}
                    >
                      <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                      Reprovar
                    </button>
                  </div>
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

// ── Schedule Interview Modal ───────────────────────────────────────────────────

interface ScheduleInterviewModalProps {
  candidate: CandidateListSummary;
  onClose: () => void;
  onSuccess: (candidateId: string, scheduledStart: string, scheduledEnd: string, interviewType: "hr" | "technical") => void;
}

function ScheduleInterviewModal({ candidate, onClose, onSuccess }: ScheduleInterviewModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [interviewType, setInterviewType] = useState<"hr" | "technical">("hr");
  const [format, setFormat] = useState<InterviewFormat>("online");
  const [locationOrUrl, setLocationOrUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) {
      setValidationError("Data e hora são obrigatórios.");
      return;
    }
    if (!candidate.active_job_id) {
      setValidationError("Candidato não possui vaga ativa.");
      return;
    }
    setValidationError(null);
    setSaving(true);

    const scheduledStart = buildScheduledStart(date, time);
    const scheduledEnd = addMinutes(scheduledStart, parseInt(duration, 10));

    try {
      await pipelineService.schedulePipelineInterview(
        candidate.active_job_id,
        candidate.id,
        {
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          timezone: SCHEDULE_TIMEZONE,
          interview_format: format,
          interview_type: interviewType,
          title:
            interviewType === "hr"
              ? `Entrevista RH — ${candidate.full_name}`
              : `Entrevista Técnica — ${candidate.full_name}`,
          location: format === "presencial" ? locationOrUrl || null : null,
          meeting_url: format === "online" ? locationOrUrl || null : null,
          public_notes: notes || null,
          create_google_event: false,
          create_google_meet: false,
        },
      );
      onSuccess(candidate.id, scheduledStart, scheduledEnd, interviewType);
    } catch {
      toast.error("Não foi possível agendar a entrevista. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const locationLabel = format === "presencial" ? "Local" : format === "online" ? "Link" : "Contato";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="schedule-interview-modal"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-text">Marcar entrevista</p>
            <p className="text-xs text-text-muted">{candidate.full_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-lg p-1 text-text-muted hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="flex flex-col gap-4 p-5">
            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted" htmlFor="interview-date">
                  Data *
                </label>
                <input
                  ref={firstFieldRef}
                  id="interview-date"
                  type="date"
                  required
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                  data-testid="interview-date"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted" htmlFor="interview-time">
                  Hora *
                </label>
                <input
                  id="interview-time"
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                  data-testid="interview-time"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted" htmlFor="interview-duration">
                Duração
              </label>
              <select
                id="interview-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                data-testid="interview-duration"
              >
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="90">1h 30min</option>
                <option value="120">2 horas</option>
              </select>
            </div>

            {/* Type + Format */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted" htmlFor="interview-type">
                  Tipo
                </label>
                <select
                  id="interview-type"
                  value={interviewType}
                  onChange={(e) => setInterviewType(e.target.value as "hr" | "technical")}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                  data-testid="interview-type"
                >
                  <option value="hr">Entrevista RH</option>
                  <option value="technical">Entrevista Técnica</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted" htmlFor="interview-format">
                  Formato
                </label>
                <select
                  id="interview-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as InterviewFormat)}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                  data-testid="interview-format"
                >
                  <option value="online">Online</option>
                  <option value="presencial">Presencial</option>
                  <option value="telefone">Telefone</option>
                </select>
              </div>
            </div>

            {/* Location / URL */}
            {format !== "telefone" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted" htmlFor="interview-location">
                  {locationLabel} (opcional)
                </label>
                <input
                  id="interview-location"
                  type="text"
                  value={locationOrUrl}
                  onChange={(e) => setLocationOrUrl(e.target.value)}
                  placeholder={format === "online" ? "https://meet.google.com/..." : "Rua, Bairro..."}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
                  data-testid="interview-location"
                />
              </div>
            )}

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted" htmlFor="interview-notes">
                Observação (opcional)
              </label>
              <textarea
                id="interview-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 resize-none"
                data-testid="interview-notes"
              />
            </div>

            {validationError && (
              <p role="alert" className="text-xs text-danger">
                {validationError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !date || !time}
              data-testid="interview-submit"
            >
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Salvando...
                </span>
              ) : (
                "Confirmar entrevista"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reject Candidate Modal ─────────────────────────────────────────────────────

interface RejectModalProps {
  candidate: CandidateListSummary;
  onClose: () => void;
  onSuccess: (candidateId: string) => void;
}

function RejectCandidateModal({ candidate, onClose, onSuccess }: RejectModalProps) {
  const DEFAULT_REASON = "Não avançou na triagem inicial.";
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { reasonRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleConfirm() {
    if (!reason.trim() || !candidate.active_job_id) return;
    setSaving(true);
    try {
      await pipelineService.moveCandidateStage(candidate.active_job_id, candidate.id, {
        stage: "rejected",
        notes: reason.trim(),
      });
      onSuccess(candidate.id);
    } catch {
      toast.error("Não foi possível reprovar o candidato. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="reject-modal"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl">
        {/* header */}
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-semibold text-text">Reprovar candidato</p>
          <p className="text-xs text-text-muted">{candidate.full_name}</p>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-text-muted">
            O candidato será movido para a etapa <strong className="text-danger">Reprovado</strong>. Essa ação pode ser revertida na Pipeline.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted" htmlFor="reject-reason">
              Motivo *
            </label>
            <textarea
              ref={reasonRef}
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--danger))]/30 resize-none"
              data-testid="reject-reason"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || !reason.trim()}
            onClick={() => void handleConfirm()}
            className="bg-danger text-white hover:bg-danger/90"
            data-testid="reject-confirm"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Reprovando...
              </span>
            ) : (
              "Reprovar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────────

interface DrawerProps {
  candidate: CandidateListSummary;
  isReadOnly: boolean;
  scheduledInterview: { scheduled_start: string } | null;
  onClose: () => void;
  onOpenProfile: () => void;
  onScheduleInterview: () => void;
  onReject: () => void;
  onOpenPipeline: () => void;
  onCopyWhatsApp: () => void;
}

function CandidaturaDrawer({
  candidate,
  isReadOnly,
  scheduledInterview,
  onClose,
  onOpenProfile,
  onScheduleInterview,
  onReject,
  onOpenPipeline,
  onCopyWhatsApp,
}: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = candidate.full_name;
  const job = candidate.active_job_title ?? "Vaga não informada";
  const stage = candidate.active_job_stage;
  const phone = candidate.phone;
  const nextAction = deriveNextAction(candidate, scheduledInterview);
  const interviewLabel = getScheduledInterviewLabel(scheduledInterview);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="candidatura-drawer">
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 bg-black/30 cursor-default"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">{name}</p>
              <p className="truncate text-sm text-text-muted">{job}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StageBadge stage={stage} />
                <ScoreChip candidate={candidate} />
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-4 p-5">
          <section
            className="rounded-xl border border-border bg-surface-muted/60 px-4 py-3"
            data-testid="drawer-summary"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Resumo</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Vaga</dt>
                <dd className="mt-0.5 truncate font-medium text-text">{job}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Status</dt>
                <dd className="mt-1"><StageBadge stage={stage} /></dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-text-muted">Entrevista</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-text">
                  <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  {interviewLabel}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className={`rounded-xl border px-4 py-3 ${toneClasses(nextAction.tone)}`}
            data-testid="drawer-next-action"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-75">Próxima ação</p>
            <p className="text-sm font-semibold">{nextAction.label}</p>
            <p className="mt-1 text-xs opacity-85">{nextAction.description}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Contato</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-text">
                <Mail className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate">{candidate.email ?? "E-mail não informado"}</span>
              </div>
              <div className="flex items-center gap-2 text-text">
                <Phone className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <span>{phone ?? "Telefone não informado"}</span>
              </div>
            </div>
          </section>
        </div>

        {/* actions */}
        <div className="border-t border-border p-4 space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Ações principais</p>
          {!isReadOnly && (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={onScheduleInterview}
              data-testid="drawer-schedule"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {scheduledInterview ? "Reagendar entrevista" : "Marcar entrevista"}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={onCopyWhatsApp}
            disabled={!phone}
            data-testid="drawer-whatsapp"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar WhatsApp
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={onOpenProfile}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir perfil completo
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={onOpenPipeline}
            data-testid="drawer-pipeline"
          >
            <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir Pipeline
          </Button>

          {!isReadOnly && (
            <div className="mt-3 border-t border-border pt-3" data-testid="drawer-danger-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-danger hover:text-danger"
                onClick={onReject}
                data-testid="drawer-reject"
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                Reprovar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function CandidaturasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReadOnly = !canUseCandidaturasWriteActions(user?.role);

  const [candidates, setCandidates] = useState<CandidateListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Quick-action state
  const [interviewTarget, setInterviewTarget] = useState<CandidateListSummary | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CandidateListSummary | null>(null);
  const [scheduledInterviews, setScheduledInterviews] = useState<Record<string, ScheduledInterview>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  const uniqueJobs = useMemo(
    () => [...new Set(candidates.map((c) => c.active_job_title).filter(Boolean))] as string[],
    [candidates],
  );

  const filtered = useMemo(() => {
    if (!jobFilter) return candidates;
    return candidates.filter((c) => c.active_job_title === jobFilter);
  }, [candidates, jobFilter]);

  const load = useCallback(async (currentPage: number, currentSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await candidatesService.listSummaries(currentPage, PAGE_SIZE, {
        search: currentSearch || undefined,
        link_status_filter: "with_active_job",
      });
      setCandidates(result.data);
      setTotalPages(result.total_pages);
      setTotal(result.total);

      // Seed scheduledInterviews from backend next_interview (source of truth)
      const fromBackend: Record<string, ScheduledInterview> = {};
      for (const c of result.data) {
        if (c.next_interview) {
          fromBackend[c.id] = {
            scheduled_start: c.next_interview.scheduled_start,
            scheduled_end: c.next_interview.scheduled_end,
          };
        }
      }
      setScheduledInterviews(fromBackend);
    } catch {
      setError("Não foi possível carregar as candidaturas. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page, search);
  }, [load, page, search]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    setJobFilter("");
  }

  function openProfile(id: string) {
    navigate(`/candidatos/${id}`);
  }

  function openPipeline(candidate: CandidateListSummary) {
    const jobId = candidate.active_job_id;
    if (jobId) {
      navigate(`/pipeline/${jobId}?candidateId=${candidate.id}`);
    } else {
      navigate("/pipeline");
    }
  }

  function handleCopyWhatsApp(candidate: CandidateListSummary) {
    const name = candidate.full_name;
    const job = candidate.active_job_title ?? "a vaga";
    const interview = scheduledInterviews[candidate.id];
    const msg = interview
      ? (() => {
          const { date, time } = formatInterviewDateTime(interview.scheduled_start);
          return WHATSAPP_MSG_INTERVIEW(name, job, date, time);
        })()
      : WHATSAPP_MSG_GENERIC(name, job);

    void copyToClipboard(msg)
      .then(() => { toast.success("Mensagem copiada para o clipboard."); })
      .catch(() => { toast.error("Não foi possível copiar a mensagem."); });
  }

  function handleCopyContact(candidate: CandidateListSummary) {
    const contact = candidate.phone ?? candidate.email;
    if (!contact) return;

    void copyToClipboard(contact)
      .then(() => { toast.success("Contato copiado."); })
      .catch(() => { toast.error("Não foi possível copiar o contato."); });
  }

  function handleInterviewSuccess(
    candidateId: string,
    scheduledStart: string,
    scheduledEnd: string,
    interviewType: "hr" | "technical",
  ) {
    setScheduledInterviews((prev) => ({
      ...prev,
      [candidateId]: { scheduled_start: scheduledStart, scheduled_end: scheduledEnd },
    }));
    const newStage = interviewType === "hr" ? "hr_interview" : "technical_interview";
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, active_job_stage: newStage } : c)),
    );
    setInterviewTarget(null);
    toast.success("Entrevista marcada com sucesso.");
  }

  function handleRejectSuccess(candidateId: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setRejectTarget(null);
    setSelectedId((prev) => (prev === candidateId ? null : prev));
    toast.success("Candidato reprovado.");
  }

  const anyModalOpen = Boolean(interviewTarget || rejectTarget || addModalOpen);
  const visibleCandidates = filtered;
  const operationalSummary = useMemo(() => {
    const highFitCount = visibleCandidates.filter((candidate) => {
      const score = getPrimaryScore(candidate);
      return score != null && score >= 80;
    }).length;

    const readyForInterviewCount = visibleCandidates.filter((candidate) => {
      const stage = candidate.active_job_stage;
      const score = getPrimaryScore(candidate);
      const hasInterview = Boolean(scheduledInterviews[candidate.id]);
      return Boolean(
        score != null &&
          score >= 80 &&
          !hasInterview &&
          stage &&
          !INTERVIEW_STAGES.has(stage as PipelineStage) &&
          !DECISION_STAGES.has(stage as PipelineStage) &&
          !ADMISSION_STAGES.has(stage as PipelineStage) &&
          !CLOSED_STAGES.has(stage as PipelineStage),
      );
    }).length;

    const decisionPendingCount = visibleCandidates.filter((candidate) => {
      const stage = candidate.active_job_stage;
      return Boolean(stage && DECISION_STAGES.has(stage as PipelineStage));
    }).length;

    const interviewMissingCount = visibleCandidates.filter((candidate) => {
      const stage = candidate.active_job_stage;
      return Boolean(
        stage &&
          INTERVIEW_STAGES.has(stage as PipelineStage) &&
          !scheduledInterviews[candidate.id],
      );
    }).length;

    const awaitingActionCount = visibleCandidates.filter((candidate) => {
      const action = deriveNextAction(candidate, scheduledInterviews[candidate.id] ?? null);
      return action.label === "Aguardar análise IA" || action.label === "Revisar aderência";
    }).length;

    return {
      primary: `${highFitCount} com alta aderência · ${readyForInterviewCount} prontos para entrevista · ${decisionPendingCount} prontos para decisão`,
      secondary: `Atenção: ${interviewMissingCount} sem entrevista marcada · ${awaitingActionCount} aguardando ação`,
    };
  }, [scheduledInterviews, visibleCandidates]);

  return (
    <div className="flex flex-col gap-4 pt-8 sm:pt-10 lg:pt-0">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text">Candidaturas</h1>
          {!loading && (
            <span className="rounded-md border border-border/70 bg-surface-muted/30 px-2 py-0.5 text-[11px] font-medium text-text-muted" aria-live="polite">
              {total} {total === 1 ? "candidatura" : "candidaturas"}
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">Triagem diária de candidatos vinculados a vagas ativas.</p>
      </div>

      {!loading && visibleCandidates.length > 0 && (
        <section
          className="rounded-xl border border-border/70 bg-surface px-3 py-2.5 shadow-sm"
          data-testid="operational-summary"
        >
          <p className="text-sm font-semibold text-text" data-testid="operational-summary-primary">
            {operationalSummary.primary}
          </p>
          <p className="mt-1 text-xs text-text-muted" data-testid="operational-summary-secondary">
            {operationalSummary.secondary}
          </p>
        </section>
      )}

      {/* Unified Control Bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Search & Filters */}
        <div className="flex w-full flex-1 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Buscar nome, e-mail ou telefone"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-transparent bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-border/70 focus:bg-surface-muted/25 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-colors"
              aria-label="Buscar candidaturas"
              data-testid="search-input"
            />
          </div>

          <div className="hidden h-6 w-px bg-border/70 sm:block" aria-hidden="true"></div>

          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="h-10 w-full rounded-lg border border-transparent bg-surface px-3 text-sm text-text focus:border-border/70 focus:bg-surface-muted/25 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-colors sm:w-56"
            aria-label="Filtrar por vaga"
            data-testid="job-filter"
          >
            <option value="">Todas as vagas</option>
            {uniqueJobs.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>

        {/* Right: Actions */}
        <div className="flex w-full items-center justify-end gap-2 shrink-0 sm:w-auto">
          <button
            type="button"
            onClick={() => void load(page, search)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface text-text-muted transition-colors hover:bg-surface-muted/40 hover:text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            aria-label="Atualizar"
            title="Atualizar"
            data-testid="refresh-button"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/pipeline")}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface-muted/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            aria-label="Abrir Pipeline"
            data-testid="pipeline-link"
          >
            <Kanban className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            <span>Pipeline</span>
          </button>

          {!isReadOnly && (
            <Button
              type="button"
              className="h-9 gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm shadow-none"
              onClick={() => setAddModalOpen(true)}
              data-testid="add-candidates-btn"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Adicionar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.05)] px-4 py-3 text-sm text-danger"
          data-testid="candidaturas-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Erro ao carregar candidaturas</p>
            <p className="text-xs opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-full table-fixed text-sm md:min-w-[760px] lg:min-w-[1120px]" data-testid="candidaturas-table">
          <thead>
            <tr className="border-b border-border bg-surface-muted/45">
              <th className="w-[72%] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-[31%] lg:w-[24%]">
                Candidato
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:table-cell sm:w-[23%] lg:w-[17%]">
                Vaga
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted md:table-cell md:w-[14%] lg:w-[11%]">
                Status
              </th>
              <th className="w-[28%] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-[18%] lg:w-[11%]">
                Score IA
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:table-cell lg:w-[15%]">
                Entrevista
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted md:table-cell md:w-[14%] lg:w-[12%]">
                Próxima ação
              </th>
              <th className="hidden px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:table-cell lg:w-[10%]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-2" data-testid="candidaturas-loading">
                    <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
                    <p className="text-sm font-medium text-text" role="status">Carregando lista</p>
                    <p className="text-xs text-text-muted">Buscando candidaturas com vaga ativa.</p>
                  </div>
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16">
                  <div
                    className="mx-auto flex max-w-md flex-col items-center gap-2 px-6 text-center"
                    data-testid={search || jobFilter ? "filtered-empty-state" : "empty-state"}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-text-muted">
                      <FileSearch className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold text-text">
                      {search || jobFilter ? "Nenhum resultado para os filtros" : "Nenhuma candidatura ativa"}
                    </p>
                    <p className="text-xs leading-relaxed text-text-muted">
                      {search || jobFilter
                        ? "Ajuste a busca ou limpe o filtro de vaga para ver outros candidatos."
                        : "Quando houver candidatos vinculados a vagas ativas, eles aparecerão nesta lista."}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              visibleCandidates.map((c) => {
                const scheduledInterview = scheduledInterviews[c.id] ?? null;
                const hasInterview = Boolean(scheduledInterview);
                const nextAction = deriveNextAction(c, scheduledInterview);
                const priority = deriveOperationalPriority(c, scheduledInterview);
                const mobileContact = c.phone ?? c.email;
                const mobileContactIcon = c.phone ? Phone : Mail;
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-surface-muted/25 transition-colors"
                    onClick={() => setSelectedId(c.id)}
                    data-testid={`row-${c.id}`}
                  >
                    {/* Candidate */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 h-10 w-1 shrink-0 rounded-full ${priority.markerClass}`} aria-hidden="true" />
                        <Avatar name={c.full_name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{c.full_name}</p>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted sm:hidden">
                            <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{c.active_job_title ?? "Vaga não informada"}</span>
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                            <PriorityBadge priority={priority} />
                            <div className="min-w-0 md:hidden">
                              <NextActionBadge action={nextAction} />
                            </div>
                          </div>
                          <div className="mt-1 hidden min-w-0 items-center gap-3 text-[11px] text-text-muted md:flex md:flex-wrap">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{c.email ?? "E-mail não informado"}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                              {c.phone ?? "Telefone não informado"}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted md:hidden">
                            {mobileContact ? (
                              <>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {mobileContactIcon === Phone ? (
                                    <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="truncate">{mobileContact}</span>
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Copiar contato de ${c.full_name}`}
                                  title="Copiar contato"
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface text-text-muted transition-colors hover:bg-surface-muted/40 hover:text-text"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleCopyContact(c);
                                  }}
                                  data-testid={`action-copy-contact-${c.id}`}
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <span>Contato não informado</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Job */}
                    <td className="hidden px-3 py-2 align-top sm:table-cell">
                      <div className="flex min-w-0 items-start gap-2">
                        <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text">{c.active_job_title ?? "Vaga não informada"}</p>
                          <p className="text-[11px] text-text-muted">
                            {c.application_source === "manual" ? "Entrada manual" : "Candidatura recebida"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="hidden px-3 py-2 align-top md:table-cell">
                      <StageBadge stage={c.active_job_stage} />
                    </td>

                    {/* Score */}
                    <td className="px-3 py-2 align-top">
                      <ScoreChip candidate={c} />
                    </td>

                    {/* Interview */}
                    <td className="hidden px-3 py-2 align-top lg:table-cell">
                      {hasInterview ? (
                        <span
                          className="inline-flex max-w-full flex-col rounded-lg border border-border/70 bg-surface-muted/30 px-2 py-1 text-text"
                          data-testid={`interview-badge-${c.id}`}
                        >
                          <span className="flex items-center gap-1 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />
                            Entrevista marcada
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {getScheduledInterviewLabel(scheduledInterview)}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-muted/25 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Não marcada
                        </span>
                      )}
                    </td>

                    {/* Next action */}
                    <td className="hidden px-3 py-2 align-top md:table-cell">
                      <div className="max-w-[10rem]">
                        <NextActionBadge action={nextAction} />
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="hidden px-3 py-2 align-top lg:table-cell" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Abrir candidato"
                          aria-label={`Abrir candidato ${c.full_name}`}
                          onClick={() => openProfile(c.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-surface text-text-muted transition-colors hover:bg-surface-muted/40 hover:text-text"
                          data-testid={`action-open-profile-${c.id}`}
                        >
                          <User className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          title="Abrir pipeline"
                          aria-label={`Abrir pipeline de ${c.full_name}`}
                          onClick={() => openPipeline(c)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-surface text-text-muted transition-colors hover:bg-surface-muted/40 hover:text-text"
                          data-testid={`action-open-pipeline-${c.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        {!isReadOnly && (
                          <button
                            type="button"
                            title="Marcar entrevista"
                            aria-label={`Marcar entrevista com ${c.full_name}`}
                            onClick={() => setInterviewTarget(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-surface text-text transition-colors hover:bg-surface-muted/40"
                            data-testid={`action-interview-${c.id}`}
                          >
                            <Calendar className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                          </button>
                        )}

                        <MoreActionsMenu
                          candidate={c}
                          isReadOnly={isReadOnly}
                          canCopyWhatsApp={Boolean(c.phone)}
                          onOpenProfile={() => openProfile(c.id)}
                          onCopyWhatsApp={() => handleCopyWhatsApp(c)}
                          onOpenPipeline={() => openPipeline(c)}
                          onReject={() => setRejectTarget(c)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Anterior
          </Button>
          <span className="text-xs text-text-muted">
            Página {page} de {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Drawer */}
      {selectedCandidate && !anyModalOpen && (
        <CandidaturaDrawer
          candidate={selectedCandidate}
          isReadOnly={isReadOnly}
          scheduledInterview={scheduledInterviews[selectedCandidate.id] ?? null}
          onClose={() => setSelectedId(null)}
          onOpenProfile={() => openProfile(selectedCandidate.id)}
          onScheduleInterview={() => setInterviewTarget(selectedCandidate)}
          onReject={() => setRejectTarget(selectedCandidate)}
          onOpenPipeline={() => openPipeline(selectedCandidate)}
          onCopyWhatsApp={() => handleCopyWhatsApp(selectedCandidate)}
        />
      )}

      {/* Schedule Interview Modal */}
      {interviewTarget && (
        <ScheduleInterviewModal
          candidate={interviewTarget}
          onClose={() => setInterviewTarget(null)}
          onSuccess={handleInterviewSuccess}
        />
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectCandidateModal
          candidate={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={handleRejectSuccess}
        />
      )}

      {/* Add Candidate Modal */}
      {addModalOpen && (
        <AddCandidateModal
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => void load(page, search)}
        />
      )}
    </div>
  );
}
