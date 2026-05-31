import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { AuthContext } from "../../auth/AuthContext";
import { HttpError } from "../../../services/http";
import { AuthUser, UserRole } from "../../../types/auth";
import { tokenStorage } from "../../../utils/storage";
import { NotificationsProvider } from "../NotificationsContext";
import { notificationService } from "../notificationService";
import { notificationStorage } from "../notificationStorage";
import { useNotifications } from "../useNotifications";

vi.mock("../notificationService", () => ({
  notificationService: {
    getNotifications: vi.fn(),
  },
}));

function TestComponent() {
  const { notifications, unreadCount } = useNotifications();

  return (
    <div>
      <div data-testid="unread-count">{unreadCount}</div>
      <div data-testid="total-count">{notifications.length}</div>
    </div>
  );
}

function makeUser(role: UserRole): AuthUser {
  return {
    id: `${role}-1`,
    email: `${role}@example.com`,
    full_name: `${role} User`,
    role,
    status: "active",
    real_ai_token_spend_enabled: true,
    must_change_password: false,
    last_login_at: null,
    created_at: null,
  };
}

function renderProvider({
  role,
  route = "/rh",
  token = "access-token",
}: {
  role?: UserRole;
  route?: string;
  token?: string | null;
}) {
  if (token) {
    tokenStorage.set(token);
  }

  const user = role ? makeUser(role) : null;

  return render(
    <MemoryRouter future={routerFuture} initialEntries={[route]}>
      <AuthContext.Provider
        value={{
          user,
          isAuthenticated: Boolean(user),
          isLoading: false,
          login: vi.fn(),
          logout: vi.fn(),
          refreshUser: vi.fn(),
          updateUser: vi.fn(),
        }}
      >
        <NotificationsProvider>
          <TestComponent />
        </NotificationsProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("NotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("não chama notificationService quando o usuário não está autenticado", async () => {
    renderProvider({ route: "/candidato", token: null });

    await waitFor(() => {
      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("total-count")).toHaveTextContent("0");
  });

  it("não chama notificationService para role candidate", async () => {
    renderProvider({ role: "candidate", route: "/candidato/portal" });

    await waitFor(() => {
      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("total-count")).toHaveTextContent("0");
  });

  it.each(["admin", "recruiter"] as UserRole[])(
    "chama notificationService para %s autenticado",
    async (role) => {
      vi.mocked(notificationService.getNotifications).mockResolvedValue([
        {
          id: "backend-1",
          title: "Alerta interno",
          description: "Notificação administrativa",
          type: "info",
          category: "system",
          timestamp: "2026-05-17T12:00:00.000Z",
        },
      ]);

      renderProvider({ role, route: "/rh" });

      await waitFor(() => {
        expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByTestId("total-count")).toHaveTextContent("1");
      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
    },
  );

  it("para o polling depois de 401 em notificações", async () => {
    vi.useFakeTimers();
    vi.mocked(notificationService.getNotifications).mockRejectedValue(
      new HttpError(401, "Não autorizado"),
    );

    renderProvider({ role: "admin", route: "/rh" });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("total-count")).toHaveTextContent("0");
  });

  it("limpa notificações quando a busca falha", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(notificationService.getNotifications).mockRejectedValue(
      new HttpError(500, "Erro interno"),
    );

    renderProvider({ role: "admin", route: "/rh" });

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("total-count")).toHaveTextContent("0");
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[NotificationsContext] Failed to fetch notifications",
      expect.any(HttpError),
    );

    consoleError.mockRestore();
  });
});
