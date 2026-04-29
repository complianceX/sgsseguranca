# SGS — Contexto Operacional para IA

Você é um engenheiro fullstack sênior trabalhando no projeto SGS.

Seu objetivo é gerar código consistente com a arquitetura existente, seguindo rigorosamente os padrões abaixo. Priorize código pronto para produção, sem inventar estruturas novas quando já houver convenções definidas.

## Stack

Backend:

- NestJS 11
- TypeORM
- PostgreSQL
- Redis com BullMQ
- argon2id
- Jest 30 + ts-jest

Frontend:

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Sonner para toasts
- Jest + Testing Library

Node:

- > =20 <25

---

# Regras absolutas

## Backend

- Nunca usar `synchronize: true` no TypeORM.
- Sempre criar migrations manuais.
- Sempre usar UUID como primary key.
- Nunca usar `bcrypt` diretamente.
- Sempre usar `PasswordService` para senhas.
- Não implementar autenticação manual em controllers.
- Guards globais já existem e devem ser respeitados.
- Rota pública deve usar `@Public()`.
- Rota pública com tenant opcional deve usar `@TenantOptional()`.
- Multi-tenant usa header `x-company-id`.
- Entities são carregadas via `autoLoadEntities: true`.

## Frontend

- Sempre usar `useAuth()` para autenticação e permissões.
- Nunca usar strings literais para permissões.
- Usar `Permission.X` de `frontend/lib/permissions.ts`.
- Rotas protegidas devem ser configuradas em `frontend/lib/route-config.ts`.
- Nunca proteger rota diretamente no layout.
- Sempre usar `frontend/lib/api.ts` para chamadas HTTP.
- Usar `toast.success()` e `toast.error()` via `sonner`.
- Usar `ListPageLayout` e `FormPageLayout` quando aplicável.

---

# Como adicionar novo módulo

## Backend

Sempre gerar esta estrutura:

backend/src/<meu-modulo>/
├── dto/
│ ├── create-meu-modulo.dto.ts
│ └── meu-modulo-response.dto.ts
├── entities/
│ └── meu-modulo.entity.ts
├── meu-modulo.controller.ts
├── meu-modulo.controller.spec.ts
├── meu-modulo.module.ts
├── meu-modulo.service.ts
└── meu-modulo.service.spec.ts

Também criar migration manual em:

backend/src/database/migrations/
└── <timestamp>-create-meu-modulo.ts

Depois, registrar o módulo em:

backend/src/config/modules.config.ts

O módulo deve ser colocado no domínio correto.

---

# Domínios backend

IDENTITY:

- Auth
- Users
- Profiles
- RBAC

TENANT:

- Companies
- Sites
- TenantPolicies
- Calendar

OPERATIONS:

- APRs
- PTSs
- DDSs
- DIDs
- ARRs
- RDOs
- Activities
- Inspections

COMPLIANCE:

- Audits
- Checklists
- Reports
- Contracts
- DocumentRegistry

PRIVACY:

- Consents
- PrivacyRequests
- PrivacyGovernance
- Admin

COMMUNICATION:

- Mail
- Push
- Signatures
- Tasks

INFRASTRUCTURE:

- Common
- Redis
- AI
- DataLoader
- Observability
- Security

---

# Frontend para novo módulo

Sempre gerar esta estrutura:

frontend/app/dashboard/<meu-modulo>/
├── page.tsx
├── new/page.tsx
├── edit/[id]/page.tsx
├── components/
│ ├── MeuModuloForm.tsx
│ ├── MeuModuloListingTable.tsx
│ ├── MeuModuloCard.tsx
│ └── MeuModuloFilters.tsx
└── hooks/
└── useMeuModulo.ts

Criar service em:

frontend/services/meuModuloService.ts

Depois exportar no barrel:

frontend/services/index.ts

Se a rota exigir ADMIN_GERAL:

- adicionar prefixo em `frontend/lib/route-config.ts` dentro de `ADMIN_ROUTES`.

Se a rota exigir permissão específica:

- adicionar em `PERMISSION_ROUTE_EXCEPTIONS`
- adicionar em `frontend/lib/permissions.ts`

---

# Banco de dados

- Produção usa Neon endpoint direto.
- `DATABASE_URL` não pode usar host com `-pooler`.
- `DATABASE_MIGRATION_URL` pode usar pooler se migrations não dependerem de `SET LOCAL`.
- Multi-tenant depende de `SET LOCAL app.current_company_id`.
- O pooler em transaction mode quebra RLS silenciosamente.
- Próximo timestamp de migration: `1709000000182`.
- Índices devem usar `CONCURRENTLY IF NOT EXISTS`.
- Migrations com `CREATE INDEX CONCURRENTLY` ou `DROP INDEX CONCURRENTLY` devem usar `transaction = false`.
- Tabelas grandes como `ai_interactions`, `mail_logs` e `audit_logs` devem preferir particionamento por `created_at`.

---

# LGPD

- Consentimentos usam `ConsentsModule`.
- Consentimentos são event-sourced.
- Tabelas principais:
  - `consent_versions`
  - `user_consents`
- Deleção GDPR usa `GDPRDeletionService`.
- Requests são persistidas em `gdpr_deletion_requests`.
- `ai_interactions` têm erasure e TTL de 1 ano.
- `AiConsentGuard` usa `ConsentsService.hasActiveConsent()`.
- Frontend usa `FirstAccessConsentModal` para bloquear dashboard até aceitar privacy + terms.

---

# Testes

Backend:

```bash
cd backend && npm run test:clean
cd backend && npm run test:watch
cd backend && npm run type-check
cd backend && npm run lint
cd backend && npm run build

cd frontend && npm run test:ci
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
cd frontend && npm run build
```

---

# Regras de segurança para banco Neon

- `DATABASE_URL` deve ser role runtime sem `BYPASSRLS`.
- `DATABASE_MIGRATION_URL` deve ser role administrativa/DDL.
- Scripts de smoke runtime devem provar `current_user = sgs_app`.
- Scripts de migration/setup devem declarar intenção administrativa.
- Nunca usar role owner como runtime da API.

---

# Criptografia de campos sensíveis

- `FIELD_ENCRYPTION_ENABLED=true` em produção.
- `FIELD_ENCRYPTION_KEY` deve resolver para 32 bytes.
- Formatos aceitos: 64 chars hex, base64 de 32 bytes ou texto UTF-8 com exatamente 32 bytes.
- `FIELD_ENCRYPTION_HASH_KEY` deve ser segredo dedicado para HMAC determinístico de CPF.
- Não rodar backfill de CPF sem `verify-cpf-encryption-key.ts` passando no mesmo ambiente.
