'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Search,
  User,
  X,
  AlertTriangle,
  Info,
  CheckCircle,
  CalendarDays,
  Command,
  FilePlus2,
  ShieldCheck,
  WifiOff,
  RefreshCw,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApiStatus } from '@/hooks/useApiStatus';
import { useApiReconnect } from '@/hooks/useApiReconnect';
import { notificationsService, AppNotification } from '@/services/notificationsService';
import { flushOfflineQueue, getOfflineQueueCount } from '@/lib/offline-sync';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { ThemeToggle } from './ThemeToggle';

const POLL_INTERVAL_MS = 30_000;

export function Header({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: () => void;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { isOffline, apiBaseUrl } = useApiStatus();
  const { isReconnecting, reconnect } = useApiReconnect(apiBaseUrl);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() => selectedTenantStore.get());

  const handleOpen = () => setShowNotifications((v) => !v);
  const popoverRef = useRef<HTMLDivElement>(null);

  const userInitials = useMemo(() => {
    const raw = user?.nome?.trim();
    if (!raw) return 'GST';
    const parts = raw.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase()).join('');
  }, [user?.nome]);

  const currentDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date()),
    [],
  );

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await notificationsService.getUnreadCount();
      setUnreadCount(res.count);
    } catch {
      // silencioso
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsService.findAll(1, 20);
      setNotifications(res.items);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  useEffect(() => {
    const unsub = selectedTenantStore.subscribe((tenant) => setSelectedTenant(tenant));
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const updateCount = () => setOfflineQueueCount(getOfflineQueueCount());
    const onSyncStarted = () => setSyncingOfflineQueue(true);
    const onSyncCompleted = () => {
      setSyncingOfflineQueue(false);
      updateCount();
    };

    updateCount();
    window.addEventListener('app:offline-queue-updated', updateCount as EventListener);
    window.addEventListener('app:offline-sync-started', onSyncStarted as EventListener);
    window.addEventListener('app:offline-sync-completed', onSyncCompleted as EventListener);

    return () => {
      window.removeEventListener('app:offline-queue-updated', updateCount as EventListener);
      window.removeEventListener('app:offline-sync-started', onSyncStarted as EventListener);
      window.removeEventListener('app:offline-sync-completed', onSyncCompleted as EventListener);
    };
  }, []);

  useEffect(() => {
    if (showNotifications) loadNotifications();
  }, [showNotifications, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkOne = async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      // silencioso
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-[var(--ds-color-warning)]" />;
      case 'danger':
        return <AlertTriangle className="h-5 w-5 text-[var(--ds-color-danger)]" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-[var(--ds-color-success)]" />;
      default:
        return <Info className="h-5 w-5 text-[var(--ds-color-info)]" />;
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('app:command-palette-open'));
  };

  return (
    <header className="ds-topbar">
      <div className="flex flex-1 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            type="button"
            onClick={openCommandPalette}
            className="ds-topbar-search hidden lg:flex"
            aria-label="Abrir command palette"
          >
            <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
            <span className="min-w-0 flex-1 text-left text-[13px] text-[var(--ds-color-text-muted)]">
              Pesquisar módulos, documentos, colaboradores ou ações...
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/72 px-2 py-1 text-[10px] font-semibold text-[var(--ds-color-text-muted)]">
              <Command className="h-3 w-3" />
              Ctrl K
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenMobileNav}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/74 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/80 hover:text-[var(--ds-color-text-primary)] xl:hidden"
            aria-label="Abrir navegação"
            title="Abrir navegação"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden min-w-0 items-center gap-3 xl:flex">
            <div className="ds-topbar-chip">
              <CalendarDays className="h-4 w-4 text-[var(--ds-color-info)]" />
              {currentDateLabel}
            </div>
            <div className="ds-topbar-chip">
              <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
              {selectedTenant?.companyName || user?.company?.razao_social || 'Tenant não selecionado'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full items-center gap-2 xl:hidden">
            <div className="ds-topbar-chip min-w-0 flex-1 justify-center">
              <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
              <span className="truncate">
                {selectedTenant?.companyName || user?.company?.razao_social || 'Tenant não selecionado'}
              </span>
            </div>
            <div className="ds-topbar-chip">
              <CalendarDays className="h-4 w-4 text-[var(--ds-color-info)]" />
              {currentDateLabel}
            </div>
          </div>

          <div className="ds-topbar-mobile-context xl:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Contexto ativo
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--ds-color-text-primary)]">
              {pathname === '/dashboard'
                ? 'Cockpit operacional'
                : pathname.replace('/dashboard/', '').replaceAll('-', ' ')}
            </p>
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            className="ds-topbar-chip xl:hidden"
            title="Abrir command palette"
          >
            <Command className="h-4 w-4 text-[var(--ds-color-info)]" />
            Busca rápida
          </button>

          <div className="hidden items-center gap-2 2xl:flex">
            <Link href="/dashboard/aprs/new" className="ds-topbar-action">
              <FilePlus2 className="h-4 w-4" />
              Nova APR
            </Link>
            <Link href="/dashboard/pts/new" className="ds-topbar-action ds-topbar-action--secondary">
              <FilePlus2 className="h-4 w-4" />
              Nova PT
            </Link>
          </div>

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
              <WifiOff className={`h-4 w-4 ${offlineQueueCount > 0 ? 'text-[var(--ds-color-warning)]' : 'text-[var(--ds-color-text-muted)]'}`} />
            )}
            {syncingOfflineQueue ? 'Sincronizando' : `Offline: ${offlineQueueCount}`}
          </button>

          <div
            className={`ds-topbar-chip ${
              isOffline
                ? 'border-[color:var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]'
                : 'border-[color:var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
            }`}
            title={isOffline ? `API offline${apiBaseUrl ? ` (${apiBaseUrl})` : ''}` : 'API online'}
          >
            <span className={`h-2 w-2 rounded-full ${isOffline ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-success)]'}`} />
            {isOffline ? 'API offline' : 'API online'}
          </div>

          {isOffline && (
            <button
              type="button"
              onClick={reconnect}
              disabled={isReconnecting}
              className="ds-topbar-chip disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isReconnecting ? 'animate-spin' : ''}`} />
              {isReconnecting ? 'Reconectando' : 'Reconectar'}
            </button>
          )}

          <ThemeToggle />

          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              title="Notificações"
              onClick={handleOpen}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/74 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/80 hover:text-[var(--ds-color-text-primary)]"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ds-color-danger)] text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 z-50 mt-3 w-[20.5rem] overflow-hidden rounded-[1.4rem] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)] shadow-[var(--ds-shadow-lg)]">
                <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-4 py-3.5">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">Notificações</h3>
                    <p className="text-xs text-[var(--ds-color-text-muted)]">Eventos recentes da operação SST</p>
                  </div>
                  <button type="button" title="Fechar" onClick={() => setShowNotifications(false)}>
                    <X className="h-4 w-4 text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-primary)]" />
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => !notification.read && handleMarkOne(notification.id)}
                        className={`w-full border-b border-[var(--ds-color-border-subtle)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/40 ${
                          !notification.read ? 'bg-[var(--ds-color-action-primary)]/8' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">{getIcon(notification.type)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={`truncate text-sm font-semibold ${notification.read ? 'text-[var(--ds-color-text-secondary)]' : 'text-[var(--ds-color-text-primary)]'}`}>
                                {notification.title}
                              </p>
                              {!notification.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-color-info)]" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--ds-color-text-muted)]">{notification.message}</p>
                            <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]/70">
                              {formatDate(notification.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-6 text-center">
                      <CheckCircle className="mx-auto h-12 w-12 text-[var(--ds-color-border-strong)]" />
                      <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">Nenhuma notificação no momento.</p>
                    </div>
                  )}
                </div>

                <div className="bg-[color:var(--ds-color-surface-muted)]/45 px-4 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    disabled={markingAll || unreadCount === 0}
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/74 px-3 py-2">
            <div className="text-right">
              <p className="text-[13px] font-semibold text-[var(--ds-color-text-primary)]">{user?.nome}</p>
              <p className="text-xs text-[var(--ds-color-text-muted)]">{user?.profile?.nome || 'Perfil não definido'}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--ds-gradient-brand)] text-[13px] font-bold text-white shadow-[0_14px_28px_rgba(47,111,237,0.28)]">
              {userInitials || <User className="h-5 w-5" />}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
