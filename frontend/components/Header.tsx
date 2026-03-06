'use client';

import { Bell, Search, User, X, AlertTriangle, Info, CheckCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { aiService } from '@/services/aiService';
import { Insight } from '@/components/GandraInsights';
import { useApiStatus } from '@/hooks/useApiStatus';
import { useApiReconnect } from '@/hooks/useApiReconnect';
import Link from 'next/link';

export function Header() {
  const { user } = useAuth();
  const { isOffline, apiBaseUrl } = useApiStatus();
  const { isReconnecting, reconnect } = useApiReconnect(apiBaseUrl);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Insight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const result = await aiService.getInsights();
      setNotifications(result.insights);
      setUnreadCount(result.insights.length);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await loadNotifications();
    };
    loadData();
    
    // Fechar ao clicar fora
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'danger': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'success': return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
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
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) setUnreadCount(0);
            }}
            className="relative rounded-full p-1 text-[#94A3B8] hover:bg-[#334155] hover:text-[#F1F5F9]"
          >
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-[#334155] bg-[#1E293B] shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#334155] bg-[#0F172A] px-4 py-2">
                <h3 className="text-sm font-semibold text-[#F1F5F9]">Notificações COMPLIANCE X AI</h3>
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
                  notifications.map((notification, index) => (
                    <div key={index} className="border-b border-[#334155] last:border-0 hover:bg-[#0F172A] px-4 py-3 transition-colors">
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">
                          {getIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#F1F5F9] truncate">{notification.title}</p>
                          <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{notification.message}</p>
                          <Link
                            href={notification.action}
                            className="mt-2 inline-flex items-center text-[10px] font-semibold text-[#60A5FA] hover:text-[#93C5FD]"
                            onClick={() => setShowNotifications(false)}
                          >
                            VER DETALHES <ExternalLink className="ml-1 h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
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
                  className="text-xs font-medium text-[#64748B] hover:text-[#94A3B8]"
                >
                  Marcar todas como lidas
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
