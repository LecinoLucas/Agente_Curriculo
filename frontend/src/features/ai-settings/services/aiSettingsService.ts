import { httpRequest } from "../../../services/http";
import type { AiAssistantRequest, AiAssistantResponse } from "../../ai-assistant/types";

export type AiStatusResponse = {
  ok: boolean;
  environment: string;
  assistant: {
    enabled: boolean;
    read_only: boolean;
    free_text_enabled: boolean;
  };
  rag: {
    embedding_provider: string;
    gemini_embedding_enabled: boolean;
    embedding_model: string;
    synthesis_enabled: boolean;
    synthesis_provider: string;
    synthesis_model: string;
    vector_storage_mode: "json_fallback" | "pgvector" | string;
    pgvector_available: boolean;
  };
  providers: {
    provider: string;
    model: string;
    gemini_api_key_configured: boolean;
  };
  protheus: {
    real_send_enabled: boolean;
    erp_allow_real_send: boolean;
  };
  warnings: string[];
};

export const aiSettingsService = {
  getStatus(): Promise<AiStatusResponse> {
    return httpRequest<AiStatusResponse>("/api/v1/ai/status");
  },

  runAssistantTest(request: AiAssistantRequest): Promise<AiAssistantResponse> {
    return httpRequest<AiAssistantResponse>("/api/v1/ai/assistant/read-only", {
      method: "POST",
      body: request,
    });
  },
};
