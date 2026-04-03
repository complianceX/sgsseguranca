# 🚀 IMPLEMENTAÇÃO PRÁTICA - SOLUTIONS & CODE EXAMPLES

Este arquivo contém **código pronto para copiar/colar** para implementar as principais correções de performance.

---

## 1. Memoizar Componentes UI (React.memo)

### Padrão: Componentes sem Props Dinâmicas

```typescript
// ❌ ANTES: components/PaginationControls.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationControls({
  page,
  total,
  lastPage,
  onPageChange,
}: Props) {
  return (
    <div className="flex items-center justify-between">
      {/* ... */}
    </div>
  );
}

// ✅ DEPOIS: Wrap com memo
import { memo, ChevronLeft, ChevronRight } from 'lucide-react';

export const PaginationControls = memo(
  function PaginationControls({ page, total, lastPage, onPageChange }: Props) {
    return (
      <div className="flex items-center justify-between">
        {/* ... */}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison si necesário
    return (
      prevProps.page === nextProps.page &&
      prevProps.total === nextProps.total &&
      prevProps.lastPage === nextProps.lastPage &&
      prevProps.onPageChange === nextProps.onPageChange
    );
  }
);
```

### Aplicar em Componentes Críticos:
1. `PaginationControls.tsx`
2. `components/ui/badge.tsx`
3. `components/ui/status-pill.tsx`
4. `components/ui/skeleton.tsx`
5. `components/layout/PageHeader.tsx`
6. `SendMailModal.tsx` (se props não mudam frequentemente)
7. `StoredFilesPanel.tsx`

---

## 2. Fix AuthContext - Evitar Re-renders Cascata

