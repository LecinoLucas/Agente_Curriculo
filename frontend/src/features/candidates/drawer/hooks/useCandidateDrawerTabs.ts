import { useCallback, useMemo } from "react";
import type { PanelTab } from "../../../pipeline/PipelineContext";
import type { CandidateDrawerTab } from "../layout/CandidateDrawerTabs";

interface UseCandidateDrawerTabsInput {
  activePanelTab: PanelTab;
  switchPanelTab: (tab: PanelTab) => void;
}

export function useCandidateDrawerTabs({ activePanelTab, switchPanelTab }: UseCandidateDrawerTabsInput) {
  const mapTabToNewStructure = useCallback((tab: PanelTab): CandidateDrawerTab => {
    if (tab === "summary" || tab === "score" || tab === "actions") return "overview";
    if (tab === "analysis") return "overview";
    if (tab === "documents") return "documents";
    if (tab === "history") return "history";
    return "overview";
  }, []);

  const currentTab = useMemo(() => mapTabToNewStructure(activePanelTab), [activePanelTab, mapTabToNewStructure]);

  const handleTabChange = useCallback(
    (newTab: CandidateDrawerTab) => {
      if (newTab === "overview") switchPanelTab("summary");
      if (newTab === "documents") switchPanelTab("documents");
      if (newTab === "history") switchPanelTab("history");
      if (newTab === "experience") switchPanelTab("summary");
    },
    [switchPanelTab],
  );

  return {
    currentTab,
    handleTabChange,
  };
}
