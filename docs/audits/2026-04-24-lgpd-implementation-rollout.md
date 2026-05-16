# Rollout de implementação LGPD/privacidade - SGS

Data: 2026-04-24  
Base: auditoria `docs/audits/2026-04-24-lgpd-privacidade-termos-governanca.md`

## Fase 1 - Correções críticas imediatas

Status: **implementada no código**

Itens concluídos:

- Consentimento de IA no frontend passou a usar `consentsService.accept('ai_processing')`.
- Configurações de privacidade passaram a aceitar/revogar `ai_processing` via serviço versionado.
- Endpoint legado `/users/me/ai-consent` foi mantido por compatibilidade, mas agora também registra/revoga o consentimento versionado antes de sincronizar a flag legada.
- `useRequiredConsents` deixou de falhar aberto: erro na consulta de consentimentos bloqueia o dashboard até aceite/retry.
- CPF saiu dos paths do frontend e das rotas novas do backend; consultas por CPF agora usam `POST /users/worker-status/by-cpf` e `POST /users/worker-status/by-cpf/timeline`.
- Validação pública de APR passou a exigir token/grant `apr_public_validation`.
- PDFs finais de APR passaram a gerar URL pública com token de validação.
- `/verify` passou a encaminhar códigos `APR-` para `/public/aprs/verify`.
- Textos de IA foram revisados para não prometer anonimização absoluta, ausência total de dados individuais ou DPA vigente sem condição.
- Política de Privacidade reduziu promessa absoluta de AES-256 universal e DPAs com todos os suboperadores.
- Política de Cookies passou a refletir melhor o risco de storage local e sincronização offline.

## Fase 2 - Dados sensíveis no navegador

Status: **parcialmente implementada**

Itens concluídos:

- `usersService` não persiste mais listas/registros de usuários em `localStorage`.
- `ptsService` não persiste mais PTs em cache offline local.
- `inspectionsService` não persiste mais inspeções/evidências em cache offline local.
- `nonConformitiesService` não persiste mais não conformidades em cache offline local.
- `sophie-draft-storage` remove assinaturas, evidências, anexos, imagens, CPF, documentos, arquivos e data URLs de rascunhos persistidos no navegador.

Pendências técnicas:

- Remover ou endurecer filas offline de mutação para payloads sensíveis.
- Migrar rascunhos sensíveis para armazenamento autenticado no servidor.
- Limpar caches legados já existentes no navegador após login/logout ou troca de versão.

## Fase 3 - Direitos do titular e ciclo de vida

Status: **parcialmente implementada**

Itens concluídos:

- Exportação LGPD passou a incluir histórico de consentimentos/aceites versionados.
- Exportação LGPD passou a incluir inventário cross-domain de tratamento com contagens por área: exames, treinamentos, EPI, CAT, assinaturas, IA, documentos, APR, PT, DDS, logs, e-mails e atividades.
- Exportação LGPD passou a declarar limitações objetivas para documentos SST, arquivos/backups e logs de segurança que dependem de validação do controlador.
- Fluxo de `gdprErasure` passou a executar `gdpr_delete_user_data($1)` dentro da transação.
- Auditoria de `gdprErasure` passou a registrar a cobertura retornada pelo procedimento do banco.
- Criado módulo backend `privacy-requests` para protocolo de requisições do titular.
- Criada migration `1709000000146-create-privacy-requests` com RLS por tenant.
- Requisições LGPD agora têm tipo, status, titular, responsável interno, SLA interno, resposta e trilha temporal.
- Usuário autenticado pode abrir/listar suas requisições; administradores do tenant podem listar e atualizar status.

Pendências técnicas:

- Exclusão/anonimização por entidade e storage, incluindo PDFs, anexos, e-mails, documentos, CAT/APR/PT/DDS, exames e treinamentos quando cabível.
- Relatório de cobertura de eliminação por titular e por tenant.

## Fase 4 - Retenção, backups e governança contínua

Status: **parcialmente implementada**

Itens concluídos:

