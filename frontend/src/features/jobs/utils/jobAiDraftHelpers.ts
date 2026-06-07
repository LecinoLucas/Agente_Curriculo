/**
 * jobAiDraftHelpers.ts
 *
 * Maps a real API JobAiDraftFields response to JobFormValues for application to the form.
 * Does NOT use the mock data — designed exclusively for the real backend response.
 *
 * Rules:
 * - salary_min / salary_max are NOT mapped (require careful human review).
 * - pipeline_steps / matching_criteria are NOT mapped (internal AI fields).
 * - responsibilities[] and requirements[] are joined with '\n' for textarea fields.
 * - unit → location (backend field rename).
 * - All string fields are trimmed; empty strings become undefined.
 * - All list fields are normalized (trim, drop empty, dedup case-insensitive).
 */
import type { JobFormValues } from "../jobFormConfig";
import { normalizeAiDraftStringList } from "../jobFormConfig";
import type { JobAiDraftFields } from "../services/jobAiDraftService";
import { extractSkillSuggestionsFromDraft } from "./jobAiSkillSuggestions";

export type LegacyJobAiDraft = {
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

export const JOB_AI_PROMPT_EXAMPLE =
  "Preciso contratar um frentista para posto de combustível. A pessoa deve ter boa comunicação, disponibilidade para escala, experiência com atendimento ao cliente e responsabilidade com caixa. Será um diferencial já ter trabalhado em posto.";

/** Trim string or return undefined if blank. */
function trimOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeLegacyStringList(items: string[]): string[] {
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

export function applyLegacyDraftToForm(draft: LegacyJobAiDraft): Partial<JobFormValues> {
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

  const mandatorySkills = normalizeLegacyStringList(draft.mandatory_skills);
  if (mandatorySkills.length > 0) updates.mandatory_skills = mandatorySkills;

  const niceToHave = normalizeLegacyStringList(draft.nice_to_have_skills);
  if (niceToHave.length > 0) updates.nice_to_have_skills = niceToHave;

  const screeningQuestions = normalizeLegacyStringList(draft.screening_questions);
  if (screeningQuestions.length > 0) updates.screening_questions = screeningQuestions;

  const benefitsList = normalizeLegacyStringList(draft.benefits);
  if (benefitsList.length > 0) updates.benefits = benefitsList;

  return updates;
}

/**
 * Map a real API draft response to a partial JobFormValues.
 * Safe to call with any valid JobAiDraftFields — missing / null fields are
 * simply omitted from the returned partial, leaving the form field unchanged.
 */
export function applyApiDraftToForm(draft: JobAiDraftFields): Partial<JobFormValues> {
  const updates: Partial<JobFormValues> = {};

  // ── Text fields ──────────────────────────────────────────────────────────────

  const title = trimOrUndefined(draft.title);
  if (title !== undefined) updates.title = title;

  const description = trimOrUndefined(draft.description);
  if (description !== undefined) updates.description = description;

  // area → job_area
  const jobArea = trimOrUndefined(draft.area);
  if (jobArea !== undefined) updates.job_area = jobArea;

  // seniority → seniority_level (backend already validates the enum)
  const seniority = trimOrUndefined(draft.seniority);
  if (seniority !== undefined) updates.seniority_level = seniority;

  // work_model (backend already validates the enum: onsite | hybrid | remote)
  const workModel = trimOrUndefined(draft.work_model);
  if (workModel !== undefined) updates.work_model = workModel;

  // unit → location
  const location = trimOrUndefined(draft.unit);
  if (location !== undefined) updates.location = location;

  // working_hours
  const workingHours = trimOrUndefined(draft.working_hours);
  if (workingHours !== undefined) updates.working_hours = workingHours;

  const experienceContext = trimOrUndefined(draft.experience_context);
  if (experienceContext !== undefined) updates.experience_context = experienceContext;

  const minimumEducationLevel = trimOrUndefined(draft.minimum_education_level);
  if (minimumEducationLevel !== undefined) updates.minimum_education_level = minimumEducationLevel;

  if (draft.minimum_years_experience !== null && draft.minimum_years_experience !== undefined) {
    updates.minimum_years_experience = draft.minimum_years_experience;
  }

  // ── List → textarea fields (join with newline) ───────────────────────────────

  if (Array.isArray(draft.responsibilities) && draft.responsibilities.length > 0) {
    const joined = draft.responsibilities
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n");
    if (joined) updates.responsibilities = joined;
  }

  if (Array.isArray(draft.requirements) && draft.requirements.length > 0) {
    const joined = draft.requirements
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n");
    if (joined) updates.requirements = joined;
  }

  // ── Dedicated list fields (normalised arrays) ────────────────────────────────

  const mandatorySkills = normalizeAiDraftStringList(draft.mandatory_skills);
  if (mandatorySkills.length > 0) updates.mandatory_skills = mandatorySkills;

  const niceToHave = normalizeAiDraftStringList(draft.nice_to_have_skills);
  if (niceToHave.length > 0) updates.nice_to_have_skills = niceToHave;

  const screeningQuestions = normalizeAiDraftStringList(draft.screening_questions);
  if (screeningQuestions.length > 0) updates.screening_questions = screeningQuestions;

  const benefits = normalizeAiDraftStringList(draft.benefits);
  if (benefits.length > 0) updates.benefits = benefits;

  // ── Boolean fields ───────────────────────────────────────────────────────────

  if (draft.requires_manager_review !== null && draft.requires_manager_review !== undefined) {
    updates.requires_manager_review = draft.requires_manager_review;
  }

  if (
    draft.requires_behavioral_assessment !== null &&
    draft.requires_behavioral_assessment !== undefined
  ) {
    updates.requires_behavioral_assessment = draft.requires_behavioral_assessment;
  }

  // NOT mapped (intentionally):
  // - salary_min / salary_max → requires careful human review
  // - pipeline_steps          → internal AI field, not editable via this panel
  // - matching_criteria       → internal AI field, not editable via this panel

  return updates;
}

/**
 * Extract skill suggestions from the draft for the AiSkillSuggestionsBlock.
 * Returns arrays already normalised (trim + dedup).
 */
export function extractSkillSuggestions(draft: JobAiDraftFields): {
  mandatory: string[];
  optional: string[];
} {
  return extractSkillSuggestionsFromDraft(draft);
}
