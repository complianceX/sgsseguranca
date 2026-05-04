# Produção - verificação módulo a módulo (2026-05-03)

## Escopo
Validação E2E funcional em produção (`app.sgsseguranca.com.br` + `api.sgsseguranca.com.br` + Neon), seguindo o baseline do `AGENTS.md`: multi-tenant, LGPD, autenticação/autorização, PDF governado e storage.

## Pré-requisitos validados
- Frontend público e login: `200`
- API `GET /health/public`: `200`
- API `GET /auth/csrf`: `200`
- Backend/worker/migrations live no commit `de6ced760abe6fa691bafdc5f82e3dd47d73e0b0`
- `backend npm run smoke:db:readonly`: `pass`
- `backend npm run verify:rls:public`: `checked=64`, `failures=0`

## Tenants usados
- **AJN CONSULTORIA E ENGENHARIA**: usuário TST
- **Gandra Tecnologia**: usuário `Administrador Geral`

## Veredito por módulo

### 1. Auth / sessão / isolamento multi-tenant
**Veredito:** funcional

**Evidências**
- Login + sessão fecharam nos dois tenants (`/auth/csrf -> /auth/login -> /auth/me`).
- Anônimo em `/users` recebe `401`.
- TST da AJN tentando consultar usuários da Gandra com `x-company-id` forjado recebe `403`.
- `Administrador Geral` sem `x-company-id` em `/users` recebe `401`; com contexto explícito recebe `200`.

**Notas**
- O contrato de tenant explícito para `Administrador Geral` está funcionando.
- O isolamento cross-tenant está consistente com RLS e authz.

### 2. Usuários / empresas / permissões
**Veredito:** funcional com comportamento esperado por permissão

**AJN (TST)**
- `/users` API: `403` (`Permissões insuficientes: can_view_users`).
- UI `/dashboard/users`: o frontend tenta carregar `/users?page=1&limit=20&identity_type=system_user`, recebe `403` e redireciona para `/dashboard`.
- Console: `.playwright-mcp/console-2026-05-03T20-52-49-441Z.log`

**Gandra (Administrador Geral)**
- `/users?page=1&limit=5` com `x-company-id`: `200`, `total=143`.
- `/users` sem `x-company-id`: `401`.
- `/companies?page=1&limit=5`: `200`.

**Achados**
- **Baixa**: a UI de `/dashboard/users` para perfis sem permissão cai em redirect após `403`, mas sem mensagem explícita de “acesso negado”. O usuário vê o dashboard, não a causa.

### 3. APR
**Veredito:** funcional

**AJN (TST)**
- UI `/dashboard/aprs`: `0 APRs encontradas`.

**Gandra (Administrador Geral)**
- UI `/dashboard/aprs`: `2 APRs encontradas`.
- APR aprovada `28d3621e-91af-4cc4-88e5-cf827b2546d2`:
  - `GET /aprs/:id/pdf`: `200`
  - `availability=ready`
  - URL governada emitida
  - `HEAD` no download tokenizado: `200`, `Content-Type: application/pdf`, `Content-Length: 110991`
- APR pendente `3b6f3bb9-1685-4556-9fe1-a3a795695fb9`:
  - `GET /aprs/:id/pdf`: `200`
  - `availability=not_emitted`

**Achados**
- **Média**: `GET /aprs/28d3621e-91af-4cc4-88e5-cf827b2546d2/workflow-status` retorna `403` (`Funcionalidade não disponível`) mesmo para `Administrador Geral`. O módulo principal funciona, mas esse subfluxo está indisponível em produção.

### 4. DDS
**Veredito:** funcional

**AJN (TST)**
- UI `/dashboard/dds`: `12` registros
- DDS `68b09329-82bd-49a9-b155-6e226b8e3be5`:
  - `GET /dds/:id`: `200`
  - `GET /dds/:id/signatures`: `200`
  - `GET /dds/:id/pdf`: `200`, `availability=not_emitted`

**Gandra (Administrador Geral)**
- UI `/dashboard/dds`: `2` registros

**Notas**
- Fluxo de leitura/listagem e estado de PDF governado estão consistentes.
- Não forcei emissão/assinatura em produção para não mutar dados reais.

### 5. PT
**Veredito:** funcional

**AJN (TST)**
- UI `/dashboard/pts`: lista acessível, sem PTs ativas.

**Gandra (Administrador Geral)**
- UI `/dashboard/pts`: lista acessível, sem PTs ativas.

**Notas**
- Sem dados suficientes para validar aprovação/finalização sem mutação em produção.
- A superfície principal de listagem e acesso está estável.

### 6. Documentos / storage / registry
**Veredito:** funcional com proteção forte em operações sensíveis

**AJN (TST)**
- `GET /document-registry`: `403` (`can_view_documents_registry`)
- UI `/dashboard/document-registry`: falha com mensagem de erro clara.
- Console: `.playwright-mcp/console-2026-05-03T20-53-17-773Z.log`

**Gandra (Administrador Geral)**
- `GET /document-registry?company_id=...`: `200`, `3` documentos governados no recorte.
- Há evidência de PDFs governados de checklist e APR com `file_hash`, `document_code`, `expires_at` e `file_key` tenant-scoped.
- `GET /document-registry/weekly-bundle?...`: `403` com `STEP_UP_REQUIRED`.

**Notas**
- O download consolidado semanal está corretamente protegido por step-up MFA.
- O download do PDF de APR aprovada funciona via URL tokenizada restrita.

### 7. Sophie / IA
**Veredito:** funcional

**AJN (TST)**
- `GET /ai/status`: `403` (`can_use_ai`)
- UI `/dashboard/sst-agent`: mostra aviso explícito de falta da permissão `can_use_ai`.

**Gandra (Administrador Geral)**
- `GET /ai/status`: `200`
- Backend reporta provider OpenAI configurado, modo `online`, capabilities habilitadas para chat, geração e análise.

**Notas**
- O gate de permissão de IA está funcionando no backend e refletido na UI.

### 8. Workers / filas / jobs
**Veredito:** parcialmente validado

**Evidências indiretas fortes**
- Serviço worker live no commit correto.
- Documentos governados já persistidos no registry (`checklist`, `apr`) com `file_hash` e storage tenant-scoped.
- PDFs aprovados existentes estão acessíveis via fluxo governado.

**Limite desta rodada**
- Não enfileirei job novo em produção para não criar ou alterar dados reais.
- Portanto, retries, deduplicação e falha auditável ficaram **parciais** nesta verificação.

## Achados consolidados
1. **Média** — subrota APR `workflow-status` indisponível em produção para `Administrador Geral` (`403`).
2. **Baixa** — UX de `/dashboard/users` para perfis sem `can_view_users` redireciona para o dashboard após `403`, sem feedback explícito de autorização.
3. **Observação, não bug** — `weekly-bundle` exige `step-up MFA`; comportamento esperado e desejável.

## Arquivos de evidência
- `docs/audits/prod-e2e-evidence-2026-05-03.json`
- `.playwright-mcp/console-2026-05-03T20-52-49-441Z.log`
- `.playwright-mcp/console-2026-05-03T20-53-17-773Z.log`
- `.playwright-mcp/console-2026-05-03T20-39-43-485Z.log`
- `backend/output/security/rls/verify-tenant-rls-public-2026-05-03T20-31-00-537Z.json`
- `backend/temp/db-smoke-readonly-public-2026-05-03T20-31-00-537Z.json`
