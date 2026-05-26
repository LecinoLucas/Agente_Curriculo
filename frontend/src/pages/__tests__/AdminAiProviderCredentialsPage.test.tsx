import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAiProviderCredentialsPage } from "../AdminAiProviderCredentialsPage";
import type { AIProviderCredential } from "../../services/adminAiProviderCredentialsService";

const listMock = vi.fn();
const createMock = vi.fn();
const rotateMock = vi.fn();
const enableMock = vi.fn();
const disableMock = vi.fn();

vi.mock("../../services/adminAiProviderCredentialsService", () => ({
  adminAiProviderCredentialsService: {
    list: (params: unknown) => listMock(params),
    create: (payload: unknown) => createMock(payload),
    rotate: (id: string, apiKey: string) => rotateMock(id, apiKey),
    enable: (id: string) => enableMock(id),
    disable: (id: string) => disableMock(id),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const credentials: AIProviderCredential[] = [
  {
    id: "cred-1",
    provider: "google",
    model_id: "gemini-2.0-flash",
    label: "Gemini principal",
    masked_key: "****...ABCD",
    status: "active",
    priority: 100,
    cooldown_until: null,
    last_used_at: "2026-05-24T18:00:00Z",
    last_error_at: null,
    last_error_type: null,
    consecutive_rate_limit_count: 0,
    created_at: "2026-05-24T17:00:00Z",
    updated_at: "2026-05-24T17:00:00Z",
  },
  {
    id: "cred-2",
    provider: "anthropic",
    model_id: "claude-3-5-sonnet-latest",
    label: "Claude backup",
    masked_key: "****...WXYZ",
    status: "rate_limited",
    priority: 200,
    cooldown_until: "2026-05-24T19:00:00Z",
    last_used_at: null,
    last_error_at: "2026-05-24T18:30:00Z",
    last_error_type: "rate_limited",
    consecutive_rate_limit_count: 1,
    created_at: "2026-05-24T17:00:00Z",
    updated_at: "2026-05-24T18:30:00Z",
  },
];

describe("AdminAiProviderCredentialsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
    rotateMock.mockReset();
    enableMock.mockReset();
    disableMock.mockReset();

    listMock.mockResolvedValue(credentials);
    createMock.mockResolvedValue(credentials[0]);
    rotateMock.mockResolvedValue(credentials[0]);
    enableMock.mockResolvedValue(credentials[0]);
    disableMock.mockResolvedValue(credentials[0]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("lista credenciais mascaradas e status operacional", async () => {
    render(<AdminAiProviderCredentialsPage />);

    expect(await screen.findByText("Gemini principal")).toBeInTheDocument();
    expect(screen.getByText("****...ABCD")).toBeInTheDocument();
    expect(screen.getByText("Claude backup")).toBeInTheDocument();
    expect(screen.getAllByText("Em cooldown").length).toBeGreaterThan(0);
    expect(screen.queryByText("secret-key")).not.toBeInTheDocument();
  });

  it("cadastra chave usando input password e limpa o segredo depois do submit", async () => {
    const user = userEvent.setup();
    render(<AdminAiProviderCredentialsPage />);

    await screen.findByText("Gemini principal");
    await user.click(screen.getByRole("button", { name: "Adicionar chave" }));

    const apiKeyInput = screen.getByLabelText("API key");
    expect(apiKeyInput).toHaveAttribute("type", "password");

    await user.clear(screen.getByLabelText("Label"));
    await user.type(screen.getByLabelText("Label"), "Gemini nova");
    await user.type(apiKeyInput, "raw-secret-key");
    await user.click(screen.getByRole("button", { name: "Salvar credencial" }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        provider: "google",
        model_id: null,
        label: "Gemini nova",
        api_key: "raw-secret-key",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("raw-secret-key")).not.toBeInTheDocument();
    });
  });

  it("rotaciona chave existente sem exibir a nova chave", async () => {
    const user = userEvent.setup();
    render(<AdminAiProviderCredentialsPage />);

    await screen.findByText("Gemini principal");
    await user.click(screen.getAllByRole("button", { name: "Rotacionar" })[0]);

    const rotateInput = screen.getByLabelText("Nova API key");
    expect(rotateInput).toHaveAttribute("type", "password");

    await user.type(rotateInput, "new-raw-secret-key");
    await user.click(screen.getByRole("button", { name: "Rotacionar chave" }));

    await waitFor(() => {
      expect(rotateMock).toHaveBeenCalledWith("cred-1", "new-raw-secret-key");
    });
    expect(screen.queryByText("new-raw-secret-key")).not.toBeInTheDocument();
  });

  it("pede confirmação antes de desativar credencial", async () => {
    const user = userEvent.setup();
    render(<AdminAiProviderCredentialsPage />);

    await screen.findByText("Gemini principal");
    await user.click(screen.getAllByRole("button", { name: "Desativar" })[0]);

    expect(window.confirm).toHaveBeenCalledWith(
      'Desativar a credencial "Gemini principal"? O provider deixará de usar esta chave.',
    );
    await waitFor(() => {
      expect(disableMock).toHaveBeenCalledWith("cred-1");
    });
  });

  it("não renderiza chave em erro de criação retornado pela API", async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce(new Error("raw-secret-key"));

    render(<AdminAiProviderCredentialsPage />);

    await screen.findByText("Gemini principal");
    await user.click(screen.getByRole("button", { name: "Adicionar chave" }));
    await user.type(screen.getByLabelText("Label"), "Gemini com erro");
    await user.type(screen.getByLabelText("API key"), "raw-secret-key");
    await user.click(screen.getByRole("button", { name: "Salvar credencial" }));

    expect(await screen.findByText("Não foi possível cadastrar a credencial.")).toBeInTheDocument();
    expect(screen.queryByText("raw-secret-key")).not.toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });
});
