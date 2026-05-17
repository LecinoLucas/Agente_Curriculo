import type {
  CandidateGoogleLoginPayload,
  CandidateGoogleLoginResponse,
} from "../types/auth";
import { httpRequest } from "./http";

export const candidateAuthService = {
  googleLogin(payload: CandidateGoogleLoginPayload) {
    return httpRequest<CandidateGoogleLoginResponse>(
      "/api/v1/public/candidate-auth/google",
      {
        method: "POST",
        withAuth: false,
        body: payload,
      }
    );
  },
};
