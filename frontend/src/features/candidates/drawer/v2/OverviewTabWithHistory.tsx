import { type MutableRefObject, useState } from "react";
import type { CandidateOverview, Job, CandidatePipelineHistory } from "../../../../types/domain";
import { OverviewTab } from "../tabs/OverviewTab";
import { CandidateHistorySection } from "./CandidateHistorySection";

interface OverviewTabWithHistoryProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  onEdit: () => void;
  historyCacheRef: MutableRefObject<Map<string, CandidatePipelineHistory>>;
}

export function OverviewTabWithHistory({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  onEdit,
  historyCacheRef,
}: OverviewTabWithHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <OverviewTab
        overview={overview}
        activeJobId={activeJobId}
        activeJob={activeJob}
        activePipelineEntry={activePipelineEntry}
        onEdit={onEdit}
      />
      <CandidateHistorySection
        overview={overview}
        activeJobId={activeJobId}
        cacheRef={historyCacheRef}
        isOpen={historyOpen}
        onToggle={() => setHistoryOpen(!historyOpen)}
      />
    </div>
  );
}
