import { describe, it, expect } from "vitest";
import { normalizeDealBreakers, DEAL_BREAKER_OPERATORS } from "../dealBreakerHelpers";
import type { DealBreaker } from "../../../../types/domain";

describe("dealBreakerHelpers", () => {
  describe("normalizeDealBreakers", () => {
    it("should convert skill + equals to skill + contains", () => {
      const input: DealBreaker[] = [
        {
          field: "skill",
          operator: "equals",
          value: "JavaScript",
          reason: "Essential skill",
          is_active: true,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].field).toBe("skill");
      expect(result[0].operator).toBe("contains");
      expect(result[0].value).toBe("JavaScript");
      expect(result[0].reason).toBe("Essential skill");
    });

    it("should convert skill + not_equals to skill + not_contains", () => {
      const input: DealBreaker[] = [
        {
          field: "skill",
          operator: "not_equals",
          value: "COBOL",
          reason: "Avoid legacy languages",
          is_active: true,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].operator).toBe("not_contains");
    });

    it("should leave valid operators unchanged", () => {
      const input: DealBreaker[] = [
        {
          field: "skill",
          operator: "contains",
          value: "React",
          reason: "Need React experience",
          is_active: true,
        },
        {
          field: "skill",
          operator: "not_contains",
          value: "Angular",
          reason: "No Angular background",
          is_active: true,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].operator).toBe("contains");
      expect(result[1].operator).toBe("not_contains");
    });

    it("should not affect other field types", () => {
      const input: DealBreaker[] = [
        {
          field: "work_model",
          operator: "equals",
          value: "remote",
          reason: "Only remote",
          is_active: true,
        },
        {
          field: "location",
          operator: "equals",
          value: "São Paulo",
          reason: "Only SP",
          is_active: true,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].operator).toBe("equals");
      expect(result[1].operator).toBe("equals");
    });

    it("should handle mixed valid and invalid operators", () => {
      const input: DealBreaker[] = [
        {
          field: "skill",
          operator: "equals",
          value: "TypeScript",
          reason: "Need TS",
          is_active: true,
        },
        {
          field: "skill",
          operator: "contains",
          value: "React",
          reason: "Need React",
          is_active: true,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].operator).toBe("contains");
      expect(result[1].operator).toBe("contains");
    });

    it("should preserve all other properties during normalization", () => {
      const input: DealBreaker[] = [
        {
          field: "skill",
          operator: "equals",
          value: "Python",
          reason: "Must know Python",
          is_active: false,
        },
      ];

      const result = normalizeDealBreakers(input);

      expect(result[0].field).toBe("skill");
      expect(result[0].value).toBe("Python");
      expect(result[0].reason).toBe("Must know Python");
      expect(result[0].is_active).toBe(false);
    });

    it("should handle empty array", () => {
      const input: DealBreaker[] = [];
      const result = normalizeDealBreakers(input);
      expect(result).toEqual([]);
    });
  });

  describe("DEAL_BREAKER_OPERATORS configuration", () => {
    it("should have correct operators for skill field", () => {
      expect(DEAL_BREAKER_OPERATORS.skill).toEqual(["contains", "not_contains"]);
    });

    it("should have correct operators for work_model field", () => {
      expect(DEAL_BREAKER_OPERATORS.work_model).toEqual(["equals", "not_equals"]);
    });

    it("should not allow equals for skill field", () => {
      expect(DEAL_BREAKER_OPERATORS.skill).not.toContain("equals");
    });

    it("should not allow not_equals for skill field", () => {
      expect(DEAL_BREAKER_OPERATORS.skill).not.toContain("not_equals");
    });
  });
});
