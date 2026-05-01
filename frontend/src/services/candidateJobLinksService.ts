import type { CandidateJobLinkOverview, JobCandidate } from "../types/domain";
import type { Paginated } from "../types/api";
import { httpRequest, HttpError } from "./http";
import { listJobCandidates as listJobCandidatesFromJobsService } from "./jobsService";

type LinkSource = "manual" | "pipeline" | "ai_match" | "import";

type CandidateJobLinksEnvelope = {
  data?: unknown[];
  items?: unknown[];
  links?: unknown[];
  candidate_job_links?: unknown[];
};

function normalizeCandidateJobLink(item: unknown): CandidateJobLinkOverview {
  const row = (item ?? {}) as Record<string, unknown>;
  const statusValue =
    row.status === "active" ||
    row.status === "removed" ||
    row.status === "transferred" ||
    row.status === "hired" ||
    row.status === "rejected"
      ? row.status
      : "active";
  const sourceValue =
    row.source === "manual" ||
    row.source === "pipeline" ||
    row.source === "ai_match" ||
    row.source === "import"
      ? row.source
      : "manual";

  return {
    id: typeof row.id === "string" ? row.id : "",
    candidate_id: typeof row.candidate_id === "string" ? row.candidate_id : "",
    job_id: typeof row.job_id === "string" ? row.job_id : "",
    job_title: typeof row.job_title === "string" ? row.job_title : null,
    job_status: typeof row.job_status === "string" ? row.job_status : null,
    status: statusValue,
    source: sourceValue,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeCandidateJobLinks(payload: unknown): CandidateJobLinkOverview[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeCandidateJobLink(item));
  }

  const envelope = (payload ?? {}) as CandidateJobLinksEnvelope;
  const rows = envelope.candidate_job_links ?? envelope.data ?? envelope.items ?? envelope.links;
  if (Array.isArray(rows)) {
    return rows.map((item) => normalizeCandidateJobLink(item));
  }

  return [];
}

export const candidateJobLinksService = {
  listJobCandidates: (
    jobId: string,
    page = 1,
    page_size = 10,
    min_score?: number,
    seniority?: string,
  ): Promise<Paginated<JobCandidate>> =>
    listJobCandidatesFromJobsService(jobId, page, page_size, min_score, seniority),

  async linkCandidateToJob(
    candidateId: string,
    jobId: string,
    source: LinkSource = "manual",
  ): Promise<CandidateJobLinkOverview> {
    const payload = await httpRequest<unknown>(`/api/v1/jobs/${jobId}/candidates`, {
      method: "POST",
      body: {
        candidate_id: candidateId,
        source,
      },
    });
    return normalizeCandidateJobLink(payload);
  },

  async unlinkCandidateFromJob(candidateId: string, jobId: string): Promise<void> {
    await httpRequest<void>(`/api/v1/jobs/${jobId}/candidates/${candidateId}`, {
      method: "DELETE",
    });
  },

  async getCandidateJobLinks(candidateId: string): Promise<CandidateJobLinkOverview[]> {
    const paths = [
      `/api/v1/candidates/${candidateId}/job-links`,
      `/api/v1/candidates/${candidateId}/jobs`,
    ];

    for (const path of paths) {
      try {
        const payload = await httpRequest<unknown>(path);
        return normalizeCandidateJobLinks(payload);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          continue;
        }
        throw error;
      }
    }

    return [];
  },
};
