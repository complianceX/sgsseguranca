# API Reference — SGS Segurança

> Todos os endpoints prefixados com `/v1/`. Rotas sem prefixo também aceitas por compatibilidade.

---

## Auth (`/auth`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/auth/login` | Login com CPF + senha | Público |
| POST | `/auth/login/mfa/verify` | Verificar TOTP no login | Público |
| POST | `/auth/login/mfa/bootstrap/activate` | Ativar MFA no primeiro login | Público |
| POST | `/auth/refresh` | Rotacionar refresh token | Refresh |
| POST | `/auth/logout` | Logout (revoga sessão + token) | Autenticado |
| POST | `/auth/change-password` | Alterar senha | Autenticado |
| POST | `/auth/forgot-password` | Esqueci senha (email) | Público |
| POST | `/auth/reset-password` | Resetar senha com token | Público |
| POST | `/auth/confirm-password` | Confirmar senha (step-up) | Autenticado |
| POST | `/auth/step-up/verify` | Verificar step-up (MFA) | Autenticado |
| GET | `/auth/me` | Dados do usuário logado | Autenticado |
| GET | `/auth/mfa/status` | Status MFA do usuário | Autenticado |
| POST | `/auth/mfa/enroll` | Iniciar enrollment MFA | Autenticado |
| POST | `/auth/mfa/activate` | Ativar MFA com código | Autenticado |
| POST | `/auth/mfa/disable` | Desabilitar MFA | Autenticado |
| POST | `/auth/mfa/recovery-codes/regenerate` | Regenerar recovery codes | Autenticado |
| GET | `/auth/signature-pin` | Status do PIN de assinatura | Autenticado |
| POST | `/auth/signature-pin` | Criar/alterar PIN de assinatura | Autenticado |
| GET | `/auth/sessions` | Listar sessões ativas | Autenticado |
| DELETE | `/auth/sessions/:id` | Revogar sessão específica | Autenticado |

## Companies (`/companies`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/companies` | Listar empresas | Admin |
| POST | `/companies` | Criar empresa | Admin |
| GET | `/companies/:id` | Detalhes da empresa | Admin |
| PATCH | `/companies/:id` | Atualizar empresa | Admin |
| DELETE | `/companies/:id` | Remover empresa | Admin |
| GET | `/companies/:id/billing` | Faturamento | Admin |
| GET | `/companies/:id/stats` | Estatísticas | Admin |

## Users (`/users`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/users` | Listar usuários | Autenticado |
| POST | `/users` | Criar usuário | Admin |
| GET | `/users/:id` | Detalhes do usuário | Autenticado |
| PATCH | `/users/:id` | Atualizar usuário | Admin |
| DELETE | `/users/:id` | Remover usuário | Admin |
| GET | `/users/:id/module-access` | Acesso a módulos | Admin |
| PATCH | `/users/:id/module-access` | Atualizar acesso a módulos | Admin |
| GET | `/users/sites` | Sites do usuário | Autenticado |

## Profiles (`/profiles`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/profiles` | Listar perfis | Autenticado |
| POST | `/profiles` | Criar perfil | Admin |
| GET | `/profiles/:id` | Detalhes do perfil | Autenticado |
| PATCH | `/profiles/:id` | Atualizar perfil | Admin |
| DELETE | `/profiles/:id` | Remover perfil | Admin |

## Sites (`/sites`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/sites` | Listar obras | Autenticado |
| POST | `/sites` | Criar obra | Admin |
| GET | `/sites/:id` | Detalhes da obra | Autenticado |
| PATCH | `/sites/:id` | Atualizar obra | Admin |
| DELETE | `/sites/:id` | Remover obra | Admin |

## APRs (`/aprs`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/aprs` | Listar APRs | Autenticado |
| POST | `/aprs` | Criar APR | TST+ |
| GET | `/aprs/:id` | Detalhes da APR | Autenticado |
| PATCH | `/aprs/:id` | Atualizar APR | TST+ |
| DELETE | `/aprs/:id` | Remover APR | Admin |
| POST | `/aprs/:id/submit` | Submeter para aprovação | TST+ |
| PATCH | `/aprs/:id/approve` | Aprovar APR | Supervisor+ |
| PATCH | `/aprs/:id/reject` | Reprovar APR | Supervisor+ |
| PATCH | `/aprs/:id/finalize` | Finalizar APR | TST+ |
| POST | `/aprs/:id/reopen` | Reabrir APR | TST+ |
| POST | `/aprs/:id/new-version` | Nova versão | TST+ |
| POST | `/aprs/:id/generate-final-pdf` | Gerar PDF final | TST+ |
| GET | `/aprs/:id/validate` | Validar regras | TST+ |
| POST | `/aprs/:id/risk-items/:riskItemId/evidence` | Upload evidência | TST+ |
| GET | `/aprs/export/excel` | Exportar Excel | TST+ |
| GET | `/aprs/:id/export/excel` | Exportar APR em Excel | TST+ |
| POST | `/aprs/import/excel/preview` | Pré-visualizar importação | TST+ |

