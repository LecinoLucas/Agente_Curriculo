import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { AdminPage } from "../AdminPage";

const statsMock = vi.fn();
const getStatusMock = vi.fn();

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
    getStatus: () => getStatusMock(),
  },
}));

const aiStatusPayload = {
  ok: true,
  environment: "development",
  assistant: {
    enabled: true,
    read_only: true,
    free_text_enabled: false,
  },
  rag: {
    embedding_provider: "gemini",
    gemini_embedding_enabled: true,
    embedding_model: "text-embedding-004",
    synthesis_enabled: false,
    synthesis_provider: "gemini",
    synthesis_model: "gemini-2.5-flash",
    vector_storage_mode: "json_fallback",
    pgvector_available: false,
  },
  providers: {
    provider: "google",
    model: "gemini-2.5-flash",
    gemini_api_key_configured: true,
  },
  protheus: {
    real_send_enabled: false,
    erp_allow_real_send: false,
  },
  warnings: [],
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
    getStatusMock.mockReset();
    getStatusMock.mockResolvedValue(aiStatusPayload);
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
    expect(screen.getAllByText("Base de conhecimento")[0]).toBeInTheDocument();
    expect(screen.getByText("Gerenciar conhecimento")).toBeInTheDocument();
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

  it("possui aba IA com governança e atalho para a central única", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));

    expect(await screen.findByText("Governança de IA")).toBeInTheDocument();
    expect(screen.getByText("Resumo executivo")).toBeInTheDocument();
    expect(screen.getByText("Gemini configurado")).toBeInTheDocument();
    expect(screen.getAllByText("RAG synthesis").length).toBeGreaterThan(0);
    expect(screen.getByText("Embeddings")).toBeInTheDocument();
    expect(screen.getAllByText("Assistant read-only").length).toBeGreaterThan(0);
    expect(screen.getByText("Protheus real")).toBeInTheDocument();
    expect(screen.getByText("Uso operacional e custos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir central de uso de IA/i })).toBeInTheDocument();
    expect(screen.getByText("Configuração ativa")).toBeInTheDocument();
    expect(screen.getByText("Observabilidade operacional")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Laboratório IA/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Credenciais IA/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Health do Sistema/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Auditoria/i })).toBeInTheDocument();
    expect(screen.getByText(/Synthesis RAG desligado/i)).toBeInTheDocument();
    expect(getStatusMock).toHaveBeenCalled();
  });

  it("não renderiza chave, prompt, resposta bruta ou metadados sensíveis na aba IA", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));
    await screen.findByText("Governança de IA");

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("GEMINI_API_KEY");
    expect(text).not.toContain("GOOGLE_API_KEY");
    expect(text).not.toContain("AIza");
    expect(text).not.toContain("prompt bruto");
    expect(text).not.toContain("resposta completa");
    expect(text).not.toContain("content_hash");
    expect(text).not.toContain("vector_json");
    expect(text).not.toContain("payload_json");
    expect(text).not.toContain("\"embedding\":");
  });

  it("mostra loading e erro amigável na aba IA", async () => {
    getStatusMock.mockRejectedValue(new Error("network"));

    render(
      <MemoryRouter future={routerFuture}>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "IA" }));

    expect(screen.getByText("Carregando governança de IA...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("network")).toBeInTheDocument();
    });
  });
});
