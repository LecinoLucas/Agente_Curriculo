import { beforeEach, describe, expect, it, vi } from "vitest";

import { authService } from "../authService";
import { candidateAuthService } from "../candidateAuthService";
import { httpRequest } from "../http";

vi.mock("../http", () => ({
  httpRequest: vi.fn(),
}));

describe("Google auth endpoints", () => {
  beforeEach(() => {
    vi.mocked(httpRequest).mockReset();
    vi.mocked(httpRequest).mockResolvedValue({} as never);
  });

  it("staff login usa o endpoint restrito de auth", async () => {
    await authService.loginWithGoogle("staff-token");

    expect(httpRequest).toHaveBeenCalledWith("/api/v1/auth/google", {
      method: "POST",
      body: { id_token: "staff-token" },
      withAuth: false,
    });
  });

  it("login Google do candidato usa o endpoint público", async () => {
    await candidateAuthService.googleLogin({ id_token: "candidate-token" });

    expect(httpRequest).toHaveBeenCalledWith("/api/v1/public/candidate-auth/google", {
      method: "POST",
      withAuth: false,
      body: { id_token: "candidate-token" },
    });
  });
});
