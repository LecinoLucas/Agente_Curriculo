import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";

import { Modal } from "../../components/common/Modal";
import { useGoogleCalendarConnection } from "../agenda/useGoogleCalendarConnection";
import type { InterviewFormat } from "../../types/agenda";

type InterviewQuickScheduleModalProps = {
  candidateName: string;
  jobTitle: string;
  isSaving: boolean;
  onClose: () => void;
  onMoveWithoutScheduling: () => Promise<void>;
  onSchedule: (payload: {
    scheduled_start: string;
    scheduled_end: string;
    interview_format: InterviewFormat;
    location: string | null;
    meeting_url: string | null;
    public_notes: string | null;
    create_google_event?: boolean;
    create_google_meet?: boolean;
  }) => Promise<void>;
  onOpenFullAgenda: () => void;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildLocalIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes + minutesToAdd, 0);
  return date.toTimeString().slice(0, 5);
}

export function InterviewQuickScheduleModal({
  candidateName,
  jobTitle,
  isSaving,
  onClose,
  onMoveWithoutScheduling,
  onSchedule,
  onOpenFullAgenda,
}: InterviewQuickScheduleModalProps) {
  const [date, setDate] = useState(todayDate());
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [interviewFormat, setInterviewFormat] = useState<InterviewFormat>("online");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createGoogleEvent, setCreateGoogleEvent] = useState(false);
  const [createGoogleMeet, setCreateGoogleMeet] = useState(false);
  const { googleConnected, googleAccountEmail } = useGoogleCalendarConnection();

  const endTime = useMemo(() => addMinutes(startTime, Number(duration) || 60), [duration, startTime]);

  const handleSchedule = async () => {
    setError(null);
    if (!date || !startTime) {
      setError("Informe data e horário de início.");
      return;
    }
    const scheduledStart = buildLocalIso(date, startTime);
    const scheduledEnd = buildLocalIso(date, endTime);
    if (new Date(scheduledStart) < new Date()) {
      setError("Não é possível agendar uma entrevista no passado.");
      return;
    }
    await onSchedule({
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      interview_format: interviewFormat,
      location: interviewFormat === "presencial" ? location.trim() || null : null,
      meeting_url: interviewFormat === "online" ? meetingUrl.trim() || null : null,
      public_notes: publicNotes.trim() || null,
      create_google_event: createGoogleEvent,
      create_google_meet: createGoogleMeet,
    });
  };

  return (
    <Modal title="Agendar entrevista" onClose={onClose} contentClassName="sm:max-w-[620px]">
      <div className="border-b border-[hsl(var(--border))] px-6 py-4">
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Defina os dados principais da entrevista com o candidato.
        </p>
        <p className="mt-2 text-sm font-medium text-[hsl(var(--text))]">
          {candidateName} · {jobTitle}
        </p>
      </div>

      <div className="grid gap-4 overflow-y-auto px-6 py-5">
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            <span>Data</span>
            <input className="ui-input h-10 w-full rounded-lg px-3" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Início</span>
            <input className="ui-input h-10 w-full rounded-lg px-3" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Duração</span>
            <select className="ui-input h-10 w-full rounded-lg px-3" value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </label>
        </div>

        <label className="space-y-1.5 text-sm font-medium">
          <span>Tipo</span>
          <select className="ui-input h-10 w-full rounded-lg px-3" value={interviewFormat} onChange={(event) => setInterviewFormat(event.target.value as InterviewFormat)}>
            <option value="online">Online</option>
            <option value="presencial">Presencial</option>
            <option value="telefone">Telefone</option>
          </select>
        </label>

        {interviewFormat === "online" ? (
          <label className="space-y-1.5 text-sm font-medium">
            <span>Link</span>
            <input className="ui-input h-10 w-full rounded-lg px-3" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://meet.google.com/..." />
          </label>
        ) : null}

        {interviewFormat === "presencial" ? (
          <label className="space-y-1.5 text-sm font-medium">
            <span>Local</span>
            <input className="ui-input h-10 w-full rounded-lg px-3" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Sala, unidade ou endereço" />
          </label>
        ) : null}

        <label className="space-y-1.5 text-sm font-medium">
          <span>Observação pública para o candidato</span>
          <textarea className="ui-input min-h-20 w-full rounded-lg px-3 py-2" value={publicNotes} onChange={(event) => setPublicNotes(event.target.value)} />
        </label>

        {/* Sincronização com calendário */}
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={createGoogleEvent}
              onChange={(e) => setCreateGoogleEvent(e.target.checked)}
              disabled={!googleConnected}
              className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
            />
            <span>Adicionar ao Google Calendar</span>
          </label>
          
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={createGoogleMeet}
              onChange={(e) => setCreateGoogleMeet(e.target.checked)}
              disabled={!googleConnected || !createGoogleEvent}
              className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
            />
            <span>Criar link do Google Meet</span>
          </label>
          
          {!googleConnected && (
            <p className="text-xs text-[hsl(var(--text-muted))]">
              Google Calendar não conectado. Conecte na agenda para habilitar.
            </p>
          )}

          {googleConnected && (
            <p className="text-xs text-emerald-600">
              Google Calendar conectado{googleAccountEmail ? `: ${googleAccountEmail}` : ""}.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-6 py-4 sm:flex-row sm:justify-end">
        <button type="button" className="ui-btn-secondary inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium" onClick={onClose} disabled={isSaving}>
          Cancelar
        </button>
        <button type="button" className="ui-btn-secondary inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium" onClick={onOpenFullAgenda} disabled={isSaving}>
          Abrir agenda completa
        </button>
        <button type="button" className="ui-btn-secondary inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium" onClick={() => void onMoveWithoutScheduling()} disabled={isSaving}>
          Mover sem agendar
        </button>
        <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-white disabled:opacity-50" onClick={() => void handleSchedule()} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
          Agendar entrevista
        </button>
      </div>
    </Modal>
  );
}
