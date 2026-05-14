import { httpRequest } from "./http";
import type {
  CollaborationComment,
  CollaborationListResponse,
  CreateCommentRequest,
  ManagerFeedbackRequest,
} from "../types/domain";

export const collaborationService = {
  // Recruiter endpoints
  listCollaboration(jobId: string, candidateId: string) {
    return httpRequest<CollaborationListResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/collaboration`,
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

  requestManagerReview(jobId: string, candidateId: string, payload: { message?: string }) {
    return httpRequest<CollaborationComment>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/collaboration/request-review`,
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
};
