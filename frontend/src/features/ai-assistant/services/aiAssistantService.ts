import { httpRequest } from "../../../services/http";
import type { AiAssistantRequest, AiAssistantResponse } from "../types";

export const aiAssistantService = {
  query(request: AiAssistantRequest): Promise<AiAssistantResponse> {
    return httpRequest<AiAssistantResponse>("/api/v1/ai/assistant/read-only", {
      method: "POST",
      body: request,
    });
  },
};
