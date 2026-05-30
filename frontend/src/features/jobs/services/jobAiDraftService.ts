import { httpRequest } from "@/services/http";

// ── OCR ───────────────────────────────────────────────────────────────────────

export type JobOcrExtractResponse = {
  extracted_text: string;
  character_count: number;
  source: string;
};

// ── Draft ─────────────────────────────────────────────────────────────────────

export type JobAiDraftFields = {
  title: string | null;
  area: string | null;
  seniority: string | null;
  work_model: string | null;
  unit: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  mandatory_skills: string[];
  nice_to_have_skills: string[];
  benefits: string[];
  working_hours: string | null;
  screening_questions: string[];
  pipeline_steps: string[];
  matching_criteria: string[];
  requires_manager_review: boolean;
  requires_behavioral_assessment: boolean;
};

export type JobAiDraftUsage = {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number | null;
};

export type JobAiDraftSource = {
  text_used: boolean;
  ocr_used: boolean;
  input_character_count: number;
};

export type JobAiDraftGenerateRequest = {
  text_input: string | null;
  ocr_text: string | null;
  source?: {
    text_used: boolean;
    image_used: boolean;
  };
};

export type JobAiDraftGenerateResponse = {
  draft: JobAiDraftFields;
  needs_review: string[];
  source: JobAiDraftSource;
  usage: JobAiDraftUsage;
};

export type AiSkillSuggestions = {
  mandatory: string[];
  optional: string[];
};

// ── API ───────────────────────────────────────────────────────────────────────

export async function extractJobTextFromImage(file: File): Promise<JobOcrExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  return httpRequest<JobOcrExtractResponse>("/api/v1/jobs/ai-draft/ocr", {
    method: "POST",
    body: form,
  });
}

export async function generateJobAiDraft(
  payload: JobAiDraftGenerateRequest,
): Promise<JobAiDraftGenerateResponse> {
  return httpRequest<JobAiDraftGenerateResponse>("/api/v1/jobs/ai-draft/generate", {
    method: "POST",
    body: payload,
  });
}
