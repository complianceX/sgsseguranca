"use client";

import {
  Bell,
  Command,
  Info,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  User,
  WifiOff,
  X,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { extractApiErrorMessage } from "@/lib/error-handler";
import { isAiEnabled } from "@/lib/featureFlags";
import { flushOfflineQueue, getOfflineQueueCount } from "@/lib/offline-sync";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useTheme } from "@/hooks/useTheme";

export function Header({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { user } = useAuth();
  const aiEnabled = isAiEnabled();
  const [showNotifications, setShowNotifications] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { notifications, unreadCount, markAllRead, markRead, refresh } =
    useRealtimeNotifications();
  const { isDark, toggle: toggleTheme } = useTheme();

  const handleOpen = useCallback(() => {
    setShowNotifications((prev) => {
      const next = !prev;
      if (next) {
        refresh();
      }
      return next;
    });
  }, [refresh]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);

  const userInitials = useMemo(() => {
    const raw = user?.nome?.trim();
    if (!raw) return "SGS";
    const parts = raw.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase()).join("");
  }, [user?.nome]);

  useEffect(() => {
    const updateCount = async () => {
      setOfflineQueueCount(await getOfflineQueueCount());
    };
    const onSyncStarted = () => setSyncingOfflineQueue(true);
    const onSyncCompleted = () => {
      setSyncingOfflineQueue(false);
      void updateCount();
    };

    void updateCount();
    window.addEventListener(
      "app:offline-queue-updated",
      updateCount as EventListener,
    );
    window.addEventListener(
      "app:offline-sync-started",
      onSyncStarted as EventListener,
    );
    window.addEventListener(
      "app:offline-sync-completed",
      onSyncCompleted as EventListener,
    );

    return () => {
      window.removeEventListener(
        "app:offline-queue-updated",
        updateCount as EventListener,
      );
      window.removeEventListener(
        "app:offline-sync-started",
        onSyncStarted as EventListener,
      );
      window.removeEventListener(
        "app:offline-sync-completed",
        onSyncCompleted as EventListener,
      );
    };
  }, []);

  useFocusTrap(panelRef, showNotifications, closeNotifications);

  const handleMarkAllAsRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllRead();
    } catch (error) {
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível marcar todas as notificações como lidas.",
        ),
      );
    } finally {
      setMarkingAll(false);
    }
  }, [markAllRead]);

  const handleMarkOne = useCallback(async (id: string) => {
    try {
      await markRead(id);
    } catch (error) {
      toast.error(
        await extractApiErrorMessage(
          error,
          "Não foi possível atualizar a notificação.",
        ),
      );
    }
  }, [markRead]);

  const getIcon = (type: string) => {
    switch (type) {
      case "warning":
        return (
          <AlertTriangle className="h-5 w-5 text-[var(--ds-color-warning)]" />
        );
      case "danger":
        return (
          <AlertTriangle className="h-5 w-5 text-[var(--ds-color-danger)]" />
        );
      case "success":
        return (
          <CheckCircle className="h-5 w-5 text-[var(--ds-color-success)]" />
        );
      default:
        return <Info className="h-5 w-5 text-[var(--ds-color-info)]" />;
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("app:command-palette-open"));
  };

  const openSophiePanel = () => {
    window.dispatchEvent(new CustomEvent("app:sophie-open"));
  };

  const showOfflineChip = syncingOfflineQueue || offlineQueueCount > 0;
  const iconButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--component-navbar-border)] bg-[var(--component-navbar-chip-bg)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)] transition-all hover:border-[var(--ds-color-border-strong)] hover:bg-[var(--component-navbar-chip-hover-bg)] hover:text-[var(--ds-color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] focus-visible:ring-offset-2";

  return (
    <header className="ds-topbar">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className={`${iconButtonClass} xl:hidden`}
            aria-label="Abrir navegação"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={openCommandPalette}
            className="ds-topbar-search hidden lg:flex"
            aria-label="Abrir command palette"
          >
            <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
            <span className="min-w-0 flex-1 text-left text-[13px] text-[var(--ds-color-text-muted)]">
              Pesquisar módulos, documentos ou ações...
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--ds-color-text-muted)]">
              <Command className="h-3 w-3" />
              Ctrl K
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="ds-topbar-chip lg:hidden"
            title="Abrir command palette"
          >
            <Command className="h-4 w-4 text-[var(--ds-color-info)]" />
            Buscar
          </button>

          {aiEnabled ? (
            <>
              <button
                type="button"
                onClick={openSophiePanel}
                className="hidden lg:flex ds-topbar-chip border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info-fg)] hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary-active)]"
                title="Abrir chat da SOPHIE"
              >
                <Sparkles className="h-4 w-4" />
                SOPHIE
              </button>
              <button
                type="button"
                onClick={openSophiePanel}
                className={`${iconButtonClass} lg:hidden`}
                title="Abrir chat da SOPHIE"
                aria-label="Abrir chat da SOPHIE"
              >
                <Sparkles className="h-4.5 w-4.5 text-[var(--ds-color-info)]" />
              </button>
            </>
          ) : null}

          {showOfflineChip ? (
            <button
              type="button"
              onClick={() => void flushOfflineQueue()}
              disabled={syncingOfflineQueue || offlineQueueCount === 0}
              className="ds-topbar-chip disabled:cursor-not-allowed disabled:opacity-60"
              title="Sincronizar itens salvos offline"
            >
              {syncingOfflineQueue ? (
                <RefreshCw className="h-4 w-4 animate-spin text-[var(--ds-color-warning)]" />
              ) : (
                <WifiOff className="h-4 w-4 text-[var(--ds-color-warning)]" />
              )}
              {syncingOfflineQueue
                ? "Sincronizando"
                : `${offlineQueueCount} offline`}
            </button>
          ) : null}

          <div className="relative">
            <button
              type="button"
              aria-label={unreadCount > 0 ? `Notificações — ${unreadCount} não lidas` : "Notificações"}
              aria-haspopup="dialog"
              onClick={handleOpen}
              aria-expanded={showNotifications}
              aria-controls="header-notifications-panel"
              className={`relative ${iconButtonClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] focus-visible:ring-offset-2`}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-white bg-[var(--ds-color-danger)] px-1 text-[10px] font-bold text-white shadow-[var(--ds-shadow-xs)]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>

            {showNotifications ? (
              <>
                <div
                  aria-hidden="true"
                  onClick={closeNotifications}
                  className="fixed inset-0 z-30"
                />
                <div
                  ref={panelRef}
                  id="header-notifications-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Notificações"
                  aria-describedby="notifications-desc"
                  tabIndex={-1}
                  className="absolute right-0 z-50 mt-3 w-[21.5rem] overflow-hidden rounded-[1.2rem] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-overlay)] shadow-[var(--ds-shadow-md)] animate-scale-in origin-top-right"
                >
                  <p id="notifications-desc" className="sr-only">
                    {unreadCount > 0
                      ? `${unreadCount} notificação${unreadCount > 1 ? "ões" : ""} não lida${unreadCount > 1 ? "s" : ""}`
                      : "Nenhuma notificação não lida"}
                  </p>

                  <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)] px-4 py-3.5">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        Notificações
                      </h3>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">
                        Eventos recentes da operação
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar notificações"
                      onClick={closeNotifications}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)]"
                    >
                      <X className="h-4 w-4 text-[var(--ds-color-text-muted)]" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          aria-label={`${notification.title}${!notification.read ? " — não lida" : ""}`}
                          onClick={() =>
                            !notification.read && handleMarkOne(notification.id)
                          }
                          className={`w-full border-b border-[var(--ds-color-border-subtle)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--ds-color-surface-muted)] focus-visible:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none ${
                            !notification.read
                              ? "border-l-[3px] border-l-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)]/78"
                              : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              {getIcon(notification.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p
                                  className={`truncate text-sm font-semibold ${notification.read ? "text-[var(--ds-color-text-secondary)]" : "text-[var(--ds-color-text-primary)]"}`}
                                >
                                  {notification.title}
                                </p>
                                {!notification.read ? (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-color-info)]" />
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-[var(--ds-color-text-muted)]">
                                {notification.message}
                              </p>
                              <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                                {formatDate(notification.createdAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-6 text-center">
                        <CheckCircle className="mx-auto h-12 w-12 text-[var(--ds-color-success)]" />
                        <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                          Nenhuma notificação no momento.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-[color:var(--ds-color-surface-muted)] px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      disabled={markingAll || unreadCount === 0}
                      className="text-xs font-semibold text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {markingAll ? "Marcando..." : "Marcar todas como lidas"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
            aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
            className={iconButtonClass}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            aria-label={user?.nome ? `Perfil de ${user.nome}` : "Perfil do usuário"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--ds-color-primary-border)] bg-[var(--ds-color-primary-subtle)] text-[13px] font-bold text-[var(--ds-color-action-primary-active)] shadow-[var(--ds-shadow-xs)] transition-colors hover:bg-[var(--ds-color-primary-subtle-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] focus-visible:ring-offset-2"
          >
            {userInitials || <User className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}
