import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  Kanban,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  ThumbsDown,
  User,
  X,
} from "lucide-react";

import { useAuth } from "../features/auth/useAuth";
import { STAGE_LABEL } from "../features/candidates/utils/profile";
import { deriveScoreSemantics } from "../features/candidates/utils/scoreSemantics";
import { candidatesService } from "../services/candidatesService";
import { pipelineService } from "../services/pipelineService";
import { toast } from "../shared/utils/toast";
import type { CandidateListSummary, PipelineStage } from "../types/domain";
import type { InterviewFormat } from "../types/agenda";
import { Button } from "../components/ui/button";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const SCHEDULE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

// ── Score chip ─────────────────────────────────────────────────────────────────

function ScoreChip({ candidate }: { candidate: CandidateListSummary }) {
  const s = deriveScoreSemantics({
    jobFitScore: candidate.active_job_job_fit_score,
    aiStatus: candidate.ai_status,
    hasActiveJob: Boolean(candidate.active_job_id),
  });

  if (s.primaryScore === null) {
    return (
      <span className="text-xs text-text-muted" data-testid="score-awaiting">
        Aguardando IA
      </span>
    );
  }

  const label =
    s.primaryScore >= 80
      ? "Alta aderência"
      : s.primaryScore >= 60
        ? "Avaliar"
        : "Baixa aderência";

  const colorClass =
    s.statusTone === "high"
      ? "text-success"
      : s.statusTone === "mid"
        ? "text-warning"
        : "text-danger";

  return (
    <div className="flex flex-col gap-0.5" data-testid="score-chip">
      <span className={`text-sm font-bold tabular-nums ${colorClass}`}>{s.primaryDisplay}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass} opacity-80`}>
        {label}
      </span>
    </div>
  );
}

// ── Stage badge ────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string | null }) {
  const label = stage ? (STAGE_LABEL[stage as PipelineStage] ?? stage) : "—";
  const cls =
    stage === "rejected"
      ? "bg-[hsl(var(--danger)/0.1)] text-danger border-[hsl(var(--danger)/0.3)]"
      : stage === "admitted" || stage === "hired"
        ? "bg-[hsl(var(--success)/0.1)] text-success border-[hsl(var(--success)/0.3)]"
        : stage === "pre_admission" || stage === "protheus"
          ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]"
          : "bg-surface-muted text-text-muted border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] text-xs font-bold text-[hsl(var(--primary))]">
      {initials || "?"}
    </div>
  );
}

// ── Schedule Interview Modal ───────────────────────────────────────────────────

interface ScheduleInterviewModalProps {
  candidate: CandidateListSummary;
  onClose: () => void;
  onSuccess: (candidateId: string, scheduledStart: string, scheduledEnd: string) => void;
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
      onSuccess(candidate.id, scheduledStart, scheduledEnd);
    } catch {
      toast.error("Não foi possível agendar a entrevista. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const locationLabel = format === "presencial" ? "Local" : format === "online" ? "Link" : "Contato";

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
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
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
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
  const name = candidate.full_name;
  const job = candidate.active_job_title ?? "Vaga não informada";
  const stage = candidate.active_job_stage;
  const phone = candidate.phone;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="candidatura-drawer">
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 bg-black/30 cursor-default"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-text">Candidatura</span>
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
        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* identity */}
          <div className="flex items-center gap-3">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{name}</p>
              <p className="truncate text-xs text-text-muted">{candidate.email ?? "—"}</p>
            </div>
          </div>

          {/* job + stage */}
          <div className="rounded-xl bg-surface-muted px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Vaga</p>
            <p className="text-sm font-medium text-text">{job}</p>
            <StageBadge stage={stage} />
          </div>

          {/* scheduled interview badge */}
          {scheduledInterview && (
            <div className="flex items-center gap-2 rounded-xl bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success)/0.3)] px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-success">Entrevista marcada</p>
                <p className="text-[11px] text-success/80">
                  {(() => {
                    const { date, time } = formatInterviewDateTime(scheduledInterview.scheduled_start);
                    return `${date} às ${time}`;
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* score */}
          <div className="rounded-xl bg-surface-muted px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Score IA</p>
            <ScoreChip candidate={candidate} />
          </div>

          {/* phone */}
          {phone && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{phone}</span>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="border-t border-border p-4 space-y-2">
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

          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
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
            onClick={onOpenPipeline}
            data-testid="drawer-pipeline"
          >
            <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir Pipeline
          </Button>

          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-danger hover:text-danger"
              onClick={onReject}
              data-testid="drawer-reject"
            >
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              Reprovar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduledInterview {
  scheduled_start: string;
  scheduled_end: string;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function CandidaturasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReadOnly = user?.role === "viewer";

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

    void copyToClipboard(msg).then(() => {
      toast.success("Mensagem copiada para o clipboard.");
    });
  }

  function handleInterviewSuccess(candidateId: string, scheduledStart: string, scheduledEnd: string) {
    setScheduledInterviews((prev) => ({
      ...prev,
      [candidateId]: { scheduled_start: scheduledStart, scheduled_end: scheduledEnd },
    }));
    setInterviewTarget(null);
    toast.success("Entrevista marcada com sucesso.");
  }

  function handleRejectSuccess(candidateId: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setRejectTarget(null);
    setSelectedId((prev) => (prev === candidateId ? null : prev));
    toast.success("Candidato reprovado.");
  }

  const anyModalOpen = Boolean(interviewTarget || rejectTarget);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-text">Candidaturas</h1>
        <p className="text-sm text-text-muted">Triagem simples dos candidatos recebidos pelo RH.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            aria-label="Buscar candidaturas"
            data-testid="search-input"
          />
        </div>

        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          aria-label="Filtrar por vaga"
          data-testid="job-filter"
        >
          <option value="">Todas as vagas</option>
          {uniqueJobs.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void load(page, search)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted hover:text-text transition-colors"
          aria-label="Atualizar"
          data-testid="refresh-button"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Atualizar
        </button>

        <button
          type="button"
          onClick={() => navigate("/pipeline")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted hover:text-text transition-colors"
          aria-label="Abrir Pipeline"
          data-testid="pipeline-link"
        >
          <Kanban className="h-3.5 w-3.5" aria-hidden="true" />
          Pipeline
        </button>

        <span className="ml-auto text-xs text-text-muted" aria-live="polite">
          {loading ? "" : `${total} candidatura${total !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.05)] px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm" data-testid="candidaturas-table">
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Candidato
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Vaga
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Etapa
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Score IA
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
                  <p className="mt-2 text-xs text-text-muted" role="status">
                    Carregando candidaturas...
                  </p>
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <p className="text-sm text-text-muted">
                    {search || jobFilter
                      ? "Nenhuma candidatura encontrada para os filtros selecionados."
                      : "Nenhuma candidatura com vaga ativa no momento."}
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((c) => {
                const hasInterview = Boolean(scheduledInterviews[c.id]);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-surface-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedId(c.id)}
                    data-testid={`row-${c.id}`}
                  >
                    {/* Candidate */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.full_name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{c.full_name}</p>
                          <p className="truncate text-xs text-text-muted">{c.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>

                    {/* Job */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-text">{c.active_job_title ?? "—"}</span>
                    </td>

                    {/* Stage + interview badge */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StageBadge stage={c.active_job_stage} />
                        {hasInterview && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-success"
                            data-testid={`interview-badge-${c.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Entrevista marcada
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3">
                      <ScoreChip candidate={c} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Abrir perfil"
                          aria-label={`Abrir perfil de ${c.full_name}`}
                          onClick={() => openProfile(c.id)}
                          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
                          data-testid={`action-profile-${c.id}`}
                        >
                          <User className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {!isReadOnly && (
                          <button
                            type="button"
                            title="Marcar entrevista"
                            aria-label={`Marcar entrevista com ${c.full_name}`}
                            onClick={() => setInterviewTarget(c)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
                            data-testid={`action-interview-${c.id}`}
                          >
                            <Calendar className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          title={c.phone ? "Copiar mensagem WhatsApp" : "Telefone não disponível"}
                          aria-label={`Copiar WhatsApp de ${c.full_name}`}
                          disabled={!c.phone}
                          onClick={() => handleCopyWhatsApp(c)}
                          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          data-testid={`action-whatsapp-${c.id}`}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {c.active_job_id && (
                          <button
                            type="button"
                            title="Abrir Pipeline"
                            aria-label={`Abrir Pipeline de ${c.active_job_title}`}
                            onClick={() => openPipeline(c)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors"
                            data-testid={`action-pipeline-${c.id}`}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}

                        {!isReadOnly && (
                          <button
                            type="button"
                            title="Reprovar"
                            aria-label={`Reprovar ${c.full_name}`}
                            onClick={() => setRejectTarget(c)}
                            className="rounded-lg p-1.5 text-danger/60 hover:bg-surface-muted hover:text-danger transition-colors"
                            data-testid={`action-reject-${c.id}`}
                          >
                            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
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
    </div>
  );
}
