import { useMemo } from "react";
import type { CandidateOverview, Job, JobRankingEntry, PipelineStage } from "../../../../types/domain";
import { TRANSFER_ALLOWED_STAGES } from "../../../../types/domain";
import { formatScorePercent, getScoreTone, normalizeScorePercent } from "../../utils/scoreFormatting";
import { isTransferTargetJob } from "../../../../utils/jobStatusRules";
import { getLatestAnalysisForActiveJob } from "../../utils/analysisStatus";

export function fmtScore(score: number | null | undefined): string {
  return formatScorePercent(score);
}

export function fmtPercentValue(value: number | null | undefined): string {
  return formatScorePercent(value);
}

export function scoreColorClass(score: number | null | undefined): string {
  const tone = getScoreTone(score);
  if (tone === "high") return "text-success";
  if (tone === "mid") return "text-warning";
  if (tone === "low") return "text-danger";
  return "text-text-muted";
}

export function scoreBgClass(score: number | null | undefined): string {
  const tone = getScoreTone(score);
  if (tone === "high") return "bg-success-soft ring-[hsl(var(--success))]/25";
  if (tone === "mid") return "bg-warning-soft ring-[hsl(var(--warning))]/25";
  if (tone === "low") return "bg-danger-soft ring-[hsl(var(--danger))]/25";
  return "bg-surface-muted ring-[hsl(var(--border))]";
}

export function getCompatibilityGuidance(params: {
  hasJobLink: boolean;
  hasResume: boolean;
  hasPersistedScore: boolean;
  analysisStatus: string | null | undefined;
}): {
  title: string;
  description: string;
  tone: "neutral" | "info";
} | null {
  if (!params.hasJobLink) {
    return {
      title: "Aguardando vaga",
      description: "Associe o candidato a uma vaga para calcular a Aderência à Vaga.",
      tone: "neutral",
    };
  }
  if (!params.hasResume) {
    return {
      title: "Aderência à Vaga indisponível",
      description: "Envie um currículo para calcular a Aderência à Vaga.",
      tone: "neutral",
    };
  }
  if (params.hasPersistedScore) {
    return null;
  }
  if (params.analysisStatus === "pending" || params.analysisStatus === "processing") {
    return {
      title: "Análise da IA em processamento",
      description: "A Aderência à Vaga será atualizada quando a execução terminar.",
      tone: "info",
    };
  }
  if (params.analysisStatus !== "completed") {
    return {
      title: "Aderência à Vaga indisponível",
      description: "Execute a análise da IA para liberar a Aderência à Vaga.",
      tone: "neutral",
    };
  }
  return null;
}

interface UseCandidateDecisionInput {
  candidateOverview: CandidateOverview | null | undefined;
  candidateActiveJobId: string | null;
  jobs: Job[];
  rankingEntry: JobRankingEntry | null;
}

export function useCandidateDecision({
  candidateOverview,
  candidateActiveJobId,
  jobs,
  rankingEntry,
}: UseCandidateDecisionInput) {
  const primaryPipelineEntry = useMemo(() => {
    if (!candidateOverview || !candidateActiveJobId) return null;
    return candidateOverview.pipeline_entries.find((entry) => entry.job_id === candidateActiveJobId) ?? null;
  }, [candidateOverview, candidateActiveJobId]);
  const latestPipelineEntry = useMemo(
    () => candidateOverview?.pipeline_entries[0] ?? null,
    [candidateOverview?.pipeline_entries],
  );

  const currentStage = primaryPipelineEntry?.stage ?? null;

  const activeJob = useMemo<Job | null>(
    () => jobs.find((job) => job.id === (candidateActiveJobId ?? "")) ?? null,
    [jobs, candidateActiveJobId],
  );

  const activeJobMatch = useMemo(
    () =>
      candidateActiveJobId
        ? candidateOverview?.top_matches.find((match) => match.job_id === candidateActiveJobId) ?? null
        : null,
    [candidateOverview?.top_matches, candidateActiveJobId],
  );

  const activeJobCompatibilityScore = normalizeScorePercent(
    rankingEntry?.job_fit_score ?? activeJobMatch?.job_fit_score ?? null,
  );
  const isTerminalPipelineStage = currentStage === "rejected";

  const transferAvailableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.id !== (candidateActiveJobId ?? null) &&
          isTransferTargetJob(job.status),
      ),
    [jobs, candidateActiveJobId],
  );

  const canTransferCurrentJob = primaryPipelineEntry !== null && currentStage !== null && TRANSFER_ALLOWED_STAGES.includes(currentStage);
  const hasResume = (candidateOverview?.resumes.length ?? 0) > 0;
  const activeJobAnalysis = getLatestAnalysisForActiveJob(
    candidateOverview?.latest_analysis,
    candidateActiveJobId,
  );

  const compatibilityGuidance = getCompatibilityGuidance({
    hasJobLink: primaryPipelineEntry !== null,
    hasResume,
    hasPersistedScore: rankingEntry?.job_fit_score != null,
    analysisStatus: activeJobAnalysis?.status ?? null,
  });

  const activeJobLabel =
    activeJob?.title ??
    candidateOverview?.active_job?.title ??
    latestPipelineEntry?.job_title ??
    "Aguardando Vaga";

  return {
    primaryPipelineEntry,
    latestPipelineEntry,
    currentStage,
    activeJob,
    activeJobCompatibilityScore,
    hasPersistedCompatibilityScore: rankingEntry?.job_fit_score != null,
    transferAvailableJobs,
    canTransferCurrentJob,
    hasResume,
    compatibilityGuidance,
    activeJobLabel,
  };
}
