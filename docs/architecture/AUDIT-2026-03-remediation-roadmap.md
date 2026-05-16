# System Audit Remediation Roadmap - 2026-03

## Objetivo
Transformar a auditoria tecnica e funcional do sistema em um plano executavel, incremental e seguro.

Este roadmap existe para:
- priorizar os problemas certos na ordem certa;
- separar o que e bug real do que e divida arquitetural;
- evitar regressao em producao;
- alinhar frontend, backend, persistencia, IA, documentos e operacao.

## Escopo
O plano cobre:
- seguranca e isolamento multi-tenant;
- governanca documental;
- autenticidade e validacao publica;
- jobs, filas e degradacao sem Redis;
- consolidacao da SOPHIE;
- consistencia entre frontend, backend e banco;
- cobertura de testes;
- observabilidade e saude operacional.

## Premissas
- sem big bang rewrite;
- sem reestruturar tudo de uma vez;
- novos ajustes devem nascer no padrao certo;
- modulos tocados devem sair melhores do que entraram;
- cada fase precisa ter criterio objetivo de aceite.

## Fonte desta analise
Este roadmap foi derivado da auditoria estatica profunda do repositorio, confrontando:
- `frontend` vs `backend`;
- controllers vs services;
- services vs persistencia;
- UI prometida vs comportamento realmente implementado;
- jobs, filas, storage, autenticidade, IA e modo offline.

## Legenda de classificacao
- `Fato`: confirmado diretamente no codigo.
- `Indicio`: ha sinais fortes no codigo, mas depende de validacao de runtime.
- `Hipotese`: depende de ambiente externo, proxy, deploy ou configuracao para confirmacao final.

## Eixos de intervencao
1. Fechar ciclos de negocio prometidos
2. Eliminar vazamentos e inconsistencias multi-tenant
3. Consolidar governanca documental
4. Reduzir arquitetura paralela e codigo morto
5. Aumentar confiabilidade operacional

## Backlog P0

### P0-01 - Isolar jobs e status de relatorios por tenant
- Tipo: Fato
- Impacto: seguranca, vazamento de metadados entre empresas
- Evidencia principal:
  - `backend/src/reports/reports.controller.ts`
- Problema:
  - `GET /reports/status/:jobId`, `GET /reports/queue/stats` e `GET /reports/jobs` consultam a fila Bull inteira sem filtrar por `companyId` do usuario autenticado.
- Arquivos-alvo:
  - `backend/src/reports/reports.controller.ts`
  - `backend/src/reports/pdf.processor.ts`
  - `frontend/app/dashboard/reports/page.tsx`
  - `frontend/services/reportsService.ts`
- Acao:
  - filtrar por `companyId` em leitura de jobs;
  - nao expor jobs que nao pertencem ao tenant;
  - revisar payload de retorno para nao revelar `companyId` de terceiros;
  - adicionar testes e2e de isolamento.
- Criterio de aceite:
  - usuario de uma empresa nao consegue consultar job de outra;
  - `jobs` e `status` retornam apenas itens do tenant ativo.

### P0-02 - Corrigir ou retirar fluxos publicos de verificacao nao implementados
- Tipo: Fato
- Impacto: quebra de confianca, autenticidade documental incompleta
- Evidencia principal:
- `frontend/app/verify/page.tsx`
  - `backend/src/auth/controllers/pdf-security.controller.ts`
  - `backend/src/common/services/pdf.service.ts`
  - ausencia de `frontend/app/api` e de `rewrites` em `frontend/next.config.mjs`
- Problema:
  - a tela publica promete verificacao de evidencia e assinatura por hash, mas o backend nao expoe isso de forma publica e `PdfService.verify()` retorna sempre `valid: false`.
- Arquivos-alvo:
- `frontend/app/verify/page.tsx`
- `frontend/next.config.mjs`
- `backend/src/auth/controllers/pdf-security.controller.ts`
- `backend/src/common/services/pdf.service.ts`
  - possivel novo controller publico dedicado
- Acao:
  - decidir se o produto tera verificacao publica de `pdf`, `evidence` e `signature`;
  - se sim, implementar rotas publicas reais e coerentes;
  - se nao, simplificar a UI publica para apenas o que existe hoje.
- Criterio de aceite:
  - nenhum CTA publico aponta para rota inexistente;
  - verificacao publica devolve resultado consistente ou deixa de ser exibida.

