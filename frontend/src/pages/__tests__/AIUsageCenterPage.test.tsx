import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIUsageCenterPage } from "../AIUsageCenterPage";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const getAIUsageCenterMock = vi.fn();

vi.mock("../../services/systemHealthService", () => ({
  systemHealthService: {
    getAIUsageCenter: (...args: unknown[]) => getAIUsageCenterMock(...args),
  },
}));

describe("AIUsageCenterPage", () => {
  beforeEach(() => {
    getAIUsageCenterMock.mockReset();
    getAIUsageCenterMock.mockResolvedValue({
      period: {
        from: "2026-06-01",
        to: "2026-06-14",
      },
      summary: {
        total_calls: 12,
        success_calls: 9,
        failed_calls: 2,
        rate_limited_calls: 1,
        blocked_calls: 0,
        unknown_calls: 0,
        total_input_tokens: 10000,
        total_output_tokens: 2500,
        total_tokens: 12500,
        estimated_cost_usd: 0.83,
        avg_duration_ms: 1450,
      },
      by_operation: [
        {
          operation: "job_ai_draft",
          calls: 5,
          success_calls: 4,
          failed_calls: 1,
          rate_limited_calls: 0,
          blocked_calls: 0,
          unknown_calls: 0,
          input_tokens: 5000,
          output_tokens: 1200,
          total_tokens: 6200,
          estimated_cost_usd: 0.42,
          avg_duration_ms: 1320,
          models: [
            {
              provider: "google",
              model: "gemini-2.5-flash",
              calls: 5,
              success_calls: 4,
              failed_calls: 1,
              rate_limited_calls: 0,
              blocked_calls: 0,
              unknown_calls: 0,
              total_tokens: 6200,
              estimated_cost_usd: 0.42,
            },
          ],
        },
      ],
      by_model: [
        {
          provider: "google",
          model: "gemini-2.5-flash",
          calls: 8,
          success_calls: 6,
          failed_calls: 1,
          rate_limited_calls: 1,
          blocked_calls: 0,
          unknown_calls: 0,
          total_tokens: 9800,
          estimated_cost_usd: 0.63,
        },
      ],
      recent_events: [
        {
          created_at: "2026-06-14T12:00:00Z",
          operation: "job_ai_draft",
          provider: "google",
          model: "gemini-2.5-flash",
          status: "error",
          normalized_status: "failed",
          tokens: 900,
          estimated_cost_usd: 0.05,
          duration_ms: 1800,
          safe_error_message: "json_parse_error",
        },
      ],
      pricing: {
        source: "internal_static",
        updated_at: null,
        models: [
          {
            provider: "google",
            model: "gemini-2.5-flash",
            input_per_1m_tokens: "0.30",
            output_per_1m_tokens: "2.50",
            currency: "USD",
            source: "internal",
            last_reviewed_at: null,
            status: "configured",
          },
        ],
      },
      gaps: {
        unknown_operation_count: 0,
        missing_token_count: 1,
        missing_cost_count: 2,
        unknown_status_count: 0,
        warnings: ["missing_cost_present", "ai_assistant_without_dedicated_operation_logs"],
      },
    });
  });

  it("renderiza cards, tabela por fluxo, tabela por modelo e eventos recentes", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AIUsageCenterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Uso de IA")).toBeInTheDocument();
    expect(screen.getByText("Chamadas totais")).toBeInTheDocument();
    expect(screen.getByText("Por fluxo")).toBeInTheDocument();
    expect(screen.getByText("Por modelo")).toBeInTheDocument();
    expect(screen.getByText("Eventos recentes")).toBeInTheDocument();
    expect(screen.getAllByText("Job Ai Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gemini-2.5-flash").length).toBeGreaterThan(0);
    expect(screen.getByText("json_parse_error")).toBeInTheDocument();
  });

  it("reaplica filtros", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <AIUsageCenterPage />
      </MemoryRouter>,
    );

    await screen.findByText("Uso de IA");
    await user.type(screen.getByLabelText("Provider"), "google");
    await user.click(screen.getByRole("button", { name: /aplicar filtros/i }));

    await waitFor(() => {
      expect(getAIUsageCenterMock).toHaveBeenCalled();
    });
  });

  it("mostra estado vazio", async () => {
    getAIUsageCenterMock.mockResolvedValueOnce({
      period: { from: null, to: null },
      summary: {
        total_calls: 0,
        success_calls: 0,
        failed_calls: 0,
        rate_limited_calls: 0,
        blocked_calls: 0,
        unknown_calls: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: null,
        avg_duration_ms: null,
      },
      by_operation: [],
      by_model: [],
      recent_events: [],
      pricing: { source: "internal_static", updated_at: null, models: [] },
      gaps: {
        unknown_operation_count: 0,
        missing_token_count: 0,
        missing_cost_count: 0,
        unknown_status_count: 0,
        warnings: [],
      },
    });

    render(
      <MemoryRouter future={routerFuture}>
        <AIUsageCenterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sem eventos de IA no período")).toBeInTheDocument();
  });

  it("mostra erro de carregamento", async () => {
    getAIUsageCenterMock.mockRejectedValueOnce(new Error("Falha remota"));

    render(
      <MemoryRouter future={routerFuture}>
        <AIUsageCenterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Falha remota/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("não renderiza campos sensíveis inexistentes no contrato", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AIUsageCenterPage />
      </MemoryRouter>,
    );

    await screen.findByText("Uso de IA");

    expect(screen.queryByText(/prompt completo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/currículo bruto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payload_json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/content_hash/i)).not.toBeInTheDocument();
  });
});
