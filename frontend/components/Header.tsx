'use client';

import { Bell, Search, User, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useApiStatus } from '@/hooks/useApiStatus';
import { useApiReconnect } from '@/hooks/useApiReconnect';
import { notificationsService, AppNotification } from '@/services/notificationsService';

const POLL_INTERVAL_MS = 30_000;

export function Header() {
  const { user } = useAuth();
  const { isOffline, apiBaseUrl } = useApiStatus();
  const { isReconnecting, reconnect } = useApiReconnect(apiBaseUrl);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const handleOpen = () => setShowNotifications((v) => !v);
  const popoverRef = useRef<HTMLDivElement>(null);

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
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkOne = async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silencioso
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'danger':  return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'success': return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      default:        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#334155] bg-[#1E293B] px-8">
      <div className="flex items-center">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-[#64748B]" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-64 rounded-md border border-[#334155] bg-[#0F172A] py-2 pl-10 pr-4 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#2563EB] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div
          className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold xl:flex ${
            isOffline
              ? 'border-red-400/40 bg-red-500/10 text-red-300'
              : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
          }`}
          title={
            isOffline
              ? `API offline${apiBaseUrl ? ` (${apiBaseUrl})` : ''}`
              : 'API online'
          }
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isOffline ? 'bg-red-400' : 'bg-emerald-400'
            }`}
          />
          {isOffline ? 'API offline' : 'API online'}
        </div>
        {isOffline && (
          <button
            type="button"
            onClick={reconnect}
            disabled={isReconnecting}
            className="hidden rounded-md border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs font-semibold text-[#CBD5E1] hover:border-[#475569] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 xl:block"
          >
            {isReconnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
        )}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            title="Notificações"
            onClick={handleOpen}
            className="relative rounded-full p-1 text-[#94A3B8] hover:bg-[#334155] hover:text-[#F1F5F9]"
          >
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-[#334155] bg-[#1E293B] shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#334155] bg-[#0F172A] px-4 py-2">
                <h3 className="text-sm font-semibold text-[#F1F5F9]">Notificações</h3>
                <button
                  type="button"
                  title="Fechar"
                  onClick={() => setShowNotifications(false)}
                >
                  <X className="h-4 w-4 text-[#94A3B8] hover:text-[#F1F5F9]" />
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => !notification.read && handleMarkOne(notification.id)}
                      className={`w-full text-left border-b border-[#334155] last:border-0 px-4 py-3 transition-colors hover:bg-[#0F172A] ${!notification.read ? 'bg-blue-500/5' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">{getIcon(notification.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-semibold truncate ${!notification.read ? 'text-[#F1F5F9]' : 'text-[#94A3B8]'}`}>{notification.title}</p>
                            {!notification.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />}
                          </div>
                          <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{notification.message}</p>
                          <p className="mt-1 text-[10px] text-[#475569]">{formatDate(notification.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-[#334155]" />
                    <p className="mt-2 text-sm text-[#94A3B8]">Nenhuma notificação no momento.</p>
                  </div>
                )}
              </div>
              <div className="bg-[#0F172A] px-4 py-2 text-center">
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll || unreadCount === 0}
                  className="text-xs font-medium text-[#64748B] hover:text-[#94A3B8] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3 border-l border-[#334155] pl-4">
          <div className="text-right">
            <p className="text-sm font-medium text-[#F1F5F9]">{user?.nome}</p>
            <p className="text-xs text-[#94A3B8]">{user?.company?.razao_social || 'Admin'}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1D4ED8] text-white">
            <User className="h-6 w-6" />
          </div>
        </div>
      </div>
    </header>
  );
}
