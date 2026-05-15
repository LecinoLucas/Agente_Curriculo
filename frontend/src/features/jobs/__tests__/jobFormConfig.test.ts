import { describe, it, expect } from "vitest";
import {
  buildCreateJobPayload,
  buildUpdateJobPayload,
  formatJobArea,
  EMPTY_FORM,
  SELECTION_FLOW_DEFAULTS,
} from "../jobFormConfig";
import type { JobFormValues } from "../jobFormConfig";

describe("jobFormConfig", () => {
  describe("formatJobArea", () => {
    it("should return dash for null values", () => {
      expect(formatJobArea(null)).toBe("—");
      expect(formatJobArea(undefined)).toBe("—");
      expect(formatJobArea("")).toBe("—");
    });

    it("should preserve the current area label", () => {
      expect(formatJobArea("Tecnologia")).toBe("Tecnologia");
    });

    it("should return original value if not found in options", () => {
      expect(formatJobArea("unknown")).toBe("unknown");
    });
  });

  describe("buildCreateJobPayload", () => {
    it("should preserve registered area names", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test area label",
        job_area: "Tecnologia",
      };

      const payload = buildCreateJobPayload(form);
      expect(payload.job_area).toBe("Tecnologia");
    });

    it("should not include job_area if empty", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        job_area: "",
      };

      const payload = buildCreateJobPayload(form);
      expect(payload.job_area).toBeUndefined();
    });
  });

  describe("buildUpdateJobPayload", () => {
    it("should preserve registered area names", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test area label",
        job_area: "Tecnologia",
      };

      const payload = buildUpdateJobPayload(form);
      expect(payload.job_area).toBe("Tecnologia");
    });

    it("should set job_area to null if empty", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        job_area: "",
      };

      const payload = buildUpdateJobPayload(form);
      expect(payload.job_area).toBeNull();
    });
  });

  describe("behavioral_template_id", () => {
    it("should include behavioral_template_id in create payload if set", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        behavioral_template_id: "template-123",
      };

      const payload = buildCreateJobPayload(form);
      expect(payload.behavioral_template_id).toBe("template-123");
    });

    it("should not include behavioral_template_id in create payload if null", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        behavioral_template_id: null,
      };

      const payload = buildCreateJobPayload(form);
      expect(payload.behavioral_template_id).toBeUndefined();
    });

    it("should include behavioral_template_id in update payload if set", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        behavioral_template_id: "template-456",
      };

      const payload = buildUpdateJobPayload(form);
      expect(payload.behavioral_template_id).toBe("template-456");
    });

    it("should set behavioral_template_id to null in update payload if not set", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        behavioral_template_id: null,
      };

      const payload = buildUpdateJobPayload(form);
      expect(payload.behavioral_template_id).toBeNull();
    });
  });

  describe("SELECTION_FLOW_DEFAULTS", () => {
    it("simple flow has all gates false", () => {
      const d = SELECTION_FLOW_DEFAULTS.simple;
      expect(d.requires_behavioral_assessment).toBe(false);
      expect(d.requires_behavioral_ai_evaluation).toBe(false);
      expect(d.requires_interview).toBe(false);
      expect(d.requires_scorecard).toBe(false);
      expect(d.requires_manager_review).toBe(false);
    });

    it("standard flow has behavioral + ai + interview + scorecard true, manager false", () => {
      const d = SELECTION_FLOW_DEFAULTS.standard;
      expect(d.requires_behavioral_assessment).toBe(true);
      expect(d.requires_behavioral_ai_evaluation).toBe(true);
      expect(d.requires_interview).toBe(true);
      expect(d.requires_scorecard).toBe(true);
      expect(d.requires_manager_review).toBe(false);
    });

    it("technical flow has interview + scorecard + manager true, behavioral false", () => {
      const d = SELECTION_FLOW_DEFAULTS.technical;
      expect(d.requires_behavioral_assessment).toBe(false);
      expect(d.requires_behavioral_ai_evaluation).toBe(false);
      expect(d.requires_interview).toBe(true);
      expect(d.requires_scorecard).toBe(true);
      expect(d.requires_manager_review).toBe(true);
    });

    it("leadership flow has all main gates true", () => {
      const d = SELECTION_FLOW_DEFAULTS.leadership;
      expect(d.requires_behavioral_assessment).toBe(true);
      expect(d.requires_behavioral_ai_evaluation).toBe(true);
      expect(d.requires_interview).toBe(true);
      expect(d.requires_scorecard).toBe(true);
      expect(d.requires_manager_review).toBe(true);
    });
  });

  describe("policy fields in payloads", () => {
    it("buildCreateJobPayload includes all policy fields", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        selection_flow_type: "technical",
        requires_behavioral_assessment: false,
        requires_behavioral_ai_evaluation: false,
        requires_interview: true,
        requires_scorecard: true,
        requires_manager_review: true,
      };

      const payload = buildCreateJobPayload(form);
      expect(payload.selection_flow_type).toBe("technical");
      expect(payload.requires_behavioral_assessment).toBe(false);
      expect(payload.requires_interview).toBe(true);
      expect(payload.requires_manager_review).toBe(true);
    });

    it("buildUpdateJobPayload includes all policy fields", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test",
        description: "Test",
        selection_flow_type: "leadership",
        requires_behavioral_assessment: true,
        requires_behavioral_ai_evaluation: true,
        requires_interview: true,
        requires_scorecard: true,
        requires_manager_review: true,
      };

      const payload = buildUpdateJobPayload(form);
      expect(payload.selection_flow_type).toBe("leadership");
      expect(payload.requires_manager_review).toBe(true);
    });

    it("EMPTY_FORM defaults to standard flow with correct gates", () => {
      expect(EMPTY_FORM.selection_flow_type).toBe("standard");
      expect(EMPTY_FORM.requires_behavioral_assessment).toBe(true);
      expect(EMPTY_FORM.requires_interview).toBe(true);
      expect(EMPTY_FORM.requires_scorecard).toBe(true);
      expect(EMPTY_FORM.requires_manager_review).toBe(false);
    });
  });
});
