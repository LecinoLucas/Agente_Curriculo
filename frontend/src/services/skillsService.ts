import { JobSkill, Skill } from "../types/domain";
import { httpRequest } from "./http";

export const skillsService = {
  async list(search?: string, category?: string): Promise<Skill[]> {
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    return httpRequest<Skill[]>(`/api/v1/skills?${params.toString()}`);
  },

  async create(name: string, category?: string, aliases?: string[]): Promise<Skill> {
    return httpRequest<Skill>("/api/v1/skills", {
      method: "POST",
      body: { name, category, aliases: aliases ?? [] },
    });
  },

  async update(id: string, payload: { name?: string; category?: string; aliases?: string[]; is_verified?: boolean }): Promise<Skill> {
    return httpRequest<Skill>(`/api/v1/skills/${id}`, { method: "PATCH", body: payload });
  },

  async delete(id: string): Promise<void> {
    return httpRequest<void>(`/api/v1/skills/${id}`, { method: "DELETE" });
  },

  async listJobSkills(jobId: string): Promise<JobSkill[]> {
    return httpRequest<JobSkill[]>(`/api/v1/jobs/${jobId}/skills`);
  },

  async addJobSkill(jobId: string, payload: { skill_id: string; is_mandatory?: boolean; minimum_level?: string; minimum_years?: number; weight?: number }): Promise<JobSkill> {
    return httpRequest<JobSkill>(`/api/v1/jobs/${jobId}/skills`, { method: "POST", body: payload });
  },

  async removeJobSkill(jobId: string, skillId: string): Promise<void> {
    return httpRequest<void>(`/api/v1/jobs/${jobId}/skills/${skillId}`, { method: "DELETE" });
  },

  async updateJobSkill(
    jobId: string,
    skillId: string,
    payload: { is_mandatory?: boolean; minimum_level?: string | null; minimum_years?: number | null; weight?: number }
  ): Promise<JobSkill> {
    // Backend doesn't have PATCH for job skills, so delete and re-add with new values
    await this.removeJobSkill(jobId, skillId);
    return this.addJobSkill(jobId, { skill_id: skillId, ...payload });
  },
};
