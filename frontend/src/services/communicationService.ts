import { httpRequest } from "./http";
import type {
  CandidateCommunication,
  CommunicationListResponse,
  CommunicationTemplate,
  CommunicationTemplateListResponse,
} from "../types/domain";

export type CommunicationTemplatePayload = {
  key: string;
  channel: string;
  audience: string;
  body_template: string;
  subject_template?: string | null;
  status?: string;
};

export type CommunicationTemplateUpdatePayload = Partial<CommunicationTemplatePayload>;

export const communicationService = {
  getRecruiterCommunications(jobId: string, candidateId: string) {
    return httpRequest<CommunicationListResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/communications`,
    );
  },

  retryCommunication(commId: string) {
    return httpRequest<{ message: string }>(`/api/v1/communications/${commId}/retry`, {
      method: "POST",
      body: {},
    });
  },

  getCandidateCommunications() {
    return httpRequest<CommunicationListResponse>("/api/v1/candidate-portal/communications", {
      withAuth: false,
    });
  },

  markCommunicationRead(commId: string) {
    return httpRequest<{ message: string }>(
      `/api/v1/candidate-portal/communications/${commId}/mark-read`,
      {
        method: "POST",
        body: {},
        withAuth: false,
      },
    );
  },

  getTemplates() {
    return httpRequest<CommunicationTemplateListResponse>("/api/v1/admin/communication/templates");
  },

  createTemplate(payload: CommunicationTemplatePayload) {
    return httpRequest<CommunicationTemplate>("/api/v1/admin/communication/templates", {
      method: "POST",
      body: payload,
    });
  },

  updateTemplate(templateId: string, payload: CommunicationTemplateUpdatePayload) {
    return httpRequest<CommunicationTemplate>(`/api/v1/admin/communication/templates/${templateId}`, {
      method: "PATCH",
      body: payload,
    });
  },
};
