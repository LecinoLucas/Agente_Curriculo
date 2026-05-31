import { PanelRightClose, RefreshCw } from "lucide-react";

import { SkeletonRows } from "../../../components/common/Skeleton";
import { DataQualityBanner } from "../../../components/data-quality/DataQualityBanner";
import type { JobRanking, JobRankingEntry } from "../../../types/domain";
import { type PipelineJobSummary } from "../../../services/pipelineService";
import {
  buildDealBreakerViolationDisplay,
  isDealBreakerReasonCode,
} from "../dealBreakerDisplay";

function getRankingFreshnessLabel(
  status: JobRankingEntry["ranking_freshness_status"] | null | undefined,
) {
  if (status === "fresh") return "Atualizado";
  if (status === "stale") return "Aderência desatualizada";
  return "Aguardando reprocessamento";
}

function RankingCard({
  entry,
  job,
  onOpenCandidate,
}: {
  entry: JobRankingEntry;
  job: PipelineJobSummary | null;
  onOpenCandidate: (candidateId: string) => void;
}) {
  const dealBreakerReason = entry.reason_tags.find((reason) => isDealBreakerReasonCode(reason)) ?? null;
  const dealBreakerDisplay = dealBreakerReason
    ? buildDealBreakerViolationDisplay({
        reasonCode: dealBreakerReason,
        jobDealBreakers: job?.deal_breakers ?? [],
      })
    : null;
  const hasDealBreakerRejection =
    Boolean(dealBreakerReason) &&
    entry.decision_suggestion === "rejected_suggested" &&
    Math.round(entry.job_fit_score) === 0;
  const reasonPreview = entry.reason_tags
    .filter((reason) => !isDealBreakerReasonCode(reason))
    .slice(0, 3)
    .map((reason) => reason.description)
    .filter(Boolean);
  const freshnessLabel = getRankingFreshnessLabel(entry.ranking_freshness_status);

  return (
    <button
      type="button"
      onClick={() => onOpenCandidate(entry.candidate_id)}
      className={[
        "w-full rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5",
        hasDealBreakerRejection
          ? "border-[hsl(var(--danger-soft))]/60 dark:border-rose-900 bg-danger-soft/20 hover:border-rose-350 hover:shadow-sm"
          : "border-border/40 dark:border-slate-800 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-slate-350 dark:hover:border-slate-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[hsl(var(--primary))]/10 text-[10px] font-black text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/15">
              {entry.rank}
            </span>
            <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{entry.candidate_name}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {freshnessLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Score
          </p>
          <p className="mt-0.5 text-base font-black tabular-nums text-[hsl(var(--primary))]">
            {Math.round(entry.job_fit_score)}%
          </p>
        </div>
      </div>

      {hasDealBreakerRejection && dealBreakerDisplay && (
        <div className="mt-3 rounded-lg border border-rose-150 dark:border-rose-900 bg-white dark:bg-slate-950 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">
            Critério Eliminatório
          </p>
          <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">
            {dealBreakerDisplay.fieldLabel}: esperado {dealBreakerDisplay.expected}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-400">
             {dealBreakerDisplay.reason}.
          </p>
        </div>
      )}

      {reasonPreview.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {reasonPreview.map((reason) => (
              <span
                key={reason}
                className="inline-flex items-center rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-450"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      {entry.ranking_summary_text && (
        <p className="mt-3 line-clamp-2 text-[10.5px] font-medium leading-relaxed text-slate-400">
          {entry.ranking_summary_text}
        </p>
      )}
    </button>
  );
}

export function PipelineRankingPanel({
  jobTitle,
  job,
  ranking,
  loading,
  isRefreshing,
  error,
  onToggle,
  onOpenCandidate,
  onRefresh,
}: {
  jobTitle: string;
  job: PipelineJobSummary | null;
  ranking: JobRanking | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onToggle: () => void;
  onOpenCandidate: (candidateId: string) => void;
  onRefresh?: () => void;
}) {
  const showInitialLoading = loading && ranking === null;

  return (
    <aside
      id="pipeline-ranking-panel"
      className="pipeline-ranking-panel sticky top-6 flex h-[720px] max-h-[85vh] flex-col rounded-2xl border border-border/40 dark:border-slate-800 bg-surface p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/40 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
            Ranking IA Marajó
          </p>
          <h3 className="mt-1 text-sm font-bold text-text dark:text-slate-100 truncate" title={jobTitle}>{jobTitle}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              title="Atualizar ranking"
            >
              <RefreshCw className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Fechar"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div id="pipeline-ranking-content" className="mt-4 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full pr-0.5">
        {showInitialLoading && <SkeletonRows rows={3} />}
        {isRefreshing && (
          <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/10 bg-[hsl(var(--primary))]/[0.02] px-3.5 py-2 text-[10px] font-bold text-[hsl(var(--primary))] animate-pulse">
            Recalculando aderência dos candidatos…
          </div>
        )}

        {!showInitialLoading && error && (
          <div className="rounded-xl border border-rose-250 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/20 p-4 text-xs font-semibold text-rose-800 dark:text-rose-350">
            {error}
          </div>
        )}

        {!showInitialLoading && !error && ranking && ranking.candidates.length === 0 && (
          <div className="py-12 text-center">
            <span className="text-3xl mb-3 block">🏁</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Nenhum ranking disponível</p>
            <p className="mt-1 text-[10px] font-medium text-slate-400">Conclua a análise dos candidatos para gerar o ranking.</p>
          </div>
        )}

        {!showInitialLoading && !error && ranking && ranking.candidates.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <span>{ranking.total_candidates} Talentos</span>
              {ranking.score_version && <span>Versão {ranking.score_version}</span>}
            </div>

            {ranking.data_quality_stats && (
              <DataQualityBanner
                filteredCount={ranking.data_quality_stats.filtered_candidates}
                validCount={ranking.data_quality_stats.valid_candidates}
                unknownCount={ranking.data_quality_stats.unknown_candidates}
                totalCount={ranking.data_quality_stats.total_candidates}
              />
            )}

            {ranking.candidates.map((entry) => (
              <RankingCard
                key={`${entry.rank}-${entry.candidate_id}`}
                entry={entry}
                job={job}
                onOpenCandidate={onOpenCandidate}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
