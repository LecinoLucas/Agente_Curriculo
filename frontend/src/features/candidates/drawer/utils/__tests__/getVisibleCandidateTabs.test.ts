import { describe, it, expect } from "vitest";
import { getVisibleCandidateTabs, type GetVisibleCandidateTabsInput } from "../getVisibleCandidateTabs";

const defaultInput: GetVisibleCandidateTabsInput = {
  pipelineStage: "entry",
  pipelineStatus: "active",
  activeJobDecision: null,
  hasActiveJob: true,
  hasBehavioralAssessment: false,
  hasInterviews: false,
  hasScorecard: false,
  hasHiringDecision: false,
  hasPreAdmission: false,
  hasAdmissionPackage: false,
  hasCollaboration: false,
  userRole: "candidate",
  showAll: false,
};

describe("getVisibleCandidateTabs", () => {
  it("should always show overview tab", () => {
    const result = getVisibleCandidateTabs(defaultInput);
    expect(result).toContain("overview");
  });

  it("should show only overview, documents, communications when no active job", () => {
    const input = { ...defaultInput, hasActiveJob: false };
    const result = getVisibleCandidateTabs(input);
    expect(result).toEqual(["overview", "documents", "communications"]);
  });

  it("should show overview, score, documents, communications for entry/received stage", () => {
    const input = { ...defaultInput, pipelineStage: "entry", hasActiveJob: true };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("overview");
    expect(result).toContain("score");
    expect(result).toContain("documents");
    expect(result).toContain("communications");
  });

  it("should show collaboration tab in screening stage for recruiters", () => {
    const input = { ...defaultInput, pipelineStage: "screening", userRole: "recruiter" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("collaboration");
  });

  it("should show interview tab when in hr_interview stage", () => {
    const input = { ...defaultInput, pipelineStage: "hr_interview" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("interview");
  });

  it("should show assessment tab in screening stage when behavioral assessment exists", () => {
    const input = { ...defaultInput, pipelineStage: "screening", hasBehavioralAssessment: true };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("assessment");
  });

  it("should show pre_admission tab when in offer/hired stage with hiring decision", () => {
    const input = { ...defaultInput, pipelineStage: "offer", hasHiringDecision: true, userRole: "hr" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("pre_admission");
  });

  it("should show all tabs except notes for candidate when showAll is true", () => {
    const input = { ...defaultInput, showAll: true };
    const result = getVisibleCandidateTabs(input);
    expect(result).toEqual(["overview", "score", "documents", "interview", "assessment", "communications", "collaboration"]);
  });

  it("should include notes for recruiter", () => {
    const input = { ...defaultInput, userRole: "recruiter" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("notes");
  });

  it("should not include notes for viewer", () => {
    const input = { ...defaultInput, userRole: "viewer" };
    const result = getVisibleCandidateTabs(input);
    expect(result).not.toContain("notes");
  });

  it("should not exceed 6 tabs when showAll is false", () => {
    const input = {
      ...defaultInput,
      pipelineStage: "final",
      hasInterviews: true,
      hasScorecard: true,
      hasCollaboration: true,
      hasPreAdmission: true,
      hasAdmissionPackage: true,
      userRole: "recruiter",
      showAll: false,
    };
    const result = getVisibleCandidateTabs(input);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("should include collaboration when candidat is in interview and has recruiter role", () => {
    const input = { ...defaultInput, pipelineStage: "hr_interview", userRole: "recruiter" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("collaboration");
  });

  it.each(["hired", "pre_admission", "protheus", "admitted"] as const)(
    "should show pre_admission in %s stage",
    (pipelineStage) => {
    const input = { ...defaultInput, pipelineStage, userRole: "hr" };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("pre_admission");
    },
  );

  it("should hide pre_admission for recruiter in admission stages", () => {
    const input = {
      ...defaultInput,
      pipelineStage: "pre_admission",
      hasPreAdmission: true,
      userRole: "recruiter",
    };
    const result = getVisibleCandidateTabs(input);
    expect(result).not.toContain("pre_admission");
  });

  it("should prioritize important tabs when exceeding max", () => {
    const input = {
      ...defaultInput,
      pipelineStage: "final",
      hasInterviews: true,
      hasScorecard: true,
      hasCollaboration: true,
      hasPreAdmission: true,
      hasAdmissionPackage: true,
      userRole: "recruiter",
      showAll: false,
    };
    const result = getVisibleCandidateTabs(input);

    // overview and score should always be prioritized
    expect(result[0]).toBe("overview");
    expect(result).toContain("score");
  });

  it("should show communications always when active job exists", () => {
    const input = { ...defaultInput, hasActiveJob: true };
    const result = getVisibleCandidateTabs(input);
    expect(result).toContain("communications");
  });

  it("should not show collaboration in screening without recruiter role or collaboration data", () => {
    const input = {
      ...defaultInput,
      pipelineStage: "screening",
      userRole: "user",
      hasCollaboration: false,
    };
    const result = getVisibleCandidateTabs(input);
    expect(result).not.toContain("collaboration");
  });
});
