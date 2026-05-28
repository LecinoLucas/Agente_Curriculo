import { ChevronDown, ClipboardCheck, Loader } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../../../features/auth/useAuth";
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
import { toast } from "../../../../shared/utils/toast";
import { InterviewScorecardForm } from "./InterviewScorecardForm";

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_yes: "Forte sim",
  yes: "Sim",
  neutral: "Neutro",
  no: "Nao",
  strong_no: "Forte nao",
};

function getEnvelopeScorecards(envelope: InterviewScorecardEnvelope | null): InterviewScorecard[] {
  const listed = envelope?.scorecards ?? [];
  if (envelope?.scorecard && !listed.some((scorecard) => scorecard.id === envelope.scorecard?.id)) {
    return [envelope.scorecard, ...listed];
  }
  return listed;
}

function upsertEnvelopeScorecard(
  envelope: InterviewScorecardEnvelope | null,
  nextScorecard: InterviewScorecard,
): InterviewScorecardEnvelope {
  const currentScorecards = getEnvelopeScorecards(envelope).filter(
    (scorecard) => scorecard.id !== nextScorecard.id,
  );
  return {
    scorecard: nextScorecard,
    scorecards: [nextScorecard, ...currentScorecards],
    suggested_behavioral_questions: envelope?.suggested_behavioral_questions ?? [],
  };
}

function formatRecommendationLabel(value: InterviewScorecard["final_recommendation"]) {
  if (!value) return "Sem recomendacao final";
  return RECOMMENDATION_LABELS[value] ?? value;
}

function formatScorecardDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR");
}

interface InterviewScorecardPanelProps {
  jobId: string | null;
  candidateId: string | null;
  interviewId?: string | null;
  onChanged?: (scorecard: InterviewScorecard) => void | Promise<void>;
  onSubmitted?: (scorecard: InterviewScorecard) => void | Promise<void>;
}

export function InterviewScorecardPanel({
  jobId,
  candidateId,
  interviewId = null,
  onChanged,
  onSubmitted,
}: InterviewScorecardPanelProps) {
  const { user } = useAuth();
  const [envelope, setEnvelope] = useState<InterviewScorecardEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const submitLockedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!jobId || !candidateId) {
        setEnvelope({ scorecard: null, scorecards: [], suggested_behavioral_questions: [] });
        setLoading(false);
        return;
      }

      try {
        const payload = await getInterviewScorecard(jobId, candidateId, interviewId);
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
  }, [jobId, candidateId, interviewId]);

  const allScorecards = useMemo(() => getEnvelopeScorecards(envelope), [envelope]);
  const ownScorecard = useMemo(() => {
    if (!user?.id) return null;
    return allScorecards.find((scorecard) => scorecard.evaluator_id === user.id) ?? null;
  }, [allScorecards, user?.id]);
  const editableScorecard = ownScorecard ?? (!user ? (envelope?.scorecard ?? null) : null);
  const parallelScorecards = useMemo(
    () => allScorecards.filter((scorecard) => scorecard.id !== editableScorecard?.id),
    [allScorecards, editableScorecard?.id],
  );

  const handleSave = async (payload: InterviewScorecardPayload): Promise<InterviewScorecard> => {
    if (!jobId || !candidateId) {
      throw new Error("Contexto de vaga e candidato ausente.");
    }

    setSaving(true);
    setError(null);
    try {
      const saved = editableScorecard
        ? await updateInterviewScorecard(editableScorecard.id, { ...payload, interview_id: interviewId })
        : await createInterviewScorecard(jobId, candidateId, { ...payload, interview_id: interviewId });
      setEnvelope((current) => upsertEnvelopeScorecard(current, saved));
      await onChanged?.(saved);
      return saved;
    } catch {
      setError("Não foi possível salvar o rascunho.");
      throw new Error("save_failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (scorecardId: string) => {
    if (submitting || submitLockedRef.current) return;

    submitLockedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const submitted = await submitInterviewScorecard(scorecardId);
      setEnvelope((current) => upsertEnvelopeScorecard(current, submitted));
      toast.success("Avaliação concluída com sucesso.");
      await onSubmitted?.(submitted);
    } catch {
      setError("Não foi possível enviar o scorecard. Verifique recomendação e evidências.");
      throw new Error("submit_failed");
    } finally {
      submitLockedRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!jobId || !candidateId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-surface-muted/30 p-5 text-sm text-text-muted">
          Vincule o candidato a uma vaga ativa para preencher o scorecard de entrevista.
        </div>
      </div>
    );
  }

  const suggestedQuestions = envelope?.suggested_behavioral_questions ?? [];
  const hasAnyScorecard = allScorecards.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[hsl(var(--accent-soft))] p-2 text-[hsl(var(--primary))]">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Entrevista
          </p>
          <h3 className="text-base font-semibold text-text">
            Scorecard de entrevista
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Avaliação estruturada preenchida por recrutador ou gestor.
          </p>
        </div>
      </div>

      {!hasAnyScorecard ? (
        <div className="rounded-lg border border-border bg-surface-muted/30 p-4 text-sm text-text-muted">
          Nenhum scorecard criado para esta entrevista.
        </div>
      ) : null}

      {!editableScorecard && parallelScorecards.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ja existem pareceres de outros avaliadores. O formulario abaixo vai registrar o seu scorecard sem sobrescrever os existentes.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}
      {parallelScorecards.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold text-text">
              {editableScorecard ? "Pareceres paralelos" : "Pareceres existentes"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Consulte os outros pareceres sem perder o seu formulario de avaliacao.
            </p>
          </div>
          <div className="grid gap-3">
            {parallelScorecards.map((scorecard, index) => (
              <div
                key={scorecard.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">
                      Parecer {index + 1}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Atualizado em {formatScorecardDate(scorecard.updated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-text-muted">
                      {scorecard.status === "submitted" ? "Enviado" : "Rascunho"}
                    </span>
                    <span className="rounded-full bg-[hsl(var(--accent-soft))] px-2.5 py-1 text-[hsl(var(--primary))]">
                      {formatRecommendationLabel(scorecard.final_recommendation)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-text-muted">
                  {scorecard.items.length} criterio(s) registrado(s)
                </p>
                <p className="mt-2 text-sm text-text">
                  {scorecard.overall_notes?.trim() || "Sem observacoes finais registradas."}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <InterviewScorecardForm
        scorecard={editableScorecard}
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
