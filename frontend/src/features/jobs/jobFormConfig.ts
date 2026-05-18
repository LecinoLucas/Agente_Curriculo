import type { CreateJobRequestPayload, UpdateJobRequestPayload } from "../../services/jobsService";
import type { DealBreaker, Job, JobQualityResult } from "../../types/domain";
import { normalizeDealBreakers } from "./utils/dealBreakerHelpers";

export type SelectionFlowType = "simple" | "standard" | "technical" | "leadership";

export type JobFormValues = {
  title: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  experience_context?: string;
  behavioral_requirements: string[];
  newBehavioralRequirement: string;
  behavioral_template_id?: string | null;
  status: string;
  job_area?: string;
  priority: "low" | "normal" | "high" | "urgent";
  seniority_level?: string;
  minimum_education_level?: string;
  minimum_years_experience?: number;
  deal_breakers?: DealBreaker[];
  work_model?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  selection_flow_type: SelectionFlowType;
  requires_behavioral_assessment: boolean;
  requires_behavioral_ai_evaluation: boolean;
  requires_interview: boolean;
  requires_scorecard: boolean;
  requires_manager_review: boolean;
};

export type PendingJobSkill = {
  skill_id: string;
  skill_name: string;
  priority_level: "priority" | "complementary" | "eliminatory";
  minimum_level: string | null;
  minimum_years: number | null;
  weight: number;
};

export const SELECTION_FLOW_DEFAULTS: Record<SelectionFlowType, {
  requires_behavioral_assessment: boolean;
  requires_behavioral_ai_evaluation: boolean;
  requires_interview: boolean;
  requires_scorecard: boolean;
  requires_manager_review: boolean;
}> = {
  simple: {
    requires_behavioral_assessment: false,
    requires_behavioral_ai_evaluation: false,
    requires_interview: false,
    requires_scorecard: false,
    requires_manager_review: false,
  },
  standard: {
    requires_behavioral_assessment: true,
    requires_behavioral_ai_evaluation: true,
    requires_interview: true,
    requires_scorecard: true,
    requires_manager_review: false,
  },
  technical: {
    requires_behavioral_assessment: false,
    requires_behavioral_ai_evaluation: false,
    requires_interview: true,
    requires_scorecard: true,
    requires_manager_review: true,
  },
  leadership: {
    requires_behavioral_assessment: true,
    requires_behavioral_ai_evaluation: true,
    requires_interview: true,
    requires_scorecard: true,
    requires_manager_review: true,
  },
};

export const EMPTY_FORM: JobFormValues = {
  title: "",
  description: "",
  requirements: "",
  responsibilities: "",
  experience_context: "",
  behavioral_requirements: [],
  newBehavioralRequirement: "",
  behavioral_template_id: null,
  status: "draft",
  job_area: "",
  priority: "normal",
  seniority_level: "",
  minimum_education_level: "",
  minimum_years_experience: undefined,
  deal_breakers: [],
  work_model: "",
  location: "",
  selection_flow_type: "standard",
  ...SELECTION_FLOW_DEFAULTS.standard,
};

