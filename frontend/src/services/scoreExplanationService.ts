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

export type ScoreExplanationResponse = {
  job_id: string;
  candidate_id: string;
  analysis_id: string;
  score: number;
  final_score: number;
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
  highlights: string[];
  risks: string[];
  high_score_reasons: string[];
  low_score_reasons: string[];
  overestimation_risks: string[];
  recommended_questions: string[];
  strongest_evidence: ScoreExplanationEvidence[];
  matched_equivalences: ScoreExplanationEvidence[];
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
