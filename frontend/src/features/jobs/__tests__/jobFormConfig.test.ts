import { describe, it, expect } from "vitest";
import {
  buildCreateJobPayload,
  buildUpdateJobPayload,
  formatJobArea,
  JOB_AREA_OPTIONS,
  EMPTY_FORM,
} from "../jobFormConfig";
import type { JobFormValues } from "../jobFormConfig";

describe("jobFormConfig", () => {
  describe("JOB_AREA_OPTIONS structure", () => {
    it("should have value and label for each option", () => {
      JOB_AREA_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("label");
        expect(typeof option.value).toBe("string");
        expect(typeof option.label).toBe("string");
      });
    });

    it("should have valid enum values", () => {
      const validValues = [
        "technology",
        "data",
        "financial",
        "fiscal",
        "accounting",
        "administrative",
        "commercial",
        "operational",
        "hr",
        "leadership",
      ];
      const actualValues = JOB_AREA_OPTIONS.map((opt) => opt.value);
      expect(actualValues).toEqual(validValues);
    });

    it("should have Portuguese labels", () => {
      const dataOption = JOB_AREA_OPTIONS.find((opt) => opt.value === "data");
      expect(dataOption?.label).toBe("Dados");

      const techOption = JOB_AREA_OPTIONS.find((opt) => opt.value === "technology");
      expect(techOption?.label).toBe("Tecnologia");
    });
  });

  describe("formatJobArea", () => {
    it("should return dash for null values", () => {
      expect(formatJobArea(null)).toBe("—");
      expect(formatJobArea(undefined)).toBe("—");
      expect(formatJobArea("")).toBe("—");
    });

    it("should convert enum value to Portuguese label", () => {
      expect(formatJobArea("data")).toBe("Dados");
      expect(formatJobArea("technology")).toBe("Tecnologia");
      expect(formatJobArea("financial")).toBe("Financeiro");
      expect(formatJobArea("fiscal")).toBe("Fiscal");
      expect(formatJobArea("accounting")).toBe("Contábil");
      expect(formatJobArea("administrative")).toBe("Administrativo");
      expect(formatJobArea("commercial")).toBe("Comercial");
      expect(formatJobArea("operational")).toBe("Operacional");
      expect(formatJobArea("hr")).toBe("RH");
      expect(formatJobArea("leadership")).toBe("Liderança");
    });

    it("should return original value if not found in options", () => {
      expect(formatJobArea("unknown")).toBe("unknown");
    });
  });

  describe("buildCreateJobPayload", () => {
    it("should send enum value for job_area, not label", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test Job",
        description: "Test Description",
        job_area: "data",
      };

      const payload = buildCreateJobPayload(form);

      // Verify that job_area is sent as the enum value
      expect(payload.job_area).toBe("data");
      // Ensure it's NOT sending the Portuguese label
      expect(payload.job_area).not.toBe("Dados");
    });

    it("should send enum values for all job_area options", () => {
      JOB_AREA_OPTIONS.forEach((option) => {
        const form: JobFormValues = {
          ...EMPTY_FORM,
          title: "Test",
          description: "Test",
          job_area: option.value,
        };

        const payload = buildCreateJobPayload(form);
        expect(payload.job_area).toBe(option.value);
        // Double-check: never send Portuguese label
        expect(payload.job_area).not.toBe(option.label);
      });
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
    it("should send enum value for job_area, not label", () => {
      const form: JobFormValues = {
        ...EMPTY_FORM,
        title: "Test Job",
        description: "Test Description",
        job_area: "data",
      };

      const payload = buildUpdateJobPayload(form);

      expect(payload.job_area).toBe("data");
      expect(payload.job_area).not.toBe("Dados");
    });

    it("should send enum values for all job_area options", () => {
      JOB_AREA_OPTIONS.forEach((option) => {
        const form: JobFormValues = {
          ...EMPTY_FORM,
          title: "Test",
          description: "Test",
          job_area: option.value,
        };

        const payload = buildUpdateJobPayload(form);
        expect(payload.job_area).toBe(option.value);
        expect(payload.job_area).not.toBe(option.label);
      });
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
});
