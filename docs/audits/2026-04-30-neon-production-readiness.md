# Auditoria Neon Producao - 2026-04-30

## Escopo

Auditoria read-only do banco PostgreSQL em producao no Neon para validar prontidao operacional, isolamento multi-tenant e remediacoes seguras antes de qualquer alteracao de dados.

Regra de dominio confirmada apos a auditoria: a tabela `public.users` funciona hoje como cadastro de pessoas. Nem toda linha representa usuario de login. Usuario autenticavel tem credencial/login; funcionario/signatario pode existir apenas para constar em documentos e assinar fluxos de SST.

## Guardrails usados

- Conexao pela role runtime `sgs_app`, nao pela role administrativa de migracao.
- Transacoes `BEGIN READ ONLY`.
- `lock_timeout = 2s`, `statement_timeout = 45s`, `idle_in_transaction_session_timeout = 60s`.
- `app.is_super_admin = true` apenas para auditoria controlada de catalogo/RLS.
- Sem DDL, sem DML, sem backfill e sem exposicao de PII bruta nos logs.
- Saidas com hashes curtos para tenant/site/user quando amostras eram necessarias.

## Evidencia confirmada

- Banco alvo: `neondb` no Neon, PostgreSQL 17.8.
- Role usada nos jobs: `sgs_app`.
- RLS: validacao anterior passou em 64 tabelas, sem falhas reportadas.
- Auditoria de remediacao: sem tabelas gravaveis sem RLS e sem FKs sem indice.
- `ai_interactions`: 319 linhas no total.
- `ai_interactions` nao validas: 13 linhas antigas de 2026-03, `provider=openai`, `status=error`, `user_ref_status=invalid_uuid`.
- `ai_interactions`: 0 `missing_user`, 0 `unclassified`, 0 inconsistencias `invalid_uuid` com `user_uuid`.
- Registros de pessoa sem senha local: 36 no total; 29 ativos, 7 inativos/deletados no recorte anterior.
- Registros ativos sem senha local: 29, todos em 1 tenant e 1 site, perfil `Operador / Colaborador`.
- Registros ativos sem senha local: 0 com email, 0 com CPF, 0 com `auth_user_id`.
- Pela regra de dominio, esses 29 devem ser tratados primeiro como candidatos a `funcionario/signatario sem login`, nao como usuarios quebrados.
- Dependencias diretas desses 29 usuarios: 0 impactos encontrados em 80 colunas candidatas.
- Dependencias JSON/texto: 0 impactos encontrados em 21 colunas JSON candidatas analisadas.

## Acoes executadas

- Baseline read-only de catalogo, RLS, remediacao e integridade.
- `VACUUM (ANALYZE)` seguro em tabelas pequenas, sem schema change.
- Preflight read-only de possiveis reparos em `ai_interactions` e classificacao de pessoas sem credencial.
- Auditoria profunda read-only de referencias dos registros ativos sem senha local.
- Criacao dos scripts locais:
  - `backend/scripts/prod-data-repair-preflight.js`
  - `backend/scripts/prod-null-password-users-review.js`
- Criacao dos aliases npm:
  - `npm run db:prod-repair:preflight`
  - `npm run db:prod-repair:preflight:json`
  - `npm run db:null-password:review`
  - `npm run db:null-password:review:json`

## Decisoes de seguranca

### AI interactions

Nao aplicar update automatico agora.

Motivo: as 13 linhas nao validas ja estao classificadas como `invalid_uuid`, sao antigas e todas sao logs de erro. Inventar mapeamento de usuario ou apagar historico sem politica de retencao aprovada aumenta risco LGPD/auditoria.

Acao recomendada: manter monitoramento e criar alerta se aparecerem novos `missing_user`, `unclassified` ou `invalid_uuid` apos abril/2026.

### Pessoas sem login vs usuarios autenticaveis

Nao desativar nem completar automaticamente agora.

