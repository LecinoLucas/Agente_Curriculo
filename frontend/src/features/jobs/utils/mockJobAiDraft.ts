import type { JobFormValues } from "../jobFormConfig";

export type JobAiDraft = {
  title: string;
  area: string;
  work_model: string;
  location: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  mandatory_skills: string[];
  nice_to_have_skills: string[];
  screening_questions: string[];
  benefits: string[];
  working_hours: string;
  seniority: string;
  experience_context: string;
  minimum_years_experience: number | null;
  requires_manager_review: boolean;
  requires_behavioral_assessment: boolean;
};

export const MOCK_AI_PROMPT_EXAMPLE =
  "Preciso contratar um frentista para posto de combustível. A pessoa deve ter boa comunicação, disponibilidade para escala, experiência com atendimento ao cliente e responsabilidade com caixa. Será um diferencial já ter trabalhado em posto.";

export const MOCK_JOB_AI_DRAFT: JobAiDraft = {
  title: "Frentista",
  area: "Operação de pista",
  seniority: "Júnior",
  work_model: "onsite",
  working_hours: "Escala 6x1 (44h semanais)",
  location: "Unidade a definir",
  description:
    "Atendimento aos clientes na pista, apoio à operação de caixa e cumprimento das rotinas operacionais do posto com foco em segurança e cordialidade.",
  responsibilities: [
    "Atender clientes durante o abastecimento com orientação clara e cordial.",
    "Apoiar a operação de caixa e conferência básica de recebimentos quando necessário.",
    "Cumprir rotinas de segurança, organização da pista e padrões de atendimento da unidade.",
    "Registrar ocorrências simples da operação e sinalizar divergências ao responsável.",
  ],
  requirements: [
    "Boa comunicação com clientes e equipe.",
    "Disponibilidade para trabalhar em escala.",
    "Experiência com atendimento ao cliente.",
    "Responsabilidade com caixa e valores.",
  ],
  mandatory_skills: [
    "Atendimento ao cliente",
    "Responsabilidade com caixa",
    "Rotina operacional",
  ],
  nice_to_have_skills: ["Experiência em posto de combustível", "Venda adicional na pista"],
  screening_questions: [
    "Você tem disponibilidade para trabalhar em escala?",
    "Já atuou com atendimento ao cliente em rotina operacional?",
    "Tem experiência com caixa ou recebimentos?",
  ],
  benefits: ["Vale-transporte", "Vale-alimentação", "Seguro de vida", "Plano odontológico"],
  experience_context: "Atuação em ambiente externo (pista), com ritmo dinâmico e contato direto e contínuo com o público.",
  minimum_years_experience: 1,
  requires_manager_review: true,
  requires_behavioral_assessment: false,
};

function normalizeStringList(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = item.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function inferTitle(description: string): string {
  const normalized = description.toLocaleLowerCase("pt-BR");
  if (normalized.includes("frentista") || normalized.includes("posto")) return "Frentista";
  if (normalized.includes("caixa")) return "Operador de Caixa";
  if (normalized.includes("atendimento")) return "Atendente";
  return "Assistente Operacional";
}

function buildSummary(description: string): string {
  const cleanDescription = description.trim();
  if (!cleanDescription) return MOCK_JOB_AI_DRAFT.description;
  if (cleanDescription.length <= 180) return cleanDescription;
  return `${cleanDescription.slice(0, 177).trimEnd()}...`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function generateMockJobDraft(description: string): Promise<JobAiDraft> {
  await sleep(650);

  const title = inferTitle(description);

  // Future integration point:
  // replace this local draft builder with the real API request/response mapping.
  return {
    ...MOCK_JOB_AI_DRAFT,
    title,
    description: title === "Frentista" ? MOCK_JOB_AI_DRAFT.description : buildSummary(description),
  };
}

export function applyDraftToForm(draft: JobAiDraft): Partial<JobFormValues> {
  const updates: Partial<JobFormValues> = {
    title: draft.title,
    description: draft.description,
    responsibilities:
      draft.responsibilities.length > 0 ? draft.responsibilities.join("\n") : undefined,
    requirements: draft.requirements.length > 0 ? draft.requirements.join("\n") : undefined,
    experience_context: draft.experience_context,
    job_area: draft.area,
    seniority_level: draft.seniority,
    minimum_years_experience: draft.minimum_years_experience ?? undefined,
    work_model: draft.work_model,
    working_hours: draft.working_hours,
    location: draft.location,
    requires_manager_review: draft.requires_manager_review,
    requires_behavioral_assessment: draft.requires_behavioral_assessment,
  };

  const mandatorySkills = normalizeStringList(draft.mandatory_skills);
  if (mandatorySkills.length > 0) updates.mandatory_skills = mandatorySkills;

  const niceToHave = normalizeStringList(draft.nice_to_have_skills);
  if (niceToHave.length > 0) updates.nice_to_have_skills = niceToHave;

  const screeningQuestions = normalizeStringList(draft.screening_questions);
  if (screeningQuestions.length > 0) updates.screening_questions = screeningQuestions;

  const benefitsList = normalizeStringList(draft.benefits);
  if (benefitsList.length > 0) updates.benefits = benefitsList;

  return updates;
}
