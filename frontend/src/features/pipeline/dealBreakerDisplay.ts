import type {
  AnalysisResult,
  Candidate,
  CandidateLatestAnalysisOverview,
  DealBreaker,
  RankingReasonCode,
} from "../../types/domain";
import { formatEducationLevel, formatWorkModel } from "../../utils/jobFormatters";

export type DealBreakerReasonCode = RankingReasonCode & {
  expected?: string | null;
  actual?: string | null;
  reason?: string | null;
};

export type DealBreakerViolationDisplay = {
  fieldLabel: string;
  expected: string;
  actual: string;
  reason: string;
  summary: string;
};

const FIELD_LABELS: Record<string, string> = {
  location: "Localização",
  work_model: "Modelo de trabalho",
  education_level: "Formação mínima",
  experience_years: "Experiência mínima",
  skill: "Skill eliminatória",
  language: "Idioma",
  availability: "Disponibilidade",
  custom_text: "Critério da vaga",
};

function humanizeConfiguredValue(field: string, value: string): string {
  if (!value.trim()) return value;
  if (field === "education_level") return formatEducationLevel(value);
  if (field === "work_model") return formatWorkModel(value);
  return value;
}

export function isDealBreakerReasonCode(reason: RankingReasonCode | null | undefined): reason is DealBreakerReasonCode {
  return reason?.type === "deal_breaker";
}

export function formatDealBreakerField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatExpectedValue(config: DealBreaker | null, reasonCode: DealBreakerReasonCode): string {
  if (reasonCode.expected?.trim()) return reasonCode.expected.trim();
  if (!config) return "regra da vaga";

  if (config.values?.length) {
    return config.values.map((value) => humanizeConfiguredValue(config.field, value)).join(", ");
  }

  if (config.value?.trim()) {
    return humanizeConfiguredValue(config.field, config.value.trim());
  }

  return "regra da vaga";
}

function formatActualValue(
  config: DealBreaker | null,
  reasonCode: DealBreakerReasonCode,
  source: {
    candidate?: Candidate | null;
    latestAnalysis?: CandidateLatestAnalysisOverview | null;
    analysisResult?: AnalysisResult | null;
  },
): string {
  if (reasonCode.actual?.trim()) return reasonCode.actual.trim();

  const field = config?.field ?? reasonCode.field;
  if (field === "location") {
    const parts = [
      source.candidate?.location_city,
      source.candidate?.location_state,
      source.candidate?.location_country,
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(" · ") : "Não informado";
  }

  if (field === "experience_years") {
    const years = source.analysisResult?.total_experience_years ?? source.latestAnalysis?.total_experience_years;
    return years != null ? `${years} ano(s)` : "Não informado no currículo";
  }

  if (field === "skill") {
    const keywords = source.analysisResult?.keywords ?? [];
    return keywords.length > 0 ? keywords.slice(0, 5).join(", ") : "Não informado no currículo";
  }

  if (field === "custom_text") {
    const text = source.analysisResult?.candidate_summary ?? source.candidate?.internal_notes;
    return text?.trim() ? text.trim() : "Não informado no currículo";
  }

  return "Não informado no currículo";
}

function formatReason(config: DealBreaker | null, reasonCode: DealBreakerReasonCode): string {
  return reasonCode.reason?.trim() || config?.reason?.trim() || reasonCode.description?.trim() || "Regra da vaga";
}

export function buildDealBreakerViolationDisplay(params: {
  reasonCode: DealBreakerReasonCode;
  jobDealBreakers?: DealBreaker[] | null;
  candidate?: Candidate | null;
  latestAnalysis?: CandidateLatestAnalysisOverview | null;
  analysisResult?: AnalysisResult | null;
}): DealBreakerViolationDisplay {
  const config =
    params.jobDealBreakers?.find((dealBreaker) => dealBreaker.is_active && dealBreaker.field === params.reasonCode.field) ??
    null;
  const fieldLabel = formatDealBreakerField(params.reasonCode.field);
  const expected = formatExpectedValue(config, params.reasonCode);
  const actual = formatActualValue(config, params.reasonCode, {
    candidate: params.candidate,
    latestAnalysis: params.latestAnalysis,
    analysisResult: params.analysisResult,
  });
  const reason = formatReason(config, params.reasonCode);

  return {
    fieldLabel,
    expected,
    actual,
    reason,
    summary: `${fieldLabel}: esperado ${expected}, encontrado ${actual}`,
  };
}
