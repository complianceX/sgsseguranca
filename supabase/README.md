# Supabase Schema Governance

O diretório [`supabase/migrations`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations) é a fonte oficial do schema do banco.

## Regras

- Toda mudança estrutural deve entrar primeiro como migration incremental do Supabase.
- O baseline inicial está em [`20260403120000_baseline_public_schema.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403120000_baseline_public_schema.sql).
- O endurecimento inicial de RLS para tabelas sensíveis está em [`20260403133000_rls_hardening_sensitive_tables.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403133000_rls_hardening_sensitive_tables.sql).
- A padronização inicial de UUID/FKs em tabelas sensíveis está em [`20260403143000_standardize_sensitive_uuid_columns.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403143000_standardize_sensitive_uuid_columns.sql).
- A consolidação canônica de [`audit_logs`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403153000_consolidate_audit_logs.sql) está em [`20260403153000_consolidate_audit_logs.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403153000_consolidate_audit_logs.sql).
- O endurecimento final de [`ai_interactions.user_id`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403154000_enforce_ai_interactions_user_uuid.sql) está em [`20260403154000_enforce_ai_interactions_user_uuid.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403154000_enforce_ai_interactions_user_uuid.sql).
- A ponte inicial para `Supabase Auth` está em [`20260403155000_prepare_supabase_auth_bridge.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403155000_prepare_supabase_auth_bridge.sql).
- O endurecimento operacional de `user_sessions` está em [`20260403156000_harden_user_sessions.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403156000_harden_user_sessions.sql).
- A compatibilidade de claims com `Supabase Auth` e o `custom_access_token_hook` estão em [`20260403161000_support_supabase_auth_claims.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403161000_support_supabase_auth_claims.sql).
- O backfill inicial de `public.users.auth_user_id` por e-mail está em [`20260403162000_backfill_users_auth_user_id_from_auth.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403162000_backfill_users_auth_user_id_from_auth.sql).
- A remediação do legado sistêmico que bloqueava UUID/FKs finais está em [`20260403163000_remediate_legacy_system_markers.sql`](C:/Users/User/Documents/trae_projects/sgs-seguraca/supabase/migrations/20260403163000_remediate_legacy_system_markers.sql).
- Dumps em `temp/supabase-migration/` são apenas artefatos de auditoria, recuperação e comparação.
- `DATABASE_SCHEMA_DDL.sql` e documentos derivados não são fonte de verdade para deploy.
- Não editar schema manualmente no painel do Supabase sem gerar a migration correspondente no repositório.

## Uso operacional

- Ambiente limpo: reconstruir a base a partir de `supabase/migrations/`.
- Staging: aplicar baseline apenas em banco vazio ou por reconciliação controlada.
- Produção existente: nunca aplicar o baseline diretamente sem diff validado; criar migrations incrementais a partir do estado real.

## Compatibilidade atual

- O baseline preserva a coluna `public.users.password` apenas como legado temporário.
- `public.users.auth_user_id` passa a existir como ponte para `auth.users(id)`.
- `public.user_sessions` passa a exigir expiração e registrar revogação explícita.
- O `Supabase Auth` passa a poder emitir claims canônicas do domínio via `public.custom_access_token_hook(jsonb)`.
- As functions `public.current_company()`, `public.current_user_role()` e `public.is_super_admin()` passam a entender tanto variáveis de sessão do backend quanto `request.jwt.claims` do ecossistema Supabase.
- O alvo arquitetural continua sendo `Supabase Auth`, mas a remoção do legado ocorrerá em migration posterior.
- O backend passa a conseguir provisionar/atualizar `auth.users` quando `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_AUTH_SYNC_ENABLED=true` estiverem configurados.
- Para sincronização em massa dos usuários legados, use `npm run auth:sync:supabase` em `backend/` para `dry-run` e `npm run auth:sync:supabase:apply` para efetivar.
- Em login local bem-sucedido, o backend pode sincronizar a senha conhecida para o `Supabase Auth` em background quando `SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN=true`.
- O corte final de `public.users.password` deve ser faseado:
  - manter `LEGACY_PASSWORD_AUTH_ENABLED=true` durante a transição
  - deixar o sync em login (`SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN=true`) migrar os usuários ativos
  - usar `forgot-password` / `reset-password` ou scripts operacionais para os usuários restantes
  - só então desligar `LEGACY_PASSWORD_AUTH_ENABLED=false`, com `SUPABASE_URL` e `SUPABASE_JWT_SECRET` já configurados no backend
  - após o desligamento, o backend continua aceitando `/auth/login`, `/auth/change-password` e `/auth/confirm-password`, mas a verificação de senha passa a usar `auth.users` como fonte canônica
- `public.audit_logs` passa a expor apenas o contrato canônico: `userId`, `entity`, `entityId`, `companyId`, `timestamp`.
- `public.ai_interactions.user_id` passa a ser `uuid` obrigatório com FK para `public.users(id)`.
- A configuração remota do Auth do projeto de produção deve permanecer alinhada com:
  - `site_url = https://app.sgsseguranca.com.br`
  - `uri_allow_list = https://app.sgsseguranca.com.br,https://app.sgsseguranca.com.br/**,http://localhost:3000/**,http://localhost:3001/**,http://localhost:3002/**`
- O dump auditado que originou o baseline foi extraído de PostgreSQL `16.12`.
- O `supabase/config.toml` permanece com `db.major_version = 17` para compatibilidade com o tooling local atual; reconcilie essa divergência antes do primeiro deploy de migration em produção.
- Para validar `npx supabase db reset --local`, este ambiente precisa do Docker Desktop ativo.
- Para a API NestJS aceitar access tokens do Supabase, configure também `SUPABASE_JWT_SECRET` no backend.
