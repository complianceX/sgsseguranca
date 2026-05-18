# Prompt para geracao do site institucional do SGS

Use este texto como prompt em outra IA para gerar o site institucional do SGS.

## Instrucoes gerais

Voce e uma IA de produto, design e copy B2B enterprise. Crie um site institucional completo para o SGS, com linguagem profissional, visual premium e foco em conversao comercial para empresas de SST.

O SGS e um sistema real, entao nao invente funcionalidades, certificacoes, clientes, integracoes ou numeros que nao estejam confirmados aqui.

## Objetivo do site

O site deve:

- explicar o que e o SGS,
- mostrar para quem ele serve,
- destacar os modulos principais,
- comunicar governanca documental, seguranca e LGPD,
- apresentar a IA Sophie como assistente de SST,
- gerar credibilidade para venda B2B,
- servir como pagina institucional e comercial.

## Publico-alvo

O site e direcionado para:

- empresas prestadoras de servicos em ambientes industriais,
- mineracao,
- construcao,
- manutencao,
- operacoes de risco,
- equipes de SST,
- gestores que precisam de controle documental, evidencias, pendencias e indicadores,
- empresas que precisam demonstrar rastreabilidade e conformidade.

## Posicionamento do produto

Apresente o SGS como uma plataforma SaaS multi-tenant para gestao de SST e seguranca do trabalho.

A mensagem central e:

SGS centraliza documentos, evidencias, assinaturas, pendencias, treinamentos, exames, trabalhadores, relatorios e indicadores em um ambiente seguro, rastreavel e preparado para governanca documental.

## O que o sistema faz

O SGS serve para organizar e controlar a operacao de SST no dia a dia. Ele ajuda equipes a:

- criar e gerenciar documentos de seguranca,
- manter evidencias associadas aos registros,
- controlar assinaturas e aprovacoes,
- acompanhar pendencias documentais,
- acompanhar vencimentos de treinamentos e exames,
- registrar ocorrencias e nao conformidades,
- estruturar auditorias e dossies,
- centralizar relatorios e indicadores,
- usar IA assistiva para acelerar rascunhos e analises.

## Modulos que devem aparecer no site

Mostre, no minimo, estes dominos:

- Dashboard executivo e operacional
- APR - Analise Preliminar de Riscos
- PT - Permissao de Trabalho
- DDS - Dialogo Diario de Seguranca
- RDO - Relatorio Diario de Obra / Operacao
- Inspecoes e relatorios fotograficos
- Checklists
- CAT
- Nao conformidades
- Acoes corretivas
- Auditorias
- Dossies
- Registro documental
- Central de pendencias documentais
- Importacao documental
- Trabalhadores / funcionarios
- Treinamentos
- Exames medicos
- EPI e fichas de EPI
- Sites, empresas, usuarios e perfis
- Riscos, atividades, maquinas e ferramentas
- Relatorios e KPIs
- IA Sophie

## Estrutura tecnica real do sistema

Explique a arquitetura de forma executiva, sem excesso tecnico.

### Stack principal

- Frontend: Next.js
- Backend: NestJS + TypeORM
- Banco: PostgreSQL
- Cache e filas: Redis + BullMQ
- Storage: S3 compativel
- Deploy frontend: Vercel
- Deploy backend e worker: Render
- Observabilidade: logs estruturados, Sentry opcional, OpenTelemetry opcional

## Estrutura de pastas do monorepo

Use esta organizacao para explicar a arquitetura do projeto:

### Raiz

- `backend/`: aplicacao backend NestJS
- `frontend/`: aplicacao frontend Next.js
- `docs/`: documentacao tecnica, rapida, institucional e de arquitetura
- `scripts/`: scripts utilitarios
- `test/`: testes e cargas de performance
- `supabase/`: artefatos relacionados ao banco e ao ambiente Supabase
- `cloudflare/`: utilitarios e exemplos ligados a Cloudflare
- `prompts/`: prompts operacionais e guias de trabalho
- `artifacts/`: saidas e arquivos auxiliares
- `jmeter/`: materiais de teste de carga

### Arquivos de configuracao importantes na raiz

- `README.md`
- `AGENTES.md`
- `render.yaml`
- `package.json`
- `Dockerfile`
- `Dockerfile.worker`
- `docker-compose.yml`
- `docker-compose.local.yml`

### Backend

O backend fica em `backend/` e concentra a logica do sistema.

Pastas importantes:

- `backend/src/auth/`
- `backend/src/common/tenant/`
- `backend/src/common/database/`
- `backend/src/companies/`
- `backend/src/users/`
- `backend/src/rbac/`
- `backend/src/profiles/`
- `backend/src/admin/`
- `backend/src/dashboard/`
- `backend/src/aprs/`
- `backend/src/pts/`
- `backend/src/dds/`
- `backend/src/rdos/`
- `backend/src/relatorios/`
- `backend/src/photographic-reports/`
- `backend/src/checklists/`
- `backend/src/cats/`
- `backend/src/nonconformities/`
- `backend/src/audits/`
- `backend/src/dossiers/`
- `backend/src/document-registry/`
- `backend/src/document-import/`
- `backend/src/document-videos/`
- `backend/src/signatures/`
- `backend/src/ai/`
- `backend/src/sophie/`
- `backend/src/calendar/`
- `backend/src/mail/`
- `backend/src/notifications/`
- `backend/src/push/`
- `backend/src/privacy-requests/`
- `backend/src/privacy-governance/`
- `backend/src/forensic-trail/`
- `backend/src/storage/`
- `backend/src/common/storage/`
- `backend/src/common/redis/`
- `backend/src/common/queue/`
- `backend/src/disaster-recovery/`
- `backend/src/tasks/`
- `backend/src/reports/`
- `backend/src/health/`

### Frontend

O frontend fica em `frontend/` e concentra a experiencia do usuario final.

Pastas importantes:

- `frontend/app/`
- `frontend/components/`
- `frontend/services/`
- `frontend/hooks/`
- `frontend/styles/`
- `frontend/scripts/`

## O que o backend faz

Descreva o backend como a fonte de verdade do sistema.

Ele e responsavel por:

- autenticar usuarios,
- validar tenant e company scoping,
- aplicar RBAC e permissoes,
- controlar lock documental,
- emitir PDF final,
- integrar storage governado,
- processar filas,
- enviar emails,
- executar rotinas assincronas,
- manter trilha forense,
- responder health checks.

## O que o frontend faz

Descreva o frontend como a camada de experiencia e operacao.

Ele e responsavel por:

- login e area autenticada,
- dashboard e indicadores,
- formulios e CRUDs operacionais,
- modulos documentais,
- paginas institucionais,
- apresentacao visual enterprise,
- refletir permissao e estado do backend.

## Fluxos importantes que precisam ser explicados

### Fluxo autenticado

1. Usuario faz login.
2. Backend valida credenciais, sessao e permissao.
3. Frontend carrega contexto do tenant.
4. Usuario acessa dashboard e modulos permitidos.

### Fluxo documental governado

1. Documento e criado ou importado.
2. Backend valida regras, tenant e estado.
3. Evidencias e anexos sao persistidos.
4. Documento pode passar por aprovacao.
5. PDF final oficial e gerado.
6. Registro entra em storage governado.
7. Lock ou read-only e aplicado quando necessario.
8. Trilha forense registra eventos criticos.

### Fluxo assincrono

1. Acao pesada entra em fila.
2. Worker processa em segundo plano.
3. Resultado volta para o documento, relatorio ou notificacao.

### Fluxo de IA

1. Usuario solicita apoio.
2. Sistema valida consentimento e regras.
3. Dados passam por sanitizacao quando necessario.
4. Sophie gera apoio assistivo.
5. Resultado volta como rascunho, analise ou sugestao.

## Integracoes externas

### IA e Sophie

- OpenAI como base do assistente
- Sophie como camada assistiva
- uso de consentimento
- sanitizacao de PII
- rate limiting e resiliencia

### Calendario

- Google Calendar
- apoio a rotinas operacionais, vencimentos e eventos

### Email

- envio de notificacoes, documentos e alertas
- processamento por fila

### Storage

- S3 compativel
- armazenamento de PDFs finais, evidencias e anexos
- links assinados e controle de acesso

### Banco

- PostgreSQL principal
- TypeORM
- isolamento por tenant
- RLS como defesa adicional quando aplicavel

### Cache e filas

- Redis
- BullMQ
- cache, rate limit, fila de jobs e retry

### Deploy

- frontend em Vercel
- backend e worker em Render
- banco gerenciado fora do app

### Observabilidade

- logs estruturados
- Sentry quando configurado
- OpenTelemetry quando habilitado
- health checks para web e worker

## Seguranca e LGPD

O site precisa comunicar que o SGS foi pensado para dados sensiveis de SST.

Mostre:

- isolamento por tenant,
- RBAC,
- controle de sessoes,
- consentimento para uso de IA,
- sanitizacao de dados antes de IA,
- trilha de auditoria,
- governanca documental,
- backend como autoridade final de autorizacao,
- LGPD como requisito de produto.

## Regras de claims seguros

Use apenas claims que possam ser defendidos com o sistema real.

Pode usar:

