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

/** Trim string or return undefined if blank. */
function trimOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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

  // Always map booleans — backend provides sensible defaults (true / false).
  updates.requires_manager_review = draft.requires_manager_review;
  updates.requires_behavioral_assessment = draft.requires_behavioral_assessment;

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
  return {
    mandatory: normalizeAiDraftStringList(draft.mandatory_skills),
    optional: normalizeAiDraftStringList(draft.nice_to_have_skills),
  };
}
