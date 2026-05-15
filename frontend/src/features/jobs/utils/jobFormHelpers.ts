import type { Job } from "../../../types/domain";
import type { JobFormValues } from "../jobFormConfig";
import { SELECTION_FLOW_DEFAULTS, trimToNull } from "../jobFormConfig";
import { normalizeDealBreakers } from "./dealBreakerHelpers";

export function toForm(job: Job): JobFormValues {
  const flowType = (job.selection_flow_type as JobFormValues["selection_flow_type"]) ?? "standard";
  const policyDefaults = SELECTION_FLOW_DEFAULTS[flowType];
  return {
    title: job.title,
    description: job.description,
    requirements: job.requirements ?? "",
    responsibilities: job.responsibilities ?? "",
    experience_context: job.experience_context ?? "",
    behavioral_requirements: [...(job.behavioral_requirements ?? [])],
    newBehavioralRequirement: "",
    behavioral_template_id: job.behavioral_template_id ?? null,
    status: job.status,
    job_area: job.job_area ?? "",
    priority: job.priority ?? "normal",
    seniority_level: job.seniority_level ?? "",
    minimum_education_level: job.minimum_education_level ?? "",
    minimum_years_experience: job.minimum_years_experience ?? undefined,
    deal_breakers: normalizeDealBreakers((job.deal_breakers ?? []).map((rule) => ({ ...rule }))),
    work_model: job.work_model ?? "",
    location: job.location ?? "",
    salary_min: job.salary_min ?? undefined,
    salary_max: job.salary_max ?? undefined,
    selection_flow_type: flowType,
    requires_behavioral_assessment: job.requires_behavioral_assessment ?? policyDefaults.requires_behavioral_assessment,
    requires_behavioral_ai_evaluation: job.requires_behavioral_ai_evaluation ?? policyDefaults.requires_behavioral_ai_evaluation,
    requires_interview: job.requires_interview ?? policyDefaults.requires_interview,
    requires_scorecard: job.requires_scorecard ?? policyDefaults.requires_scorecard,
    requires_manager_review: job.requires_manager_review ?? policyDefaults.requires_manager_review,
  };
}

export function formatFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    description: "Descrição",
    requirements: "Requisitos",
    responsibilities: "Responsabilidades",
    experience_context: "Contexto de experiência",
    job_area: "Área da vaga",
    seniority_level: "Senioridade",
    minimum_years_experience: "Anos mínimos de experiência",
    minimum_education_level: "Escolaridade mínima",
    priority_skills: "Skills essenciais",
  };
  return labels[field] ?? field;
}

export function buildFrontendPublicationBlockers(form: JobFormValues, mandatorySkillsCount: number): string[] {
  const blockers: string[] = [];
  if (!trimToNull(form.job_area ?? "")) blockers.push("job_area");
  if (!trimToNull(form.seniority_level ?? "")) blockers.push("seniority_level");
  if ((form.minimum_years_experience ?? 0) <= 0) blockers.push("minimum_years_experience");
  if (mandatorySkillsCount < 2) blockers.push("priority_skills");
  return blockers;
}
