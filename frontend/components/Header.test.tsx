import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Header } from "./Header";

const getUnreadCount = jest.fn();
const findAll = jest.fn();
const markAllAsRead = jest.fn();
const markAsRead = jest.fn();
const flushOfflineQueue = jest.fn();
const getOfflineQueueCount = jest.fn().mockResolvedValue(0);
const toastError = jest.fn();

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      nome: "Maria Souza",
    },
  }),
}));

jest.mock("@/services/notificationsService", () => ({
  notificationsService: {
    getUnreadCount: (...args: unknown[]) => getUnreadCount(...args),
    findAll: (...args: unknown[]) => findAll(...args),
    markAllAsRead: (...args: unknown[]) => markAllAsRead(...args),
    markAsRead: (...args: unknown[]) => markAsRead(...args),
  },
  getRetryAfterMsFromError: jest.fn(() => null),
}));

jest.mock("@/lib/offline-sync", () => ({
  flushOfflineQueue: (...args: unknown[]) => flushOfflineQueue(...args),
  getOfflineQueueCount: (...args: unknown[]) => getOfflineQueueCount(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("Header", () => {
  beforeEach(() => {
    getUnreadCount.mockResolvedValue({ count: 0 });
    findAll.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    markAllAsRead.mockResolvedValue(undefined);
    markAsRead.mockResolvedValue(undefined);
    toastError.mockReset();
    jest.clearAllMocks();
    getOfflineQueueCount.mockResolvedValue(0);
  });

  it("exibe aviso honesto quando a lista de notificações degrada", async () => {
    findAll.mockRejectedValueOnce(
      new Error("Não foi possível carregar a lista de notificações agora."),
    );

    render(<Header />);

    fireEvent.click(screen.getByTitle("Notificações"));

    expect(
      await screen.findByText("Notificações com degradação parcial"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Não foi possível carregar a lista de notificações agora."),
    ).toBeInTheDocument();
  });

  it("mostra toast quando marcar todas como lidas falha", async () => {
    getUnreadCount.mockResolvedValue({ count: 2 });
    findAll.mockResolvedValue({
      items: [
        {
          id: "n1",
          type: "warning",
          title: "Pendência",
          message: "Há uma pendência operacional.",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    markAllAsRead.mockRejectedValueOnce(
      new Error("Não foi possível atualizar a notificação."),
    );

    render(<Header />);

    fireEvent.click(screen.getByTitle("Notificações"));

    await screen.findByText("Pendência");
    fireEvent.click(screen.getByText("Marcar todas como lidas"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Não foi possível atualizar a notificação.",
      );
    });
  });
});
