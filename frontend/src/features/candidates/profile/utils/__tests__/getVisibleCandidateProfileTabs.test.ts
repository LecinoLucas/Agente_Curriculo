import { describe, expect, it } from "vitest";

import {
  getVisibleCandidateProfileTabs,
  type CandidateProfileTabsContext,
} from "../getVisibleCandidateProfileTabs";

const baseContext: CandidateProfileTabsContext = {
  activeJobId: "job-1",
  pipelineStage: "entry",
  relationshipStatus: "active",
  isTerminal: false,
  hasAnalysis: true,
  hasScore: true,
  hasBehavioralAssessment: false,
  hasBehavioralAi: false,
  hasInterviews: false,
  hasHiringDecision: false,
  hasPreAdmissionCase: false,
  hasCommunication: false,
  hasNotes: false,
  hasProcessHistory: true,
  userRole: "admin",
};

describe("getVisibleCandidateProfileTabs", () => {
  it("candidato sem vaga ativa não mostra Entrevistas, Avaliações ou Pré-admissão", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      activeJobId: null,
      pipelineStage: null,
      relationshipStatus: null,
    });

    expect(tabs).toEqual(["overview", "documents", "communications", "notes", "history"]);
    expect(tabs).not.toContain("interviews");
    expect(tabs).not.toContain("assessments");
    expect(tabs).not.toContain("pre_admission");
  });

  it("candidato em Entrevista mostra Entrevistas", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "technical_interview",
    });

    expect(tabs).toContain("interviews");
  });

  it("candidato em Final mostra Ações, Score, Entrevistas e Histórico", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "final",
    });

    expect(tabs).toContain("workflow");
    expect(tabs).toContain("score");
    expect(tabs).toContain("interviews");
    expect(tabs).toContain("history");
  });

  it("candidato em Oferta mostra Ações, Score, Entrevistas e Histórico", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "offer",
    });

    expect(tabs).toContain("workflow");
    expect(tabs).toContain("score");
    expect(tabs).toContain("interviews");
    expect(tabs).toContain("history");
  });

  it("candidato Contratado sem caso de pré-admissão NÃO mostra a aba", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "hired",
      hasPreAdmissionCase: false,
    });

    expect(tabs).not.toContain("pre_admission");
  });

  it("candidato Contratado com caso de pré-admissão mostra a aba", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "hired",
      hasPreAdmissionCase: true,
    });

    expect(tabs).toContain("pre_admission");
  });

  it("candidato em etapa admissional sem caso NÃO mostra a aba", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "pre_admission",
      hasPreAdmissionCase: false,
    });

    expect(tabs).not.toContain("pre_admission");
  });

  it("recruiter não vê Pré-admissão mesmo em etapa admissional", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      userRole: "recruiter",
      pipelineStage: "pre_admission",
      hasPreAdmissionCase: true,
      explicitTab: "pre_admission",
    });

    expect(tabs).not.toContain("pre_admission");
  });

  it("candidato Reprovado mostra Histórico e Comunicação, mas não Score ou Entrevistas", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "rejected",
      relationshipStatus: "rejected",
      isTerminal: true,
    });

    expect(tabs).toEqual(["overview", "communications", "notes", "history"]);
    expect(tabs).not.toContain("score");
    expect(tabs).not.toContain("interviews");
  });

  it("Histórico e Comunicação não somem para staff", () => {
    for (const userRole of ["admin", "recruiter", "manager", "hr"] as const) {
      const tabs = getVisibleCandidateProfileTabs({
        ...baseContext,
        userRole,
        pipelineStage: "screening",
      });

      expect(tabs).toContain("history");
      expect(tabs).toContain("communications");
    }
  });

  it("deep link mantém aba Entrevistas visível quando a matriz esconderia", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "entry",
      explicitTab: "interviews",
    });

    expect(tabs).toContain("interviews");
  });

  it("deep link mantém aba Avaliações visível quando a matriz esconderia", () => {
    const tabs = getVisibleCandidateProfileTabs({
      ...baseContext,
      pipelineStage: "entry",
      explicitTab: "assessments",
    });

    expect(tabs).toContain("assessments");
  });
});
