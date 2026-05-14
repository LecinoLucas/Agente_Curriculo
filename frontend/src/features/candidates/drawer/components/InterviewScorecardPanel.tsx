import { ChevronDown, ClipboardCheck, Loader } from "lucide-react";
import { useEffect, useState } from "react";

import {
  createInterviewScorecard,
  getInterviewScorecard,
  submitInterviewScorecard,
  updateInterviewScorecard,
} from "../../../../services/interviewScorecardService";
import type {
  InterviewScorecard,
  InterviewScorecardEnvelope,
  InterviewScorecardPayload,
} from "../../../../types/domain";
import { InterviewScorecardForm } from "./InterviewScorecardForm";

interface InterviewScorecardPanelProps {
  jobId: string | null;
  candidateId: string | null;
}

export function InterviewScorecardPanel({ jobId, candidateId }: InterviewScorecardPanelProps) {
  const [envelope, setEnvelope] = useState<InterviewScorecardEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!jobId || !candidateId) {
        setEnvelope({ scorecard: null, suggested_behavioral_questions: [] });
        setLoading(false);
        return;
      }

      try {
        const payload = await getInterviewScorecard(jobId, candidateId);
        if (!cancelled) setEnvelope(payload);
      } catch {
        if (!cancelled) setError("Erro ao carregar scorecard de entrevista.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [jobId, candidateId]);

  const handleSave = async (payload: InterviewScorecardPayload): Promise<InterviewScorecard> => {
    if (!jobId || !candidateId) {
      throw new Error("Contexto de vaga e candidato ausente.");
    }

    setSaving(true);
    setError(null);
    try {
      const saved = envelope?.scorecard
        ? await updateInterviewScorecard(envelope.scorecard.id, payload)
        : await createInterviewScorecard(jobId, candidateId, payload);
      setEnvelope((current) => ({
        scorecard: saved,
        suggested_behavioral_questions: current?.suggested_behavioral_questions ?? [],
      }));
      return saved;
    } catch {
      setError("Não foi possível salvar o rascunho.");
      throw new Error("save_failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (scorecardId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const submitted = await submitInterviewScorecard(scorecardId);
      setEnvelope((current) => ({
        scorecard: submitted,
        suggested_behavioral_questions: current?.suggested_behavioral_questions ?? [],
      }));
    } catch {
      setError("Não foi possível enviar o scorecard. Verifique recomendação e evidências.");
      throw new Error("submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-5 w-5 animate-spin text-[hsl(var(--text-muted))]" />
      </div>
    );
  }

  if (!jobId || !candidateId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-5 text-sm text-[hsl(var(--text-muted))]">
          Vincule o candidato a uma vaga ativa para preencher o scorecard de entrevista.
        </div>
      </div>
    );
  }

  const scorecard = envelope?.scorecard ?? null;
  const suggestedQuestions = envelope?.suggested_behavioral_questions ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[hsl(var(--accent-soft))] p-2 text-[hsl(var(--primary))]">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Entrevista
          </p>
          <h3 className="text-base font-semibold text-[hsl(var(--text))]">
            Scorecard de entrevista
          </h3>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Avaliação estruturada preenchida por recrutador ou gestor.
          </p>
        </div>
      </div>

      {!scorecard ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhum scorecard criado para esta entrevista.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <InterviewScorecardForm
        scorecard={scorecard}
        saving={saving}
        submitting={submitting}
        onSave={handleSave}
        onSubmit={handleSubmit}
      />

      {suggestedQuestions.length > 0 ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40">
          <button
            type="button"
            onClick={() => setQuestionsOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-blue-950"
          >
            Perguntas sugeridas pela IA comportamental
            <ChevronDown className={`h-4 w-4 transition ${questionsOpen ? "rotate-180" : ""}`} />
          </button>
          {questionsOpen ? (
            <div className="space-y-2 border-t border-blue-100 px-4 py-3">
              {suggestedQuestions.map((question, index) => (
                <p key={`${question}-${index}`} className="text-sm text-blue-950">
                  {index + 1}. {question}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