## DDS (`/dds`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/dds` | Listar DDS | Autenticado |
| POST | `/dds` | Criar DDS | TST+ |
| GET | `/dds/:id` | Detalhes do DDS | Autenticado |
| PATCH | `/dds/:id` | Atualizar DDS | TST+ |
| DELETE | `/dds/:id` | Remover DDS | Admin |
| PATCH | `/dds/:id/status` | Atualizar status | TST+ |
| PATCH | `/dds/:id/audit` | Auditar DDS | Supervisor+ |
| POST | `/dds/:id/file` | Anexar PDF | TST+ |
| POST | `/dds/:id/videos` | Anexar vídeo | TST+ |
| POST | `/dds/:id/operationalize` | Operacionalizar modelo | TST+ |
| POST | `/dds/:id/approvals/initialize` | Iniciar fluxo de aprovação | TST+ |
| POST | `/dds/:id/approvals/:approvalId/approve` | Aprovar etapa | Supervisor+ |
| POST | `/dds/:id/approvals/:approvalId/reject` | Rejeitar etapa | Supervisor+ |
| POST | `/dds/:id/approvals/reopen` | Reabrir fluxo | TST+ |
| PUT | `/dds/:id/signatures` | Substituir assinaturas | TST+ |
| POST | `/dds/:id/signature-invites` | Enviar convites de assinatura | TST+ |

## PTs (`/pts`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/pts` | Listar PTs | Autenticado |
| POST | `/pts` | Criar PT | TST+ |
| GET | `/pts/:id` | Detalhes da PT | Autenticado |
| PATCH | `/pts/:id` | Atualizar PT | TST+ |
| DELETE | `/pts/:id` | Remover PT | Admin |
| POST | `/pts/:id/approve` | Aprovar PT | Supervisor+ |
| POST | `/pts/:id/reject` | Rejeitar PT | Supervisor+ |
| POST | `/pts/:id/pre-approval-review` | Revisão pré-aprovação | TST+ |
| POST | `/pts/:id/file` | Anexar PDF | TST+ |
| PATCH | `/pts/:id/approval-rules` | Regras de aprovação | Admin |

## ARRs (`/arrs`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/arrs` | Listar ARRs | Autenticado |
| POST | `/arrs` | Criar ARR | TST+ |
| GET | `/arrs/:id` | Detalhes da ARR | Autenticado |
| PATCH | `/arrs/:id` | Atualizar ARR | TST+ |
| DELETE | `/arrs/:id` | Remover ARR | Admin |

## DIDs (`/dids`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/dids` | Listar DIDs | Autenticado |
| POST | `/dids` | Criar DID | TST+ |
| GET | `/dids/:id` | Detalhes do DID | Autenticado |
| PATCH | `/dids/:id` | Atualizar DID | TST+ |
| DELETE | `/dids/:id` | Remover DID | Admin |

## RDOs (`/rdos`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/rdos` | Listar RDOs | Autenticado |
| POST | `/rdos` | Criar RDO | TST+ |
| GET | `/rdos/:id` | Detalhes do RDO | Autenticado |
| PATCH | `/rdos/:id` | Atualizar RDO | TST+ |
| DELETE | `/rdos/:id` | Remover RDO | Admin |

## Checklists (`/checklists`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/checklists` | Listar checklists | Autenticado |
| POST | `/checklists` | Criar checklist | TST+ |
| GET | `/checklists/:id` | Detalhes | Autenticado |
| PATCH | `/checklists/:id` | Atualizar | TST+ |
| DELETE | `/checklists/:id` | Remover | Admin |

## NonConformities (`/nonconformities`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/nonconformities` | Listar NCs | Autenticado |
| POST | `/nonconformities` | Criar NC | TST+ |
| GET | `/nonconformities/:id` | Detalhes | Autenticado |
| PATCH | `/nonconformities/:id` | Atualizar | TST+ |
| DELETE | `/nonconformities/:id` | Remover | Admin |

