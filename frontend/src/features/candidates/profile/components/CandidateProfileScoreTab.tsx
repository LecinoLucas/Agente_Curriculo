import { useEffect, useState } from "react";

import { ScoreTab as CandidateScoreDetailsTab } from "../../drawer/tabs/ScoreTab";
import { useCandidateDecision } from "../../hooks/useCandidateDecision";
import { ANALYSIS_STATUS_LABEL, formatScorePercent } from "../../utils/profile";
import { formatDateTime, getScoreAttentionPoints, getScoreStrengths } from "../profileFormatters";
import { ActionButton, DefinitionList, EmptyBlock, SectionCard } from "./ProfileSharedUI";
import { scoreExplanationService } from "../../../../services/scoreExplanationService";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import type {
  AnalysisResult,
  AnalysisStatus,
  CandidateOverview,
  CandidatePipelineEntryOverview,
  Job,
  JobRankingEntry,
} from "../../../../types/domain";

interface CandidateProfileScoreTabProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidatePipelineEntryOverview | null;
  rankingEntry: JobRankingEntry | null;
  analysisResult: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  scoreNotReady: boolean;
  analysisRequesting: boolean;
  matchingRecalculating?: boolean;
  manualAnalysisStatus: AnalysisStatus["status"] | null;
  onRequestAnalysis: (options?: { force?: boolean }) => Promise<void>;
  onRecalculateMatching?: () => Promise<void>;
  compatibilityGuidance: ReturnType<typeof useCandidateDecision>["compatibilityGuidance"];
}

