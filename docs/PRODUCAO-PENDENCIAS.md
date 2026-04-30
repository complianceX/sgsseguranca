# Pendências Pré-Produção

Itens que requerem ação manual (fora do código) ou decisão de negócio para fechar completamente.

---

## 1. Sentry DSN — Configurar no Render Dashboard

**Backend** (`sgs-backend-web` e `sgs-backend-worker`)

O `render.yaml` já tem a chave `SENTRY_DSN` declarada. Falta preencher o valor:

1. Acesse [sentry.io](https://sentry.io) → Crie dois projetos: `sgs-backend` e `sgs-frontend`
2. Copie o DSN de cada projeto
3. No Render Dashboard: **Settings → Environment Groups → `sgs-backend-common` → adicione `SENTRY_DSN`**
4. Faça redeploy para ativar

**Frontend** (`app.sgsseguranca.com.br`)

O frontend usa `NEXT_PUBLIC_SENTRY_DSN`. Configure na plataforma de deploy do frontend (Vercel / Cloudflare Pages / Render Static):

```
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<orgId>.ingest.sentry.io/<projectId>
```

---

## 2. Auth local no Neon — estado operacional

**Status atual**: `LEGACY_PASSWORD_AUTH_ENABLED=true` em produção

O sistema autentica via `users.password` (hash argon2id local) porque o banco Neon atual não possui schema `auth.users`. Este é o modo operacional explícito enquanto `SUPABASE_AUTH_SYNC_ENABLED=false`.

**Como verificar se existe base para cutover Supabase Auth:**

```bash
node backend/scripts/audit-supabase-auth-cutover.js
```

Se o audit retornar `relation "auth.users" does not exist`, não desligue `LEGACY_PASSWORD_AUTH_ENABLED`: isso quebraria login por senha.

**Somente após provisionar Supabase Auth/Neon Auth e confirmar 100% de usuários com `auth_user_id`:**

No `render.yaml`, altere:
```yaml
LEGACY_PASSWORD_AUTH_ENABLED: "false"
SUPABASE_AUTH_SYNC_ENABLED: "true"
SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN: "true"
```

Faça o cutover gradual: habilite sync, valide login real e só então desative o auth local.

---

## 3. SECURITY_HARDENING_PHASE — Avançar para phase1/phase2

**Status atual**: `SECURITY_HARDENING_PHASE=phase0` no `render.yaml`

O módulo de IA (`AiService`) tem features gates por fase. Phase2 inclui:
- Risk gate automático em IA
- Checklist auto-NC por IA

Para ativar quando o módulo AI estiver validado em produção:
```yaml
SECURITY_HARDENING_PHASE: "phase1"  # ou "phase2"
```

---

## O que já está correto (não requer ação)

- `npm audit`: 0 vulnerabilidades em backend e frontend
- `synchronize: false` no PostgreSQL de produção (só SQLite em dev usa `true`)
- Scripts SQL manuais em `scripts/deprecated-sql/` — todos cobertos pelas migrations TypeScript
- RLS habilitado em todas as tabelas tenant
- CSRF enforced em produção
- Redis `volatile-lru` (tokens revogados nunca evictados)
- DEV bypass flags ausentes no `render.yaml`
- `preDeployCommand` garante migrations antes de receber tráfego
