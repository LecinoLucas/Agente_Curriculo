import type { CreateJobRequestPayload, UpdateJobRequestPayload } from "../../services/jobsService";
import type { DealBreaker, Job, JobQualityResult } from "../../types/domain";

export type JobFormValues = {
  title: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  experience_context?: string;
  behavioral_requirements: string[];
  newBehavioralRequirement: string;
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
};

export type PendingJobSkill = {
  skill_id: string;
  skill_name: string;
  is_mandatory: boolean;
  minimum_level: string | null;
  minimum_years: number | null;
  weight: number;
};

export const EMPTY_FORM: JobFormValues = {
  title: "",
  description: "",
  requirements: "",
  responsibilities: "",
  experience_context: "",
  behavioral_requirements: [],
  newBehavioralRequirement: "",
  status: "draft",
  job_area: "",
  priority: "normal",
  seniority_level: "",
  minimum_education_level: "",
  minimum_years_experience: undefined,
  deal_breakers: [],
  work_model: "",
  location: "",
};

export const JOB_AREA_OPTIONS = [
  "Tecnologia",
  "Dados",
  "Financeiro",
  "Fiscal",
  "Contábil",
  "Administrativo",
  "Comercial",
  "Operacional",
  "RH",
  "Liderança",
] as const;

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
    mandatory_skills: "Faltam pelo menos 2 skills obrigatórias",
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
  if ((form.deal_breakers ?? []).length > 0) payload.deal_breakers = form.deal_breakers;
  if (workModel) payload.work_model = workModel;
  if (location) payload.location = location;
  if (form.salary_min !== undefined) payload.salary_min = String(form.salary_min);
  if (form.salary_max !== undefined) payload.salary_max = String(form.salary_max);
  if (behavioralRequirements.length > 0) payload.behavioral_requirements = behavioralRequirements;

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
    deal_breakers: form.deal_breakers ?? [],
    work_model: trimToNull(form.work_model),
    location: trimToNull(form.location),
    salary_min: form.salary_min !== undefined ? String(form.salary_min) : null,
    salary_max: form.salary_max !== undefined ? String(form.salary_max) : null,
  };
}
