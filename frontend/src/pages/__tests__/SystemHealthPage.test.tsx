import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { SystemHealthPage } from "../SystemHealthPage";

const getOverviewMock = vi.fn();
const getQueuesMock = vi.fn();
const getDatabaseMock = vi.fn();
const getErrorsMock = vi.fn();
const getAIPricingCatalogMock = vi.fn();
const getUsageMock = vi.fn();

vi.mock("../../services/systemHealthService", () => ({
  systemHealthService: {
    getOverview: () => getOverviewMock(),
    getQueues: () => getQueuesMock(),
    getDatabase: () => getDatabaseMock(),
    getErrors: () => getErrorsMock(),
    getAIPricingCatalog: () => getAIPricingCatalogMock(),
  },
}));

vi.mock("../../services/aiLimitsService", () => ({
  aiLimitsService: {
    getUsage: () => getUsageMock(),
    revokeOverride: vi.fn(),
  },
}));

describe("SystemHealthPage", () => {
  beforeEach(() => {
    getOverviewMock.mockReset();
    getQueuesMock.mockReset();
    getDatabaseMock.mockReset();
    getErrorsMock.mockReset();
    getAIPricingCatalogMock.mockReset();
    getUsageMock.mockReset();

    getOverviewMock.mockResolvedValue({
      status: "ok",
      environment: "development",
      version: "1.0.0",
      uptime_seconds: 120,
      backend: { status: "ok", latency_ms: null },
      database: { status: "ok", latency_ms: 12 },
      redis: { status: "ok", latency_ms: 4 },
      ai_provider: { configured_provider: "google", status: "ok" },
      last_analysis_at: "2026-05-12T14:00:00Z",
      pending_analyses: 2,
      processing_analyses: 1,
      failed_analyses_24h: 0,
    });

    getQueuesMock.mockResolvedValue({
      redis: { status: "ok", latency_ms: 4 },
      celery: { status: "unknown", message: "Celery inspect indisponível", workers_online: null },
      pending_analyses: 2,
      processing_analyses: 1,
      stale_processing: 0,
      failed_last_24h: 0,
      retries_pending: 0,
    });
    getDatabaseMock.mockResolvedValue({
      status: "ok",
      latency_ms: 11,
      total_candidates: 5,
      total_jobs: 3,
      total_analyses: 7,
      analyses_by_status: [{ status: "completed", count: 7 }],
      database_time: "2026-05-12T14:00:00Z",
      pool_info: { status: "available" },
    });
    getErrorsMock.mockResolvedValue({
      failed_analyses_24h: 0,
      ai_errors_by_provider: [],
      recent_failures: [],
      worker_status: { status: "unknown", message: "Sem resposta", workers_online: null },
    });
    getAIPricingCatalogMock.mockResolvedValue({
      items: [],
    });
    getUsageMock.mockResolvedValue({
      defaults: { per_user: 10, per_job: 20, global: 100 },
      global_usage: { used_today: 5, effective_limit: 100, limit_source: "default" },
      active_overrides: [],
    });
  });

  it("renderiza a página e as abas", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Health do Sistema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visão Geral" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Performance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IA / Limites" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filas" })).toBeInTheDocument();
    expect(screen.getByText("Status geral")).toBeInTheDocument();
  });

  it("mostra loading discreto enquanto carrega", () => {
    getOverviewMock.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Carregando status do sistema...")).toBeInTheDocument();
  });

  it("mostra erro quando o overview falha", async () => {
    getOverviewMock.mockRejectedValue(new Error("Falha ao consultar health"));

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Falha ao consultar health")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("carrega a aba de IA com link para a central e mantém limites/pricing", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await screen.findByText("Status geral");
    await user.click(screen.getByRole("button", { name: "IA / Limites" }));

    expect(await screen.findByText("Uso operacional centralizado")).toBeInTheDocument();
    expect(screen.getByText("Limites de IA")).toBeInTheDocument();
    expect(screen.getByText("Preços IA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver central de uso/i })).toBeInTheDocument();
  });

  it("renderiza a aba Performance com budgets por módulo", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await screen.findByText("Status geral");
    await user.click(screen.getByRole("button", { name: "Performance" }));

    expect(await screen.findByText("Performance geral")).toBeInTheDocument();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Vagas")).toBeInTheDocument();
    expect(screen.getByText("Pré-admissão")).toBeInTheDocument();
    expect(screen.getByText("RAG / Base de Conhecimento")).toBeInTheDocument();
    expect(screen.getByText("Uso de IA")).toBeInTheDocument();
  });

  it("expõe os budgets críticos de performance sem inventar métricas em tempo real", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await screen.findByText("Status geral");
    await user.click(screen.getByRole("button", { name: "Performance" }));

    expect(await screen.findByText("Ranking de vagas não deve carregar no load inicial.")).toBeInTheDocument();
    expect(screen.getByText("Movimento simples do Pipeline não deve recarregar board completo.")).toBeInTheDocument();
    expect(screen.getByText("Warning controlado: rag_vector_search_json_fallback_limited.")).toBeInTheDocument();
    expect(screen.getByText("Tempo real indisponível")).toBeInTheDocument();
    expect(screen.getAllByText("Budget definido").length).toBeGreaterThan(0);
  });

  it("não exibe campos internos sensíveis na aba Performance", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await screen.findByText("Status geral");
    await user.click(screen.getByRole("button", { name: "Performance" }));

    await screen.findByText("Performance geral");

    expect(screen.queryByText(/prompt bruto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/query bruta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vector_json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/embedding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/content_hash/i)).not.toBeInTheDocument();
  });

  it("permite navegar da aba Performance para IA / Limites sem quebrar a aba existente", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await screen.findByText("Status geral");
    await user.click(screen.getByRole("button", { name: "Performance" }));
    await user.click(await screen.findByRole("button", { name: /Ver limites e pricing de IA/i }));
    expect(await screen.findByText("Uso operacional centralizado")).toBeInTheDocument();
  });
});