Motivo: os 29 registros nao tem senha local nem `auth_user_id`, portanto nao ha evidencia de que sejam usuarios autenticaveis quebrados. Pelo contrato de dominio, podem representar funcionarios/signatarios cadastrados para documentos. Qualquer DML que desative esses registros pode quebrar assinaturas, participantes e historico de SST.

Acao recomendada: manter como cadastro de pessoa ate haver um campo explicito de persona/acesso. Separar semanticamente:

- usuario de login: possui senha local e/ou `auth_user_id`;
- funcionario/signatario: pessoa ativa sem credencial de login, usada em documentos/assinaturas;
- conta incompleta: pessoa marcada para ter acesso, mas sem credencial esperada.

## Plano de execucao sem quebra

### Fase 1 - Congelar mutacao automatica

Status: concluido.

Manter apenas auditorias read-only ate existir lista nominal aprovada. Nenhum script criado suporta `--apply`; flags de escrita sao bloqueadas.

Complemento implementado localmente: a migration historica `1709000000173-deactivate-active-users-without-password.ts` foi neutralizada para no-op. Em bancos onde ela ja foi aplicada, nada muda. Em bancos novos/restores, ela nao desativa mais pessoas sem senha local.

### Fase 2 - Corrigir semantica antes de corrigir dados

Antes de qualquer update, ajustar relatorios e fluxos internos para nao tratar `sem senha` como erro automatico. Classificar cada linha como:

- funcionario/signatario sem login, manter registro;
- usuario autenticavel, exigir credencial/login;
- conta operacional incompleta, completar cadastro;
- registro criado por erro/importacao, revisar com tenant antes de desativar.

### Fase 3 - Modelo explicito de persona/acesso

Status: implementado localmente de forma aditiva, pendente de deploy/migration em producao.

- migration `1709000000189-add-user-identity-access-classification.ts` adiciona `users.identity_type` e `users.access_status`;
- backfill derivado por regra segura: `password/auth_user_id/email` => `system_user`; sem credencial nem email => `employee_signer`;
- `access_status` separa `credentialed`, `no_login` e `missing_credentials`;
- API `/users` aceita filtros opcionais `identity_type` e `access_status` sem remover tenant/site scope;
- frontend passa a listar `Usuarios` com `identity_type=system_user` e `Funcionarios` com `identity_type=employee_signer`;
- `prod-null-password-users-review.js` detecta `identity_type/access_status` quando existirem e continua read-only em bancos ainda sem essas colunas;
- nenhuma exclusao ou desativacao automatica durante essa fase.

### Fase 4 - Preparar rollback

Antes de qualquer DML futura:

- criar branch/backup logico no Neon;
- exportar snapshot criptografado dos campos que serao alterados;
- registrar tenant, user id, estado anterior e motivo;
- limitar transacao por tenant e por lote pequeno.

### Fase 5 - Aplicar lote controlado

Executar somente em uma janela curta e observada:

- `BEGIN`;
- `SET LOCAL lock_timeout = '2s'`;
- `SET LOCAL statement_timeout = '30s'`;
- aplicar somente IDs aprovados;
- validar contagens antes do `COMMIT`;
- se qualquer contagem divergir, `ROLLBACK`.

### Fase 6 - Validar pos-aplicacao

Reexecutar:

- `npm run db:prod-repair:preflight:json`;
- `npm run db:null-password:review:json -- --active-only --include-json-text-refs`;
- smoke de login/admin;
- health publico do backend;
- checagem de Sentry/logs por erros 4xx/5xx novos.

## Veredicto

O banco esta em estado operacionalmente saudavel para producao quanto a RLS, catalogo basico e integridade de indices/FKs auditada. O principal ajuste necessario nao e apagar/desativar dados: e separar semanticamente pessoa/funcionario de usuario autenticavel. Os 29 registros ativos sem credencial devem ser preservados como candidatos a funcionario/signatario ate existir classificacao explicita aprovada.
