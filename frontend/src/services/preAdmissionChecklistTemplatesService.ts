import { httpRequest } from "./http";
import type {
  PreAdmissionChecklistTemplate,
  PreAdmissionChecklistTemplateDetail,
  PreAdmissionChecklistTemplateItem,
  PreAdmissionChecklistTemplateItemPayload,
  PreAdmissionChecklistTemplateItemUpdatePayload,
  PreAdmissionChecklistTemplatePayload,
  PreAdmissionChecklistTemplateUpdatePayload,
} from "../types/domain";

const API_BASE = "/api/v1/admin/pre-admission/checklists";

export const preAdmissionChecklistTemplatesService = {
  async listTemplates(): Promise<PreAdmissionChecklistTemplate[]> {
    return httpRequest<PreAdmissionChecklistTemplate[]>(API_BASE);
  },

  async getTemplate(templateId: string): Promise<PreAdmissionChecklistTemplateDetail> {
    return httpRequest<PreAdmissionChecklistTemplateDetail>(`${API_BASE}/${templateId}`);
  },

  async createTemplate(payload: PreAdmissionChecklistTemplatePayload): Promise<PreAdmissionChecklistTemplate> {
    return httpRequest<PreAdmissionChecklistTemplate>(API_BASE, {
      method: "POST",
      body: payload,
    });
  },

  async updateTemplate(
    templateId: string,
    payload: PreAdmissionChecklistTemplateUpdatePayload,
  ): Promise<PreAdmissionChecklistTemplate> {
    return httpRequest<PreAdmissionChecklistTemplate>(`${API_BASE}/${templateId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async archiveTemplate(templateId: string): Promise<PreAdmissionChecklistTemplate> {
    return httpRequest<PreAdmissionChecklistTemplate>(`${API_BASE}/${templateId}/archive`, {
      method: "POST",
    });
  },

  async duplicateTemplate(templateId: string): Promise<PreAdmissionChecklistTemplateDetail> {
    return httpRequest<PreAdmissionChecklistTemplateDetail>(`${API_BASE}/${templateId}/duplicate`, {
      method: "POST",
    });
  },

  async createItem(
    templateId: string,
    payload: PreAdmissionChecklistTemplateItemPayload,
  ): Promise<PreAdmissionChecklistTemplateItem> {
    return httpRequest<PreAdmissionChecklistTemplateItem>(`${API_BASE}/${templateId}/items`, {
      method: "POST",
      body: payload,
    });
  },

  async updateItem(
    templateId: string,
    itemId: string,
    payload: PreAdmissionChecklistTemplateItemUpdatePayload,
  ): Promise<PreAdmissionChecklistTemplateItem> {
    return httpRequest<PreAdmissionChecklistTemplateItem>(`${API_BASE}/${templateId}/items/${itemId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteItem(templateId: string, itemId: string): Promise<void> {
    return httpRequest<void>(`${API_BASE}/${templateId}/items/${itemId}`, {
      method: "DELETE",
    });
  },
};
