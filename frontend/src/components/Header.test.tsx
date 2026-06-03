import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import type { AppNotification } from "@/services/notificationsService";
import { Header } from "./Header";

const markAllReadMock = jest.fn(async () => undefined);
const markReadMock = jest.fn(async () => undefined);
const refreshMock = jest.fn();
const flushOfflineQueue = jest.fn();
const getOfflineQueueCount = jest.fn(async () => 0);
const toastError = jest.fn();
const toggleThemeMock = jest.fn();

type RealtimeState = {
  notifications: AppNotification[];
  unreadCount: number;
};

let realtimeState: RealtimeState = {
  notifications: [],
  unreadCount: 0,
};

const useRealtimeNotificationsMock = jest.fn(() => ({
  notifications: realtimeState.notifications,
  unreadCount: realtimeState.unreadCount,
  markAllRead: markAllReadMock,
  markRead: markReadMock,
  refresh: refreshMock,
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      nome: "Maria Souza",
    },
  }),
}));

jest.mock("@/hooks/useRealtimeNotifications", () => ({
  useRealtimeNotifications: () => useRealtimeNotificationsMock(),
}));

jest.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "light",
    isDark: false,
    toggle: toggleThemeMock,
    setTheme: jest.fn(),
  }),
}));

jest.mock("@/lib/featureFlags", () => ({
  isAiEnabled: jest.fn(() => false),
}));

jest.mock("@/lib/offline-sync", () => ({
  flushOfflineQueue: () => flushOfflineQueue(),
  getOfflineQueueCount: () => getOfflineQueueCount(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("Header", () => {
  beforeEach(() => {
    realtimeState = {
      notifications: [],
      unreadCount: 0,
    };

    markAllReadMock.mockReset().mockResolvedValue(undefined);
    markReadMock.mockReset().mockResolvedValue(undefined);
    refreshMock.mockReset();
    flushOfflineQueue.mockReset();
    getOfflineQueueCount.mockReset().mockResolvedValue(0);
    toastError.mockReset();
    toggleThemeMock.mockReset();
    useRealtimeNotificationsMock.mockClear();
  });

  it("exibe aviso honesto quando a lista de notificações degrada", async () => {
    realtimeState = {
      unreadCount: 1,
      notifications: [
        {
          id: "degraded-1",
          type: "warning",
          title: "Notificações com degradação parcial",
          message: "Não foi possível carregar a lista de notificações agora.",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: /Notificações/i }));

    // O comportamento mudou: o aviso de degradação é exibido como item da lista.
    expect(
      await screen.findByText("Notificações com degradação parcial"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Não foi possível carregar a lista de notificações agora."),
    ).toBeInTheDocument();
  });

  it("mostra toast quando marcar todas como lidas falha", async () => {
    realtimeState = {
      unreadCount: 1,
      notifications: [
        {
          id: "n1",
          type: "warning",
          title: "Pendência",
          message: "Há uma pendência operacional.",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    markAllReadMock.mockRejectedValueOnce(
      new Error("Não foi possível atualizar a notificação."),
    );

    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: /Notificações/i }));

    await screen.findByText("Pendência");

    const markAllButton = screen.getByRole("button", {
      name: /Marcar todas como lidas/i,
    });

    await waitFor(() => expect(markAllButton).not.toBeDisabled());
    fireEvent.click(markAllButton);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Não foi possível atualizar a notificação.",
      );
    });
  });

  it("markAllRead não causa re-render do Header quando chamado", async () => {
    realtimeState = {
      unreadCount: 1,
      notifications: [
        {
          id: "n2",
          type: "info",
          title: "Nova atualização",
          message: "Há uma nova atualização disponível.",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    let renderCount = 0;

    function HeaderWithRenderCounter() {
      const rendersRef = useRef(0);
      rendersRef.current += 1;
      renderCount = rendersRef.current;
      return <Header />;
    }

    const { rerender } = render(<HeaderWithRenderCounter />);

    expect(renderCount).toBe(1);
    expect(
      screen.getByRole("button", { name: "Notificações — 1 não lidas" }),
    ).toBeInTheDocument();

    const firstHookResult = useRealtimeNotificationsMock.mock.results[0]?.value;

    await act(async () => {
      await firstHookResult.markAllRead();
    });

    expect(renderCount).toBe(1);

    realtimeState = {
      unreadCount: 0,
      notifications: realtimeState.notifications.map((item) => ({
        ...item,
        read: true,
      })),
    };

    rerender(<HeaderWithRenderCounter />);

    expect(renderCount).toBe(2);
    expect(
      screen.getByRole("button", { name: "Notificações" }),
    ).toBeInTheDocument();
    expect(firstHookResult.markAllRead).toBe(markAllReadMock);
    expect(useRealtimeNotificationsMock.mock.results[1]?.value.markAllRead).toBe(
      markAllReadMock,
    );
  });
});
