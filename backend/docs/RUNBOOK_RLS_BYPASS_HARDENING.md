# Runbook — Conclusao do hardening de isolamento multi-tenant (bypass de RLS, PR #137)

> Status: PLANO APROVADO (Caminho A — conexao dedicada). Fases 2 e 3 dependem de
> staging, credenciais de owner do banco e janela controlada. NADA em producao
> deve ser executado fora deste runbook e sem janela + backup.

## 1. Contexto e estado atual

A migration `1709000000346-harden-rls-bypass-role-gate` (do #137) ja redefiniu
`public.is_super_admin()` para exigir DUAS condicoes: a flag de sessao
`app.is_super_admin` E `pg_has_role(current_user,'sgs_rls_bypass','MEMBER')`.
Ela tambem concedeu `sgs_rls_bypass` ao `sgs_app` (compatibilidade), entao o
comportamento hoje e identico ao anterior. O vetor so fecha de fato com o
`REVOKE sgs_rls_bypass FROM sgs_app` — e esse REVOKE so e seguro depois que as
operacoes que legitimamente precisam de acesso cross-tenant deixarem de usar a
conexao comum (`sgs_app`).

Runtime hoje liga o bypass apenas quando `isSuperAdmin && !companyId`
(super admin sem empresa) — ver `TenantDbContextService`.

## 2. Consumidores do bypass (mapeados)

| Consumidor | Uso | Destino no plano |
|---|---|---|
| Login (auth.service) | achar usuario por CPF sem tenant + rehash senha | funcao SECURITY DEFINER escopada |
| Exclusao LGPD (gdpr-deletion) | apagar/anonimizar dados de empresa/titular | conexao dedicada sgs_admin |
| Trilha forense (forensic-trail) | gravar auditoria fora de contexto de tenant | conexao dedicada sgs_admin |
| Cleanup / observability / mail (tarefas) | jobs sem contexto de tenant | conexao dedicada sgs_admin |
| Operador super-admin (dashboards globais, provisionamento) | ver/gerir todos os tenants | REMOVER (nao e necessario) |

LGPD e login DEVEM continuar funcionando — sao obrigacao legal / acesso de todos.
"Remover super admin" = remover as telas/rotas de OPERADOR cross-tenant, nao a conta.

## 3. Arquitetura alvo (Caminho A)

- Nova role de banco: `sgs_admin LOGIN`, membro de `sgs_rls_bypass`.
- Nova env: `DATABASE_ADMIN_URL` (aponta para `sgs_admin`), endpoint Neon DIRETO (sem -pooler).
- Novo DataSource/pool privilegiado no app (dormante se `DATABASE_ADMIN_URL` ausente).
- Operacoes raras cross-tenant (LGPD, forense, cleanup) passam a usar o pool privilegiado.
- Login: nova funcao `SECURITY DEFINER` `find_login_user(cpf)` — resolve o usuario sem
  bypass de sessao; auth.service passa a chama-la.
- Remover rotas/telas de operador super-admin.
- Runtime `sgs_app` deixa de precisar do bypass -> REVOKE.

## 4. FASE 1 — codigo (PR revisado, sem tocar em producao)

Fatiar para reduzir risco:
- PR 1a: DataSource privilegiado + config (Joi `DATABASE_ADMIN_URL`) + guardas + testes. Aditivo/dormante.
- PR 1b: rotear LGPD/forense/cleanup para o pool privilegiado + testes.
- PR 1c: login via `find_login_user` SECURITY DEFINER (migration + auth.service) + testes. (Mais sensivel — validar em staging.)
- PR 1d: remover rotas/telas de operador super-admin.

## 5. FASE 2 — staging

1. Provisionar `sgs_admin` no banco de staging (secao 6, passos S1-S2).
2. Setar `DATABASE_ADMIN_URL` no staging.
3. Deploy do codigo das fases 1a-1d.
4. Validar: login OK; operacao normal de tenant OK; LGPD/forense OK via pool dedicado.
5. Rodar os testes de isolamento (secao 7).
6. So depois de tudo verde: aplicar o REVOKE em staging (passo P4) e repetir os testes.

## 6. FASE 3 — producao (janela controlada)

Pre-requisitos: BACKUP recente confirmado; `DATABASE_MIGRATION_URL`/owner disponivel;
janela de menor uso; fases 1a-1d ja deployadas e validadas em staging.

Ordem (NAO pular):

```sql
-- P1. Backup logico da role/grants atuais (evidencia + rollback)
SELECT rolname FROM pg_roles WHERE rolname IN ('sgs_app','sgs_admin','sgs_rls_bypass');
SELECT r.rolname AS member, g.rolname AS granted_role
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.member
JOIN pg_roles g ON g.oid = m.roleid
WHERE g.rolname = 'sgs_rls_bypass';

-- P2. Criar a role dedicada (senha forte via segredo; NAO commitar a senha)
CREATE ROLE sgs_admin LOGIN PASSWORD '<SEGREDO_FORTE>';
GRANT sgs_rls_bypass TO sgs_admin;
-- Conceder os mesmos privilegios de dados que sgs_app tem (SELECT/INSERT/UPDATE/DELETE
-- nas tabelas de aplicacao) — herdar via role comum se existir, ou GRANT explicito.

-- P3. Setar DATABASE_ADMIN_URL no Coolify (sgs_admin, endpoint DIRETO) e fazer deploy.
--     Validar /health e um fluxo de LGPD/forense em modo seguro.

-- P4. O passo que fecha o vetor (apos P3 validado):
REVOKE sgs_rls_bypass FROM sgs_app;
```

## 7. Testes de isolamento (rodar como sgs_app, apos REVOKE)

Usar duas empresas de teste (companyA, companyB). Conectar como `sgs_app`.

```sql
-- Contexto de tenant A
SELECT set_config('app.current_company_id','<companyA>',false),
       set_config('app.is_super_admin','false',false);

-- 7.1 READ cross-tenant deve retornar 0 linhas de B
SELECT count(*) FROM users WHERE company_id = '<companyB>';   -- esperado: 0

-- 7.2 Tentar escalar via flag (o vetor) — deve NAO conceder bypass
SELECT set_config('app.is_super_admin','true',false);
SELECT count(*) FROM users WHERE company_id = '<companyB>';   -- esperado: 0 (pg_has_role falha)
SELECT public.is_super_admin();                               -- esperado: false

-- 7.3 INSERT/UPDATE/DELETE cross-tenant devem falhar/afetar 0 linhas
INSERT INTO some_table (company_id, ...) VALUES ('<companyB>', ...);  -- esperado: erro RLS / 0
UPDATE some_table SET x = y WHERE company_id = '<companyB>';           -- esperado: 0 linhas
DELETE FROM some_table WHERE company_id = '<companyB>';                -- esperado: 0 linhas

-- 7.4 Fail-closed sem contexto
SELECT set_config('app.current_company_id','',false);
SELECT count(*) FROM users;                                  -- esperado: 0 (current_company() lanca -> NULL)
```

Repetir 7.1-7.4 com o papel `sgs_admin` para confirmar que a conexao dedicada
CONTINUA enxergando cross-tenant (para LGPD/forense).

## 8. Rollback

Se algo quebrar apos o REVOKE:

```sql
GRANT sgs_rls_bypass TO sgs_app;   -- restaura o comportamento anterior imediatamente
```

O login/LGPD voltam a funcionar na conexao comum. Investigar antes de retentar.
A migration 346 tem `down()` que restaura a definicao antiga de is_super_admin.

## 9. Evidencias a registrar

- Saida dos passos P1 (grants antes/depois).
- Resultado de cada teste 7.1-7.4 (como sgs_app e como sgs_admin).
- /health pos-deploy, um login real, uma operacao LGPD de teste.
- Confirmacao final: `SELECT ... FROM pg_auth_members` sem sgs_app em sgs_rls_bypass.

## Criterio de conclusao

Runtime (`sgs_app`) sem `sgs_rls_bypass`; login e LGPD funcionando (definer / conexao
dedicada); leitura e escrita cross-tenant bloqueadas com o papel comum; fail-closed sem
contexto confirmado.