import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  getBehavioralAIEvaluationDetail,
  getBehavioralAIMetrics,
  listBehavioralAIEvaluations,
  retryBehavioralAIEvaluation,
} from "../behavioralAIEvaluationService";

const httpRequestMock = vi.fn();

vi.mock("../http", () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}));

describe("behavioralAIEvaluationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monta a listagem operacional com filtros suportados", async () => {
    httpRequestMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      page_size: 20,
      total_pages: 1,
    });

    await listBehavioralAIEvaluations({
      page: 2,
      page_size: 20,
      status: "failed",
      operational_status: "credential_invalid",
      candidate_id: "candidate-1",
      job_id: "job-1",
      provider: "google",
      model: "gemini-2.5-flash",
      provider_error_type: "ai_credential_invalid",
      date_from: "2026-05-01",
      date_to: "2026-05-25",
      search: "Ana",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/behavioral-ai/evaluations?page=2&page_size=20&status=failed&operational_status=credential_invalid&candidate_id=candidate-1&job_id=job-1&provider=google&model=gemini-2.5-flash&provider_error_type=ai_credential_invalid&date_from=2026-05-01&date_to=2026-05-25&search=Ana",
    );
  });

  it("normaliza métricas ausentes sem criar dados sensíveis", async () => {
    httpRequestMock.mockResolvedValue({ pending: 1, rate_limited: 2 });

    await expect(getBehavioralAIMetrics()).resolves.toMatchObject({
      pending: 1,
      processing: 0,
      rate_limited: 2,
      credential_invalid: 0,
    });
    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/behavioral-ai/metrics");
  });

  it("consulta detalhe seguro pelo evaluation_id", async () => {
    httpRequestMock.mockResolvedValue({
      id: "eval-1",
      evaluation_id: "eval-1",
      assignment_id: "assignment-1",
      candidate_id: "candidate-1",
      candidate_name: "Ana",
      candidate_email: null,
      job_id: "job-1",
      job_title: "Tecnologia",
      type: "behavioral_ai",
      status: "completed",
      operational_status: "completed",
      provider: "google",
      model: "gemini",
      retry_count: 0,
      can_retry: false,
      retry_allowed_reason: "completed",
      safe_error_message: null,
      stuck: false,
      created_at: "2026-05-24T10:00:00Z",
      updated_at: "2026-05-24T10:00:00Z",
      prompt_version: 1,
      confidence: "medium",
      summary: "Resumo seguro",
    });

    const detail = await getBehavioralAIEvaluationDetail("eval-1");

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/behavioral-ai/evaluations/eval-1");
    expect(detail.summary).toBe("Resumo seguro");
    expect(JSON.stringify(detail)).not.toContain("api_key");
  });

  it("solicita retry pelo endpoint operacional", async () => {
    httpRequestMock.mockResolvedValue({
      evaluation_id: "eval-1",
      assignment_id: "assignment-1",
      status: "pending",
      enqueued: true,
      retry_count: 2,
      message: "Avaliação enfileirada para retry",
    });

    await retryBehavioralAIEvaluation("eval-1");

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/behavioral-ai/eval-1/retry", {
      method: "POST",
    });
  });
});