- plataforma SaaS multi-tenant para gestao de SST,
- controle de APR, PT, DDS, RDO, CAT, checklists, auditorias e inspecoes,
- PDF final oficial com storage governado,
- central de pendencias documentais,
- IA Sophie para apoiar rascunhos, analises e produtividade,
- consentimento e sanitizacao de dados antes do uso de IA,
- dashboards, KPIs, calendario e relatorios,
- controle de treinamentos, exames, trabalhadores e EPIs,
- arquitetura com backend como autoridade final de permissao, tenant e documentos.

Evite:

- dizer que a IA substitui o tecnico de seguranca,
- prometer automacao total,
- vender video como suporte em todos os modulos,
- expor secrets, env vars ou topologia interna,
- afirmar capacidades nao confirmadas no repositorio.

## Direcao visual

Crie um site com sensacao:

- premium,
- institucional,
- enterprise,
- confiavel,
- limpo,
- sofisticado,
- com muito espaco em branco,
- tipografia forte,
- hierarquia visual clara,
- cores sobrias e confiaveis,
- sem cara de template generico.

Se precisar resumir a sensacao visual, use:

- confianca,
- precisao,
- controle,
- organizacao,
- governanca,
- tecnologia de alto padrao.

## Estrutura de paginas esperada

Crie, no minimo, estas paginas:

1. Home
2. Modulos
3. Governanca documental
4. IA Sophie
5. Seguranca e LGPD
6. Tecnologia
7. Contato / Agendar demonstracao

## Conteudo que a Home deve responder

A Home precisa responder rapidamente:

- o que e o SGS,
- para quem serve,
- qual dor resolve,
- quais modulos principais existem,
- por que confiar,
- qual o proximo passo.

### Seccoes recomendadas para a Home

- Hero forte com proposta de valor
- Problema atual do mercado
- Solucao SGS
- Modulos principais
- Governanca documental
- IA Sophie
- Seguranca e LGPD
- Diferenciais
- CTA para demonstracao

### Hero sugerido

Titulo:

SGS: gestao de seguranca do trabalho com governanca documental

Subtitulo:

Centralize APR, PT, DDS, RDO, CAT, checklists, auditorias, trabalhadores, treinamentos e exames em uma plataforma segura, multi-tenant e preparada para rastreabilidade.

CTA principal:

Agendar demonstracao

CTA secundario:

Ver modulos

## O que a pagina de modulos deve mostrar

Organize os modulos em blocos:

- Documentos de SST
- Pessoas e conformidade
- Operacao
- Inteligencia e indicadores
- Governanca documental

Para cada bloco, mostre valor de negocio, nao apenas lista de funcionalidades.

## O que a pagina de governanca documental deve mostrar

Explique que documento oficial no SGS nao e apenas um arquivo anexado.

Mostre:

- origem do documento,
- metadados,
- hash,
- assinatura,
- storage governado,
- trilha forense,
- consulta segura,
- validacao e rastreabilidade,
- PDF final oficial.

## O que a pagina de IA Sophie deve mostrar

Explique:

- o que e a Sophie,
- como ela ajuda SST,
- onde ela atua,
- consentimento,
- protecao de dados,
- sanitizacao de PII,
- uso assistivo e nao substitutivo.

## O que a pagina de seguranca e LGPD deve mostrar

Explique:

- isolamento por empresa,
- backend como autoridade final,
- RBAC,
- sessao e acesso,
- consentimento,
- minimizacao de dados,
- sanidade de IA,
- trilha de auditoria,
- governanca documental,
- responsabilidade tecnica preservada.

## O que a pagina de tecnologia deve mostrar

Se a pagina existir, faca uma versao institucional sem excesso tecnico.

Mostre:

- Next.js,
- NestJS,
- PostgreSQL,
- Redis + BullMQ,
- storage S3 compativel,
- Sentry,
- Google Calendar,
- OpenAI.

## CTA e conversao

Use CTAs como:

- Agendar demonstracao
- Conhecer modulos
- Ver governanca documental
- Falar com especialista
- Solicitar apresentacao

## Tom de escrita

O texto deve ser:

- profissional,
- seguro,
- claro,
- direto,
- premium,
- sem hype,
- sem exagero,
- sem linguagem generica.

## Entrega esperada da IA

Gere:

- estrutura completa do site,
- copy completa de cada seccao,
- titulos e subtitulos,
- CTAs,
- sugestoes de layout,
- ordem ideal das paginas,
- texto pronto para cada pagina,
- tudo em portugues do Brasil,
- pronto para virar site sem reescrever do zero.

## Regra final

O resultado deve parecer um site institucional profissional do SGS, pronto para uso comercial e implementacao.
