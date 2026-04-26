# SGS — Guia de Desenvolvimento

## Stack

- **Backend**: NestJS 11, TypeORM, PostgreSQL, Redis (BullMQ), argon2id
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Sonner (toasts)
- **Testes backend**: Jest 30, ts-jest, 204 suites / 1425 testes
- **Testes frontend**: Jest + Testing Library
- **Node**: >=20 <25

---

## Como adicionar um novo módulo

### Backend

```
backend/src/<meu-modulo>/
├── dto/
│   ├── create-meu-modulo.dto.ts       # class-validator + class-transformer
│   └── meu-modulo-response.dto.ts
├── entities/
│   └── meu-modulo.entity.ts           # @Entity(), @PrimaryGeneratedColumn('uuid')
├── meu-modulo.controller.ts           # @Controller('meu-modulo')
├── meu-modulo.controller.spec.ts
├── meu-modulo.module.ts               # TypeOrmModule.forFeature([MeuModulo])
├── meu-modulo.service.ts
└── meu-modulo.service.spec.ts

backend/src/database/migrations/
└── <timestamp>-create-meu-modulo.ts   # SQL manual, nunca autoSync
```

**Passo único fora do diretório do módulo**:
Abra `backend/src/config/modules.config.ts` e adicione o módulo no grupo de domínio correto.

Regras:
- Guards globais (JWT, tenant, rate-limit) são aplicados automaticamente.
- Nunca use `synchronize: true` no TypeORM — sempre migrations manuais.
- Entities são auto-descobertas via `autoLoadEntities: true`.

### Frontend

```
frontend/app/dashboard/<meu-modulo>/
├── page.tsx                           # listagem
├── new/page.tsx                       # criação
├── edit/[id]/page.tsx                 # edição
├── components/
│   ├── MeuModuloForm.tsx
│   ├── MeuModuloListingTable.tsx
│   ├── MeuModuloCard.tsx              # mobile
│   └── MeuModuloFilters.tsx
└── hooks/
    └── useMeuModulo.ts                # estado de listagem

frontend/services/
└── meuModuloService.ts                # findPaginated, findOne, create, update, delete
```

Depois adicione o serviço no barrel `frontend/services/index.ts` no grupo correto.

**Se a rota requer ADMIN_GERAL**: adicione o prefixo em `frontend/lib/route-config.ts` → `ADMIN_ROUTES`.
**Se a rota requer permissão específica**: adicione em `PERMISSION_ROUTE_EXCEPTIONS` e em `frontend/lib/permissions.ts`.

---

## Estrutura de domínios

### Backend (`backend/src/config/modules.config.ts`)

| Domínio | Módulos |
|---|---|
| **IDENTITY** | Auth, Users, Profiles, RBAC |
| **TENANT** | Companies, Sites, TenantPolicies, Calendar |
| **OPERATIONS** | APRs, PTSs, DDSs, DIDs, ARRs, RDOs, Activities, Inspections, etc. |
| **COMPLIANCE** | Audits, Checklists, Reports, Contracts, DocumentRegistry |
| **PRIVACY** | Consents, PrivacyRequests, PrivacyGovernance, Admin |
| **COMMUNICATION** | Mail, Push, Signatures, Tasks |
| **INFRASTRUCTURE** | Common, Redis, AI, DataLoader, Observability, Security, etc. |

### Frontend (`frontend/services/index.ts`)

Mesma divisão de domínios — barrel exporta apenas os objetos de serviço.
Tipos são importados diretamente do arquivo fonte.

---

## Convenções críticas

