import type { UserRole } from "../../../../types/auth";
import type { PipelineStage } from "../../../../types/domain";
import {
  canAccessPreAdmission as canAccessPreAdmissionArea,
  isInternalStaffRole,
} from "../../../../shared/auth/roles";

export type CandidateProfileTabKey =
  | "overview"
  | "workflow"
  | "pre_admission"
  | "score"
  | "documents"
  | "interviews"
  | "assessments"
  | "communications"
  | "notes"
  | "history";

export const CANDIDATE_PROFILE_TAB_KEYS: CandidateProfileTabKey[] = [
  "overview",
  "workflow",
  "pre_admission",
  "score",
  "documents",
  "interviews",
  "assessments",
  "communications",
  "notes",
  "history",
];

export interface CandidateProfileTabsContext {
  activeJobId: string | null;
  pipelineStage: PipelineStage | null;
  relationshipStatus: string | null | undefined;
  isTerminal: boolean;
  hasAnalysis: boolean;
  hasScore: boolean;
  hasBehavioralAssessment: boolean;
  hasBehavioralAi: boolean;
  hasInterviews: boolean;
  hasHiringDecision: boolean;
  hasPreAdmissionCase: boolean;
  hasCommunication: boolean;
  hasNotes: boolean;
  hasProcessHistory: boolean;
  userRole: UserRole;
  explicitTab?: CandidateProfileTabKey | null;
}

function canAccessPreAdmission(context: CandidateProfileTabsContext): boolean {
  return canAccessPreAdmissionArea(context.userRole);
}

function addStaffBaseTabs(visible: Set<CandidateProfileTabKey>, context: CandidateProfileTabsContext) {
  if (!isInternalStaffRole(context.userRole)) return;
  visible.add("communications");
  visible.add("notes");
  visible.add("history");
}

function addPipelineBaseTabs(visible: Set<CandidateProfileTabKey>) {
  visible.add("workflow");
  visible.add("score");
}

function shouldShowAssessment(context: CandidateProfileTabsContext): boolean {
  return context.hasBehavioralAssessment || context.hasBehavioralAi;
}

export function isCandidateProfileTabKey(value: string | null | undefined): value is CandidateProfileTabKey {
  return CANDIDATE_PROFILE_TAB_KEYS.includes(value as CandidateProfileTabKey);
}

export function getVisibleCandidateProfileTabs(
  context: CandidateProfileTabsContext,
): CandidateProfileTabKey[] {
  const visible = new Set<CandidateProfileTabKey>(["overview"]);
  const stage = context.pipelineStage;
  const hasActiveJob = Boolean(context.activeJobId);
  const canSeePreAdmission = canAccessPreAdmission(context);
  const rejected =
    stage === "rejected" ||
    context.relationshipStatus === "rejected" ||
    context.relationshipStatus === "removed";

  if (!hasActiveJob) {
    visible.add("documents");
    addStaffBaseTabs(visible, context);
  } else if (rejected || (context.isTerminal && stage !== "admitted")) {
    addStaffBaseTabs(visible, context);
  } else if (stage === "hired") {
    visible.add("workflow");
    addStaffBaseTabs(visible, context);
  } else if (stage === "pre_admission" || stage === "protheus" || stage === "admitted") {
    addStaffBaseTabs(visible, context);
  } else if (stage === "entry") {
    addPipelineBaseTabs(visible);
    visible.add("documents");
    addStaffBaseTabs(visible, context);
  } else if (stage === "screening") {
    addPipelineBaseTabs(visible);
    visible.add("documents");
    if (shouldShowAssessment(context)) visible.add("assessments");
    if (context.hasInterviews) visible.add("interviews");
    addStaffBaseTabs(visible, context);
  } else if (
    stage === "hr_interview" ||
    stage === "technical_interview" ||
    stage === "final" ||
    stage === "offer"
  ) {
    addPipelineBaseTabs(visible);
    visible.add("interviews");
    if (shouldShowAssessment(context)) visible.add("assessments");
    addStaffBaseTabs(visible, context);
  } else {
    visible.add("documents");
    if (hasActiveJob) addPipelineBaseTabs(visible);
    addStaffBaseTabs(visible, context);
  }

  if (context.hasPreAdmissionCase && canSeePreAdmission) {
    visible.add("pre_admission");
  }

  if (context.explicitTab) {
    if (context.explicitTab === "pre_admission") {
      if (canSeePreAdmission && context.hasPreAdmissionCase) {
        visible.add(context.explicitTab);
      }
    } else {
      visible.add(context.explicitTab);
    }
  }

  return CANDIDATE_PROFILE_TAB_KEYS.filter((tab) => visible.has(tab));
}
