import { useMemo } from "react";
import type { CandidateOverview, Job, JobRankingEntry, PipelineStage } from "../../../../types/domain";
import { getCandidateState, getNextAction, type CandidateState } from "../../../pipeline/candidateState";
import { formatScorePercent, getScoreTone, normalizeScorePercent } from "../../utils/scoreFormatting";
import { isTransferTargetJob } from "../../../../utils/jobStatusRules";

export function fmtScore(score: number | null | undefined): string {
  return formatScorePercent(score);
}

export function fmtPercentValue(value: number | null | undefined): string {
  return formatScorePercent(value);
}

export function scoreColorClass(score: number | null | undefined): string {
  const tone = getScoreTone(score);
  if (tone === "high") return "text-[hsl(var(--success))]";
  if (tone === "mid") return "text-[hsl(var(--warning))]";
  if (tone === "low") return "text-[hsl(var(--danger))]";
  return "text-[hsl(var(--text-muted))]";
}

export function scoreBgClass(score: number | null | undefined): string {
  const tone = getScoreTone(score);
  if (tone === "high") return "bg-[hsl(var(--success-soft))] ring-[hsl(var(--success))]/25";
  if (tone === "mid") return "bg-[hsl(var(--warning-soft))] ring-[hsl(var(--warning))]/25";
  if (tone === "low") return "bg-[hsl(var(--danger-soft))] ring-[hsl(var(--danger))]/25";
  return "bg-[hsl(var(--surface-muted))] ring-[hsl(var(--border))]";
}

export function getCompatibilityGuidance(params: {
  hasJobLink: boolean;
  hasResume: boolean;
  analysisStatus: string | null | undefined;
}): {
  title: string;
  description: string;
  tone: "neutral" | "info";
} | null {
  if (!params.hasJobLink) {
    return {
      title: "Aguardando vaga",
      description: "Associe o candidato a uma vaga para calcular a compatibilidade.",
      tone: "neutral",
    };
  }
  if (!params.hasResume) {
    return {
      title: "Compatibilidade indisponível",
      description: "Envie um currículo para calcular a compatibilidade.",
      tone: "neutral",
    };
  }
  if (params.analysisStatus === "pending" || params.analysisStatus === "processing") {
    return {
      title: "Análise da IA em processamento",
      description: "O cálculo da compatibilidade será atualizado quando a execução terminar.",
      tone: "info",
    };
  }
  if (params.analysisStatus !== "completed") {
    return {
      title: "Compatibilidade indisponível",
      description: "Execute a análise da IA para liberar esta decisão.",
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
  linkSaving: boolean;
}

export function useCandidateDecision({
  candidateOverview,
  candidateActiveJobId,
  jobs,
  rankingEntry,
  linkSaving,
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

  const activeJobCompatibilityScore = normalizeScorePercent(primaryPipelineEntry?.match_score ?? null);
  const isTerminalPipelineStage = currentStage === "hired" || currentStage === "rejected";

  const candidateState = useMemo(() => {
    if (!candidateOverview) return null;
    if (primaryPipelineEntry == null) {
      return {
        key: "waiting_job",
        label: "Aguardando vaga",
        tone: "warning",
      } as CandidateState;
    }
    return getCandidateState({
      resume_count: candidateOverview.resumes.length,
      ai_status: candidateOverview.latest_analysis?.status ?? null,
      pipeline: { stage: primaryPipelineEntry?.stage ?? null },
      ranking_available: rankingEntry !== null || activeJobCompatibilityScore !== null,
    });
  }, [activeJobCompatibilityScore, primaryPipelineEntry?.stage, candidateOverview, rankingEntry]);

  const candidateNextAction = useMemo(
    () => (candidateState ? getNextAction(candidateState) : null),
    [candidateState],
  );

  const transferAvailableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.id !== (candidateActiveJobId ?? null) &&
          isTransferTargetJob(job.status),
      ),
    [jobs, candidateActiveJobId],
  );

  const canTransferCurrentJob = primaryPipelineEntry !== null && !isTerminalPipelineStage;
  const hasResume = (candidateOverview?.resumes.length ?? 0) > 0;

  const compatibilityGuidance = getCompatibilityGuidance({
    hasJobLink: primaryPipelineEntry !== null,
    hasResume,
    analysisStatus: candidateOverview?.latest_analysis?.status ?? null,
  });

  const activeJobLabel =
    activeJob?.title ??
    candidateOverview?.active_job?.title ??
    latestPipelineEntry?.job_title ??
    "Não vinculado";

  const linkStatus = primaryPipelineEntry
    ? "Vínculo ativo no pipeline"
    : latestPipelineEntry?.relationship_status === "rejected"
      ? "Vínculo encerrado (Reprovado)"
      : latestPipelineEntry?.relationship_status === "hired"
        ? "Vínculo encerrado (Contratado)"
    : linkSaving
      ? "Vinculando à vaga ativa"
      : "Não vinculado";

  return {
    primaryPipelineEntry,
    latestPipelineEntry,
    currentStage,
    activeJob,
    activeJobCompatibilityScore,
    candidateState,
    candidateNextAction,
    transferAvailableJobs,
    canTransferCurrentJob,
    hasResume,
    compatibilityGuidance,
    activeJobLabel,
    linkStatus,
  };
}
