import { httpRequest } from "./http";
import { PaginatedResponse } from "../types/domain";

export type SkillAlias = {
  id: string;
  alias: string;
  normalized_alias: string;
};

export type SkillCatalog = {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_reason_note: string | null;
  created_at: string;
  aliases: SkillAlias[];
};

export type ListSkillsParams = {
  search?: string;
  category?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
  archived?: boolean;
};

export type CreateSkillPayload = {
  name: string;
  category?: string;
  aliases?: string[];
  description?: string;
};

export type UpdateSkillPayload = {
  name?: string;
  category?: string | null;
  aliases?: string[];
  description?: string | null;
};

export type ArchiveSkillPayload = {
  reason: string;
  note?: string;
};

export const skillsService = {
  async listSkills(params: ListSkillsParams = {}): Promise<PaginatedResponse<SkillCatalog>> {
    const urlParams = new URLSearchParams();
    if (params.search) urlParams.set("search", params.search);
    if (params.category) urlParams.set("category", params.category);
    if (params.page) urlParams.set("page", params.page.toString());
    if (params.page_size) urlParams.set("page_size", params.page_size.toString());
    if (params.is_active !== undefined) urlParams.set("is_active", params.is_active.toString());
    if (params.archived !== undefined) urlParams.set("archived", params.archived.toString());

    return httpRequest<PaginatedResponse<SkillCatalog>>(`/api/v1/skills?${urlParams.toString()}`);
  },

  async createSkill(payload: CreateSkillPayload): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>("/api/v1/skills", {
      method: "POST",
      body: payload,
    });
  },

  async updateSkill(id: string, payload: UpdateSkillPayload): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>(`/api/v1/skills/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deactivateSkill(id: string): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>(`/api/v1/skills/${id}/deactivate`, {
      method: "PATCH",
    });
  },

  async activateSkill(id: string): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>(`/api/v1/skills/${id}/activate`, {
      method: "PATCH",
    });
  },

  async archiveSkill(id: string, payload: ArchiveSkillPayload): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>(`/api/v1/skills/${id}/archive`, {
      method: "PATCH",
      body: payload,
    });
  },

  async restoreSkill(id: string): Promise<SkillCatalog> {
    return httpRequest<SkillCatalog>(`/api/v1/skills/${id}/restore`, {
      method: "PATCH",
    });
  },
};