export function formatJobArea(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

export const PRIORITY_OPTIONS: Array<{ value: JobFormValues["priority"]; label: string }> = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function buildJobQualitySummary(job: Job): JobQualityResult | null {
  if (job.quality_score == null || !job.quality_status) {
    return null;
  }

  return {
    job_id: job.id,
    quality_score: job.quality_score,
    status: job.quality_status,
    can_publish: false,
    publication_blockers: [],
    missing_fields: [],
    suggestions: [],
    warnings: [],
  };
}

export function getQualityStatusLabel(status: Job["quality_status"]): string {
  if (status === "good") return "Boa";
  if (status === "acceptable") return "Aceitável";
  if (status === "weak") return "Fraca";
  return "Indisponível";
}

export function getQualityStatusDescription(status: JobQualityResult["status"]): string {
  if (status === "good") return "Boa qualidade";
  if (status === "acceptable") return "Qualidade aceitável";
  return "Qualidade fraca";
}

export function formatPublicationBlocker(blocker: string): string {
  const labels: Record<string, string> = {
    job_area: "Área da vaga não definida",
    seniority_level: "Senioridade não definida",
    minimum_years_experience: "Experiência mínima não definida",
    priority_skills: "Faltam pelo menos 2 skills essenciais",
    behavioral_template_id: "Template comportamental ativo não selecionado",
    behavioral_template_status: "Template comportamental vinculado não está ativo",
    behavioral_template_structure: "Template comportamental vinculado não possui competências/perguntas válidas",
  };

  return labels[blocker] ?? blocker;
}

export function formatSalary(job: Job): string {
  if (job.salary_min == null && job.salary_max == null) return "—";
  if (job.salary_min != null && job.salary_max != null) {
    return `${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")} – ${job.salary_max.toLocaleString("pt-BR")}`;
  }
  if (job.salary_min != null) return `A partir de ${job.salary_currency} ${job.salary_min.toLocaleString("pt-BR")}`;
  return `Até ${job.salary_currency} ${job.salary_max?.toLocaleString("pt-BR")}`;
}

export function trimToNull(value?: string): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function normalizeBehavioralRequirement(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function behavioralRequirementKey(value: string) {
  return normalizeBehavioralRequirement(value).toLocaleLowerCase("pt-BR");
}

export function buildCreateJobPayload(form: JobFormValues): CreateJobRequestPayload {
  const payload: CreateJobRequestPayload = {
    title: form.title,
    description: form.description,
    status: form.status,
    priority: form.priority,
  };

  const requirements = trimToNull(form.requirements);
  const responsibilities = trimToNull(form.responsibilities);
  const experienceContext = trimToNull(form.experience_context);
  const jobArea = trimToNull(form.job_area);
  const seniorityLevel = trimToNull(form.seniority_level);
  const minimumEducationLevel = trimToNull(form.minimum_education_level);
  const workModel = trimToNull(form.work_model);
  const location = trimToNull(form.location);
  const behavioralRequirements = form.behavioral_requirements
    .map((item) => item.trim())
    .filter(Boolean);

  if (requirements) payload.requirements = requirements;
  if (responsibilities) payload.responsibilities = responsibilities;
  if (experienceContext) payload.experience_context = experienceContext;
  if (jobArea) payload.job_area = jobArea;
  if (seniorityLevel) payload.seniority_level = seniorityLevel;
  if (minimumEducationLevel) payload.minimum_education_level = minimumEducationLevel;
  if (form.minimum_years_experience !== undefined) payload.minimum_years_experience = String(form.minimum_years_experience);
  if ((form.deal_breakers ?? []).length > 0) payload.deal_breakers = normalizeDealBreakers(form.deal_breakers);
  if (workModel) payload.work_model = workModel;
  if (location) payload.location = location;
  if (form.salary_min !== undefined) payload.salary_min = String(form.salary_min);
  if (form.salary_max !== undefined) payload.salary_max = String(form.salary_max);
  if (behavioralRequirements.length > 0) payload.behavioral_requirements = behavioralRequirements;
  if (form.behavioral_template_id) payload.behavioral_template_id = form.behavioral_template_id;

  payload.selection_flow_type = form.selection_flow_type;
  payload.requires_behavioral_assessment = form.requires_behavioral_assessment;
  payload.requires_behavioral_ai_evaluation = form.requires_behavioral_ai_evaluation;
  payload.requires_interview = form.requires_interview;
  payload.requires_scorecard = form.requires_scorecard;
  payload.requires_manager_review = form.requires_manager_review;

  return payload;
}

export function buildUpdateJobPayload(form: JobFormValues): UpdateJobRequestPayload {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    requirements: trimToNull(form.requirements),
    responsibilities: trimToNull(form.responsibilities),
    experience_context: trimToNull(form.experience_context),
    behavioral_requirements: form.behavioral_requirements.map((item) => item.trim()).filter(Boolean),
    job_area: trimToNull(form.job_area),
    priority: form.priority,
    seniority_level: trimToNull(form.seniority_level),
    minimum_education_level: trimToNull(form.minimum_education_level),
    minimum_years_experience: form.minimum_years_experience !== undefined ? String(form.minimum_years_experience) : null,
    deal_breakers: normalizeDealBreakers(form.deal_breakers ?? []),
    work_model: trimToNull(form.work_model),
    location: trimToNull(form.location),
    salary_min: form.salary_min !== undefined ? String(form.salary_min) : null,
    salary_max: form.salary_max !== undefined ? String(form.salary_max) : null,
    behavioral_template_id: form.behavioral_template_id || null,
    selection_flow_type: form.selection_flow_type,
    requires_behavioral_assessment: form.requires_behavioral_assessment,
    requires_behavioral_ai_evaluation: form.requires_behavioral_ai_evaluation,
    requires_interview: form.requires_interview,
    requires_scorecard: form.requires_scorecard,
    requires_manager_review: form.requires_manager_review,
  };
}

export type BehavioralTemplateValidationResult = {
  /** Whether the template configuration is valid for publishing */
  valid: boolean;
  /** Severity: "ok" | "warning" | "error" */
  level: "ok" | "warning" | "error";
  /** Human-readable message shown in UI */
  message: string | null;
};

/**
 * Pure validation helper — no side-effects, no API calls.
 * Used by the checklist/review step and by tests.
 *
 * Rules:
 * - If requires_behavioral_assessment is false → always valid (template optional)
 * - If requires_behavioral_assessment is true:
 *   - templateStatus === "active" → valid (ok)
 *   - templateStatus === "draft" → invalid (error) — must be published first
 *   - templateStatus === "archived" → invalid (error) — cannot be used
 *   - templateStatus is null/undefined → invalid (error) — must select one
 */
export function validateBehavioralTemplate(
  requiresAssessment: boolean,
  templateStatus: "active" | "draft" | "archived" | null | undefined,
): BehavioralTemplateValidationResult {
  if (!requiresAssessment) {
    return { valid: true, level: "ok", message: null };
  }
  if (templateStatus === "active") {
    return { valid: true, level: "ok", message: "Template ativo vinculado." };
  }
  if (templateStatus === "draft") {
    return {
      valid: false,
      level: "error",
      message: "Template em rascunho — publique o template antes de usar esta vaga.",
    };
  }
  if (templateStatus === "archived") {
    return {
      valid: false,
      level: "error",
      message: "Template arquivado — selecione um template ativo.",
    };
  }
  return {
    valid: false,
    level: "error",
    message: "Esta vaga exige avaliação comportamental. Selecione um template ativo.",
  };
}
