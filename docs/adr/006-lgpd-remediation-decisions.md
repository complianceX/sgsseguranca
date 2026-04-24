# ADR-006: Decisões de Remediação LGPD — Fase 1 a Fase 3
Status: Accepted | Date: 2026-04-23

## Contexto

Auditoria completa de privacidade identificou 25 achados (A1–A25) cobrindo ausência de prova material de consentimento, falhas de fail-fast em variáveis críticas, GDPR deletion em memória, ai_interactions fora do escopo LGPD, inconsistência de retenção e ausência de modal de primeiro acesso. Este ADR registra as decisões arquiteturais tomadas para remediar os achados prioritários.

---

## Decisão 1 — Consentimento versioned, event-sourced (A1, A3)

**Problema:** o campo `users.ai_processing_consent` era um boolean sem registro de IP, user-agent, timestamp nem versão do texto aceito. Sem prova material, o consentimento seria inválido perante a ANPD.

**Decisão:** substituir pela tabela `user_consents` (event-sourced) e `consent_versions` (imutável).

- Cada aceite/revogação gera uma linha nova — nunca sobrescreve.
- O hash SHA-256 do corpo do documento é armazenado na `consent_versions` (`body_hash`) e verificado na publicação de versões.
- A tabela `user_consents` armazena `accepted_ip`, `accepted_user_agent`, `accepted_at` e `version_id` (FK para o texto aceito).
- `ConsentsService.hasActiveConsent(userId, type)` verifica se a versão aceita coincide com a versão vigente. Se o texto mudar, o usuário é forçado a re-aceitar.

**Alternativas descartadas:**
- Flag booleana versionada (sem IP/UA — insuficiente para prova).
- Armazenar consentimento no JWT (violaria princípio da necessidade e não permitiria revogação em tempo real).

---

## Decisão 2 — AiConsentGuard delegado ao ConsentsService (A3)

**Problema:** `AiConsentGuard` lia `users.ai_processing_consent` diretamente — não detectava versão desatualizada do consentimento.

**Decisão:** o guard injeta `ConsentsService` e chama `hasActiveConsent(userId, 'ai_processing')`. Se a versão do texto mudou desde o último aceite, o guard bloqueia com 403 e o usuário é direcionado a re-aceitar.

---

## Decisão 3 — Fail-fast em produção para variáveis críticas (A7, A8)

**Problema:** `FIELD_ENCRYPTION_HASH_KEY` ausente em produção levava a fallback `'sgs-dev-field-hash-key'`, criando risco de rainbow-table attack em CPFs. Variáveis legais (`DPO_EMAIL`, `POLICY_VERSION`, etc.) podiam estar vazias sem erro.

**Decisão:** throws explícitos durante bootstrap do módulo/runtime:

- `field-encryption.util.ts`: lança se `NODE_ENV=production`, `FIELD_ENCRYPTION_ENABLED=true` e a chave está ausente.
- `legal.ts` (frontend): lança se `NEXT_PUBLIC_APP_ENV=production` e qualquer campo legal obrigatório está vazio.

**Fail-safe:** em desenvolvimento os erros são logados/sinalizados mas não bloqueiam.

---

## Decisão 4 — GDPR deletion requests persistidos em banco (A11)

**Problema:** `GDPRDeletionService` usava `Map<string, GDPRDeleteRequest>` em memória — dados perdidos em restart, auditoria impossível.

**Decisão:** criar tabela `gdpr_deletion_requests` (migration 1709000000144) com status, tabelas processadas, timestamp e mensagem de erro. O service injeta `Repository<GdprDeletionRequest>` e persiste cada requisição antes de executar a função SQL.

**Comportamento:** a linha é criada com `status = 'in_progress'` antes da execução e atualizada para `completed` ou `failed` no `finally`. Falhas ficam auditáveis.

---

## Decisão 5 — validateUserConsent corrigido (A12)

**Problema original:** `validateUserConsent` checava `ai_processing_consent` para decidir se o usuário "pode ser deletado" — semanticamente errado. LGPD Art. 18 VI é um direito incondicional, não condicionado a AI consent.

**Decisão:** o método agora verifica (1) usuário existe e (2) não há requisição `pending/in_progress` para o mesmo usuário, prevenindo duplicatas. Retorna `can_delete: false` apenas nesses dois casos.