### P0-03 - Implementar verificacao real de PDF/hash ou remover a promessa
- Tipo: Fato
- Impacto: governanca, autenticidade, auditoria
- Evidencia principal:
  - `backend/src/common/services/pdf.service.ts`
- Problema:
  - o servico de verificacao de PDF existe, mas a verificacao retorna sempre invalida.
- Arquivos-alvo:
  - `backend/src/common/services/pdf.service.ts`
  - `backend/src/auth/controllers/pdf-security.controller.ts`
  - `frontend/app/verify/page.tsx`
- Acao:
  - persistir e consultar hash real do documento assinado;
  - alinhar contrato entre assinatura, registry documental e validacao publica.
- Criterio de aceite:
  - um PDF assinado pelo sistema pode ser validado com resultado positivo.

### P0-04 - Unificar o contrato de degradacao quando Redis estiver desligado
- Tipo: Fato
- Impacto: previsibilidade operacional, startup, feature flags
- Evidencia principal:
  - `backend/src/app.module.ts`
  - `backend/src/reports/reports.module.ts`
  - `backend/src/mail/mail.module.ts`
  - `backend/src/ai/ai.module.ts`
- Problema:
  - o AppModule remove modulos inteiros quando `REDIS_DISABLED=true`, mas os modulos tambem implementam stubs locais para esse mesmo cenario.
- Arquivos-alvo:
  - `backend/src/app.module.ts`
  - `backend/src/reports/reports.module.ts`
  - `backend/src/mail/mail.module.ts`
  - `backend/src/ai/ai.module.ts`
  - `backend/src/queue/*`
- Acao:
  - escolher uma estrategia unica:
    - ou modulo continua e degrada;
    - ou modulo nao sobe e frontend aprende a esconder o fluxo.
- Criterio de aceite:
  - o comportamento sem Redis e deterministico e documentado.

### P0-05 - Corrigir exposicao incompleta do registry documental
- Tipo: Fato
- Impacto: governanca, bundles semanais, consistencia documental
- Evidencia principal:
  - `backend/src/document-registry/document-registry.service.ts`
  - `backend/src/checklists/checklists.service.ts`
  - `backend/src/nonconformities/nonconformities.service.ts`
- Problema:
  - o registry aceita `apr`, `pt`, `dds`, `audit`, mas apenas `checklist` e `nonconformity` fazem `upsert`.
- Arquivos-alvo:
  - `backend/src/aprs/aprs.service.ts`
  - `backend/src/pts/pts.service.ts`
  - `backend/src/dds/dds.service.ts`
  - `backend/src/audits/audits.service.ts`
  - `frontend/app/dashboard/document-registry/page.tsx`
- Acao:
  - garantir `upsert` sempre que PDF final/documento governado for anexado ou emitido;
  - revisar `weekly bundle` para refletir apenas o que realmente existe.
- Criterio de aceite:
  - o registry lista todos os tipos documentais prometidos pela UI.

## Backlog P1

### P1-01 - Consolidar RBAC e papel do usuario em uma unica fonte de verdade
- Tipo: Fato
- Evidencia principal:
  - `backend/src/auth/roles.guard.ts`
  - `backend/src/rbac/rbac.service.ts`
  - `backend/src/common/middleware/tenant.middleware.ts`
  - `backend/src/signatures/signatures.service.ts`
- Problema:
  - perfil, role, permissao e super-admin estao espalhados em verificacoes diferentes.
- Acao:
  - padronizar `Role` + `permissions` em um contrato unico;
  - remover comparacoes por string fora de uma camada central.
- Criterio de aceite:
  - nenhum guard/service decide autorizacao baseado em string solta de perfil.

### P1-02 - Consolidar a SOPHIE em uma arquitetura unica
- Tipo: Fato
- Evidencia principal:
  - `backend/src/ai/ai.module.ts`
  - `backend/src/ai/sst-agent/sst-agent.service.ts`
  - `backend/src/sophie/sophie.module.ts`
  - `backend/src/sophie/sophie.controller.ts`
  - `backend/src/sophie/sophie.local-chat.service.ts`
  - `backend/src/ai/sophie-task-prompts.ts`
  - `backend/src/ai/sophie.task-prompts.ts`
- Problema:
  - a IA oficial convive com engine local, modulo legado, arquivos duplicados de prompt e rotas paralelas.
- Acao:
  - definir runtime oficial;
  - isolar ou remover legado nao utilizado;
  - deixar uma unica superficie publica de IA.
- Criterio de aceite:
  - existe um unico caminho oficial para chat, imagem, automacoes e prompts.

