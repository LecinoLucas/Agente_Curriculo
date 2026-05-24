import { describe, expect, it, vi } from "vitest";

import { adminAiProviderCredentialsService } from "../adminAiProviderCredentialsService";

const httpRequestMock = vi.fn();

vi.mock("../http", () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}));

describe("adminAiProviderCredentialsService", () => {
  it("lista credenciais com filtros opcionais", async () => {
    httpRequestMock.mockResolvedValue([]);

    await adminAiProviderCredentialsService.list({
      provider: "google",
      model_id: "gemini-2.0-flash",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/ai-provider-credentials?provider=google&model_id=gemini-2.0-flash",
    );
  });

  it("cadastra credencial sem persistir chave fora do payload da requisição", async () => {
    httpRequestMock.mockResolvedValue({});

    await adminAiProviderCredentialsService.create({
      provider: "anthropic",
      model_id: null,
      label: "Claude principal",
      api_key: "secret-key",
    });

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/ai-provider-credentials", {
      method: "POST",
      body: {
        provider: "anthropic",
        model_id: null,
        label: "Claude principal",
        api_key: "secret-key",
      },
    });
  });

  it("rotaciona credencial pelo endpoint seguro", async () => {
    httpRequestMock.mockResolvedValue({});

    await adminAiProviderCredentialsService.rotate("cred-1", "new-secret-key");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/ai-provider-credentials/cred-1/rotate",
      {
        method: "PATCH",
        body: { api_key: "new-secret-key" },
      },
    );
  });
});