---

## Decisão 6 — ai_interactions cobertos por GDPR e TTL (A13)

**Problema:** `gdpr_delete_user_data()` e `cleanup_expired_data()` não cobriam `ai_interactions`. Dados de perguntas/respostas permaneciam vinculados ao usuário após pedido de erasure.

**Decisão (migration 1709000000145):**

- Adicionar `deleted_at TIMESTAMPTZ` à tabela `ai_interactions`.
- `gdpr_delete_user_data()` anonimiza: `question = '[LGPD: dado apagado]'`, `response = NULL`, `user_id = NULL`, `deleted_at = NOW()`.
- `cleanup_expired_data()` hard-deleta `ai_interactions` com `deleted_at < NOW() - INTERVAL '1 year'`.
- `AiInteraction` entity recebe `@DeleteDateColumn() deleted_at`.

---

## Decisão 7 — audit_logs retention alinhada (A14)

**Problema:** `cleanup_expired_data()` deletava `audit_logs` após 1 ano, mas `data_retention_policies` registrava 730 dias (2 anos). Código e política divergentes.

**Decisão:** a migration 1709000000145 altera o intervalo para `INTERVAL '2 years'` e atualiza o registro em `data_retention_policies` (`retention_days = 730`). A fonte de verdade é a tabela + a função, alinhadas.

---

## Decisão 8 — Modal de primeiro acesso para consentimentos base (A2)

**Problema:** usuários podiam entrar no dashboard sem nunca ter sido expostos à Política de Privacidade ou Termos de Uso vigentes.

**Decisão:** implementar `FirstAccessConsentModal` integrado ao `DashboardLayout`:

- Hook `useRequiredConsents` chama `GET /users/me/consents` uma vez por sessão.
- Se `privacy` ou `terms` não estiverem ativos na versão vigente, o modal é exibido de forma bloqueante (sem botão de fechar).
- O modal oferece `privacy` e `terms` como obrigatórios e `ai_processing` como opcional.
- Ao aceitar, chama `POST /users/me/consents` para cada tipo selecionado.
- **Fail open:** se o endpoint `/users/me/consents` retornar erro, o modal não é exibido para não bloquear o acesso indevidamente.

**Nota sobre AiConsentModal:** o modal de IA específico (`AiConsentModal` + `useAiConsent`) continua operando para o fluxo pontual de habilitação da Sophie, pois é exibido no momento de uso do AIButton, não no login.

---

## Decisão 9 — Páginas legais com conteúdo LGPD-compliant (A15–A20)

- **Política de Privacidade** (`/privacidade`): adicionados suboperadores nomeados (OpenAI, Supabase, Cloudflare, Sentry, New Relic), tabela de transferências internacionais com salvaguardas, seção de dados sensíveis de saúde (Art. 11), tabela de retenção, tabela de cookies, DPO com telefone/e-mail, links para /termos e /cookies.
- **Termos de Uso** (`/termos`): adicionadas cláusula de responsabilidade de IA (lista explícita de não-substituição), notificação de incidentes em 48h (Art. 48 LGPD), janela de exportação de 30 dias pós-rescisão, teto de responsabilidade de 12 meses.
- **Política de Cookies** (`/cookies`): página nova com tabela de 7 cookies (name, category, purpose, duration, third-party, HttpOnly, Secure), seção sobre localStorage/sessionStorage, instrução de configuração por browser.

---

## Consequências

- **Positivas:** prova material de consentimento para ANPD; auditoria completa de deleção; ai_interactions cobertas pelo direito ao esquecimento; retenção de dados alinhada em código e política; modal garante que nenhum usuário acesse o dashboard sem ter sido exposto aos documentos legais vigentes.
- **Negativas / trade-offs:** cada login (nova sessão) faz um request adicional a `GET /users/me/consents` — impacto negligenciável pois é uma query simples por índice; `consent_versions` precisa ser populada pelo seeder antes de qualquer aceite.
- **Débito técnico registrado:** `useAiConsent` ainda usa `users.ai_processing_consent` (boolean) para estado otimista. Migrar para `consentsService.getStatus()` eliminaria a dependência do campo legado — pode ser feito após validação do fluxo de consentimento versioned em produção.
