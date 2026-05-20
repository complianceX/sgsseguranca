# Neon — Runbook de validação de segurança (SGS)

Este runbook valida, com evidência SQL, se a postura de segurança do Postgres/Neon está alinhada com o modelo do SGS:

- runtime com role **sem BYPASSRLS** (`sgs_app`)
- RLS ativo e forçado em tabelas tenant-scoped (`company_id`)
- extensões mínimas (somente as necessárias)
- grants previsíveis (sem privilégios amplos por engano)

## Execução via script repo-backed

No diretório `backend`:

```bash
npm run db:security-posture
npm run db:security-posture:json
npm run db:security-posture:strict
```

Interpretação:
- `db:security-posture`: saída humana resumida para leitura operacional
- `db:security-posture:json`: artefato estruturado para pipeline
- `db:security-posture:strict`: retorna exit code `1` quando existir qualquer `finding`

O script não imprime connection string, CPF, tokens, senhas ou payloads de negócio. Ele só emite metadados de postura: role atual, grants, cobertura de RLS e inventário de extensões.

## 1) Role runtime (`sgs_app`)

Execute com um usuário com permissão de leitura em `pg_roles`:

```sql
SELECT
  rolname,
  rolbypassrls,
  rolsuper,
  rolcreaterole,
  rolcreatedb
FROM pg_roles
WHERE rolname IN ('sgs_app');
```

Critério esperado:
- `rolsuper=false`
- `rolbypassrls=false`
- `rolcreaterole=false`
- `rolcreatedb=false`

### Grants efetivos do runtime

```sql
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'sgs_app'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;
```

Sinal de alerta:
- grants em tabelas sem RLS
- grants em views/materialized views com dados cross-tenant
- grants `TRIGGER`, `REFERENCES` ou `TRUNCATE` para a role runtime devem ser tratados como indevidos até prova contrária
- grants de runtime em tabelas tenant-scoped sem postura RLS completa devem ser tratados como falha
- grants herdados por roles das quais `sgs_app` é membro e grants para `PUBLIC` também entram na revisão

## 2) RLS gate (tabelas com `company_id`)

Valida que qualquer tabela `public.*` com coluna `company_id` está com RLS habilitado/forçado e com policy tenant padrão:

```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
      AND p.policyname = 'tenant_isolation_policy'
  ) AS has_tenant_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attname = 'company_id'
  AND a.attisdropped = false
ORDER BY c.relname;
```

Critério esperado:
- `rls_enabled=true`
- `rls_forced=true`
- `has_tenant_policy=true`, validando expressão de isolamento por `current_company()` e `is_super_admin()` para `SELECT`, `INSERT`, `UPDATE` e `DELETE`; nome da policy sozinho não é evidência suficiente

Falha bloqueante:
- qualquer tabela `public.*` com `company_id` sem `RLS`
- qualquer tabela `public.*` com `company_id` sem `tenant_isolation_policy`
- tabelas críticas sem `FORCE ROW LEVEL SECURITY`

No baseline atual do SGS, tratar como críticas pelo menos:
- `users`
- `expense_reports`
- `expense_advances`
- `expense_items`
- `signatures`
- `tenant_document_policies`
- `privacy_requests`
- `privacy_request_events`
- `medical_exams`
- `trainings`

## 3) Extensões instaladas

```sql
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;
```

Recomendação SGS (baseline):
- `uuid-ossp` (UUIDs)
- `pg_trgm` (busca/índices de texto onde aplicável)

Observação:
- `pg_stat_statements` pode ser útil, mas deve ter **acesso restrito** e não deve expor SQL com PII para roles runtime.

Saída esperada do script:
- lista legível `extname@extversion`
- revisão manual do drift contra o baseline aprovado do ambiente
- extensão inesperada não é bloqueio automático por si só, mas deve ser revisada

## 4) CPF plaintext (sanity check pós-backfill)

```sql
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE cpf IS NOT NULL AND btrim(cpf) <> '')::int AS cpf_plaintext,
  COUNT(*) FILTER (WHERE cpf_hash IS NOT NULL)::int AS cpf_hash,
  COUNT(*) FILTER (WHERE cpf_ciphertext IS NOT NULL)::int AS cpf_ciphertext
FROM public.users;
```

Critério esperado (pós-migração):
- `cpf_plaintext = 0`
- `cpf_hash > 0` e `cpf_ciphertext > 0` (compatível com base existente)

## Leitura do resultado

- `status=pass`: nenhum finding bloqueante foi encontrado; warnings ainda exigem triagem
- `findings`: postura insegura que deve falhar em CI e impedir promoção
- `warnings`: itens não bloqueantes nesta rodada, mas que precisam de decisão explícita

Próximos passos manuais quando houver `finding`:
- corrigir RLS/policy/FORCE RLS na migration adequada
- revisar grants da role runtime (`sgs_app`) antes de novo deploy
- rerodar `npm run db:security-posture:strict`
