import { useCallback, useEffect, useRef, useState } from "react";
import { Loader, Sparkles } from "lucide-react";

import { parseQuestionText } from "../../../behavioral-templates/behavioralTemplateHelper";
import { getBehavioralEvaluation, triggerBehavioralAnalysis } from "../../../../services/behavioralAIEvaluationService";
import { getCandidateBehavioralAssessment } from "../../../../services/behavioralAssessmentService";
import { formatContextError } from "../../../../services/errorMessages";
import type {
  BehavioralAIEvaluationResponse,
  BehavioralAssignmentAnswer,
  BehavioralAssignmentDetailResponse,
} from "../../../../types/domain";
import { formatDateTime, getBehavioralAIStatusLabel, getBehavioralAIStatusTone } from "../profileFormatters";
import {
  BEHAVIORAL_STATUS_LABEL,
  behavioralKindLabel,
  behavioralStatusTone,
} from "../profileStatusLabels";
import {
  ActionButton,
  Badge,
  DefinitionList,
  EmptyBlock,
  SectionCard,
} from "./ProfileSharedUI";
import { CurrentProcessHistoryHint } from "./CandidateProfileHistoryTab";

function renderBehavioralAnswer(answer: BehavioralAssignmentAnswer | null) {
  if (!answer) return <span className="text-text-muted">Não respondida</span>;
  if (answer.answer_text) return <p className="whitespace-pre-wrap">{answer.answer_text}</p>;
  if (answer.answer_value !== null && answer.answer_value !== undefined) {
    return <span className="font-semibold">{answer.answer_value}</span>;
  }
  if (answer.selected_options_json?.length) {
    return <span>{answer.selected_options_json.join(", ")}</span>;
  }
  return <span className="text-text-muted">Não respondida</span>;
}