- Criada tabela `gdpr_retention_cleanup_runs` para evidenciar cada limpeza TTL manual ou agendada.
- `GDPRDeletionService.deleteExpiredData()` passou a gravar status, origem, tabelas limpas, contagem, duração e erro.
- Criada rota protegida `GET /admin/gdpr/retention-cleanup-runs` para consulta admin dos últimos runs de retenção.
- Criado scheduler worker-only `GdprRetentionCleanupScheduler` para executar a limpeza LGPD diariamente às 03:30.
- `TasksWorkerModule` passou a carregar o scheduler de retenção LGPD apenas no worker.
- Criado endpoint público técnico `GET /privacy-governance/subprocessors` com registro de suboperadores, finalidade, país/região, categoria, risco, transferência internacional, DPA e evidências pendentes.
- Criado endpoint público técnico `GET /privacy-governance/retention-matrix` com matriz de retenção por domínio de dado, fonte de verdade, modo de descarte e status de implementação.
- Criado endpoint público técnico `GET /privacy-governance/tenant-offboarding-checklist` com passos, responsáveis, evidência esperada e bloqueios de desligamento de tenant.
- Política de Privacidade foi ajustada para não afirmar DPA/SCC/criptografia/região como se todos estivessem comprovados; agora aponta necessidade de evidência por provedor.

Pendências técnicas / contratuais:

- Transformar a matriz técnica em configuração administrável por tenant quando houver política contratual específica.
- Automatizar inventário e expurgo físico de objetos em storage no offboarding.
- Confirmação contratual real dos suboperadores: DPA, SCC quando aplicável, região, retenção e logs.
- RIPD/DPIA para IA, saúde ocupacional, geolocalização e assinaturas.
- Testes e2e de privacidade por release.

## Validação executada

- Backend: `npm test -- public-apr-verification.controller.spec.ts users.controller.spec.ts aprs-pdf.service.spec.ts`
- Backend: `npm run build`
- Frontend: `npm test -- AiConsentModal.test.tsx app/verify/page.test.tsx`
- Frontend: histórico da fase inclui suite legada de inspeção; **não executar** `inspectionsService.test.ts` após a substituição do módulo por relatório fotográfico.
- Frontend: `npx tsc --noEmit`
- Frontend: `npm run build`
- Backend: `npm test -- users.service.spec.ts`
- Backend: `npm test -- privacy-requests.service.spec.ts users.service.spec.ts`
- Backend: `npm test -- gdpr-deletion.service.spec.ts gdpr-retention-cleanup.scheduler.spec.ts privacy-governance.service.spec.ts admin.controller.spec.ts`
- Backend: `npm run build`

## Fase 5 - Direitos do titular no produto

Status: **implementada no código**

Itens concluídos:

- Controller `privacy-requests` passou a permitir criação/listagem própria para todos os perfis autenticados, incluindo colaborador e trabalhador.
- Mantida restrição administrativa para listagem e atualização de requisições do tenant.
- Criado service frontend `privacyRequestsService` para criar e listar protocolos LGPD do titular.
- `usersService` passou a expor `exportMyData()` para `GET /users/me/export`.
- Tela de configurações ganhou seção "Privacidade e direitos do titular" com:
  - abertura de protocolo LGPD por tipo de direito;
  - descrição opcional com alerta para não inserir dados sensíveis desnecessários;
  - listagem dos últimos protocolos do usuário;
  - status, data de abertura e prazo interno;
  - botão de exportação JSON dos dados do próprio usuário.

Pendências técnicas:

- Tela administrativa dedicada para triagem/resposta das requisições do tenant.
- Teste e2e do fluxo completo titular -> admin -> resposta.
- Autenticação reforçada/revalidação para exportação e pedidos destrutivos, se exigido pelo risco.

Validação local:

- Backend: `npm test -- privacy-requests.controller.spec.ts privacy-requests.service.spec.ts`
- Frontend: `npm test -- privacyRequestsService.test.ts`
- Frontend: `npx tsc --noEmit`
- Backend: `npm run build`
- Frontend: `npm run build`

## Fase 6 - Triagem administrativa de requisições LGPD

Status: **implementada no código**

Itens concluídos:

- `privacyRequestsService` passou a suportar atualização de status/resposta.
- Criada tela `dashboard/privacy-requests` para administradores do tenant.
- A tela administrativa lista protocolos do tenant, exibe métricas de total, abertos e vencidos.
- Administrador pode alterar status e registrar resposta ao titular.
- Fluxo exige resposta textual antes de atender ou rejeitar requisição.
- Configurações ganhou link de governança para "Requisições LGPD" apenas com acesso ativo para administradores.

Pendências técnicas:

- E2E titular -> admin -> resposta com autenticação real.
- Notificação por e-mail ao titular quando houver mudança de status.
- Histórico granular de transições de status além do registro atual.

Validação local:

- Frontend: `npm test -- privacyRequestsService.test.ts`
- Frontend: `npx tsc --noEmit`
- Backend: `npm test -- privacy-requests.controller.spec.ts privacy-requests.service.spec.ts`
- Backend: `npm run build`
- Frontend: `npm run build`

## Fase 7 - Trilha granular dos protocolos LGPD

Status: **implementada no backend**

Itens concluídos:

- Criada entidade `PrivacyRequestEvent`.
- Criada migration `1709000000148-create-privacy-request-events` com RLS por tenant.
- Criação de protocolo agora registra evento `created`.
- Mudança de status registra evento `status_changed` com status anterior, novo status, responsável e notas.
- Atualização de resposta sem mudança de status registra evento `response_updated`.
- Criado endpoint `GET /privacy-requests/:id/events`, respeitando acesso do titular ou admin.
- `privacyRequestsService` passou a listar eventos do protocolo.
- Tela administrativa passou a exibir/ocultar histórico de eventos por protocolo.

Pendências técnicas:

- Notificar titular quando evento relevante for criado.

Validação local:

- Frontend: `npm test -- privacyRequestsService.test.ts`
- Frontend: `npx tsc --noEmit`
- Backend: `npm test -- privacy-requests.service.spec.ts privacy-requests.controller.spec.ts`
- Backend: `npm run build`
- Frontend: `npm run build`

## Fase 8 - Notificação ao titular

Status: **implementada no backend**

Itens concluídos:

- `PrivacyRequestsService` passou a buscar o titular do protocolo no mesmo tenant.
- Mudança de status ou resposta agora tenta enviar e-mail ao titular com protocolo, status anterior, status atual e resposta registrada.
- Envio é best-effort: falha de e-mail ou ausência de e-mail não bloqueia atualização do protocolo.
- Testes cobrem envio bem-sucedido, titular sem e-mail e falha do provedor sem quebra da atualização.

Pendências técnicas:

- Preferência do usuário para canal de notificação.
- Template HTML institucional para e-mails LGPD.
- Registro explícito de evento `notification_failed`/`notification_sent` se for exigida trilha de comunicação separada.

Validação local:

- Backend: `npm test -- privacy-requests.service.spec.ts privacy-requests.controller.spec.ts`
- Backend: `npm run build`

## Fase 9 - Manifesto de storage para offboarding

Status: **implementada no backend**

Itens concluídos:

- Criado endpoint protegido `GET /privacy-governance/admin/tenant-storage-manifest`.
- Endpoint exige tenant no contexto e roles `ADMIN_GERAL` ou `ADMIN_EMPRESA`.
- Manifesto lista objetos conhecidos em `document_registry` por tenant, com módulo, entidade, chave, hash, status, retenção e legal hold.
- Manifesto inclui total por módulo e indicação de truncamento.
- Listagem real de prefixos do storage é opcional via `includeStorageListing=true`, para funcionar localmente sem credenciais de cloud.
- Prefixos verificados quando solicitado: `documents/{tenantId}/`, `quarantine/{tenantId}/`, `reports/{tenantId}/`.

Pendências técnicas:

- Expandir manifesto para anexos fora do `document_registry` quando existirem fontes adicionais.
- Implementar expurgo físico com trava explícita, dry-run obrigatório e legal hold.
- Exportar manifesto como CSV/JSON assinado para dossiê de offboarding.

Validação local:

- Backend: `npm test -- privacy-governance.service.spec.ts`
- Backend: `npm run build`
- Geral: `git diff --check`

## Fase 10 - Plano dry-run de expurgo físico

Status: **implementada no backend**

Itens concluídos:

- Criado endpoint protegido `GET /privacy-governance/admin/tenant-storage-expunge-plan`.
- Endpoint não executa exclusão; retorna apenas plano dry-run.
- Plano considera elegíveis apenas documentos `EXPIRED`, com `expires_at` vencido e sem `litigation_hold`.
- Itens bloqueados recebem motivo objetivo: `legal_hold`, `status_not_expired`, `missing_expiry_date` ou `retention_not_elapsed`.

Pendências técnicas:

- Implementar execução destrutiva em endpoint separado com confirmação forte.
- Persistir plano e execução em tabela auditável antes de qualquer exclusão real.
- Exigir dupla confirmação/admin e export prévia do manifesto.

Validação local:

- Backend: `npm test -- privacy-governance.service.spec.ts`
- Backend: `npm run build`
- Geral: `git diff --check`
