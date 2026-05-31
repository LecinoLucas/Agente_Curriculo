import type { PipelineBoardFilters, PipelineStage } from "../../types/domain";
import { isPipelineOperationalJob } from "../../utils/jobStatusRules";

export const PIPELINE_SHOW_RANKING_STORAGE_KEY = "pipeline:showRanking";
export const PIPELINE_LAST_SELECTED_JOB_KEY = "pipeline:lastSelectedJobId";
export const INTERVIEW_STAGES = new Set<PipelineStage>(["hr_interview", "technical_interview"]);
export const SCHEDULE_TIMEZONE = "America/Sao_Paulo";

export function interviewTypeForStage(stage: PipelineStage) {
  return stage === "technical_interview" ? "technical" : "hr";
}

export function canUsePipeline(status: string | undefined) {
  return isPipelineOperationalJob(status);
}

export function resolveInitialShowRanking() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PIPELINE_SHOW_RANKING_STORAGE_KEY) === "true";
}

export function getLastSelectedJobId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PIPELINE_LAST_SELECTED_JOB_KEY);
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultPipelineDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    entered_from: formatDateInputValue(from),
    entered_to: formatDateInputValue(to),
  };
}

export function hasAnyPipelineDateFilter(searchParams: URLSearchParams) {
  return (
    searchParams.has("entered_from") ||
    searchParams.has("entered_to") ||
    searchParams.has("updated_from") ||
    searchParams.has("updated_to")
  );
}

export function readPipelineBoardFilters(searchParams: URLSearchParams): PipelineBoardFilters {
  const read = (key: keyof PipelineBoardFilters) => {
    const value = searchParams.get(key);
    return value?.trim() ? value : undefined;
  };

  return {
    entered_from: read("entered_from"),
    entered_to: read("entered_to"),
    updated_from: read("updated_from"),
    updated_to: read("updated_to"),
  };
}
