# Rate Limiting — Guia de Referência

> Documento de referência para as 3 camadas de proteção contra abuso do sistema.
>
> Atualizado em: 2026-03-24

---

## Visão Geral

O sistema usa **3 camadas independentes** de rate limiting, cada uma com propósito distinto:

```
Requisição HTTP
     │
     ▼
[Camada 1] IpThrottlerGuard — por IP (Redis)
     │   bloqueia brute force antes de qualquer lógica de negócio
     ▼
[Camada 2] TenantRateLimitGuard — por empresa (Redis)
     │   protege contra empresa abusando do sistema
     ▼
[Camada 3] UserRateLimitGuard — por usuário (Redis, rotas sensíveis)
     │   protege endpoints custosos por usuário individual
     ▼
Controller
```

---

## Camada 1 — Rate Limit por IP (`IpThrottlerGuard`)

**Storage:** Redis (multi-instância — persiste entre restarts e réplicas)
**Guard:** `IpThrottlerGuard` (extends `ThrottlerGuard` do `@nestjs/throttler`)
**Registro:** `APP_GUARD` global

### Limites por endpoint

| Endpoint | Prod | Dev |
|---|---|---|
| `POST /auth/login` | 5/min | 30/min |
| `POST /auth/forgot-password` | 3/min | 30/min |
| `POST /auth/reset-password` | 5/min | 30/min |
| `POST /auth/change-password` | 5/min | 30/min |
| Todos os outros | 100/min | 100/min |

### Variáveis de ambiente

| Variável | Padrão (prod) | Descrição |
|---|---|---|
| `THROTTLE_TTL` | 60000 (ms) | Janela global |
| `THROTTLE_LIMIT` | 100 | Limite global por janela |
| `LOGIN_THROTTLE_LIMIT` | 5 | Limite do login |
| `LOGIN_THROTTLE_TTL` | 60000 | Janela do login |
| `FORGOT_PASSWORD_THROTTLE_LIMIT` | 3 | Limite do forgot-password |
| `CHANGE_PASSWORD_THROTTLE_LIMIT` | 5 | Limite de troca de senha |
| `DISABLE_LOGIN_THROTTLE_IN_DEV` | false | Desabilitar throttle de login em dev |

### Resposta 429

```json
{
  "statusCode": 429,
  "message": "Too Many Requests"
}
```

Header: `Retry-After: <segundos>`

---

## Camada 2 — Rate Limit por Tenant (`TenantRateLimitGuard`)

**Storage:** Redis (contadores por minuto/hora com Lua script atômico)
**Guard:** `TenantRateLimitGuard`
**Registro:** `APP_GUARD` global

### Planos e limites

| Plano | req/min | req/hora | burst |
|---|---|---|---|
| FREE | 10 | 100 | 5 |
| STARTER | 60 | 1.000 | 20 |
| PROFESSIONAL | 300 | 10.000 | 100 |
| ENTERPRISE | 1.000 | 100.000 | 500 |

**Padrão:** `STARTER` (configurável via `TENANT_RATE_LIMIT_DEFAULT_PLAN`)

### Sobrescrever limite por rota (`@TenantThrottle`)

Para endpoints custosos, aplique o decorator:

```typescript
@TenantThrottle({ requestsPerMinute: 5, requestsPerHour: 50 })
@Post('export/excel')
async exportExcel() { ... }
```

O `TenantRateLimitGuard` lerá o metadata e aplicará os limites customizados em vez dos limites do plano.

### Chaves Redis

```
ratelimit:{companyId}:minute:{window}   TTL: 60s
ratelimit:{companyId}:hour:{window}     TTL: 3600s
```

### Resposta 429

```json
{
  "statusCode": 429,
  "message": "Limite de requisições excedido para esta empresa. Tente novamente em breve.",
  "retryAfter": 60
}
```

Headers: `X-RateLimit-Plan`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

---