export function CandidateProfileScoreTab({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  rankingEntry,
  analysisResult,
  loading,
  error,
  scoreNotReady,
  analysisRequesting,
  matchingRecalculating = false,
  manualAnalysisStatus,
  onRequestAnalysis,
  onRecalculateMatching,
  compatibilityGuidance,
}: CandidateProfileScoreTabProps) {
  const candidateId = overview.candidate.id;
  const decision = overview.active_job_decision;
  const currentAnalysisId = decision?.current_analysis_id ?? null;
  const currentAnalysisOverview =
    overview.latest_analysis?.analysis_id === currentAnalysisId ? overview.latest_analysis : null;
  const status = manualAnalysisStatus ?? decision?.analysis_status ?? null;
  const scoreStatus = decision?.score_status ?? null;
  const isProcessing =
    scoreStatus === "analysis_processing" ||
    status === "pending" ||
    status === "processing" ||
    status === "retry_scheduled";
  const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanationResponse | null>(null);
  const [scoreExplanationLoading, setScoreExplanationLoading] = useState(false);

  useEffect(() => {
    if (!activeJobId || !candidateId || !currentAnalysisId || isProcessing) {
      setScoreExplanation(null);
      setScoreExplanationLoading(false);
      return;
    }

    let cancelled = false;
    setScoreExplanationLoading(true);
    void scoreExplanationService
      .get(activeJobId, candidateId)
      .then((payload) => {
        if (cancelled) return;
        if (payload.analysis_id && payload.analysis_id !== currentAnalysisId) {
          setScoreExplanation(null);
          return;
        }
        setScoreExplanation(payload);
      })
      .catch(() => {
        if (!cancelled) setScoreExplanation(null);
      })
      .finally(() => {
        if (!cancelled) setScoreExplanationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, candidateId, currentAnalysisId, isProcessing]);

  if (!activeJobId) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para consultar score e análise."
      />
    );
  }

  if (isProcessing) {
    return (
      <EmptyBlock
        title="Análise em andamento."
        description="A análise da vaga ativa ainda está sendo processada."
        actionLabel="Gerar análise agora"
        onAction={() => void onRequestAnalysis()}
        actionDisabled
      />
    );
  }

  if (status === "failed" || scoreStatus === "analysis_failed") {
    return (
      <EmptyBlock
        title="Análise falhou."
        description="A análise da vaga ativa não foi concluída. Solicite uma nova tentativa quando quiser."
        actionLabel={analysisRequesting ? "Solicitando..." : "Tentar novamente"}
        onAction={() => void onRequestAnalysis()}
        actionDisabled={analysisRequesting}
      />
    );
  }

  if ((scoreNotReady || (!currentAnalysisId && !rankingEntry)) && !loading) {
    const activeResumeVersionId =
      activePipelineEntry?.resume_version_id ??
      overview.resumes[0]?.current_version_id ??
      null;
    const latestExtractionStatus =
      (
        overview.resumes.find((r) => r.current_version_id === activeResumeVersionId)
          ?.extraction_status ?? overview.resumes[0]?.extraction_status ?? null
      )?.toLowerCase() ?? null;
    const extractionInFlight =
      latestExtractionStatus === "pending" || latestExtractionStatus === "processing";

    let title = "Análise ainda não gerada";
    let subtitle =
      "O candidato está vinculado à vaga ativa, mas ainda não existe análise IA canônica para este vínculo.";
    let actionLabel = analysisRequesting ? "Solicitando..." : "Gerar análise agora";
    let actionDisabled = analysisRequesting;

    if (extractionInFlight) {
      title = "Extração de currículo em andamento";
      subtitle = "Extração do currículo em andamento.";
      actionDisabled = true;
    } else if (currentAnalysisId && status === "completed") {
      title = "Matching pendente";
      subtitle =
        "Esta análise IA já foi concluída. Falta apenas recalcular o matching/ranking desta vaga. Essa ação não usa IA e pode levar alguns instantes.";
      actionLabel = matchingRecalculating ? "Recalculando..." : "Recalcular matching";
    } else if (currentAnalysisId) {
      title = "Análise interrompida";
      subtitle =
        "Existe uma análise canônica para a vaga ativa, mas ela não está em processamento válido.";
      actionLabel = analysisRequesting ? "Solicitando..." : "Reprocessar análise";
    }

    const isMatchingPending = currentAnalysisId != null && status === "completed";
    const handleAction = isMatchingPending
      ? onRecalculateMatching
        ? () => void onRecalculateMatching()
        : undefined
      : () => void onRequestAnalysis({ force: true });
    const isActionDisabled = isMatchingPending
      ? matchingRecalculating || !activeJobId || !onRecalculateMatching
      : actionDisabled;

    return (
      <EmptyBlock
        title={title}
        description={subtitle}
        actionLabel={actionLabel}
        onAction={handleAction}
        actionDisabled={isActionDisabled}
      />
    );
  }

  const strengths = getScoreStrengths(scoreExplanation);
  const attentionPoints = getScoreAttentionPoints(scoreExplanation);
  const resumeVersion =
    currentAnalysisOverview?.resume_title ??
    overview.resumes.find((resume) => resume.resume_id === currentAnalysisOverview?.resume_id)
      ?.title ??
    "-";
  const analysisDate =
    currentAnalysisOverview?.completed_at ??
    currentAnalysisOverview?.updated_at ??
    rankingEntry?.source_analysis_created_at ??
    rankingEntry?.computed_at ??
    null;
  const summary =
    scoreExplanation?.ranking_summary_text ?? rankingEntry?.ranking_summary_text ?? null;

  return (
    <div className="space-y-4">
      {scoreStatus === "score_stale" ? (
        <SectionCard title="Score desatualizado">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              O score atual pode não refletir a versão mais recente do currículo ou da vaga.
            </p>
            <ActionButton
              onClick={() => void onRequestAnalysis({ force: true })}
              disabled={analysisRequesting}
              primary
            >
              {analysisRequesting ? "Atualizando..." : "Atualizar análise"}
            </ActionButton>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title="Análise da vaga ativa">
        <DefinitionList
          items={[
            [
              "Score principal",
              formatScorePercent(rankingEntry?.job_fit_score ?? decision?.match_score ?? null),
            ],
            [
              "Status da análise",
              status ? (ANALYSIS_STATUS_LABEL[status] ?? status) : "-",
            ],
            ["Data da análise", analysisDate ? formatDateTime(analysisDate) : "-"],
            ["Currículo analisado", resumeVersion],
          ]}
        />
      </SectionCard>

      {summary || strengths.length > 0 || attentionPoints.length > 0 || scoreExplanationLoading ? (
        <SectionCard title="Explicação resumida">
          {scoreExplanationLoading ? (
            <p className="text-sm text-text-muted">Carregando explicação detalhada...</p>
          ) : null}
          {summary ? <p className="text-sm leading-6 text-text">{summary}</p> : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <InsightColumn title="Principais forças" items={strengths} empty="Sem forças destacadas." />
            <InsightColumn
              title="Pontos de atenção"
              items={attentionPoints}
              empty="Sem pontos de atenção destacados."
            />
          </div>
        </SectionCard>
      ) : null}

      <CandidateScoreDetailsTab
        overview={overview}
        activeJobId={activeJobId}
        activeJob={activeJob}
        activePipelineEntry={activePipelineEntry}
        rankingEntry={rankingEntry}
        analysisResult={analysisResult}
        loading={loading}
        error={error}
        compatibilityGuidance={compatibilityGuidance}
        scoreExplanation={scoreExplanation}
      />
    </div>
  );
}

function InsightColumn({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-text">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--bg))] px-3 py-2"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">{empty}</p>
      )}
    </div>
  );
}
