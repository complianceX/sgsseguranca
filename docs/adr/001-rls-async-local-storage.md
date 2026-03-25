# ADR-001: Isolamento Multi-Tenant com RLS + AsyncLocalStorage
Status: Accepted | Date: 2026-03-24

## Contexto
O sistema é SaaS multi-tenant e precisa garantir isolamento por `company_id` em todos os módulos, sem depender de filtros manuais espalhados em cada service.

No backend, o contexto de tenant é resolvido por request (`TenantMiddleware`) e propagado com `AsyncLocalStorage` (`TenantService`). No banco, as tabelas tenant-scoped têm RLS habilitado com policy `tenant_isolation_policy` e funções de sessão (`current_company()`, `is_super_admin()`).

## Decisão
Adotamos um modelo híbrido e fail-closed:

- Contexto em aplicação: `TenantMiddleware` + `TenantService` (AsyncLocalStorage)
- Enforcement em banco: PostgreSQL RLS com `FORCE ROW LEVEL SECURITY`
- Injeção automática de contexto no pool: `TenantDbContextService` patcha `pg.Pool.connect()` e executa `set_config(...)` em cada conexão adquirida

Isso evita vazamento cross-tenant por esquecimento de filtro em query de domínio.

## Consequências (prós e contras)
Prós:
- Defesa em profundidade: app + banco
- Menor risco de erro humano em queries novas
- Compatível com acesso super-admin controlado por contexto explícito

Contras:
- Complexidade operacional maior (RLS + contexto de sessão)
- Dependência de disciplina em migrações para manter policy em tabelas novas
- Debug exige atenção ao contexto de tenant ativo

## Alternativas consideradas
- Apenas filtros na aplicação (`where company_id = ...`) em todos os services
: rejeitado por alto risco de regressão.
- Apenas RLS nativo sem contexto de aplicação
: insuficiente para logs, auditoria e telemetria por request.
- Schema por tenant
: maior custo operacional e de manutenção para o estágio atual do produto.
