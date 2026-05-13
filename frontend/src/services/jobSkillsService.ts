import { JobSkill } from "../types/domain";
import { httpRequest } from "./http";

export const jobSkillsService = {
  async listJobSkills(jobId: string): Promise<JobSkill[]> {
    return httpRequest<JobSkill[]>(`/api/v1/jobs/${jobId}/skills`);
  },

  async addJobSkill(
    jobId: string,
    payload: {
      skill_name: string;
      priority_level?: "priority" | "complementary" | "eliminatory";
      minimum_level?: string | null;
      minimum_years?: number | null;
      weight?: number;
    },
  ): Promise<JobSkill> {
    return httpRequest<JobSkill>(`/api/v1/jobs/${jobId}/skills`, { method: "POST", body: payload });
  },

  async removeJobSkill(jobId: string, skillId: string): Promise<void> {
    return httpRequest<void>(`/api/v1/jobs/${jobId}/skills/${skillId}`, { method: "DELETE" });
  },

  async updateJobSkill(
    jobId: string,
    skill: JobSkill,
    payload: { priority_level?: "priority" | "complementary" | "eliminatory"; minimum_level?: string | null; minimum_years?: number | null; weight?: number },
  ): Promise<JobSkill> {
    return httpRequest<JobSkill>(`/api/v1/jobs/${jobId}/skills/${skill.id}`, {
      method: "PATCH",
      body: payload,
    });
  },
};
