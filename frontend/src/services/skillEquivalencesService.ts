import { SkillEquivalenceGroup } from "../types/domain";
import { httpRequest } from "./http";

type SkillEquivalencePayload = {
  canonical: string;
  aliases: string[];
  domains: string[];
  type?: string | null;
  strength: SkillEquivalenceGroup["strength"];
};

export const skillEquivalencesService = {
  async list(search?: string): Promise<SkillEquivalenceGroup[]> {
    const params = new URLSearchParams({ limit: "500" });
    if (search) params.set("search", search);
    return httpRequest<SkillEquivalenceGroup[]>(`/api/v1/skill-equivalences?${params.toString()}`);
  },

  async create(payload: SkillEquivalencePayload): Promise<SkillEquivalenceGroup> {
    return httpRequest<SkillEquivalenceGroup>("/api/v1/skill-equivalences", {
      method: "POST",
      body: payload,
    });
  },

  async update(id: string, payload: Partial<SkillEquivalencePayload>): Promise<SkillEquivalenceGroup> {
    return httpRequest<SkillEquivalenceGroup>(`/api/v1/skill-equivalences/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async delete(id: string): Promise<void> {
    return httpRequest<void>(`/api/v1/skill-equivalences/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