### P1-03 - Ativar ou remover health checks detalhados e observabilidade prometida
- Tipo: Fato
- Evidencia principal:
  - `backend/src/health/health.module.ts`
  - `backend/src/health/health.controller.ts`
  - `backend/src/health/enhanced-health.controller.ts`
  - `backend/src/main.ts`
  - `README.md`
- Problema:
  - ha codigo de health check detalhado nao registrado e OTel desabilitado, apesar da promessa institucional.
- Acao:
  - importar `HealthModule` de verdade ou remover os controllers mortos;
  - religar ou replanejar OTel.
- Criterio de aceite:
  - o que a documentacao promete existe no runtime.

### P1-04 - Unificar arquitetura de storage
- Tipo: Fato
- Evidencia principal:
  - `backend/src/common/services/storage.service.ts`
  - `backend/src/common/storage/s3.service.ts`
- Problema:
  - dois servicos diferentes controlam upload/download/URL, com buckets e variaveis diferentes.
- Acao:
  - padronizar um unico servico;
  - revisar quem precisa de URL publica, URL assinada e download server-side.
- Criterio de aceite:
  - todos os anexos e PDFs seguem o mesmo contrato de armazenamento.

### P1-05 - Transformar o modo offline em estado de negocio formal
- Tipo: Fato
- Evidencia principal:
  - `frontend/lib/offline-sync.ts`
  - `frontend/services/aprsService.ts`
  - `frontend/services/ptsService.ts`
  - `frontend/services/checklistsService.ts`
  - `frontend/services/nonConformitiesService.ts`
- Problema:
  - o sistema cria estados locais intermediarios que o backend ainda nao confirmou.
- Acao:
  - distinguir visual e tecnicamente:
    - salvo local;
    - pendente de sync;
    - rejeitado pelo backend;
    - confirmado no servidor.
- Criterio de aceite:
  - o usuario nunca confunde item em fila com item validado pelo backend.

### P1-06 - Tirar gargalos sincronos do request path
- Tipo: Fato
- Evidencia principal:
  - `backend/src/checklists/checklists.service.ts`
- Problema:
  - PDF de checklist ainda pode ser gerado de forma sincrona durante request.
- Acao:
  - mover geracao pesada para fila;
  - manter fallback apenas quando explicitamente aceito.
- Criterio de aceite:
  - endpoints operacionais nao bloqueiam por geracao pesada de PDF.

## Backlog P2

### P2-01 - Quebrar paginas gigantes do frontend em modulos de dominio
- Tipo: Fato
- Evidencia principal:
  - `frontend/app/dashboard/page.tsx`
  - `frontend/app/dashboard/sst-agent/page.tsx`
  - `frontend/app/dashboard/reports/page.tsx`
  - `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`
  - `frontend/app/dashboard/pts/components/PtForm.tsx`
- Problema:
  - muita orquestracao, estado, regras e UX na mesma pagina.
- Acao:
  - migrar para `modules/` ou composicao por hooks/sections.
- Criterio de aceite:
  - paginas ficam finas; regras vivem em hooks e services especializados.

### P2-02 - Introduzir eventos de dominio nos fluxos cross-module
- Tipo: Fato
- Evidencia principal:
  - busca por `EventEmitter`, `@OnEvent`, `publish`, `subscribe` nao encontrou bus de negocio no backend
- Problema:
  - side effects sao diretos e acoplados.
- Acao:
  - criar eventos para:
    - documento emitido;
    - documento aprovado;
    - NC criada;
    - evidencias anexadas;
    - vencimentos detectados.
- Criterio de aceite:
  - integracoes entre modulos nao dependem tanto de chamada direta.

### P2-03 - Limpar codigo morto, paralelo ou placeholder
- Tipo: Fato
- Evidencia principal:
  - `frontend/app/dashboard/pts/components/PtForm.refactored.tsx`
  - `backend/src/ai/ai.service.stub.ts`
  - `backend/src/common/tenant/tenant.interceptor.ts`
  - `backend/src/health/enhanced-health.controller.ts`
  - `backend/src/ai/sophie.task-prompts.ts`
- Problema:
  - a base tem trilhas paralelas que dificultam entender o comportamento real.
- Acao:
  - catalogar e remover ou documentar cada artefato legado.
- Criterio de aceite:
  - nao existe arquivo relevante cujo status seja ambiguo.

