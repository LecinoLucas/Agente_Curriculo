import { useEffect, useState } from "react";

import { getCandidateFinalDecisionSummary } from "../../../../services/decisionSummaryService";
import type {
  CandidateFinalDecisionReadinessStatus,
  CandidateFinalDecisionSummary,
  InterviewFinalRecommendation,
} from "../../../../types/domain";

interface CandidateFinalDecisionSummaryCardProps {
  jobId?: string | null;
  candidateId?: string | null;
  summary?: CandidateFinalDecisionSummary | null;
}

const readinessLabels: Record<CandidateFinalDecisionReadinessStatus, string> = {
  missing_job_match: "Match da vaga pendente",
  waiting_behavioral_assessment: "Aguardando comportamental",
  waiting_behavioral_ai: "Aguardando IA assistiva",
  waiting_interview_scorecard: "Aguardando scorecard",
  ready_for_human_decision: "Pronto para decisão humana",
  needs_attention: "Requer atenção",
};

const recommendationLabels: Record<InterviewFinalRecommendation, string> = {
  strong_yes: "Sim forte",
  yes: "Sim",
  neutral: "Neutro",
  no: "Não",
  strong_no: "Não forte",
};

function formatMatchScore(value: number | null): string {
  if (value == null) {
    return "Pendente";
  }
  const percentage = value <= 1 ? value * 100 : value;
  return `${Math.round(percentage)}%`;
}

function readinessTone(status: CandidateFinalDecisionReadinessStatus): string {
  if (status === "ready_for_human_decision") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (status === "needs_attention") {
    return "border-red-200 bg-red-50 text-red-950";
  }
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function statusText(status: string | null | undefined): string {
  if (!status) return "Pendente";
  const labels: Record<string, string> = {
    submitted: "Concluído",
    completed: "Concluída",
    scheduled: "Agendada",
    rescheduled: "Remarcada",
    awaiting_feedback: "Aguardando feedback",
    no_show: "No-show",
    cancelled: "Cancelada",
    processing: "Em andamento",
    analysis_processing: "Análise em andamento",
    matching_pending: "Matching pendente",
    waiting_analysis: "Análise pendente",
    pending: "Pendente",
    draft: "Rascunho",
    failed: "Falhou",
  };
  return labels[status] ?? status;
}

function nextActionText(value: string): string {
  const labels: Record<string, string> = {
    request_or_wait_job_match: "Atualizar análise da vaga",
    wait_candidate_behavioral_submission: "Aguardar resposta comportamental",
    run_or_wait_behavioral_ai: "Gerar ou aguardar análise assistiva",
    complete_interview_scorecard: "Preencher scorecard de entrevista",
    refresh_job_match: "Atualizar match antes da decisão",
    review_and_move_pipeline: "Revisar evidências e mover pipeline manualmente",
  };
  return labels[value] ?? value;
}

export function CandidateFinalDecisionSummaryCard({
  jobId,
  candidateId,
  summary: providedSummary,
}: CandidateFinalDecisionSummaryCardProps) {
  const [summary, setSummary] = useState<CandidateFinalDecisionSummary | null>(providedSummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(providedSummary ?? null);
  }, [providedSummary]);

  useEffect(() => {
    if (providedSummary !== undefined || !jobId || !candidateId) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    getCandidateFinalDecisionSummary(jobId, candidateId)
      .then((payload) => {
        if (active) setSummary(payload);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar o resumo consolidado.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [candidateId, jobId, providedSummary]);

  if (!jobId || !candidateId) {
    return null;
  }

  if (loading && !summary) {
    return (
      <section className="rounded-lg border border-border bg-white p-4 text-sm text-text-muted">
        Carregando resumo consolidado...
      </section>
    );
  }

  if (error && !summary) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </section>
    );
  }

  if (!summary) {
    return null;
  }

  const readiness = summary.decision_readiness.status;
  const scorecard = summary.interview_scorecard;
  const interview = summary.interview;
  const behavioral = summary.behavioral_assessment;
  const recommendation = scorecard.final_recommendation
    ? recommendationLabels[scorecard.final_recommendation]
    : "Pendente";

  return (
    <section
      className={`rounded-lg border p-4 ${readinessTone(readiness)}`}
      data-testid="final-decision-summary-card"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Decisão final consolidada</h3>
          <p className="mt-1 text-sm">{readinessLabels[readiness]}</p>
        </div>
        <div className="text-sm font-semibold">{formatMatchScore(summary.active_job_decision.match_score)}</div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-current/15 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase text-current/65">Match</div>
          <div className="mt-1 text-sm font-medium">{formatMatchScore(summary.active_job_decision.match_score)}</div>
          <div className="mt-1 text-xs text-current/70">{statusText(summary.active_job_decision.score_status)}</div>
        </div>
        <div className="rounded-md border border-current/15 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase text-current/65">Comportamental</div>
          <div className="mt-1 text-sm font-medium">{statusText(behavioral.assignment_status)}</div>
          <div className="mt-1 text-xs text-current/70">
            {behavioral.answered_count}/{behavioral.question_count} respostas
          </div>
        </div>
        <div className="rounded-md border border-current/15 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase text-current/65">IA assistiva</div>
          <div className="mt-1 text-sm font-medium">{statusText(behavioral.ai_evaluation_status)}</div>
          <div className="mt-1 text-xs text-current/70">{behavioral.ai_confidence ?? "Sem confiança registrada"}</div>
        </div>
        <div className="rounded-md border border-current/15 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase text-current/65">Entrevista</div>
          <div className="mt-1 text-sm font-medium">{statusText(interview?.status ?? scorecard.status)}</div>
          <div className="mt-1 text-xs text-current/70">
            {scorecard.average_rating != null ? `Média ${scorecard.average_rating}` : statusText(scorecard.status)}
          </div>
        </div>
      </div>

      {behavioral.ai_summary ? (
        <p className="mt-3 text-xs leading-relaxed text-current/75">{behavioral.ai_summary}</p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase text-current/65">Recomendação humana</div>
          <div className="mt-1 text-sm font-medium">{recommendation}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase text-current/65">Próximo passo sugerido</div>
          <div className="mt-1 text-sm font-medium">{nextActionText(summary.decision_readiness.next_action)}</div>
        </div>
      </div>

      {summary.decision_readiness.missing_items.length > 0 ? (
        <div className="mt-3 text-xs text-current/75">
          Pendências: {summary.decision_readiness.missing_items.join(", ")}
        </div>
      ) : null}

      {summary.decision_readiness.warnings.length > 0 ? (
        <div className="mt-2 text-xs font-medium text-current">
          Warnings: {summary.decision_readiness.warnings.join(", ")}
        </div>
      ) : null}
    </section>
  );
}
