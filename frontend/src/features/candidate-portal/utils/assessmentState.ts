import type { BehavioralAssignmentSummary } from "../../../services/candidatePortalService";

export type AssessmentDisplayState =
  | "not_required"
  | "pending_release"
  | "available"
  | "submitted"
  | "under_review"
  | "completed"
  | "error";

export function deriveAssessmentState(
  requiresAssessment: boolean,
  assessments: BehavioralAssignmentSummary[],
  loadError: boolean,
): AssessmentDisplayState {
  if (loadError) return "error";

  const active = assessments.filter(
    (a) => a.status !== "expired" && a.status !== "cancelled",
  );

  if (active.length === 0) {
    return requiresAssessment ? "pending_release" : "not_required";
  }

  if (active.some((a) => a.status === "pending" || a.status === "in_progress")) {
    return "available";
  }

  const submitted = active.filter((a) => a.status === "submitted");
  if (submitted.length === 0) return "not_required";

  if (submitted.every((a) => a.ai_evaluation_status === "completed")) {
    return "completed";
  }

  if (
    submitted.some(
      (a) =>
        a.ai_evaluation_status === "processing" ||
        a.ai_evaluation_status === "pending",
    )
  ) {
    return "under_review";
  }

  return "submitted";
}
