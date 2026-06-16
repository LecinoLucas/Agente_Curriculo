import { httpRequest } from "./http";
import type {
  CollaborationComment,
  CollaborationListResponse,
  CreateCommentRequest,
  ManagerFeedbackRequest,
  ReviewRequestListResponse,
} from "../types/domain";

export type RequestManagerReviewPayload = {
  message: string;
  target_manager_id?: string;
  priority?: "low" | "medium" | "high";
};

export const collaborationService = {
  // Recruiter endpoints
  listCollaboration(jobId: string, candidateId: string, signal?: AbortSignal) {
    return httpRequest<CollaborationListResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/collaboration`,
      { signal },
    );
  },

  createComment(jobId: string, candidateId: string, payload: CreateCommentRequest) {
    return httpRequest<CollaborationComment>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/collaboration/comments`,
      {
        method: "POST",
        body: payload,
      },
    );
  },

  requestManagerReview(jobId: string, candidateId: string, payload: RequestManagerReviewPayload) {
    return httpRequest<CollaborationComment>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/collaboration/request-manager-review`,
      {
        method: "POST",
        body: payload,
      },
    );
  },

  // Manager endpoints
  listManagerCollaboration(jobId: string, candidateId: string) {
    return httpRequest<CollaborationListResponse>(
      `/api/v1/manager/jobs/${jobId}/candidates/${candidateId}/collaboration`,
    );
  },

  submitManagerFeedback(jobId: string, candidateId: string, payload: ManagerFeedbackRequest) {
    return httpRequest<CollaborationComment>(
      `/api/v1/manager/jobs/${jobId}/candidates/${candidateId}/feedback`,
      {
        method: "POST",
        body: payload,
      },
    );
  },

  listReviewRequests() {
    return httpRequest<ReviewRequestListResponse>("/api/v1/manager/review-requests");
  },
};
