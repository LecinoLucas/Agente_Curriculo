import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleSignInButton } from "../GoogleSignInButton";
import { __resetGoogleIdentityForTests } from "../../../services/googleIdentityService";

function installGoogleMock() {
  const initializeMock = vi.fn();
  const renderButtonMock = vi.fn((element: HTMLElement) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Continuar com Google";
    element.appendChild(button);
  });

  window.google = {
    accounts: {
      id: {
        initialize: initializeMock,
        renderButton: renderButtonMock,
        prompt: vi.fn(),
      },
    },
  };

  return { initializeMock, renderButtonMock };
}

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    __resetGoogleIdentityForTests();
    delete window.google;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetGoogleIdentityForTests();
    delete window.google;
  });

  it("não chama initialize mais de uma vez para o mesmo clientId em re-renders", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    const { initializeMock, renderButtonMock } = installGoogleMock();

    const { rerender } = render(
      <GoogleSignInButton onCredential={() => {}} onError={() => {}} />,
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });
    expect(renderButtonMock).toHaveBeenCalledTimes(1);

    rerender(<GoogleSignInButton onCredential={() => {}} onError={() => {}} />);
    rerender(<GoogleSignInButton onCredential={() => {}} onError={() => {}} />);

    await waitFor(() => {
      expect(renderButtonMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    // initialize must remain called exactly once for the same clientId
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it("renderiza o botão quando há VITE_GOOGLE_CLIENT_ID", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    installGoogleMock();

    render(<GoogleSignInButton onCredential={() => {}} onError={() => {}} />);

    const button = await screen.findByRole("button", { name: /continuar com google/i });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("não quebra sem VITE_GOOGLE_CLIENT_ID e não inicializa GIS", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    const { initializeMock } = installGoogleMock();

    const onError = vi.fn();
    render(<GoogleSignInButton onCredential={() => {}} onError={onError} />);

    // botão não deve aparecer; mensagem opcional em DEV apenas
    expect(screen.queryByRole("button", { name: /continuar com google/i })).not.toBeInTheDocument();
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it("dispara onCredential quando GIS chama o callback registrado", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");

    let registeredCallback: ((response: { credential?: string }) => void) | null = null;
    const initializeMock = vi.fn((options: { callback: (r: { credential?: string }) => void }) => {
      registeredCallback = options.callback;
    });
    const renderButtonMock = vi.fn((element: HTMLElement) => {
      const button = document.createElement("button");
      button.type = "button";
      element.appendChild(button);
    });
    window.google = {
      accounts: {
        id: {
          initialize: initializeMock,
          renderButton: renderButtonMock,
          prompt: vi.fn(),
        },
      },
    };

    const onCredential = vi.fn();
    render(<GoogleSignInButton onCredential={onCredential} />);

    await waitFor(() => expect(initializeMock).toHaveBeenCalledTimes(1));

    // Simulate Google calling the registered callback
    registeredCallback?.({ credential: "fake-id-token" });

    expect(onCredential).toHaveBeenCalledWith("fake-id-token");
  });

  it("inclui origem atual e clientId mascarado quando o Google recusa a origin", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "123456789012-abcdefghi1234567.apps.googleusercontent.com");
    const onError = vi.fn();

    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(() => {
            throw new Error("The given origin is not allowed for the given client ID.");
          }),
          prompt: vi.fn(),
        },
      },
    };

    render(<GoogleSignInButton onCredential={() => {}} onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Origem atual: http://localhost:3000."));
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("123456789012...i1234567.apps.googleusercontent.com"));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Web application"));
  });
});
