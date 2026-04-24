import {
  AnalysisMatch,
  AnalysisPipelineStatus,
  AnalysisResult,
  AnalysisStatus,
  AnalysisSummary,
} from "../types/domain";
import { httpRequest } from "./http";

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export const analysisService = {
  request: (resumeVersionId: string) =>
    httpRequest<{ analysis_id: string }>(`/api/v1/analyses?resume_version_id=${resumeVersionId}`, {
      method: "POST",
    }),

  list: (
    page = 1,
    pageSize = 10,
    status?: AnalysisSummary["status"] | "all",
  ) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });

    if (status && status !== "all") {
      params.set("status", status);
    }

    return httpRequest<PaginatedResponse<AnalysisSummary>>(`/api/v1/analyses?${params.toString()}`);
  },
  status: (analysisId: string) => httpRequest<AnalysisStatus>(`/api/v1/analyses/${analysisId}/status`),
  pipeline: (analysisId: string) =>
    httpRequest<AnalysisPipelineStatus>(`/api/v1/analyses/${analysisId}/pipeline`),
  result: (analysisId: string) => httpRequest<AnalysisResult>(`/api/v1/analyses/${analysisId}/result`),
};

export async function matchToJob(analysisId: string, jobId: string): Promise<AnalysisMatch> {
  return httpRequest<AnalysisMatch>(`/api/v1/analyses/${analysisId}/match/${jobId}`, {
    method: "POST",
  });
}
