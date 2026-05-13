import type {
  AssessmentOption,
  AssessmentQuestion,
  AssessmentTemplate,
  AssessmentTemplateDetail,
  AssessmentType,
  AssessmentTemplateStatus,
  JobAssessment,
} from "../types/domain";
import { httpRequest } from "./http";

const API_BASE = "/api/v1";

type ListTemplateFilters = {
  type?: AssessmentType;
  status?: AssessmentTemplateStatus;
};

type AssessmentOptionInput = {
  option_text: string;
  score_value?: number | null;
  metadata?: Record<string, unknown> | null;
  order_index?: number;
};

type AssessmentQuestionInput = {
  question_text: string;
  question_type: AssessmentQuestion["question_type"];
  required?: boolean;
  order_index?: number;
  metadata?: Record<string, unknown> | null;
  options?: AssessmentOptionInput[];
};

type AssessmentTemplateCreatePayload = {
  title: string;
  description?: string | null;
  type: AssessmentType;
  status?: AssessmentTemplateStatus;
  version?: number;
  questions?: AssessmentQuestionInput[];
};

type AssessmentTemplateUpdatePayload = {
  title?: string;
  description?: string | null;
  status?: AssessmentTemplateStatus;
};

type AssessmentTemplateDuplicatePayload = {
  title?: string;
  status?: AssessmentTemplateStatus;
};

type JobAssessmentCreatePayload = {
  template_id: string;
  required?: boolean;
  trigger_stage?: string;
  order_index?: number;
};

type JobAssessmentUpdatePayload = {
  required?: boolean;
  trigger_stage?: string;
  order_index?: number;
};

type AssessmentQuestionUpdatePayload = {
  question_text?: string;
  question_type?: AssessmentQuestion["question_type"];
  required?: boolean;
  order_index?: number;
  metadata?: Record<string, unknown> | null;
};

type AssessmentOptionUpdatePayload = {
  option_text?: string;
  score_value?: number | null;
  metadata?: Record<string, unknown> | null;
  order_index?: number;
};

function withFilters(filters?: ListTemplateFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const assessmentsService = {
  async listTemplates(filters?: ListTemplateFilters): Promise<AssessmentTemplate[]> {
    return httpRequest<AssessmentTemplate[]>(
      `${API_BASE}/admin/assessments/templates${withFilters(filters)}`,
    );
  },

  async getTemplate(templateId: string): Promise<AssessmentTemplateDetail> {
    return httpRequest<AssessmentTemplateDetail>(`${API_BASE}/admin/assessments/templates/${templateId}`);
  },

  async createTemplate(payload: AssessmentTemplateCreatePayload): Promise<AssessmentTemplate> {
    return httpRequest<AssessmentTemplate>(`${API_BASE}/admin/assessments/templates`, {
      method: "POST",
      body: payload,
    });
  },

  async updateTemplate(templateId: string, payload: AssessmentTemplateUpdatePayload): Promise<AssessmentTemplate> {
    return httpRequest<AssessmentTemplate>(`${API_BASE}/admin/assessments/templates/${templateId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async archiveTemplate(templateId: string): Promise<AssessmentTemplate> {
    return httpRequest<AssessmentTemplate>(`${API_BASE}/admin/assessments/templates/${templateId}/archive`, {
      method: "POST",
    });
  },

  async duplicateTemplate(
    templateId: string,
    payload: AssessmentTemplateDuplicatePayload = {},
  ): Promise<AssessmentTemplate> {
    return httpRequest<AssessmentTemplate>(`${API_BASE}/admin/assessments/templates/${templateId}/duplicate`, {
      method: "POST",
      body: payload,
    });
  },

  async createQuestion(templateId: string, payload: AssessmentQuestionInput): Promise<AssessmentQuestion> {
    return httpRequest<AssessmentQuestion>(`${API_BASE}/admin/assessments/templates/${templateId}/questions`, {
      method: "POST",
      body: payload,
    });
  },

  async updateQuestion(questionId: string, payload: AssessmentQuestionUpdatePayload): Promise<AssessmentQuestion> {
    return httpRequest<AssessmentQuestion>(`${API_BASE}/admin/assessments/questions/${questionId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteQuestion(questionId: string): Promise<void> {
    return httpRequest<void>(`${API_BASE}/admin/assessments/questions/${questionId}`, {
      method: "DELETE",
    });
  },

  async createOption(questionId: string, payload: AssessmentOptionInput): Promise<AssessmentOption> {
    return httpRequest<AssessmentOption>(`${API_BASE}/admin/assessments/questions/${questionId}/options`, {
      method: "POST",
      body: payload,
    });
  },

  async updateOption(optionId: string, payload: AssessmentOptionUpdatePayload): Promise<AssessmentOption> {
    return httpRequest<AssessmentOption>(`${API_BASE}/admin/assessments/options/${optionId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteOption(optionId: string): Promise<void> {
    return httpRequest<void>(`${API_BASE}/admin/assessments/options/${optionId}`, {
      method: "DELETE",
    });
  },

  async listJobAssessments(jobId: string): Promise<JobAssessment[]> {
    return httpRequest<JobAssessment[]>(`${API_BASE}/jobs/${jobId}/assessments`);
  },

  async attachTemplateToJob(jobId: string, payload: JobAssessmentCreatePayload): Promise<JobAssessment> {
    return httpRequest<JobAssessment>(`${API_BASE}/jobs/${jobId}/assessments`, {
      method: "POST",
      body: payload,
    });
  },

  async updateJobAssessment(
    jobId: string,
    jobAssessmentId: string,
    payload: JobAssessmentUpdatePayload,
  ): Promise<JobAssessment> {
    return httpRequest<JobAssessment>(`${API_BASE}/jobs/${jobId}/assessments/${jobAssessmentId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteJobAssessment(jobId: string, jobAssessmentId: string): Promise<void> {
    return httpRequest<void>(`${API_BASE}/jobs/${jobId}/assessments/${jobAssessmentId}`, {
      method: "DELETE",
    });
  },
};
