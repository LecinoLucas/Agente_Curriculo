import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NotificationsProvider } from "../NotificationsContext";
import { useNotifications } from "../useNotifications";
import { notificationStorage } from "../notificationStorage";

function TestComponent() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    addNotification,
  } = useNotifications();

  return (
    <div>
      <div data-testid="unread-count">{unreadCount}</div>
      <div data-testid="total-count">{notifications.length}</div>
      <button
        onClick={() => notifications[0] && markAsRead(notifications[0].id)}
        data-testid="btn-mark-read"
      >
        Mark First Read
      </button>
      <button onClick={markAllAsRead} data-testid="btn-mark-all-read">
        Mark All Read
      </button>
      <button onClick={clearAll} data-testid="btn-clear-all">
        Clear All
      </button>
      <button
        onClick={() =>
          addNotification({
            title: "Test Alert",
            description: "Test description",
            type: "info",
            category: "system",
          })
        }
        data-testid="btn-add"
      >
        Add Notification
      </button>
    </div>
  );
}

describe("NotificationsContext", () => {
  beforeEach(() => {
    notificationStorage.clear();
  });

  it("inicializa com as notificações padrão de desenvolvimento nos testes", () => {
    render(
      <NotificationsProvider>
        <TestComponent />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("total-count").textContent).toBe("5");
    expect(screen.getByTestId("unread-count").textContent).toBe("4");
  });

  it("permite marcar uma notificação como lida", () => {
    render(
      <NotificationsProvider>
        <TestComponent />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("unread-count").textContent).toBe("4");

    act(() => {
      screen.getByTestId("btn-mark-read").click();
    });

    expect(screen.getByTestId("unread-count").textContent).toBe("3");
  });

  it("permite marcar todas as notificações como lidas", () => {
    render(
      <NotificationsProvider>
        <TestComponent />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("unread-count").textContent).toBe("4");

    act(() => {
      screen.getByTestId("btn-mark-all-read").click();
    });

    expect(screen.getByTestId("unread-count").textContent).toBe("0");
  });

  it("permite limpar todas as notificações", () => {
    render(
      <NotificationsProvider>
        <TestComponent />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("total-count").textContent).toBe("5");

    act(() => {
      screen.getByTestId("btn-clear-all").click();
    });

    expect(screen.getByTestId("total-count").textContent).toBe("0");
    expect(screen.getByTestId("unread-count").textContent).toBe("0");
  });

  it("permite adicionar uma nova notificação", () => {
    render(
      <NotificationsProvider>
        <TestComponent />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("total-count").textContent).toBe("5");

    act(() => {
      screen.getByTestId("btn-add").click();
    });

    expect(screen.getByTestId("total-count").textContent).toBe("6");
    expect(screen.getByTestId("unread-count").textContent).toBe("5");
  });
});