## Signatures (`/signatures`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/signatures` | Criar assinatura | Autenticado |
| GET | `/signatures` | Listar (filtro doc) | Autenticado |
| GET | `/signatures/verify/:id` | Verificar assinatura | Público |
| DELETE | `/signatures/:id` | Remover assinatura | Autenticado |
| DELETE | `/signatures/document/:document_id` | Remover assinaturas do doc | Autenticado |

## Dashboard (`/dashboard`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/dashboard` | Dashboard principal | Autenticado |
| GET | `/dashboard/kpis` | KPIs | Autenticado |
| GET | `/dashboard/pending-queue` | Pendências do usuário | Autenticado |
| GET | `/dashboard/heatmap` | Mapa de calor de riscos | Autenticado |

## AI / Sophie (`/ai`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/ai/insights` | Insights de segurança | TST+ |
| POST | `/ai/analyze-apr` | Analisar APR | TST+ |
| POST | `/ai/analyze-pt` | Analisar PT | TST+ |
| GET | `/ai/analyze-checklist/:id` | Analisar checklist | TST+ |
| POST | `/ai/generate-dds` | Gerar DDS por IA | TST+ |
| POST | `/ai/generate-checklist` | Gerar checklist por IA | TST+ |
| POST | `/ai/generate-apr-draft` | Rascunho de APR | TST+ |
| POST | `/ai/generate-pt-draft` | Rascunho de PT | TST+ |
| POST | `/ai/apr/suggest-risk-items` | Sugerir riscos | TST+ |
| POST | `/ai/create-checklist` | Criar checklist | TST+ |
| POST | `/ai/create-dds` | Criar DDS | TST+ |
| POST | `/ai/create-nonconformity` | Abrir NC | TST+ |
| POST | `/ai/generate-monthly-report` | Relatório mensal | TST+ |

## Document Registry (`/document-registry`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/document-registry` | Listar documentos | Autenticado |
| POST | `/document-registry` | Criar registro | TST+ |
| PATCH | `/document-registry/:id` | Atualizar | TST+ |
| DELETE | `/document-registry/:id` | Remover | Admin |

## Document Import (`/document-import`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/document-import` | Iniciar importação |
| GET | `/document-import/:id` | Status da importação |
| GET | `/document-import/:id/logs` | Logs da importação |
| POST | `/document-import/:id/retry` | Reprocessar |

## Audits (`/audits`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/audits` | Listar auditorias |
| POST | `/audits` | Criar auditoria |
| GET | `/audits/:id` | Detalhes |
| PATCH | `/audits/:id` | Atualizar |
| DELETE | `/audits/:id` | Remover |
| POST | `/audits/:id/pdf` | Gerar PDF |

## Reports (`/reports`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/reports/aprs` | Relatório de APRs |
| POST | `/reports/dds` | Relatório de DDS |
| POST | `/reports/pts` | Relatório de PTs |
| POST | `/reports/nonconformities` | Relatório de NCs |
| POST | `/reports/audits` | Relatório de auditorias |

## Companies Admin (`/admin/companies`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/companies` | Listar empresas (todas) |
| POST | `/admin/companies` | Criar empresa |
| PATCH | `/admin/companies/:id` | Atualizar empresa |
| DELETE | `/admin/companies/:id` | Remover empresa |

## Health (`/health`, `/health/public`)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/health` | Health check completo (DB, Redis, worker) | Interno |
| GET | `/health/public` | Health check público | Público |

## Outros Módulos

Cada módulo tem CRUD básico (GET list, POST create, GET :id, PATCH :id, DELETE :id):

- `/epis` — Gestão de EPIs
- `/epi-assignments` — Assignação de EPIs
- `/machines` — Máquinas e equipamentos
- `/tools` — Ferramentas
- `/trainings` — Treinamentos
- `/medical-exams` — Exames médicos
- `/risks` — Riscos
- `/activities` — Atividades
- `/service-orders` — Ordens de serviço
- `/contracts` — Contratos
- `/cats` — CAT (Comunicação de Acidente de Trabalho)
- `/corrective-actions` — Ações corretivas
- `/expenses` — Despesas
- `/calendar` — Calendário
- `/notifications` — Notificações
- `/tasks` — Tarefas
- `/tenant-policies` — Políticas do tenant
- `/tenant-lifecycle` — Ciclo de vida
- `/consents` — Consentimentos LGPD
- `/privacy-requests` — Requisições LGPD
- `/privacy-governance` — Governança LGPD
- `/sophie` — Sophie AI (endpoints específicos)

## Swagger

Disponível em `GET /api/docs` (apenas não-produção, Basic Auth em staging).
