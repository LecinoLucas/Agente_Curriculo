import { httpRequest } from "./http";
import type { MatchingFeedback } from "../types/domain";

export type ScoreExplanationEvidence = {
  requirement: string;
  requirement_type: string;
  match_status: string;
  match_type: string;
  evidence_quotes: string[];
  evidence_strength: string;
  confidence: string;
  score_hint: number;
  explanation: string;
};

export type ScoreExplanationBreakdownItem = {
  score: number;
  weight: number;
  contribution: number;
};

export type ScoreExplanationFactorSummaryItem = {
  factor_type: string;
  factor_key: string;
  factor_label: string;
  impact_score: number;
  direction: "positive" | "negative" | "neutral";
};

export type ScoreExplanationFactorSummary = {
  positive: ScoreExplanationFactorSummaryItem[];
  negative: ScoreExplanationFactorSummaryItem[];
  contextual: ScoreExplanationFactorSummaryItem[];
};

export type ScoreExplanationDeltaChange = {
  factor_type: string;
  factor_key: string;
  factor_label: string;
  previous_impact_score: number;
  current_impact_score: number;
  impact_delta: number;
  change_kind: "added" | "removed" | "changed";
};

export type ScoreExplanationDelta = {
  previous_score?: number | null;
  current_score?: number | null;
  score_change?: number | null;
  change_reason?:
    | "candidate_analysis_changed"
    | "job_requirements_changed"
    | "score_model_changed"
    | "manual_recompute_same_inputs"
    | null;
  top_changes: ScoreExplanationDeltaChange[];
};

export type SkillPartialMatch = {
  required: string;
  candidate: string;
  score: number;
  reason: string;
  source: string;
};

export type ScoreExplanationResponse = {
  job_id: string;
  candidate_id: string;
  analysis_id?: string | null;
  score: number;
  final_score: number;
  freshness_status: "fresh" | "stale";
  score_model_version?: string | null;
  explainability_version?: string | null;
  computed_at?: string | null;
  recommendation: string;
  engine_used: string;
  explanation: string;
  breakdown: {
    mandatory?: ScoreExplanationBreakdownItem | null;
    optional?: ScoreExplanationBreakdownItem | null;
    experience?: ScoreExplanationBreakdownItem | null;
    seniority?: ScoreExplanationBreakdownItem | null;
    ai_adjustment?: ScoreExplanationBreakdownItem | null;
  };
  factor_summary: ScoreExplanationFactorSummary;
  delta?: ScoreExplanationDelta | null;
  highlights: string[];
  risks: string[];
  high_score_reasons: string[];
  low_score_reasons: string[];
  overestimation_risks: string[];
  recommended_questions: string[];
  strongest_evidence: ScoreExplanationEvidence[];
  matched_equivalences: ScoreExplanationEvidence[];
  partial_matches?: SkillPartialMatch[];
  gaps: string[];
  confidence_score: number;
  strengths: string[];
  feedback: MatchingFeedback | null;
};

export type MatchingFeedbackRequest = {
  liked?: boolean | null;
  rejected?: boolean | null;
  hired?: boolean | null;
  comment?: string | null;
};

export const scoreExplanationService = {
  get: (jobId: string, candidateId: string): Promise<ScoreExplanationResponse> =>
    httpRequest<ScoreExplanationResponse>(`/api/v1/jobs/${jobId}/candidates/${candidateId}/score-explanation`),
  saveFeedback: (
    jobId: string,
    candidateId: string,
    payload: MatchingFeedbackRequest,
  ): Promise<MatchingFeedback> =>
    httpRequest<MatchingFeedback>(`/api/v1/jobs/${jobId}/candidates/${candidateId}/matching-feedback`, {
      method: "POST",
      body: payload,
    }),
};
