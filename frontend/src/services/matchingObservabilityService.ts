import { httpRequest } from "./http";

export type MatchingObservabilityCountItem = {
  name: string;
  count: number;
};

export type MatchingObservabilityJobItem = {
  job_id: string;
  job_title: string;
  negative_feedback_count: number;
};

export type MatchingObservabilitySummary = {
  total_observations: number;
  adaptive_count: number;
  legacy_count: number;
  average_score: number;
  average_confidence: number;
  high_score_negative_feedback: number;
  low_score_positive_feedback: number;
  top_missing_skills: MatchingObservabilityCountItem[];
  top_equivalences_used: MatchingObservabilityCountItem[];
  jobs_with_most_negative_feedback: MatchingObservabilityJobItem[];
};

export const matchingObservabilityService = {
  summary: (): Promise<MatchingObservabilitySummary> =>
    httpRequest<MatchingObservabilitySummary>("/api/v1/admin/matching-observability/summary"),
};
