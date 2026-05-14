import type {
  BehavioralAssessmentTemplate,
  BehavioralTemplateCompetency,
  BehavioralTemplateQuestion,
} from "../types/domain";
import { httpRequest } from "./http";

const API_BASE = "/api/v1";

type BehavioralTemplateCreatePayload = {
  name: string;
  description?: string | null;
};

type BehavioralTemplateUpdatePayload = {
  name?: string;
  description?: string | null;
};

type BehavioralCompetencyCreatePayload = {
  name: string;
  description?: string | null;
  weight?: number;
  display_order?: number;
};

type BehavioralCompetencyUpdatePayload = {
  name?: string;
  description?: string | null;
  weight?: number;
  display_order?: number;
};

type BehavioralQuestionCreatePayload = {
  question_text: string;
  answer_type: "text" | "scale" | "multiple_choice";
  is_required?: boolean;
  weight?: number;
  display_order?: number;
  options_json?: string[] | null;
};

type BehavioralQuestionUpdatePayload = {
  question_text?: string;
  answer_type?: "text" | "scale" | "multiple_choice";
  is_required?: boolean;
  weight?: number;
  display_order?: number;
  options_json?: string[] | null;
};

type JobBehavioralTemplateLinkPayload = {
  behavioral_template_id: string | null;
};

export const behavioralTemplatesService = {
  async listTemplates(): Promise<BehavioralAssessmentTemplate[]> {
    return httpRequest<BehavioralAssessmentTemplate[]>(`${API_BASE}/admin/behavioral/templates`);
  },

  async listActiveTemplates(): Promise<BehavioralAssessmentTemplate[]> {
    return httpRequest<BehavioralAssessmentTemplate[]>(`${API_BASE}/admin/behavioral/templates/active`);
  },

  async getTemplate(templateId: string): Promise<BehavioralAssessmentTemplate> {
    return httpRequest<BehavioralAssessmentTemplate>(`${API_BASE}/admin/behavioral/templates/${templateId}`);
  },

  async createTemplate(payload: BehavioralTemplateCreatePayload): Promise<BehavioralAssessmentTemplate> {
    return httpRequest<BehavioralAssessmentTemplate>(`${API_BASE}/admin/behavioral/templates`, {
      method: "POST",
      body: payload,
      withAuth: true,
    });
  },

  async updateTemplate(
    templateId: string,
    payload: BehavioralTemplateUpdatePayload,
  ): Promise<BehavioralAssessmentTemplate> {
    return httpRequest<BehavioralAssessmentTemplate>(`${API_BASE}/admin/behavioral/templates/${templateId}`, {
      method: "PATCH",
      body: payload,
      withAuth: true,
    });
  },

  async activateTemplate(templateId: string): Promise<BehavioralAssessmentTemplate> {
    return httpRequest<BehavioralAssessmentTemplate>(`${API_BASE}/admin/behavioral/templates/${templateId}/activate`, {
      method: "POST",
      withAuth: true,
    });
  },

  async archiveTemplate(templateId: string): Promise<BehavioralAssessmentTemplate> {
    return httpRequest<BehavioralAssessmentTemplate>(`${API_BASE}/admin/behavioral/templates/${templateId}/archive`, {
      method: "POST",
      withAuth: true,
    });
  },

  async createCompetency(
    templateId: string,
    payload: BehavioralCompetencyCreatePayload,
  ): Promise<BehavioralTemplateCompetency> {
    return httpRequest<BehavioralTemplateCompetency>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies`,
      {
        method: "POST",
        body: payload,
        withAuth: true,
      },
    );
  },

  async updateCompetency(
    templateId: string,
    competencyId: string,
    payload: BehavioralCompetencyUpdatePayload,
  ): Promise<void> {
    return httpRequest<void>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies/${competencyId}`,
      {
        method: "PATCH",
        body: payload,
        withAuth: true,
      },
    );
  },

  async deleteCompetency(templateId: string, competencyId: string): Promise<void> {
    return httpRequest<void>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies/${competencyId}`,
      {
        method: "DELETE",
        withAuth: true,
      },
    );
  },

  async createQuestion(
    templateId: string,
    competencyId: string,
    payload: BehavioralQuestionCreatePayload,
  ): Promise<BehavioralTemplateQuestion> {
    return httpRequest<BehavioralTemplateQuestion>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies/${competencyId}/questions`,
      {
        method: "POST",
        body: payload,
        withAuth: true,
      },
    );
  },

  async updateQuestion(
    templateId: string,
    competencyId: string,
    questionId: string,
    payload: BehavioralQuestionUpdatePayload,
  ): Promise<void> {
    return httpRequest<void>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies/${competencyId}/questions/${questionId}`,
      {
        method: "PATCH",
        body: payload,
        withAuth: true,
      },
    );
  },

  async deleteQuestion(templateId: string, competencyId: string, questionId: string): Promise<void> {
    return httpRequest<void>(
      `${API_BASE}/admin/behavioral/templates/${templateId}/competencies/${competencyId}/questions/${questionId}`,
      {
        method: "DELETE",
        withAuth: true,
      },
    );
  },

  async linkTemplateToJob(jobId: string, templateId: string | null): Promise<void> {
    return httpRequest<void>(`${API_BASE}/jobs/${jobId}/behavioral-template`, {
      method: "PATCH",
      body: { behavioral_template_id: templateId } as JobBehavioralTemplateLinkPayload,
      withAuth: true,
    });
  },
};
