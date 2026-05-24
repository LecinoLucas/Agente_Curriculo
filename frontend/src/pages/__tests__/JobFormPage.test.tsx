import { describe, expect, it } from "vitest";

import { EMPTY_FORM, SELECTION_FLOW_DEFAULTS } from "../../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers } from "../../features/jobs/utils/jobFormHelpers";
import { STEPS } from "../JobFormPage";

describe("JobFormPage", () => {
  describe("Step order", () => {
    it("renders 'Fluxo de avaliação' before 'Avaliação comportamental'", () => {
      const assessmentPolicyIndex = STEPS.findIndex((s) => s.id === "assessment-policy");
      const behavioralIndex = STEPS.findIndex((s) => s.id === "behavioral");

      expect(assessmentPolicyIndex).toBeLessThan(behavioralIndex);
      expect(assessmentPolicyIndex).toBe(5);
      expect(behavioralIndex).toBe(6);
    });
  });

  describe("Publication flow and blockers", () => {
    it("does not require behavioral template for Technical flow", () => {
      const technicalPolicy = SELECTION_FLOW_DEFAULTS.technical;
      
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          requires_behavioral_assessment: technicalPolicy.requires_behavioral_assessment,
          behavioral_template_id: null,
        },
        2, // valid priority skills
      );

      // Technical flow doesn't require assessment, so it shouldn't block
      expect(technicalPolicy.requires_behavioral_assessment).toBe(false);
      expect(blockers).not.toContain("behavioral_template_id");
    });

    it("requires behavioral template for Standard flow", () => {
      const standardPolicy = SELECTION_FLOW_DEFAULTS.standard;
      
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          requires_behavioral_assessment: standardPolicy.requires_behavioral_assessment,
          behavioral_template_id: null,
        },
        2,
      );

      // Standard flow requires assessment, so it should block
      expect(standardPolicy.requires_behavioral_assessment).toBe(true);
      expect(blockers).toContain("behavioral_template_id");
    });

    it("blocks publication when mandatory gates (like seniority) are pending", () => {
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          job_area: "Engenharia",
          seniority_level: "", // missing
          minimum_years_experience: 2,
        },
        2,
      );

      expect(blockers.length).toBeGreaterThan(0);
      expect(blockers).toContain("seniority_level");
    });

    it("allows publication when all mandatory gates are filled", () => {
      const blockers = buildFrontendPublicationBlockers(
        {
          ...EMPTY_FORM,
          job_area: "Engenharia",
          seniority_level: "Pleno",
          minimum_years_experience: 3,
          requires_behavioral_assessment: true,
          behavioral_template_id: "template-123",
        },
        2,
      );

      expect(blockers).toHaveLength(0);
    });
  });
});
