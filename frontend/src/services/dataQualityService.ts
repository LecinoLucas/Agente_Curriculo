import { httpRequest } from "./http";

export const dataQualityService = {
  async reprocessCandidate(candidateId: string): Promise<void> {
    await httpRequest("POST", `/admin/data-quality/classify/${candidateId}`, {});
  },

  async markAsValid(candidateId: string): Promise<void> {
    await httpRequest("POST", `/admin/data-quality/unmark-invalid/${candidateId}`, {});
  },
};
