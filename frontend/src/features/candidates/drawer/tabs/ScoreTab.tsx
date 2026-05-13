import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisResult,
  CandidateOverview,
  Job,
  JobRankingEntry,
} from "../../../../types/domain";
import { Badge } from "../../../../components/ui/badge";
import { Info } from "lucide-react";
import { EmptyTab, Section, DecisionCard, MetaItem, BreakdownItem } from "../components/DrawerSectionHelpers";
import { SkeletonRows } from "../../../../components/common/Skeleton";
import { fmtScore, fmtPercentValue, scoreColorClass, getCompatibilityGuidance } from "../hooks/useCandidateDecision";
import { useAuth } from "../../../../features/auth/useAuth";
import { scoreExplanationService, type ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import { formatErrorForToast, handleApiError } from "../../../../shared/utils/errorHandler";
import { toast } from "../../../../shared/utils/toast";
import { buildDealBreakerViolationDisplay, isDealBreakerReasonCode } from "../../../pipeline/dealBreakerDisplay";
import { ScoreSummary } from "../score/ScoreSummary";
import { deriveScoreSemantics } from "../../utils/scoreSemantics";
import { normalizeScorePercent } from "../../utils/scoreFormatting";
import {  getExplainabilityDeltaLine,
  getExplainabilityFreshnessLine,
  getExplainabilityQuickLine,
  getTopExplainabilityInsights,
} from "../../utils/explainabilityUi";
import { getLatestAnalysisForActiveJob } from "../../utils/analysisStatus";

export interface ScoreTabFocusRequest {
  intent: "analysis" | "review";
  token: number;
}

function formatOptionalDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function getFreshnessBadge(status: string | null | undefined, loading: boolean) {
  if (loading) {
    return {
      label: "Atualizando ranking...",
      variant: "secondary" as const,
      description: "Recomputando a aderência da vaga com a análise mais recente.",
    };
  }

  if (status === "fresh") {
    return {
      label: "Atualizado",
      variant: "success" as const,
      description: "Este score representa a aderência do candidato à vaga com base na análise mais recente disponível.",
    };
  }

  if (status === "stale") {
    return {
      label: "Ranking desatualizado",
      variant: "warning" as const,
      description: "A aderência desta vaga ainda não refletiu a análise mais recente disponível.",
    };
  }

  return {
    label: "Status do ranking indisponível",
    variant: "neutral" as const,
    description: "Ainda não há evidência suficiente para garantir a atualização deste ranking.",
  };
}

export function ScoreTab({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  rankingEntry,
  analysisResult,
  loading,
  error,
  compatibilityGuidance,
  scoreExplanation: initialScoreExplanation,
  focusRequest = null,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  rankingEntry: JobRankingEntry | null;
  analysisResult: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  compatibilityGuidance: ReturnType<typeof getCompatibilityGuidance>;
  scoreExplanation: ScoreExplanationResponse | null;
  focusRequest?: ScoreTabFocusRequest | null;
}) {
  const { user } = useAuth();
  const canSendMatchingFeedback = user?.role === "admin" || user?.role === "recruiter";
  const compatibilityScore = rankingEntry?.job_fit_score ?? null;
  const latestActiveAnalysis = getLatestAnalysisForActiveJob(
    overview.latest_analysis,
    activeJobId,
  );
  // Use prop from parent (CandidateDrawer), only update locally for feedback
  const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanationResponse | null>(initialScoreExplanation);
  const [feedbackSaving, setFeedbackSaving] = useState<"liked" | "rejected" | "hired" | null>(null);
  const [showConfidenceDetails, setShowConfidenceDetails] = useState(false);
  const rankingDetailsRef = useRef<HTMLElement | null>(null);
  const explainabilityRef = useRef<HTMLElement | null>(null);
  const rankingDetailsDisclosureRef = useRef<HTMLDetailsElement | null>(null);
  const explainabilityDisclosureRef = useRef<HTMLDetailsElement | null>(null);
  const dealBreakerViolations = rankingEntry?.reason_tags.filter((reason) => isDealBreakerReasonCode(reason)) ?? [];
  const dealBreakerDetails = dealBreakerViolations.map((reasonCode) =>
    buildDealBreakerViolationDisplay({
      reasonCode,
      jobDealBreakers: activeJob?.deal_breakers ?? [],
      candidate: overview.candidate,
      latestAnalysis: latestActiveAnalysis,
      analysisResult,
    }),
  );
  const candidateId = overview.candidate.id;
  const hasRankingDetails =
    Boolean(rankingEntry?.ranking_summary_text) ||
    Boolean(rankingEntry && rankingEntry.reason_tags.length > 0) ||
    Boolean(rankingEntry?.score_breakdown) ||
    dealBreakerDetails.length > 0;
  const freshnessBadge = getFreshnessBadge(rankingEntry?.ranking_freshness_status, loading);
  const rankingComputedAt = rankingEntry?.ranking_updated_at ?? rankingEntry?.score_computed_at ?? rankingEntry?.computed_at ?? null;
  const rankingRelativeTime = formatRelativeDateTime(rankingComputedAt);
  const rankingVersion = rankingEntry?.ranking_version ?? rankingEntry?.version ?? null;
  const explainabilityInsights = getTopExplainabilityInsights(scoreExplanation, 3);
  const explainabilityLine = getExplainabilityQuickLine(scoreExplanation);
  const deltaLine = getExplainabilityDeltaLine(scoreExplanation);
  const freshnessLine = getExplainabilityFreshnessLine(
    scoreExplanation?.ranking_freshness_status ?? rankingEntry?.ranking_freshness_status,
    scoreExplanation?.computed_at ?? rankingComputedAt,
  );

  // Update scoreExplanation when prop changes (for feedback updates)
  useEffect(() => {
    setScoreExplanation(initialScoreExplanation);
  }, [initialScoreExplanation]);

  useEffect(() => {
    if (!focusRequest) return;

    if (focusRequest.intent === "analysis") {
      if (rankingDetailsDisclosureRef.current) {
        rankingDetailsDisclosureRef.current.open = true;
      }
      window.requestAnimationFrame(() => {
        rankingDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (explainabilityDisclosureRef.current) {
      explainabilityDisclosureRef.current.open = true;
    }
    window.requestAnimationFrame(() => {
      explainabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusRequest]);

  const semantics = deriveScoreSemantics({
    jobFitScore: compatibilityScore,
    aiStatus: latestActiveAnalysis?.status,
    hasActiveJob: Boolean(activeJobId),
    confidenceScore:
      scoreExplanation?.data_confidence_score ??
      rankingEntry?.score_breakdown?.confidence_score ??
      null,
  });

  const handleMatchingFeedback = useCallback(
    async (kind: "liked" | "rejected" | "hired") => {
      if (!activeJobId || !candidateId || !canSendMatchingFeedback) return;

      setFeedbackSaving(kind);
      try {
        const payload =
          kind === "liked"
            ? { liked: true, rejected: false, hired: false }
            : kind === "rejected"
              ? { liked: false, rejected: true, hired: false }
              : { liked: true, rejected: false, hired: true };

        const saved = await scoreExplanationService.saveFeedback(activeJobId, candidateId, payload);
        setScoreExplanation((current) => (current ? { ...current, feedback: saved } : current));
        toast.success("Feedback de matching registrado.");
      } catch (err) {
        toast.error(formatErrorForToast(handleApiError(err)));
      } finally {
        setFeedbackSaving(null);
      }
    },
    [activeJobId, candidateId, canSendMatchingFeedback],
  );

  if (!activeJobId) {
    return (
        <EmptyTab
          title="Aguardando vaga"
          description="Associe o candidato a uma vaga para liberar Aderência à Vaga e sinais de decisão."
        />
    );
  }

  const confidenceScoreValue = scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0;
  const confidencePercent = normalizeScorePercent(confidenceScoreValue) ?? 0;
  let confidenceMessage = "Currículo com boa confiança";
  if (confidencePercent < 40) {
    confidenceMessage = "Currículo com baixa confiança";
  } else if (confidencePercent < 75) {
    confidenceMessage = "Currículo com pouca confiança";
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
          Resumo operacional
        </p>
        <p className="mt-2 text-sm font-medium text-[hsl(var(--text))]">{semantics.contextLine}</p>
        {semantics.detailLine ? (
          <p className="mt-1 text-xs leading-5 text-[hsl(var(--text-muted))]">{semantics.detailLine}</p>
        ) : null}
      </div>

      {compatibilityScore !== null || rankingEntry?.score_breakdown || scoreExplanation ? (
        <ScoreSummary
          compatibilityScore={compatibilityScore}
          scoreBreakdown={rankingEntry?.score_breakdown ?? null}
          scoreExplanation={scoreExplanation}
          rankingSummaryText={rankingEntry?.ranking_summary_text}
          rank={rankingEntry?.rank}
        />
      ) : null}

      <Section title="Resumo da vaga ativa">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
              Situação do score
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--text))]" title={freshnessBadge.description}>
              {compatibilityGuidance?.description ?? "Aderência calculada para a vaga ativa com base no currículo analisado."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={freshnessBadge.variant} title={freshnessBadge.description}>
              {freshnessBadge.label}
            </Badge>
            <button
              type="button"
              onClick={() => setShowConfidenceDetails(!showConfidenceDetails)}
              className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-1 text-xs text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))] transition-colors"
              title={confidenceMessage}
            >
              <Info className="h-3.5 w-3.5" />
              <span>Confiança</span>
            </button>
            {rankingComputedAt ? (
              <span className="text-xs text-[hsl(var(--text-muted))]">
                Atualizado {rankingRelativeTime}
              </span>
            ) : null}
          </div>
        </div>

        {showConfidenceDetails && (
          <div className="mt-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[hsl(var(--text))]">Confiança da Análise</span>
              <span className="text-xs font-semibold text-[hsl(var(--text))]">
                {fmtPercentValue(scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[hsl(var(--border))] overflow-hidden">
              <div 
                className={`h-2 rounded-full ${
                  (scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0) > 0.7 
                    ? "bg-emerald-500" 
                    : (scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0) > 0.4 
                      ? "bg-amber-500" 
                      : "bg-red-500"
                }`}
                style={{ width: `${(scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0) * 100}%` }}
              ></div>
            </div>
            <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
              {(scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0) > 0.7 
                ? "ℹ️ Currículo rico em detalhes e histórico profissional." 
                : (scoreExplanation?.data_confidence_score ?? rankingEntry?.score_breakdown?.confidence_score ?? 0) > 0.4 
                  ? "ℹ️ Currículo com detalhes suficientes para análise básica." 
                  : "ℹ️ Currículo muito resumido ou incompleto. A nota pode não ser precisa."}
            </p>
          </div>
        )}

        {loading ? <SkeletonRows /> : null}
        {error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
            {error}
          </div>
        ) : null}

        {!loading && !error && rankingEntry ? (
          <div className="flex flex-col gap-4">
            {/* Removed redundant grid */}

            {dealBreakerDetails.length > 0 ? (
              <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3">
                <p className="text-sm font-semibold text-[hsl(var(--danger))]">Score zerado por regra da vaga</p>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text))]">
                  Este candidato foi rejeitado porque um critério eliminatório da vaga não foi atendido.
                </p>
              </div>
            ) : null}

            {dealBreakerDetails.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    Critérios eliminatórios violados
                  </p>
                  <p className="mt-1 text-sm text-[hsl(var(--text))]">
                    O score foi zerado porque a regra da vaga não foi atendida.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {dealBreakerDetails.map((item, index) => (
                    <div
                      key={`${index}-${item.fieldLabel}-${item.expected}-${item.actual}`}
                      className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--surface-muted))] px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[hsl(var(--text))]">{item.fieldLabel}</p>
                          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{item.reason}</p>
                        </div>
                        <Badge variant="danger">Critério eliminatório</Badge>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MetaItem label="Esperado" value={item.expected} />
                        <MetaItem label="Encontrado" value={item.actual} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {rankingEntry.reason_tags.filter((reason) => !isDealBreakerReasonCode(reason)).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {rankingEntry.reason_tags
                  .filter((reason) => !isDealBreakerReasonCode(reason))
                  .slice(0, 3)
                  .map((reason, index) => (
                  <span
                    key={`${reason.type}-${reason.field}-${index}`}
                    className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]"
                  >
                    {reason.description}
                  </span>
                ))}
              </div>
            ) : null}

            {dealBreakerDetails.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-muted))]">Nenhum critério eliminatório violado.</p>
            ) : null}

            {/* Removed redundant summary text */}

            {scoreExplanation && scoreExplanation.overestimation_risks.length > 0 ? (
              <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] px-4 py-3">
                <p className="text-sm font-semibold text-[hsl(var(--warning))]">Alerta de confiança</p>
                <div className="mt-1 flex flex-col gap-1 text-xs leading-relaxed text-[hsl(var(--text))]">
                  {scoreExplanation.overestimation_risks.map((risk) => (
                    <p key={risk}>{risk}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {!hasRankingDetails ? (
              <p className="text-sm text-[hsl(var(--text-muted))]">
                O detalhamento do ranking ainda não está disponível neste contexto.
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/* Removed redundant Leitura da análise section */}

      {!scoreExplanation ? (
        <EmptyTab
          title="Explicação ainda não gerada para a vaga ativa"
          description="O score contextual desta vaga ainda não possui explicação detalhada disponível."
          compact
        />
      ) : null}

      {canSendMatchingFeedback && scoreExplanation ? (
        <Section title="Feedback humano">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  Feedback do recrutador
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                  Registra se o matching ajudou ou não na decisão.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleMatchingFeedback("liked")}
                  disabled={feedbackSaving !== null}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    scoreExplanation.feedback?.liked
                      ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]",
                    feedbackSaving === "liked" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {feedbackSaving === "liked" ? "Salvando…" : "👍 Útil"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleMatchingFeedback("rejected")}
                  disabled={feedbackSaving !== null}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    scoreExplanation.feedback?.rejected
                      ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]",
                    feedbackSaving === "rejected" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {feedbackSaving === "rejected" ? "Salvando…" : "👎 Não ajudou"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleMatchingFeedback("hired")}
                  disabled={feedbackSaving !== null}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    scoreExplanation.feedback?.hired
                      ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--accent-soft))] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]",
                    feedbackSaving === "hired" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {feedbackSaving === "hired" ? "Salvando…" : "Contratado"}
                </button>
              </div>
            </div>

            {scoreExplanation.feedback?.feedback_at ? (
              <p className="mt-3 text-xs text-[hsl(var(--text-muted))]">
                Último feedback registrado em {formatOptionalDateTime(scoreExplanation.feedback.feedback_at)}.
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Detalhes técnicos da análise">
        <div ref={rankingDetailsRef} />
        <details
          ref={rankingDetailsDisclosureRef}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-4 py-3"
        >
          <summary className="cursor-pointer list-none text-sm font-medium text-[hsl(var(--text))]">
            Detalhes técnicos da análise
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {rankingEntry ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <MetaItem label="Etapa no ranking" value={rankingEntry.stage || "—"} />
                  <MetaItem label="Status na vaga" value={rankingEntry.pipeline_status || "—"} />
                  <MetaItem
                    label="Análise de origem"
                    value={rankingEntry.source_analysis_created_at ? formatOptionalDateTime(rankingEntry.source_analysis_created_at) : "—"}
                  />
                  <MetaItem label="Versão do ranking" value={rankingVersion || "—"} />
                  <MetaItem label="Modelo de score" value={rankingEntry.score_model_version || "—"} />
                  <MetaItem label="Atualizado em" value={formatOptionalDateTime(rankingComputedAt)} />
                </div>

                {rankingEntry.score_breakdown ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <BreakdownItem label="Skills" value={rankingEntry.score_breakdown.skill_match_score} />
                    <BreakdownItem label="Experiência" value={rankingEntry.score_breakdown.experience_match_score} />
                    <BreakdownItem label="Senioridade" value={rankingEntry.score_breakdown.seniority_match_score} />
                    <BreakdownItem label="Educação" value={rankingEntry.score_breakdown.education_score} />
                    <BreakdownItem label="Confiança dos dados" value={rankingEntry.score_breakdown.confidence_score} />
                    <BreakdownItem label="Penalidade" value={rankingEntry.score_breakdown.penalty_score} />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[hsl(var(--text-muted))]">
                O detalhamento técnico do ranking ainda não está disponível neste contexto.
              </p>
            )}

            {scoreExplanation ? (
              <details
                ref={explainabilityDisclosureRef}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-sm font-medium text-[hsl(var(--text))]">
                  Breakdown e evidências
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MetaItem label="Aderência à vaga" value={fmtScore(scoreExplanation.job_fit_score)} />
                    <MetaItem label="Recommendation" value={scoreExplanation.recommendation || "—"} />
                    <MetaItem label="Motor usado" value={scoreExplanation.engine_used || "—"} />
                    <MetaItem label="Confiança" value={fmtPercentValue(scoreExplanation.data_confidence_score)} />
                  </div>

                  <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Breakdown do score
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <ExplanationBreakdownItem label="Essenciais" item={scoreExplanation.breakdown.mandatory ?? null} />
                      <ExplanationBreakdownItem label="Diferenciais" item={scoreExplanation.breakdown.optional ?? null} />
                      <ExplanationBreakdownItem label="Experiência" item={scoreExplanation.breakdown.experience ?? null} />
                      <ExplanationBreakdownItem label="Senioridade" item={scoreExplanation.breakdown.seniority ?? null} />
                      <ExplanationBreakdownItem label="Ajuste IA" item={scoreExplanation.breakdown.ai_adjustment ?? null} />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <InsightListBlock
                      title="Destaques"
                      items={scoreExplanation.highlights}
                      empty="Sem destaques relevantes."
                    />
                    <InsightListBlock
                      title="Riscos"
                      items={scoreExplanation.risks}
                      empty="Sem riscos relevantes."
                    />
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </details>
      </Section>
    </div>
  );
}

function InsightListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))]">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[hsl(var(--text-muted))]">{empty}</p>
      )}
    </div>
  );
}

function ExplainabilityCard({
  label,
  tone,
}: {
  label: string;
  tone: "positive" | "negative" | "contextual";
}) {
  return (
    <div
      className={[
        "rounded-xl border px-3 py-3 text-sm leading-6",
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50/75 text-emerald-950"
          : tone === "negative"
            ? "border-amber-200 bg-amber-50/80 text-amber-950"
            : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))]",
      ].join(" ")}
    >
      {label}
    </div>
  );
}

function ExplanationBreakdownItem({
  label,
  item,
}: {
  label: string;
  item: { score: number; weight: number; contribution: number } | null;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <p className={["mt-2 text-lg font-extrabold tabular-nums", scoreColorClass(item?.score ?? null)].join(" ")}>
        {fmtScore(item?.score ?? null)}
      </p>
      <div className="mt-2 flex flex-col gap-1 text-xs text-[hsl(var(--text-muted))]">
        <span>Peso: {item ? `${Math.round(item.weight * 100)}%` : "—"}</span>
        <span>Contribuição: {fmtScore(item?.contribution ?? null)}</span>
      </div>
    </div>
  );
}
