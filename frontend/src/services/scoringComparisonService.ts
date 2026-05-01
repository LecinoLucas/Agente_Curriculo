import { httpRequest } from "./http";

export type InsightEvidence = {
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

export type ScoreDriver = {
  driver: string;
  impact: string;
  weight: number;
  reason: string;
};

export type CandidateEvaluationInsight = {
  why_score_is_high: string[];
  why_score_is_low: string[];
  top_evidence: InsightEvidence[];
  matched_requirements: string[];
  partially_matched_requirements: string[];
  missing_critical_requirements: string[];
  equivalent_matches: InsightEvidence[];
  inferred_matches: InsightEvidence[];
  score_drivers: ScoreDriver[];
  possible_overestimation: string[];
  possible_underestimation: string[];
  risk_points: string[];
  recommended_interview_questions: string[];
  human_review_notes: string[];
};

export type ScoringComparisonResponse = {
  job_id: string;
  candidate_id: string;
  analysis_id: string;
  job_profile_hash: string;
  candidate_profile_hash: string;
  legacy_match_score: number;
  adaptive_match_score: number;
  delta: number;
  legacy_recommendation: string;
  adaptive_recommendation: string;
  confidence_score: number;
  should_review_manually: boolean;
  major_differences: string[];
  strengths: string[];
  gaps: string[];
  risk_points: string[];
  explanation: string;
  evaluation_insight: CandidateEvaluationInsight;
};

export const scoringComparisonService = {
  compare: (jobId: string, candidateId: string): Promise<ScoringComparisonResponse> =>
    httpRequest<ScoringComparisonResponse>(`/api/v1/admin/scoring-comparison/${jobId}/${candidateId}`),
};
