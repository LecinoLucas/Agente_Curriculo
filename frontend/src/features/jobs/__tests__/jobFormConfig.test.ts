import { describe, it, expect } from "vitest";
import {
  buildCreateJobPayload,
  buildUpdateJobPayload,
  formatJobArea,
  EMPTY_FORM,
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
});
