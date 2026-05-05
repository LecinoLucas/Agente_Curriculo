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
  skill: ["equals", "not_equals", "contains", "in"],
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