### Backend
- **Permissões**: guards globais via `APP_GUARD` chain. Rota pública: `@Public()`.
- **Multi-tenant**: `TenantGuard` extrai tenant do header `x-company-id`. Use `@TenantOptional()` para rotas públicas.
- **UUID nos testes**: jest usa shim CJS (`test/uuid-cjs.js`) — uuid 14 é ESM puro.
- **Redis tiers**: `REDIS_CLIENT_AUTH` (sessões), `REDIS_CLIENT_CACHE` (rate-limit/dashboard), `REDIS_CLIENT_QUEUE` (BullMQ).
- **Senhas**: argon2id via `PasswordService`. Nunca `bcrypt` direto.
- **Migrations**: timestamp `1709000000146-create-nome.ts`. CLI usa `DATABASE_DIRECT_URL`.

### Frontend
- **Auth**: `useAuth()` → `{ user, hasPermission, isAdminGeral, loading }`.
- **Permissões**: use `Permission.CAN_VIEW_RISKS` de `lib/permissions.ts` ao invés de strings literais.
- **Rotas protegidas**: configurar em `lib/route-config.ts`, não em `layout.tsx`.
- **API**: use instância central de `lib/api.ts` (token refresh, retry, offline queue automáticos).
- **Toasts**: `toast.success()` / `toast.error()` via `sonner`.
- **Layouts**: `ListPageLayout` e `FormPageLayout` de `components/layout/`.

---

## Rodar testes

```bash
# Backend
cd backend && npm run test:clean       # todos os testes (silencioso)
cd backend && npm run test:watch       # modo watch

# Frontend
cd frontend && npm test                # todos

# Type check
cd backend && npm run type-check
cd frontend && npx tsc --noEmit
```

---

## Segurança (0 vulnerabilidades em npm audit)

- `backend/package.json` tem overrides: `protobufjs >=8.0.1`, `uuid >=14.0.0`
- OTEL usa `@opentelemetry/exporter-trace-otlp-http` (Jaeger OTLP port 4318) — sem protobufjs vulnerável
- `backend/test/uuid-cjs.js` é o shim CJS do uuid 14 para o Jest
- Nunca remover os overrides sem verificar `npm audit` após

---

## Banco de dados — regras de produção

### Neon: endpoint direto vs pooler

`DATABASE_URL` em produção deve apontar para o **endpoint direto** do Neon (sem `-pooler` no hostname).

Motivo: o isolamento multi-tenant usa `SET LOCAL app.current_company_id` dentro de cada transação. Esse comando aplica a configuração apenas na sessão corrente. O endpoint pooler do Neon opera em transaction mode — cada statement pode ir para uma conexão diferente, fazendo o `SET LOCAL` não persistir para os statements seguintes da mesma transação, quebrando silenciosamente o RLS.

Regra: nunca usar `ep-*.us-east-2-pooler.aws.neon.tech` em `DATABASE_URL`. Usar sempre `ep-*.us-east-2.aws.neon.tech`.

Exceção permitida: `DATABASE_MIGRATION_URL` pode ser pooler se as migrations não dependerem de SET LOCAL (todas as migrations do SGS são executadas como role owner/DDL, sem RLS por sessão).

Verificação: o log de startup da aplicação exibe o hostname conectado. Se aparecer `-pooler` no host e `DATABASE_POOLER_ALLOW_SESSION_RLS` não estiver em `true`, a aplicação emite warning de segurança.

### Migrations: sequência de timestamps

O próximo timestamp disponível para migrations é `1709000000165`. Sempre usar `CONCURRENTLY IF NOT EXISTS` para índices e `transaction = false` quando a migration contiver `CREATE/DROP INDEX CONCURRENTLY`.

---

## LGPD

- Consentimentos: `ConsentsModule` (event-sourced, tabelas `consent_versions` + `user_consents`)
- GDPR deletion: `GDPRDeletionService` persiste em `gdpr_deletion_requests` (TypeORM)
- `ai_interactions` cobertos por erasure e TTL de 1 ano
- `AiConsentGuard` delega para `ConsentsService.hasActiveConsent()`
- Frontend: `FirstAccessConsentModal` bloqueia dashboard até aceite de `privacy` + `terms`