## Camada 3 — Rate Limit por Usuário em Rotas Sensíveis (`UserRateLimitGuard`)

**Storage:** Redis (sliding window de 60s por user_id + rota)
**Guard:** `UserRateLimitGuard`
**Registro:** `APP_GUARD` global — ativo apenas em rotas com `@UserThrottle`

### Limites aplicados

| Endpoint | Limite |
|---|---|
| `POST /ai/sst/chat` | 10 req/min por usuário |
| `POST /ai/sst/analyze-image-risk` | 5 req/min por usuário |
| `POST /ai/analyze-apr` | 5 req/min por usuário |
| `POST /ai/analyze-pt` | 5 req/min por usuário |
| `GET /users/me/export` | 3 req/min por usuário |

### Adicionar a novo endpoint

```typescript
@UserThrottle({ requestsPerMinute: 5 })
@Post('minha-rota-sensivel')
async minhaRotaSensivel() { ... }
```

### Chaves Redis

```
user_rl:{userId}:{method}:{path}   TTL: 60s
```

### Resposta 429

```json
{
  "statusCode": 429,
  "message": "Limite de 10 requisições/minuto por usuário excedido. Aguarde 45s antes de tentar novamente.",
  "retryAfter": 45
}
```

Headers: `X-User-RateLimit-Limit`, `X-User-RateLimit-Remaining`, `X-User-RateLimit-Reset`, `Retry-After`

---

## Endpoint Admin

```
GET /admin/rate-limits/status
Authorization: Bearer <token_admin_geral>
```

Retorna snapshot dos contadores Redis:

```json
{
  "timestamp": "2026-03-24T12:00:00.000Z",
  "ip_throttler": {
    "storage": "redis",
    "active_ip_windows": 42,
    "currently_blocked_ips": 2
  },
  "tenants": {
    "active_tenants_this_minute": 18,
    "total_active_windows": 36
  },
  "ai_users": {
    "active_user_windows": 5,
    "requests_by_route": {
      "POST:/ai/sst/chat": 47,
      "POST:/ai/analyze-apr": 12,
      "GET:/users/me/export": 3
    }
  }
}
```

---

## Frontend — Tratamento do 429

### `handleApiError` (automático)

A função `handleApiError` em `frontend/lib/error-handler.ts` extrai automaticamente
o header `Retry-After` e exibe o countdown no toast:

```
"Muitas requisições. Tente novamente em 45s."
```

### `useRetryAfter` (hook para botões)

Para desabilitar o botão de submit durante o período de retry:

```tsx
import { useRetryAfter } from '@/hooks/useRetryAfter';

function MeuFormulario() {
  const { blocked, secondsLeft, onError } = useRetryAfter();

  const handleSubmit = async () => {
    try {
      await minhaApiCall();
    } catch (err) {
      onError(err);           // captura o Retry-After do 429
      handleApiError(err, 'Contexto');
    }
  };

  return (
    <button disabled={blocked} onClick={handleSubmit}>
      {blocked ? `Aguarde ${secondsLeft}s` : 'Enviar'}
    </button>
  );
}
```

---

## Histórico de Alterações

| Data | Alteração |
|---|---|
| 2026-03-24 | Documento criado |
| 2026-03-24 | ThrottlerModule migrado para Redis storage (multi-instância) |
| 2026-03-24 | `POST /auth/forgot-password` reduzido para 3/min (era 5/min) |
| 2026-03-24 | `@TenantThrottle` decorator implementado |
| 2026-03-24 | `UserRateLimitService` + `UserRateLimitGuard` implementados |
| 2026-03-24 | `@UserThrottle` aplicado em 4 endpoints de IA |
| 2026-03-24 | `GET /admin/rate-limits/status` implementado |
| 2026-03-24 | `handleApiError` atualizado com countdown do Retry-After |
| 2026-03-24 | `useRetryAfter` hook criado |
