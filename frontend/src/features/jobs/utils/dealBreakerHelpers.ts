import type { DealBreaker } from "../../../types/domain";

export type DealBreakerDraft = {
  field: string;
  operator: DealBreaker["operator"];
  value: string;
  reason: string;
  is_active: boolean;
};

export const DEAL_BREAKER_FIELDS: Array<{ value: string; label: string }> = [
  { value: "location", label: "Localização" },
  { value: "work_model", label: "Modelo de trabalho" },
  { value: "education_level", label: "Escolaridade" },
  { value: "experience_years", label: "Experiência" },
  { value: "skill", label: "Skill" },
  { value: "language", label: "Idioma" },
  { value: "availability", label: "Disponibilidade" },
  { value: "custom_text", label: "Texto livre" },
];

export const DEAL_BREAKER_OPERATORS: Record<string, DealBreaker["operator"][]> = {
  location: ["equals", "not_equals", "contains", "in"],
  work_model: ["equals", "not_equals"],
  education_level: ["equals", "contains"],
  experience_years: ["equals", "not_equals", "contains"],
  skill: ["contains", "not_contains"],
  language: ["equals", "contains"],
  availability: ["equals", "not_equals"],
  custom_text: ["contains"],
};

export function emptyDealBreakerDraft(): DealBreakerDraft {
  return {
    field: "",
    operator: "equals",
    value: "",
    reason: "",
    is_active: true,
  };
}

/**
 * Normalizes deal breakers to ensure operators are valid for their fields.
 * Converts invalid operator combinations to valid ones based on backend rules.
 *
 * Examples:
 * - skill + equals → skill + contains
 * - skill + not_equals → skill + not_contains
 */
export function normalizeDealBreakers(dealBreakers: DealBreaker[]): DealBreaker[] {
  return dealBreakers.map((breaker) => {
    const validOperators = DEAL_BREAKER_OPERATORS[breaker.field] ?? [];

    // If operator is valid for this field, return as-is
    if (validOperators.includes(breaker.operator)) {
      return breaker;
    }

    // Map invalid operators to valid ones
    let normalizedOperator: DealBreaker["operator"] = breaker.operator;

    // For skill field, convert equals/not_equals to contains/not_contains
    if (breaker.field === "skill") {
      if (breaker.operator === "equals") {
        normalizedOperator = "contains";
      } else if (breaker.operator === "not_equals") {
        normalizedOperator = "not_contains";
      }
    }

    // If still invalid, use the first valid operator for this field
    if (!validOperators.includes(normalizedOperator) && validOperators.length > 0) {
      normalizedOperator = validOperators[0];
    }

    return {
      ...breaker,
      operator: normalizedOperator,
    };
  });
}
