import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, CandidateOverview, Job, JobRankingEntry } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import { ScoreTab, type ScoreTabFocusRequest } from "../tabs/ScoreTab";
import { CandidateAnalysisSection } from "./CandidateAnalysisSection";
import { getCompatibilityGuidance } from "../hooks/useCandidateDecision";

interface ScoreTabWithAnalysisProps {
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
}

export function ScoreTabWithAnalysis({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  rankingEntry,
  analysisResult,
  loading,
  error,
  compatibilityGuidance,
  scoreExplanation,
  focusRequest = null,
}: ScoreTabWithAnalysisProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const analysisSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focusRequest || focusRequest.intent !== "analysis") return;
    if (!analysisResult) return;

    setAnalysisOpen(true);
    window.requestAnimationFrame(() => {
      analysisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [analysisResult, focusRequest]);

  return (
    <div className="flex flex-col">
      <ScoreTab
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
        focusRequest={focusRequest}
      />
      {analysisResult && (
        <div ref={analysisSectionRef}>
          <CandidateAnalysisSection
            analysisResult={analysisResult}
            isLoading={loading}
            isOpen={analysisOpen}
            onToggle={() => setAnalysisOpen(!analysisOpen)}
          />
        </div>
      )}
    </div>
  );
}
