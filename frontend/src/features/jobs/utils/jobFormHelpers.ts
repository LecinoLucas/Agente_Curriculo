import type { Job, JobFormValues } from "../../../types/domain";
import { trimToNull } from "../jobFormConfig";

export function toForm(job: Job): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    requirements: job.requirements ?? "",
    responsibilities: job.responsibilities ?? "",
    experience_context: job.experience_context ?? "",
    behavioral_requirements: [...(job.behavioral_requirements ?? [])],
    newBehavioralRequirement: "",
    status: job.status,
    job_area: job.job_area ?? "",
    priority: job.priority ?? "normal",
    seniority_level: job.seniority_level ?? "",
    minimum_education_level: job.minimum_education_level ?? "",
    minimum_years_experience: job.minimum_years_experience ?? undefined,
    deal_breakers: (job.deal_breakers ?? []).map((rule) => ({ ...rule })),
    work_model: job.work_model ?? "",
    location: job.location ?? "",
    salary_min: job.salary_min ?? undefined,
    salary_max: job.salary_max ?? undefined,
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
    mandatory_skills: "Skills obrigatórias",
  };
  return labels[field] ?? field;
}

export function buildFrontendPublicationBlockers(form: JobFormValues, mandatorySkillsCount: number): string[] {
  const blockers: string[] = [];
  if (!trimToNull(form.job_area ?? "")) blockers.push("job_area");
  if (!trimToNull(form.seniority_level ?? "")) blockers.push("seniority_level");
  if ((form.minimum_years_experience ?? 0) <= 0) blockers.push("minimum_years_experience");
  if (mandatorySkillsCount < 2) blockers.push("mandatory_skills");
  return blockers;
}
