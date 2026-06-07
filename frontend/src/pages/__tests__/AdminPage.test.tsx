import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { AdminPage } from "../AdminPage";

const statsMock = vi.fn();
const getUsageSummaryMock = vi.fn();

vi.mock("../SystemHealthPage", () => ({
  SystemHealthPage: () => <div>Status geral</div>,
}));

vi.mock("../../services/usersService", () => ({
  usersService: {
    stats: () => statsMock(),
  },
}));

vi.mock("../../features/ai-settings/services/aiSettingsService", () => ({
  aiSettingsService: {
    getUsageSummary: (...args: unknown[]) => getUsageSummaryMock(...args),
  },
}));

const aiUsagePayload = {
  ok: true,
  period: "today",
  status: {
    assistant_enabled: true,
    free_text_enabled: false,
    rag_synthesis_enabled: false,
    gemini_embedding_enabled: false,
    protheus_real_send_enabled: false,
    gemini_api_key_configured: true,
  },
  totals: {
    requests: 12,
    input_tokens: 10000,
    output_tokens: 2000,
    total_tokens: 12000,
    errors: 1,
  },
  by_feature: [
    {
      feature: "rag_synthesis",
      requests: 7,
      total_tokens: 4000,
      errors: 1,
    },
    {
      feature: "job_ai_draft",
      requests: 5,
      total_tokens: 8000,
      errors: 0,
    },
  ],
  recent: [
    {
      created_at: "2026-06-07T14:22:00Z",
      feature: "rag_synthesis",
      provider: "gemini",
      model: "gemini-2.5-flash",
      total_tokens: 900,
      status: "success",
    },
  ],
  warnings: ["rag_synthesis_disabled"],
};

describe("AdminPage", () => {
  beforeEach(() => {
    statsMock.mockReset();
    statsMock.mockResolvedValue({
      total_users: 12,
      active_users: 10,
      inactive_users: 1,
      suspended_users: 1,
      pending_users: 0,
      admins: 2,
      recruiters: 5,
      viewers: 3,
      candidates: 2,
    });
    getUsageSummaryMock.mockReset();
    getUsageSummaryMock.mockResolvedValue(aiUsagePayload);
  });

  it("exibe cards admin e o diagnóstico candidato/vaga ao alternar as abas", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    // Aba Geral (inicialmente ativa)
    expect((await screen.findAllByText("Auditoria"))[0]).toBeInTheDocument();
    expect(screen.getByText("Ver auditoria")).toBeInTheDocument();
    expect(screen.getAllByText("Health do Sistema")[0]).toBeInTheDocument();
    expect(screen.getByText("Ver health")).toBeInTheDocument();
    expect(screen.getByText("BI de Recrutamento")).toBeInTheDocument();
    expect(screen.getByText("Ver BI")).toBeInTheDocument();
    expect(screen.getAllByText("Laboratório IA")[0]).toBeInTheDocument();
    expect(screen.getByText("Abrir Laboratório")).toBeInTheDocument();
    expect(screen.getAllByText("Importação por formulário")[0]).toBeInTheDocument();
    expect(screen.getByText("Abrir importação")).toBeInTheDocument();

    // Diagnóstico não deve estar no DOM ainda
    expect(screen.queryByText("Diagnóstico Candidato/Vaga")).not.toBeInTheDocument();

    // Clicar na aba de Diagnóstico Operacional
    const diagTabButton = screen.getByRole("button", { name: "Diagnóstico Operacional" });
    fireEvent.click(diagTabButton);

    // Diagnóstico agora deve estar visível
    expect(screen.getByText("Diagnóstico Candidato/Vaga")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnosticar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reparar" })).toBeInTheDocument();
  });

  it("alterna para a aba Health do Sistema de forma lazy", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    // Inicialmente, as informações internas de status detalhado de Health (como chaves Gemini em cooldown, latência etc.) não devem estar no DOM
    expect(screen.queryByText("Status geral")).not.toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();

    // Clicar na aba de Health do Sistema
    const healthTabButton = screen.getByRole("button", { name: "Health do Sistema" });
    fireEvent.click(healthTabButton);

    // Agora que foi montado, o conteúdo da aba deve aparecer sem acionar chamadas assíncronas do health real.
    expect(screen.getByText("Status geral")).toBeInTheDocument();
  });

  it("possui aba IA e mostra status, consumo, features, recentes e atalhos", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));

    expect(await screen.findByText("Status da IA")).toBeInTheDocument();
    expect(screen.getByText("Consumo hoje")).toBeInTheDocument();
    expect(screen.getByText("Gemini configurado")).toBeInTheDocument();
    expect(screen.getByText("RAG synthesis")).toBeInTheDocument();
    expect(screen.getByText("RAG embedding Gemini")).toBeInTheDocument();
    expect(screen.getByText("Assistant read-only")).toBeInTheDocument();
    expect(screen.getByText("Protheus real")).toBeInTheDocument();
    expect(screen.getByText("12.000")).toBeInTheDocument();
    expect(screen.getAllByText("rag_synthesis").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("job_ai_draft")).toBeInTheDocument();
    expect(screen.getByText("gemini/gemini-2.5-flash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir Laboratório IA/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Credenciais IA/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Health do sistema/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("rag_synthesis_disabled")).toBeInTheDocument();
    expect(getUsageSummaryMock).toHaveBeenCalledWith("today");
  });

  it("não renderiza chave, prompt, resposta bruta ou metadados sensíveis na aba IA", async () => {
    getUsageSummaryMock.mockResolvedValue({
      ...aiUsagePayload,
      warnings: [],
    });

    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));
    await screen.findByText("Status da IA");

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("GEMINI_API_KEY");
    expect(text).not.toContain("GOOGLE_API_KEY");
    expect(text).not.toContain("AIza");
    expect(text).not.toContain("prompt bruto");
    expect(text).not.toContain("resposta completa");
    expect(text).not.toContain("content_hash");
    expect(text).not.toContain("vector_json");
    expect(text).not.toContain("payload_json");
    expect(text).not.toContain("embeddings");
  });

  it("mostra loading e erro amigável na aba IA", async () => {
    getUsageSummaryMock.mockRejectedValue(new Error("network"));

    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));

    expect(screen.getByText("Carregando métricas de IA...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Não foi possível carregar as métricas de IA agora.")).toBeInTheDocument();
    });
  });
});