### ANTES:
```typescript
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const router = useRouter();

  // ... bootstrap code ...

  const login = async (cpf: string, password: string, turnstileToken?: string) => {
    // ... auth logic ...
    setUser(authenticatedUser);
    setRoles(resolvedRoles);
    setPermissions(data.permissions || []);
  };

  const logout = async () => {
    // ... logout logic ...
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      roles,
      permissions,
      isAdminGeral,
      hasPermission: (permission: string) => permissions.includes(permission), // ❌ Inline
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### DEPOIS:
```typescript
'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/tokenStore';
import { authRefreshHint } from '@/lib/authRefreshHint';
import { User } from '@/services/usersService';
import {
  clearAuthenticatedSession,
  isAdminGeralAccount,
  persistAuthenticatedSession,
} from '@/lib/auth-session-state';
import { authService } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  roles: string[];
  permissions: string[];
  isAdminGeral: boolean;
  hasPermission: (permission: string) => boolean;
  login: (cpf: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// ✅ Separar contexto de ações para evitar re-renders desnecessários
interface AuthActionsContextType {
  login: (cpf: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthActionsContext = createContext<AuthActionsContextType>({} as AuthActionsContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
        if (!tokenStore.get() && authRefreshHint.get()) {
          const refreshed = await authService.refreshAccessToken();
          const refreshedToken = refreshed.accessToken;
          if (refreshedToken) {
            tokenStore.set(refreshedToken);
          }
        }

        if (!tokenStore.get()) return;

        const data = await authService.getCurrentSession();
        if (mounted) {
          setUser(data.user || null);
          setRoles(data.roles || []);
          setPermissions(data.permissions || []);
          if (data.user) {
            persistAuthenticatedSession({
              user: data.user,
              roles: data.roles || [],
            });
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setRoles([]);
          setPermissions([]);
          clearAuthenticatedSession();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ Memoizar hasPermission
  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

  // ✅ Memoizar isAdminGeral
  const isAdminGeral = useMemo(
    () => isAdminGeralAccount(user),
    [user]
  );

  // ✅ Memoizar login/logout como useCallback
  const login = useCallback(
    async (cpf: string, password: string, turnstileToken?: string) => {
      try {
        const data = await authService.login(cpf, password, turnstileToken);

        if (!data.accessToken) {
          throw new Error('Access token ausente na resposta de login.');
        }

        const authenticatedUser = data.user;
        if (!authenticatedUser) {
          throw new Error('Resposta de login invalida do servidor.');
        }

        const resolvedRoles = data.roles || [];
        persistAuthenticatedSession({
          user: authenticatedUser,
          roles: resolvedRoles,
          accessToken: data.accessToken,
        });

        setUser(authenticatedUser);
        setRoles(resolvedRoles);
        setPermissions(data.permissions || []);

        try {
          const enrichedData = await authService.getCurrentSession();
          setUser(enrichedData.user || authenticatedUser);
          setRoles(enrichedData.roles || resolvedRoles);
          setPermissions(enrichedData.permissions || data.permissions || []);
        } catch {
          // Usamos os dados do login como fallback
        }

        router.push('/dashboard');
        router.refresh();
      } catch (error) {
        clearAuthenticatedSession();
        throw error;
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearAuthenticatedSession();
      setUser(null);
      setRoles([]);
      setPermissions([]);
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  // ✅ Consolidar value com useMemo para evitar recriação
  const authContextValue = useMemo<AuthContextType>(() => ({
    user,
    loading,
    roles,
    permissions,
    isAdminGeral,
    hasPermission,
    login,
    logout,
  }), [user, loading, roles, permissions, isAdminGeral, hasPermission, login, logout]);

  const actionsContextValue = useMemo<AuthActionsContextType>(() => ({
    login,
    logout,
  }), [login, logout]);

  return (
    <AuthContext.Provider value={authContextValue}>
      <AuthActionsContext.Provider value={actionsContextValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

export const useAuthActions = () => {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error('useAuthActions deve ser usado dentro de AuthProvider');
  }
  return context;
};
```

---

## 3. Parallelizar Waterfalls em CorrectiveActionsPage

### ANTES:
```typescript
const loadData = useCallback(async () => {
  try {
    setLoading(true);
    // BATCH 1
    const [actionsPage, summaryData, usersPage] = await Promise.all([
      correctiveActionsService.findPaginated({ page, limit: 10 }),
      correctiveActionsService.findSummary(),
      usersService.findPaginated({ page: 1, limit: 100 }),
    ]);
    
    setActions(actionsPage.data);
    setTotal(actionsPage.total);
    setLastPage(actionsPage.lastPage);
    setSummary(summaryData);
    setUsers(usersPage.data);
    
    // BATCH 2 - espera BATCH 1 terminar ❌
    const [overview, bySite] = await Promise.all([
      correctiveActionsService.getSlaOverview(),
      correctiveActionsService.getSlaBySite(),
    ]);
    setSlaOverview(overview);
    setSlaBySite(bySite);
  } catch (error) {
    handleApiError(error, 'Ações corretivas');
  } finally {
    setLoading(false);
  }
}, [page]);
```

### DEPOIS:
```typescript
const loadData = useCallback(async () => {
  try {
    setLoading(true);
    
    // ✅ ÚNICO Promise.all com TUDO
    const [
      actionsPage,
      summaryData,
      usersPage,
      overview,
      bySite,
    ] = await Promise.all([
      correctiveActionsService.findPaginated({ page, limit: 10 }),
      correctiveActionsService.findSummary(),
      usersService.findPaginated({ page: 1, limit: 100 }),
      correctiveActionsService.getSlaOverview(),
      correctiveActionsService.getSlaBySite(),
    ]);
    
    // ✅ Set tudo una vez após Promise.all
    setActions(actionsPage.data);
    setTotal(actionsPage.total);
    setLastPage(actionsPage.lastPage);
    setSummary(summaryData);
    setUsers(usersPage.data);
    setSlaOverview(overview);
    setSlaBySite(bySite);
  } catch (error) {
    handleApiError(error, 'Ações corretivas');
  } finally {
    setLoading(false);
  }
}, [page]);
```

---

## 4. Cache para Requisições Repetidas

### Criar Hook de Cache:

```typescript
// lib/useRequestCache.ts
import { useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function useRequestCache<T>(
  fetcher: () => Promise<T>,
  ttl: number = 60_000, // 1 minuto padrão
  deps: unknown[] = []
) {
  const cacheRef = useRef<CacheEntry<T> | null>(null);

  const cachedFetcher = useCallback(async (): Promise<T> => {
    const now = Date.now();
    
    if (cacheRef.current && now - cacheRef.current.timestamp < ttl) {
      // ✅ Retorna cached data se está dentro do TTL
      return cacheRef.current.data;
    }

    // ❌ Cache expirado, fetch novo
    const data = await fetcher();
    cacheRef.current = { data, timestamp: now };
    return data;
  }, [fetcher, ttl]);

  return cachedFetcher;
}
```

### Usar em Header.tsx:

```typescript
// ANTES
const loadUnreadCount = useCallback(async () => {
  const res = await notificationsService.getUnreadCount();
  setUnreadCount(res.count);
}, []);

// DEPOIS
import { useRequestCache } from '@/lib/useRequestCache';

// ... dentro do Header component
const cachedGetUnreadCount = useRequestCache(
  () => notificationsService.getUnreadCount(),
  30_000 // Cache por 30 segundos
);

const loadUnreadCount = useCallback(async () => {
  const res = await cachedGetUnreadCount();
  setUnreadCount(res.count);
}, [cachedGetUnreadCount]);
```

---

## 5. Fix Header Polling - Não Poll Quando Fechado

### ANTES:
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    loadUnreadCount();
  }, unreadPollDelayMs);

  return () => clearInterval(interval);
}, [loadUnreadCount, unreadPollDelayMs]);
```

### DEPOIS:
```typescript
useEffect(() => {
  // ✅ NÃO poll quando notificações não estão visíveis
  if (!showNotifications) {
    return;
  }

  const interval = setInterval(() => {
    loadUnreadCount();
  }, unreadPollDelayMs);

  return () => clearInterval(interval);
}, [showNotifications, unreadPollDelayMs, loadUnreadCount]);
```

---

## 6. Otimizar Date Formatting em Tabelas

### Criar Hook:

```typescript
// hooks/useDateFormatters.ts
import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function useDateFormatters() {
  return useMemo(() => ({
    /**
     * Formata data como "dd/MM/yyyy"
     * @example "25/04/2026"
     */
    formatDate: (date: string | Date | null) => {
      if (!date) return '—';
      try {
        return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR });
      } catch {
        return '—';
      }
    },

    /**
     * Formata data/hora como "dd/MM/yyyy HH:mm"
     * @example "25/04/2026 14:30"
     */
    formatDateTime: (date: string | Date | null) => {
      if (!date) return '—';
      try {
        return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: ptBR });
      } catch {
        return '—';
      }
    },

    /**
     * Formata data relativa
     * @example "há 2 horas"
     */
    formatRelative: (date: string | Date | null) => {
      if (!date) return '—';
      try {
        const now = new Date();
        const d = new Date(date);
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'agora';
        if (diffMins < 60) return `há ${diffMins}m`;
        if (diffHours < 24) return `há ${diffHours}h`;
        if (diffDays < 7) return `há ${diffDays}d`;
        return format(d, 'dd/MM/yyyy', { locale: ptBR });
      } catch {
        return '—';
      }
    },
  }), []);
}
```

### Usar em Tabela:

```typescript
// ANTES
{audits.map(audit => (
  <TableRow key={audit.id}>
    <TableCell>
      {format(new Date(audit.data_auditoria), 'dd/MM/yyyy', { locale: ptBR })}
    </TableCell>
  </TableRow>
))}

// DEPOIS
import { useDateFormatters } from '@/hooks/useDateFormatters';

export default function AuditsPage() {
  const dateFormatters = useDateFormatters();

  return (
    <Table>
      <TableBody>
        {audits.map(audit => (
          <TableRow key={audit.id}>
            <TableCell>{dateFormatters.formatDate(audit.data_auditoria)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## 7. Tree-shake Lucide Icons

### Estratégia 1: Icon Wrapper Component

```typescript
// components/icons/index.ts
// ✅ Exportar apenas os ícones mais usados direto
export { Bell, Menu, RefreshCw, Search, User, X, AlertTriangle } from 'lucide-react';

// Para ícones less-used, usar lazy import
export const lazyIconMap = {
  Command: () => import('lucide-react').then(m => ({ default: m.Command })),
  Sparkles: () => import('lucide-react').then(m => ({ default: m.Sparkles })),
  WifiOff: () => import('lucide-react').then(m => ({ default: m.WifiOff })),
} as const;
```

### Usar em Componente:

```typescript
// ANTES
import {
  Bell,
  Command,
  Info,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  User,
  WifiOff,
  X,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

// DEPOIS - Importar apenas o que precisa
import { Bell, Menu, RefreshCw, Search, User, X, AlertTriangle } from "@/components/icons";
// Plus: importar lazy-loaded dinamicamente
```

---

## 8. Fix SgsInsights Memoization

### ANTES:
```typescript
const visibleInsights = useMemo(
  () => (data?.insights ?? []).filter((insight) =>
    isTemporarilyVisibleDashboardRoute(insight.action),
  ),
  [data],
);

const primaryInsight = useMemo(
  () => visibleInsights[0] ?? null,
  [visibleInsights],
);

const secondaryInsights = useMemo(
  () => visibleInsights.slice(1, 3),
  [visibleInsights],
);

const remainingInsights = useMemo(
  () => Math.max(0, visibleInsights.length - (primaryInsight ? 1 : 0) - secondaryInsights.length),
  [visibleInsights, primaryInsight, secondaryInsights],
);
```

### DEPOIS:
```typescript
const { visibleInsights, primaryInsight, secondaryInsights, remainingInsights } = useMemo(() => {
  const visible = (data?.insights ?? []).filter((insight) =>
    isTemporarilyVisibleDashboardRoute(insight.action),
  );
  const primary = visible[0] ?? null;
  const secondary = visible.slice(1, 3);
  const remaining = Math.max(
    0,
    visible.length - (primary ? 1 : 0) - secondary.length,
  );

  return { visibleInsights: visible, primaryInsight: primary, secondaryInsights: secondary, remainingInsights: remaining };
}, [data]);
```

---

## Checklist de Deployment

### Antes de fazer commit:
- [ ] Executar `npm run lint` e resolver erros
- [ ] Executar `npm run test` para unit tests passarem
- [ ] Medir bundle size com `npm run build`
- [ ] Comparar bundle size antes/depois no PR

### Testing
```bash
# Rodar em modo profiling
npm run build
npm run start

# Abrir DevTools Performance tab e recorder 30s de interações
# Verificar se há tarefas longas (>50ms)
```

### Deployment
1. Create PR com todas as mudanças
2. Code review (verifique se memos está bem)
3. Merge para staging
4. Deploy staging e testar em real 4G/3G
5. Merge para production
6. Monitor Sentry + WebVitals por 24 horas

---

## Referências Rápidas

### Boas práticas de Memoization
- Usar `memo()` para componentes que recebem objetos/arrays nas props
- Usar `useMemo()` para cálculos custosos (formato de data, filtros, transformações)
- Usar `useCallback()` para funções passadas como props
- Medir antes e depois com DevTools Performance

### Evitar Pitfalls
- ❌ Não usar `useMemo()` em tudo (tem overhead)
- ❌ Não criar objetos em memo deps sem consolidar
- ❌ Não esquecer deps em useCallback/useMemo
- ✅ Testar com DevTools Profiler

---

**Última atualização**: Abril 2026
