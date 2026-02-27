# 🎯 BOAS PRÁTICAS - FRONTEND

## 🔐 AUTENTICAÇÃO

### 1. Verificar Token Antes de Requests

```typescript
// lib/auth.ts
export function isAuthenticated(): boolean {
  const token = localStorage.getItem('token');
  return !!token && !isTokenExpired(token);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getToken(): string | null {
  const token = localStorage.getItem('token');
  if (!token || isTokenExpired(token)) {
    return null;
  }
  return token;
}
```

### 2. Interceptor de Autenticação

```typescript
// lib/api.ts
import axios from 'axios';
import { getToken, isAuthenticated } from './auth';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 3. Hook de Autenticação

```typescript
// hooks/useAuth.ts
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export function useAuth(redirectTo = '/login') {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push(redirectTo);
    }
  }, [router, redirectTo]);
}

// Uso em páginas protegidas
export default function DashboardPage() {
  useAuth(); // Redireciona se não autenticado
  
  return <div>Dashboard</div>;
}
```

### 4. Componente de Proteção

```typescript
// components/ProtectedRoute.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
    } else {
      setIsLoading(false);
    }
  }, [router]);

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  return <>{children}</>;
}

// Uso
export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      {children}
    </ProtectedRoute>
  );
}
```

---

## 🔄 TRATAMENTO DE ERROS

### 1. Try-Catch em Todas Requests

```typescript
async function fetchData() {
  try {
    const response = await api.get('/endpoint');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Erro do Axios
      if (error.response) {
        // Servidor respondeu com erro
        console.error('Erro do servidor:', error.response.data);
        toast.error(error.response.data.message || 'Erro ao buscar dados');
      } else if (error.request) {
        // Request foi feito mas sem resposta
        console.error('Sem resposta do servidor');
        toast.error('Servidor não respondeu. Verifique sua conexão.');
      } else {
        // Erro ao configurar request
        console.error('Erro na requisição:', error.message);
        toast.error('Erro ao fazer requisição');
      }
    } else {
      // Erro não relacionado ao Axios
      console.error('Erro desconhecido:', error);
      toast.error('Erro inesperado');
    }
    throw error;
  }
}
```

### 2. Error Boundary

```typescript
// components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 text-center">
          <h2>Algo deu errado</h2>
          <button onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## 📊 LOADING STATES

### 1. Hook de Loading

```typescript
// hooks/useLoading.ts
import { useState } from 'react';

export function useLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute<T>(
    fn: () => Promise<T>
  ): Promise<T | null> {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, execute };
}

// Uso
function MyComponent() {
  const { isLoading, error, execute } = useLoading();

  async function handleSubmit() {
    const result = await execute(() => api.post('/endpoint', data));
    if (result) {
      toast.success('Sucesso!');
    }
  }

  return (
    <div>
      {isLoading && <Spinner />}
      {error && <Alert>{error}</Alert>}
      <button onClick={handleSubmit}>Enviar</button>
    </div>
  );
}
```

---

## 🎨 COMPONENTES REUTILIZÁVEIS

### 1. Botão com Loading

```typescript
// components/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: React.ReactNode;
}

export function Button({ isLoading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className="relative"
    >
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      <span className={isLoading ? 'invisible' : ''}>
        {children}
      </span>
    </button>
  );
}
```

### 2. Form com Validação

```typescript
// components/Form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    try {
      await api.post('/auth/login', data);
      toast.success('Login realizado!');
    } catch (error) {
      toast.error('Erro ao fazer login');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      
      <input {...register('password')} type="password" />
      {errors.password && <span>{errors.password.message}</span>}
      
      <Button isLoading={isSubmitting}>Entrar</Button>
    </form>
  );
}
```

---

## 🚀 PERFORMANCE

### 1. Lazy Loading

```typescript
import dynamic from 'next/dynamic';

// Lazy load de componentes pesados
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false, // Desabilitar SSR se não necessário
});
```

### 2. Memoização

```typescript
import { useMemo, useCallback } from 'react';

function MyComponent({ data }) {
  // Memoizar cálculos pesados
  const processedData = useMemo(() => {
    return data.map(item => expensiveOperation(item));
  }, [data]);

  // Memoizar callbacks
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);

  return <div onClick={handleClick}>{processedData}</div>;
}
```

### 3. Debounce em Inputs

```typescript
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Uso
function SearchInput() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    if (debouncedSearch) {
      // Fazer busca apenas após 500ms sem digitar
      api.get(`/search?q=${debouncedSearch}`);
    }
  }, [debouncedSearch]);

  return <input value={search} onChange={(e) => setSearch(e.target.value)} />;
}
```

---

## 📱 RESPONSIVIDADE

### 1. Hook de Media Query

```typescript
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// Uso
function MyComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return isMobile ? <MobileView /> : <DesktopView />;
}
```

---

## ✅ CHECKLIST DE BOAS PRÁTICAS

### Autenticação
- [ ] Verificar token antes de requests
- [ ] Interceptor de autenticação configurado
- [ ] Redirect para login se não autenticado
- [ ] Tratamento de token expirado

### Erros
- [ ] Try-catch em todas requests
- [ ] Error boundary implementado
- [ ] Mensagens de erro amigáveis
- [ ] Logs de erro para debugging

### Performance
- [ ] Lazy loading de componentes pesados
- [ ] Memoização de cálculos pesados
- [ ] Debounce em inputs de busca
- [ ] Imagens otimizadas

### UX
- [ ] Loading states em todas ações
- [ ] Feedback visual (toast, alerts)
- [ ] Validação de formulários
- [ ] Mensagens claras

### Código
- [ ] TypeScript em todos arquivos
- [ ] Componentes reutilizáveis
- [ ] Hooks customizados
- [ ] Código limpo e documentado

---

**Siga essas práticas para um frontend robusto e profissional!** 🚀
