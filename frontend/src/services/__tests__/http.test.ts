import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "../http";

describe("resolveApiBaseUrl", () => {
  it("alinha o host da API ao host atual no dev local", () => {
    expect(
      resolveApiBaseUrl("http://192.168.1.219:8000", "127.0.0.1", true)
    ).toBe("http://127.0.0.1:8000");
  });

  it("preserva o host configurado fora do dev", () => {
    expect(
      resolveApiBaseUrl("http://192.168.1.219:8000", "127.0.0.1", false)
    ).toBe("http://192.168.1.219:8000");
  });

  it("preserva hosts públicos", () => {
    expect(
      resolveApiBaseUrl("https://api.example.com", "127.0.0.1", true)
    ).toBe("https://api.example.com");
  });

  it("permite acesso por localhost sem trocar a porta", () => {
    expect(
      resolveApiBaseUrl("http://192.168.1.219:9000", "localhost", true)
    ).toBe("http://localhost:9000");
  });

  it("usa a mesma origin do app local no dev para aproveitar o proxy do Vite", () => {
    expect(
      resolveApiBaseUrl("http://localhost:8000", "localhost", true, "http://127.0.0.1:5173")
    ).toBe("http://127.0.0.1:5173");
  });
});
