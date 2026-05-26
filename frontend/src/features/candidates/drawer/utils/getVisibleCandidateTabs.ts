import type { TabKey } from "../v2/CandidateProfileNavigation";
import type { PipelineStage } from "../../../../types/domain";
import type { UserRole as BackendUserRole } from "../../../../types/auth";

export type UserRole = BackendUserRole;

export interface GetVisibleCandidateTabsInput {
  pipelineStage: PipelineStage | null;
  pipelineStatus: string | null | undefined;
  activeJobDecision: string | null | undefined;
  hasActiveJob: boolean;
  hasBehavioralAssessment: boolean;
  hasInterviews: boolean;
  hasScorecard: boolean;
  hasHiringDecision: boolean;
  hasPreAdmission: boolean;
  hasAdmissionPackage: boolean;
  hasCollaboration: boolean;
  userRole: UserRole;
  showAll: boolean;
}

export function getVisibleCandidateTabs(input: GetVisibleCandidateTabsInput): TabKey[] {
  const {
    pipelineStage,
    pipelineStatus,
    activeJobDecision,
    hasActiveJob,
    hasBehavioralAssessment,
    hasInterviews,
    hasScorecard,
    hasHiringDecision,
    hasPreAdmission,
    hasAdmissionPackage,
    hasCollaboration,
    userRole,
    showAll,
  } = input;

  const visible: Set<TabKey> = new Set();
  const canSeeInternalNotes =
    userRole === "recruiter" ||
    userRole === "admin" ||
    userRole === "manager" ||
    userRole === "hr";
  const canSeePreAdmission = userRole === "admin" || userRole === "hr";

  // Resume is always visible
  visible.add("overview");

  // If showing all, return all tabs
  if (showAll) {
    const allTabs: TabKey[] = ["overview", "score", "documents", "interview", "assessment", "communications", "collaboration", "notes", "pre_admission"];
    return allTabs.filter((tab) => {
      if (tab === "notes" && !canSeeInternalNotes) return false;
      if (tab === "pre_admission" && !canSeePreAdmission) return false;
      return true;
    });
  }

  if (canSeeInternalNotes) {
    visible.add("notes");
  }

  // If no active job, show minimal tabs
  if (!hasActiveJob) {
    visible.add("documents");
    visible.add("communications");
    return Array.from(visible);
  }

  // Analysis appears if there's an active job
  visible.add("score");

  // Documents should always appear for active job, but early in the process
  visible.add("documents");

  const isStaff = userRole === "recruiter" || userRole === "admin" || userRole === "manager" || userRole === "hr";

  // Determine stage and add relevant tabs
  if (pipelineStage === "entry" || pipelineStage === "screening") {
    // Triagem/Entrada: basic flow
    visible.add("communications");

    if (pipelineStage === "screening" && (hasCollaboration || isStaff)) {
      visible.add("collaboration");
    }
  } else if (pipelineStage === "hr_interview" || pipelineStage === "technical_interview" || pipelineStage === "final") {
    // Interview stage
    if (hasInterviews || hasScorecard || pipelineStage === "hr_interview" || pipelineStage === "technical_interview") {
      visible.add("interview");
    }

    // Collaboration is important in interview stages
    if (hasCollaboration || hasScorecard || isStaff) {
      visible.add("collaboration");
    }

    visible.add("communications");
  } else if (
    pipelineStage === "offer" ||
    pipelineStage === "hired" ||
    pipelineStage === "pre_admission" ||
    pipelineStage === "protheus" ||
    pipelineStage === "admitted"
  ) {
    // Pre-admission/Contratado stage
    if (
      canSeePreAdmission &&
      (hasHiringDecision ||
        hasPreAdmission ||
        hasAdmissionPackage ||
        pipelineStage === "hired" ||
        pipelineStage === "pre_admission" ||
        pipelineStage === "protheus" ||
        pipelineStage === "admitted")
    ) {
      visible.add("pre_admission");
    }

    visible.add("communications");

    // Keep collaboration for final decisions
    if (hasCollaboration || isStaff) {
      visible.add("collaboration");
    }
  } else if (pipelineStage === "rejected") {
    // Minimal tabs for rejected
    visible.add("communications");
  }

  // Assessment appears only when relevant
  if (hasBehavioralAssessment && (pipelineStage === "screening" || pipelineStage === "hr_interview" || pipelineStage === "technical_interview")) {
    visible.add("assessment");
  }

  // Ensure we don't exceed 6 tabs for default view
  const maxTabs = 6;
  if (visible.size > maxTabs) {
    // Prioritize tabs: overview > score > interview > collaboration > pre_admission > documents > assessment > communications
    const priority: TabKey[] = ["overview", "score", "notes", "interview", "collaboration", "pre_admission", "documents", "assessment", "communications"];
    const filtered = new Set<TabKey>();

    for (const tab of priority) {
      if (visible.has(tab) && filtered.size < maxTabs) {
        filtered.add(tab);
      }
    }

    return Array.from(filtered);
  }

  return Array.from(visible);
}