### P2-04 - Elevar a cobertura de testes do frontend
- Tipo: Fato
- Evidencia principal:
  - `frontend/package.json` nao tem script de teste
  - busca por arquivos `*.spec`/`*.test` no frontend retornou zero
- Acao:
  - introduzir testes em:
    - auth refresh;
    - tenant selection;
    - offline queue;
    - verify page;
    - SOPHIE actions;
    - PT/APR critical forms.
- Criterio de aceite:
  - fluxos criticos do frontend possuem cobertura automatizada.

### P2-05 - Padronizar motor documental
- Tipo: Fato
- Evidencia principal:
  - frontend e backend ainda geram documentos por caminhos diferentes
- Acao:
  - definir contratos unicos para:
    - metadata;
    - autenticidade;
    - storage key;
    - assinatura;
    - validacao.
- Criterio de aceite:
  - emitir um documento segue a mesma trilha institucional em qualquer modulo.

## Sequencia segura de execucao

### Fase 1 - Blindagem e confianca publica
- P0-01
- P0-02
- P0-03

Objetivo:
- fechar vazamentos;
- parar de prometer o que nao existe;
- tornar autenticidade verificavel.

### Fase 2 - Contratos de infraestrutura
- P0-04
- P1-03
- P1-04

Objetivo:
- deixar degradacao, storage e health previsiveis.

### Fase 3 - Governanca documental real
- P0-05
- P2-05

Objetivo:
- transformar registry e bundles em fonte confiavel de verdade documental.

### Fase 4 - Seguranca de acesso e tenant
- P1-01

Objetivo:
- reduzir divergencia entre roles, permissoes e tenant context.

### Fase 5 - Consolidacao da SOPHIE
- P1-02

Objetivo:
- uma IA, um runtime, uma superficie, um contrato.

### Fase 6 - Confiabilidade operacional do frontend
- P1-05
- P2-01
- P2-04

Objetivo:
- reduzir risco de estado invalido, regressao visual e comportamento nao deterministico.

### Fase 7 - Desacoplamento progressivo
- P2-02
- P2-03

Objetivo:
- diminuir complexidade acidental e facilitar manutencao.

## Ordem pratica por sprint

### Sprint A
- isolar queue/jobs por tenant
- alinhar verify publico
- corrigir verificacao real de hash/pdf

### Sprint B
- unificar contrato sem Redis
- ativar ou remover health avancado
- consolidar storage

### Sprint C
- fechar registry documental para APR/PT/DDS/Auditoria
- revisar bundles e acessos documentais

### Sprint D
- consolidar RBAC/roles
- consolidar SOPHIE

### Sprint E
- formalizar offline
- reduzir pagina gigante
- adicionar testes frontend

## Criticos de teste por fase

### Testes obrigatorios da Fase 1
- usuario A nao enxerga job do usuario B
- verify publico nao chama rota inexistente
- PDF assinado retorna validacao positiva

### Testes obrigatorios da Fase 2
- modo sem Redis sobe com comportamento consistente
- health endpoints refletem modulo real
- upload/download de PDF seguem um contrato unico

### Testes obrigatorios da Fase 3
- cada modulo governado entra no registry
- bundle semanal reflete exatamente os documentos emitidos

### Testes obrigatorios da Fase 4
- role e permissao conflitando nao abrem acesso indevido
- tenant selecionado e tenant resolvido batem

### Testes obrigatorios da Fase 5
- apenas uma rota oficial da SOPHIE responde no frontend
- prompt stack duplicado nao afeta runtime

### Testes obrigatorios da Fase 6
- item offline rejeitado pelo backend volta como erro claro
- drafts nao simulam sucesso persistido

## Itens que podem esperar
- refatoracao cosmetica de componentes que ja funcionam;
- polimento de dashboards secundarios;
- melhorias esteticas que nao atacam consistencia, seguranca ou fechamento de fluxo.

## Itens que nao devem esperar
- qualquer endpoint que exponha fila global;
- qualquer UI publica que prometa validacao inexistente;
- qualquer fluxo documental que pareca auditavel sem realmente ser;
- qualquer divergencia de permissao baseada em string espalhada.

## Resultado esperado ao final do roadmap
- o sistema passa a fechar de forma confiavel o ciclo que promete;
- autenticidade e governanca documental deixam de ser parciais;
- a SOPHIE deixa de parecer uma arquitetura em transicao;
- o modo offline deixa de depender de sorte e interpretacao do usuario;
- a operacao multi-tenant fica mais previsivel e segura.