export function CandidateProfileBehavioralAssessmentsTab({
  jobId,
  candidateId,
  required,
  requiresAI,
  focusToken,
  onAfterBehavioralAIRequest,
  onOpenHistory,
}: {
  jobId: string | null;
  candidateId: string | null;
  required: boolean;
  requiresAI: boolean;
  focusToken: number;
  onAfterBehavioralAIRequest: () => Promise<void>;
  onOpenHistory: () => void;
}) {
  const [assessment, setAssessment] = useState<BehavioralAssignmentDetailResponse | null>(null);
  const [evaluation, setEvaluation] = useState<BehavioralAIEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiRequesting, setAiRequesting] = useState(false);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const aiActionRef = useRef<HTMLDivElement | null>(null);

  const loadBehavioralAssessment = useCallback(async () => {
    if (!jobId || !candidateId) {
      setAssessment(null);
      setEvaluation(null);
      return;
    }

    setLoading(true);
    setError(null);
    setAiActionError(null);

    try {
      const payload = await getCandidateBehavioralAssessment(jobId, candidateId);
      setAssessment(payload?.template_name ? payload : null);

      if (payload?.status === "submitted") {
        const summary = await getBehavioralEvaluation(jobId, candidateId);
        setEvaluation(summary);
      } else {
        setEvaluation(null);
      }
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível carregar avaliações comportamentais.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    let cancelled = false;
    void loadBehavioralAssessment().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadBehavioralAssessment]);

  useEffect(() => {
    if (
      evaluation?.status !== "pending" &&
      evaluation?.status !== "processing" &&
      evaluation?.status !== "retry_scheduled"
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void loadBehavioralAssessment();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [evaluation?.status, loadBehavioralAssessment]);

  const [highlightingAI, setHighlightingAI] = useState(false);
  useEffect(() => {
    if (focusToken <= 0) return;
    window.setTimeout(() => {
      if (typeof aiActionRef.current?.scrollIntoView === "function") {
        aiActionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      aiActionRef.current?.focus({ preventScroll: true });
    }, 0);
    setHighlightingAI(true);
    const clearId = window.setTimeout(() => setHighlightingAI(false), 3000);
    return () => window.clearTimeout(clearId);
  }, [focusToken]);

  const handleGenerateBehavioralAI = useCallback(async () => {
    if (!jobId || !candidateId || aiRequesting) return;

    setAiRequesting(true);
    setAiActionError(null);
    try {
      const response = await triggerBehavioralAnalysis(jobId, candidateId, {
        retryFailed: evaluation?.status === "failed",
      });
      setEvaluation({
        id: response.evaluation_id,
        assignment_id: response.assignment_id || assessment?.id || "",
        status: response.status,
        confidence: null,
        summary: null,
        strengths: null,
        concerns: null,
        competency_signals: null,
        suggested_interview_questions: null,
        risk_flags: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      });
      await Promise.all([loadBehavioralAssessment(), onAfterBehavioralAIRequest()]);
    } catch (err: unknown) {
      setAiActionError(
        formatContextError(
          err,
          "Não foi possível solicitar a IA comportamental.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setAiRequesting(false);
    }
  }, [
    aiRequesting,
    assessment?.id,
    candidateId,
    evaluation?.status,
    jobId,
    loadBehavioralAssessment,
    onAfterBehavioralAIRequest,
  ]);

  if (!jobId || !candidateId) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para consultar avaliações comportamentais."
      />
    );
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando avaliações...</p>;
  }

  if (error) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }

  if (!assessment) {
    return (
      <EmptyBlock
        title="Nenhuma avaliação comportamental"
        description="Quando houver teste ou pesquisa comportamental vinculada a esta candidatura, ela aparecerá aqui."
      />
    );
  }

  const answeredLabel = `${assessment.answered_count} de ${assessment.question_count} respostas`;
  const kindLabel = behavioralKindLabel(assessment, required);
  const showAIStatus = requiresAI || evaluation !== null || assessment.status === "submitted";
  const aiStatusLabel = getBehavioralAIStatusLabel(assessment.status, evaluation);
  const aiStatusTone = getBehavioralAIStatusTone(assessment.status, evaluation);
  const canRequestAI = assessment.status === "submitted" && (!evaluation || evaluation.status === "failed");

  return (
    <div className="space-y-4">
      <CurrentProcessHistoryHint
        candidateId={candidateId}
        jobId={jobId}
        onOpenHistory={onOpenHistory}
      />
      <SectionCard title="Avaliação comportamental">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-muted">{kindLabel}</p>
            <h2 className="mt-1 text-lg font-bold text-text">{assessment.template_name}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {assessment.job_title ?? "Vaga atual"} · {answeredLabel}
            </p>
          </div>
          <Badge tone={behavioralStatusTone(assessment.status)}>
            {BEHAVIORAL_STATUS_LABEL[assessment.status] ?? assessment.status}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DefinitionList
            items={[
              ["Obrigatório", required ? "Sim" : "Não"],
              ["Status", BEHAVIORAL_STATUS_LABEL[assessment.status] ?? assessment.status],
              ["Respostas", answeredLabel],
              ["IA comportamental", showAIStatus ? <Badge tone={aiStatusTone}>{aiStatusLabel}</Badge> : "-"],
              ["Início", assessment.started_at ? formatDateTime(assessment.started_at) : "-"],
              ["Conclusão", assessment.submitted_at ? formatDateTime(assessment.submitted_at) : "-"],
            ]}
          />
        </div>
      </SectionCard>

      {showAIStatus ? (
        <SectionCard title="IA comportamental">
          <div
            ref={aiActionRef}
            tabIndex={-1}
            data-testid="behavioral-ai-action-block"
            data-highlighted={highlightingAI ? "true" : undefined}
            className={[
              "rounded-xl border p-4 outline-none transition",
              canRequestAI
                ? "border-amber-200 bg-amber-50"
                : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))]",
              highlightingAI ? "ring-2 ring-amber-400 ring-offset-2 animate-pulse" : "",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-text">
                  {evaluation?.status === "failed"
                    ? "IA comportamental falhou"
                    : evaluation?.status === "pending"
                      ? "IA comportamental na fila"
                      : evaluation?.status === "processing"
                        ? "IA comportamental em processamento"
                        : evaluation?.status === "retry_scheduled"
                          ? "IA comportamental com retry agendado"
                      : evaluation?.status === "completed"
                        ? "IA comportamental concluída"
                        : "IA comportamental pendente"}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {!evaluation
                    ? "O candidato concluiu o teste comportamental. Gere a análise com IA para apoiar a decisão."
                    : evaluation.status === "failed"
                      ? "A análise com IA não foi concluída. Tente novamente para gerar uma nova avaliação assistiva."
                      : evaluation.status === "pending"
                        ? "A solicitação foi enviada para a fila de IA comportamental."
                        : evaluation.status === "processing"
                        ? "A solicitação foi enviada e o processamento será atualizado assim que a IA concluir."
                        : evaluation.status === "retry_scheduled"
                          ? `A IA atingiu um limite temporário. Nova tentativa automática${evaluation.next_retry_at ? ` em ${formatDateTime(evaluation.next_retry_at)}` : " agendada"}.`
                        : "A análise assistiva está disponível para apoiar a leitura das respostas comportamentais."}
                </p>
              </div>
              <Badge tone={aiStatusTone}>{aiStatusLabel}</Badge>
            </div>

            {canRequestAI ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ActionButton
                  onClick={() => void handleGenerateBehavioralAI()}
                  disabled={aiRequesting}
                  primary
                >
                  {aiRequesting ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiRequesting
                    ? "Solicitando..."
                    : evaluation?.status === "failed"
                      ? "Tentar novamente"
                      : "Gerar análise IA comportamental"}
                </ActionButton>
                <span className="text-xs text-text-muted">
                  Esta análise não altera score, ranking ou etapa do pipeline.
                </span>
              </div>
            ) : null}

            {aiActionError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {aiActionError}
              </p>
            ) : null}

            {evaluation?.summary ? (
              <p className="mt-4 whitespace-pre-wrap rounded-lg border border-[hsl(var(--border)/0.6)] bg-surface p-3 text-sm leading-6 text-text">
                {evaluation.summary}
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Respostas">
        {assessment.competencies.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma resposta disponível.</p>
        ) : (
          <div className="space-y-3">
            {assessment.competencies.map((competency) => (
              <details
                key={competency.id}
                className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))] p-4"
              >
                <summary className="cursor-pointer text-sm font-bold text-text">
                  {competency.name}
                  <span className="ml-2 font-normal text-text-muted">
                    {competency.questions.length} pergunta(s)
                  </span>
                </summary>
                {competency.description ? (
                  <p className="mt-2 text-xs text-text-muted">{competency.description}</p>
                ) : null}
                <div className="mt-4 space-y-3">
                  {competency.questions.map((question) => {
                    const parsed = parseQuestionText(question.question_text);
                    return (
                      <div
                        key={question.id}
                        className="rounded-xl border border-[hsl(var(--border)/0.5)] bg-surface p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-text">{parsed.text}</p>
                          {question.is_required ? <Badge tone="neutral">Obrigatória</Badge> : null}
                        </div>
                        <div className="mt-2 text-sm text-text">
                          {renderBehavioralAnswer(question.answer)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
