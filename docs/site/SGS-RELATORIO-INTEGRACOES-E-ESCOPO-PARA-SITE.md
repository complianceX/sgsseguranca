# SGS - Relatorio de Integracoes, Modulos e Escopo para Site

Data de referencia: 2026-04-23.

Este relatorio consolida o que o SGS entrega e integra hoje, com base no repositorio `sgs-seguraca`, documentos de arquitetura, rotas, modulos backend/frontend e configuracao operacional. O objetivo e servir como base para montar o site institucional/comercial do produto sem inventar funcionalidades fora do sistema real.

## 1. Resumo executivo

O SGS e uma plataforma SaaS multi-tenant para gestao de SST, focada em operacao, documentos, evidencias, assinaturas, dashboards e governanca de seguranca do trabalho.

O produto centraliza rotinas como APR, PT, DDS, RDO, CAT, checklists, auditorias, inspecoes, nao conformidades, treinamentos, exames medicos, EPI, trabalhadores, sites e empresas. Alem dos cadastros e fluxos operacionais, o sistema possui camada forte de governanca documental: PDF final oficial, storage governado, trilha forense, validacao publica, lock de documentos fechados e controle por tenant.

Frase curta para site:

> SGS e uma plataforma completa para controlar seguranca do trabalho, documentos oficiais, evidencias, treinamentos, exames, permissoes e indicadores em um ambiente SaaS seguro, rastreavel e multi-tenant.

## 2. Posicionamento do produto

### Categoria

SaaS de SST/GST para empresas que precisam controlar documentacao, rotinas de seguranca, evidencias e conformidade operacional.

### Publico alvo

- Empresas prestadoras de servico em ambientes industriais, mineracao, construcao, manutencao e operacoes de risco.
- Equipes de SST que precisam padronizar documentos e reduzir controle manual em planilhas.
- Gestores que precisam acompanhar pendencias, indicadores, vencimentos e rastreabilidade.
- Empresas que precisam demonstrar governanca documental para contratantes, auditorias e operacoes internas.

### Proposta de valor

- Centralizar documentos e processos de SST em uma plataforma unica.
- Reduzir risco de documento solto, desatualizado ou sem prova de origem.
- Garantir isolamento por empresa/tenant.
- Dar visibilidade operacional de pendencias, vencimentos e criticidade.
- Preservar trilha auditavel de documentos, anexos, assinaturas e acoes criticas.
- Usar IA assistiva com consentimento, sanitizacao e limites de seguranca.

## 3. Arquitetura geral

### Camadas principais

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Frontend | Next.js 15, React 19, TypeScript | Login, dashboard, formularios, tabelas, modulos operacionais e area autenticada |
| Backend API | NestJS 11, TypeScript, TypeORM | Regras de negocio, auth, RBAC, tenant scoping, storage, documentos, integracoes e health checks |
| Worker | NestJS worker + BullMQ | Processamento assincrono de filas, emails, importacao documental, relatorios, DR e tarefas agendadas |
| Banco | Supabase PostgreSQL | Persistencia principal com migrations TypeORM e RLS para defesa multi-tenant |
| Cache/Fila | Redis + BullMQ | Cache, rate limiting, coordenacao operacional e filas |
| Storage | Cloudflare R2 / S3 compativel | PDFs finais, anexos, videos e artefatos oficiais governados |
| Deploy backend | Render | Servicos web, worker, Redis e cron de migrations |
| Deploy frontend | Vercel | Aplicacao web em `app.sgsseguranca.com.br` |

### Fluxo simplificado

1. Usuario acessa o frontend.
2. Frontend chama a API.
3. Backend valida autenticacao, tenant, RBAC, CSRF e rate limits.
4. Backend aplica regras de dominio e grava em PostgreSQL.
5. Arquivos oficiais vao para storage governado.
6. Jobs pesados sao enviados para Redis/BullMQ e processados pelo worker.
7. Logs, metricas e erros sao enviados para a camada de observabilidade quando configurada.

## 4. Integracoes externas

### OpenAI / Sophie

Uso principal:

- Assistente SST Sophie.
- Geracao assistida de DDS.
- Geracao assistida de checklist.
- Rascunhos assistidos de APR.
- Rascunhos assistidos de PT.
- Analises e insights operacionais.
- Analise de imagem de risco no agente SST.
- Relatorio mensal assistido por IA.

Controles relevantes:

- Consentimento de IA por usuario.
- Sanitizacao de PII antes de envio ao provedor.
- Rate limiting por tenant/usuario.
- Circuit breaker para proteger a aplicacao quando a integracao fica instavel.
- Historico de IA com politica de retencao configuravel.

Observacao para site:

Use "IA assistiva para SST" e "Sophie" como destaque, mas evite prometer decisao automatica final. A IA apoia analise, rascunho e produtividade; a autoridade operacional continua no usuario e no backend.

### Google Calendar API

Uso principal:

- Consolidacao de eventos operacionais em calendario.
- Eventos relacionados a treinamentos, exames medicos, DDS, RDO, CAT e ordens de servico.
- Timezone operacional configurada para o Brasil.

Como vender:

> Calendario operacional integrado para acompanhar vencimentos, eventos e rotinas criticas de SST.

### Provedores de email

Uso principal:

- Envio de documentos armazenados.
- Envio de documentos enviados pelo usuario.
- Alertas operacionais.
- Notificacoes de pendencias e fluxos documentais.

Provedores suportados no codigo:

- Brevo API, quando `BREVO_API_KEY` estiver configurada.
- SMTP via `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`.
- Resend via `RESEND_API_KEY`.

Arquitetura:

- Backend enfileira o envio.
- Worker consome a fila `mail`.
- MailService envia pelo provedor configurado.
- Logs de envio e erros operacionais sao persistidos.

### Cloudflare R2 / S3 compativel

Uso principal:

- PDF final oficial.
- Anexos oficiais.
- Videos governados.
- Evidencias e artefatos documentais.
- Replicacao/protecao de storage em fluxos de disaster recovery.

Controles:

- Storage key persistida no banco.
- URL assinada gerada pelo backend.
- Hash e metadados.
- Trilha forense.
- Falha explicita quando o storage governado e necessario e esta indisponivel.

Mensagem para site:

> Documentos e evidencias ficam armazenados com rastreabilidade, controle de acesso e prova de integridade.

### Supabase PostgreSQL

Uso principal:

- Banco principal da aplicacao.
- PostgreSQL gerenciado.
- RLS como defesa adicional de isolamento por tenant.
- Suporte ao processo de transicao para Supabase Auth.

Pontos tecnicos:

- TypeORM como ORM.
- Migrations versionadas.
- Pooler Supabase usado em producao.
- RLS com contexto de empresa/tenant.

### Redis / BullMQ

Uso principal:

- Filas de email.
- Filas de PDF.
- Importacao documental.
- Rate limiting.
- Cache operacional.
- Heartbeat de worker.
- DLQ e controle de retries.

Mensagem para site:

> Processos pesados rodam em segundo plano para manter a operacao fluida e reduzir timeout em documentos, emails e importacoes.

### Sentry e observabilidade

Uso principal:

- Captura de excecoes frontend/backend/worker quando DSN configurado.
- Logs estruturados JSON.
- Integracao com trace/span quando OpenTelemetry esta ativo.
- Exporter Prometheus opcional.
- Jaeger opcional para tracing.

Mensagem para site:

> O SGS foi desenhado para operacao monitoravel, com logs estruturados, health checks e rastreabilidade tecnica.

### Web Push e notificacoes

Uso principal:

- Inscricao de push.
- Envio/controle de notificacoes.
- Contador de nao lidas.
- Topbar e notificacoes operacionais no frontend.

## 5. Modulos funcionais do SGS

### Dashboard executivo e operacional

Entregas:

- Resumo geral.
- KPIs.
- Heatmap.
- TST do dia.
- Pendencias documentais.
- Fila operacional.
- Indicadores para acompanhamento rapido.

Valor para site:

> Tenha uma visao consolidada da seguranca operacional, documentos pendentes, indicadores e criticidades.

### APR - Analise Preliminar de Riscos

Entregas:

- Criacao e gestao de APR.
- Itens de risco, controles e evidencias.
- Sugestoes assistidas por IA.
- Exportacao Excel.
- PDF final.
- Aprovacao/rejeicao/finalizacao.
- Logs e versoes.
- Lock de documento aprovado ou com PDF final.
- Nova versao como caminho legitimo de evolucao.

Valor para site:

> Padronize APRs, reduza retrabalho e mantenha controle de versoes, evidencias e aprovacao.

### PT - Permissao de Trabalho

Entregas:

- Criacao e gestao de PT.
- Pre-aprovacao, historico, aprovacao e rejeicao.
- Regras de aprovacao.
- PDF final governado.
- Exportacao Excel.
- Analitico operacional.
- Rascunho assistido por IA.

Valor para site:

> Controle permissoes de trabalho com aprovacao, historico e rastreabilidade documental.

### DDS

Entregas:

- Criacao de DDS.
- Assinaturas dos participantes.
- PDF final.
- Videos governados.
- Historico de fotos/hashes.
- Bundles semanais.
- Geracao assistida por IA.

Valor para site:

> Organize DDS com assinatura, evidencia e documento oficial pronto para auditoria.

### RDO

Entregas:

- Registro diario de obra/operacao.
- Status, assinatura, cancelamento.
- PDF final.
- Videos governados.
- Envio por email.
- Auditoria do documento.
- Exportacao Excel e analiticos.

Valor para site:

> Registre a rotina operacional com evidencias, assinaturas e envio controlado.

### Inspecoes

Entregas:

- Criacao e edicao de relatorios de inspecao.
- Evidencias.
- PDF final.
- Videos governados.
- Bundles semanais.

Valor para site:

> Transforme inspecoes em registros rastreaveis, com evidencias e documentos oficiais.

### Checklists

Entregas:

- Modelos e templates.
- Preenchimento a partir de template.
- Importacao Word.
- Foto do equipamento.
- Fotos por item.
- PDF final.
- Envio por email.
- Bootstrap de templates.

Valor para site:

> Padronize verificacoes operacionais e gere registros formais com evidencias.

### CAT

Entregas:

- Registro de CAT.
- Resumo e estatisticas.
- Investigacao.
- Fechamento.
- PDF final e anexos.
- Validacao publica.

Valor para site:

> Controle comunicacoes e investigacoes de acidentes com historico e documentacao.

### Nao conformidades

Entregas:

- Registro de nao conformidade.
- Anexos.
- Status.
- PDF final.
- Analiticos mensais e overview.
- Exportacao Excel.
- Relacao com acoes corretivas.

Valor para site:

> Registre desvios, acompanhe tratamento e mantenha prova documental.

### Acoes corretivas

Entregas:

- Criacao direta ou a partir de nao conformidade/auditoria.
- Status.
- SLA por site.
- Escalonamento.
- Resumo operacional.

Valor para site:

> Controle planos de acao, prazos, responsaveis e escalonamentos.

### Auditorias

Entregas:

- Criacao e gestao de auditorias.
- PDF final.
- Bundles semanais.
- Integracao com acoes corretivas.

Valor para site:

> Conduza auditorias internas com registros formais e rastreaveis.

### Dossies

Entregas:

- Dossie por trabalhador.
- Dossie por site.
- Dossie por contrato.
- Contexto documental.
- PDF governado.
- Acesso controlado a documento oficial.

Valor para site:

> Monte dossies auditaveis com documentos oficiais, pendencias e anexos complementares.

### Registro documental

Entregas:

- Indice dos documentos oficiais.
- Weekly bundle.
- Validacao e rastreio de artefatos.
- Fonte de verdade para PDF final.

Valor para site:

> Encontre e valide documentos oficiais em uma central unica.

### Central de pendencias documentais

Entregas:

- Agregacao de pendencias.
- Criticidade classificada no backend.
- Fontes degradadas/falhadas.
- Acoes permitidas pelo backend.
- Retry controlado de importacao.
- Links para documento, PDF, validacao publica e nova versao.

Valor para site:

> Veja gargalos documentais em um painel unico e aja com seguranca.

### Importacao documental

Entregas:

- Upload pela API.
- Processamento assincrono.
- Status consultavel.
- Retry controlado.
- Timeout.
- Idempotencia.
- Estado de falha previsivel e DLQ.

Valor para site:

> Importe documentos sem travar a operacao e acompanhe o processamento em tempo real.

### Videos governados

Escopo atual:

- DDS.
- RDO.
- Relatorio de Inspecao.

Entregas:

- Upload com validacao.
- Metadados persistidos.
- URL assinada.
- Trilha de upload, acesso e remocao.
- Validacao de permissao e lock pelo backend.

Observacao:

Nao vender video como recurso global de todos os modulos. Hoje o escopo correto e DDS, RDO e Inspecao.

### Trabalhadores / funcionarios

Entregas:

- Cadastro e gestao de trabalhadores.
- CPF validado e tratado como dado sensivel.
- Timeline do trabalhador.
- Status operacional por CPF.
- Relacao com treinamentos, exames e documentos.
- Erasure/GDPR/LGPD em rotas administrativas.

Valor para site:

> Acompanhe a situacao documental e operacional dos trabalhadores com foco em LGPD.

### Treinamentos

Entregas:

- Cadastro e gestao.
- Consulta por trabalhador.
- Resumo de vencimentos.
- Treinamentos expirando.
- Notificacao de vencimento.
- Compliance e bloqueios por usuario.
- Exportacao Excel.

Valor para site:

> Controle vencimentos de treinamentos e reduza risco de trabalhador irregular na operacao.

### Exames medicos

Entregas:

- Cadastro e gestao de exames.
- Resumo de vencimentos.
- Exportacao Excel.
- Relacao com trabalhador.

Valor para site:

> Monitore exames e ASOs com visibilidade de vencimentos e conformidade.

### EPI e fichas de EPI

Entregas:

- Catalogo de EPIs.
- Atribuicoes de EPI.
- Resumo.
- Devolucao e substituicao.
- Fichas operacionais no frontend.

Valor para site:

> Controle entrega, devolucao e substituicao de EPIs com historico operacional.

### Sites, empresas, usuarios e perfis

Entregas:

- Empresas/tenants.
- Sites operacionais.
- Usuarios.
- Perfis.
- RBAC.
- Tema do sistema.

Valor para site:

> Estruture empresas, unidades, usuarios e permissoes sem perder isolamento entre clientes.

### Riscos, atividades, maquinas e ferramentas

Entregas:

- Cadastros de riscos.
- Atividades.
- Maquinas.
- Ferramentas.
- Apoio aos fluxos de APR, PT, checklist e inspecao.

Valor para site:

> Mantenha uma base operacional reutilizavel para documentos e analises de risco.

### Relatorios e KPIs

Entregas:

- Relatorios.
- Geracao assincrona.
- Status de job.
- Fila de relatorios.
- Relatorio mensal assistido por IA.
- KPIs executivos.

Valor para site:

> Gere relatorios e indicadores para acompanhar seguranca, produtividade documental e pendencias.

## 6. Seguranca, LGPD e governanca

### Multi-tenancy

Regras reais do sistema:

- Cada empresa cliente e tratada como tenant.
- Backend e a autoridade final de tenant/company scoping.
- Middleware propaga contexto de tenant.
- Banco reforca isolamento com RLS.
- Rotas sensiveis passam por guards.

Mensagem para site:

> Ambiente multi-tenant com isolamento por empresa e controles de acesso por papel/permissao.

### Autenticacao e sessao

Componentes:

- Login por CPF/senha.
- JWT.
- Refresh token com CSRF.
- Controle de sessoes.
- MFA/TOTP e recovery codes no fluxo de seguranca.
- Step-up MFA para operacoes sensiveis.
- Cutover gradual para Supabase Auth.

### RBAC e permissoes

Componentes:

- Guards globais.
- Roles.
- Permissions.
- Contrato de autorizacao.
- Admin com requisitos especificos.

### LGPD

Controles existentes:

- Consentimento versionado.
- Consentimento especifico para IA.
- Revogacao de consentimento.
- Sanitizacao de PII antes de IA.
- CPF tratado com hash/ciphertext em caminhos endurecidos.
- Criptografia de campos sensiveis quando configurada.
- Retencao de historico de IA configuravel.
- Trilha de auditoria e eventos de seguranca.

Mensagem para site:

> O SGS foi desenhado considerando dados sensiveis de SST e LGPD: consentimento, minimizacao, isolamento por tenant e rastreabilidade.

### Governanca documental

Controles:

- PDF final oficial no storage governado.
- Registry documental.
- Hash e metadados.
- URL assinada.
- Lock/read-only em documentos fechados.
- Assinatura server-side.
- Trilha forense append-only.
- Validacao publica de documentos.
- Falha explicita quando artefato oficial nao esta saudavel.

Mensagem para site:

> Documentos oficiais nao ficam soltos: cada artefato tem origem, controle, acesso seguro e trilha de verificacao.

### Rate limiting e resiliencia

Controles:

- Rate limit por IP.
- Rate limit por tenant.
- Sliding window por usuario em IA.
- Redis como storage de throttling.
- Circuit breaker em integracoes.
- Timeouts configurados.
- Worker para tirar jobs pesados da request HTTP.

## 7. Diferenciais comerciais reais

Use estes pontos como base para paginas, secoes e cards do site:

1. Plataforma completa de SST em um unico ambiente.
2. Governanca documental com PDF final oficial, storage seguro e validacao publica.
3. Multi-tenant com isolamento por empresa.
4. Controle de vencimentos de treinamentos e exames.
5. Central de pendencias documentais para priorizar o que precisa de acao.
6. IA Sophie para apoiar rascunhos, analises e produtividade.
7. Evidencias governadas com videos em DDS, RDO e inspecoes.
8. Trilha forense e auditoria para eventos criticos.
9. Worker assincrono para importacoes, relatorios e emails.
10. Dashboards, KPIs e calendario operacional.
11. LGPD considerada desde consentimento ate minimizacao de dados.
12. Arquitetura moderna com Next.js, NestJS, PostgreSQL, Redis e storage S3 compativel.

## 8. Sugestao de estrutura para o site

### Home

Objetivo:

- Explicar rapidamente o que e o SGS.
- Mostrar que e uma plataforma real para SST, documentos, evidencias e conformidade.

Secoes sugeridas:

- Hero: "SGS - gestao de seguranca do trabalho com governanca documental".
- Problema: documentos soltos, vencimentos perdidos, controles manuais, falta de rastreabilidade.
- Solucao: plataforma unica para SST, documentos, evidencias, assinaturas e indicadores.
- Modulos principais.
- Diferenciais de seguranca e LGPD.
- CTA para demonstracao.

### Pagina "Modulos"

Agrupar por dominio:

- Documentos de SST: APR, PT, DDS, RDO, CAT, checklist, auditoria, inspecao.
- Pessoas e conformidade: trabalhadores, treinamentos, exames, EPI.
- Gestao operacional: sites, riscos, atividades, maquinas, ferramentas, acoes corretivas.
- Inteligencia e indicadores: Sophie, dashboard, KPIs, relatorios, calendario.
- Governanca: registry documental, validacao publica, pendencias, assinaturas, trilha forense.

### Pagina "Governanca documental"

Destacar:

- PDF final oficial.
- Storage governado.
- Hash.
- URL assinada.
- Validacao publica.
- Lock de documento fechado.
- Trilha forense.
- Central de pendencias.

### Pagina "IA Sophie"

Destacar:

- Apoio a rascunhos e analises.
- Geracao assistida de DDS, checklist, APR e PT.
- Analise de imagem de risco.
- Consentimento.
- Sanitizacao de dados.
- Rate limiting.
- IA como assistente, nao substituta da responsabilidade tecnica.

### Pagina "Seguranca e LGPD"

Destacar:

- Multi-tenancy.
- RBAC.
- MFA.
- CSRF no refresh.
- Consentimento versionado.
- RLS no banco.
- Sanitizacao de PII.
- Logs e auditoria.

### Pagina "Tecnologia"

Destacar apenas se o publico for tecnico:

- Next.js.
- NestJS.
- PostgreSQL/Supabase.
- Redis/BullMQ.
- Cloudflare R2.
- Render.
- Vercel.
- Sentry/OpenTelemetry.

## 9. Claims seguros para usar no site

Pode usar:

- "Plataforma SaaS multi-tenant para gestao de SST."
- "Controle de APR, PT, DDS, RDO, CAT, checklists, auditorias e inspecoes."
- "PDF final oficial com storage governado e validacao."
- "Central de pendencias documentais."
- "IA Sophie para apoiar rascunhos, analises e produtividade em SST."
- "Consentimento e sanitizacao de dados antes do uso de IA."
- "Dashboards, KPIs, calendario e relatorios."
- "Controle de treinamentos, exames, trabalhadores e EPIs."
- "Arquitetura com backend como autoridade final de permissao, tenant e documentos."

Evitar ou escrever com cuidado:

- "100% automatizado" - o sistema apoia e controla fluxos, mas decisoes tecnicas continuam com usuarios autorizados.
- "Substitui o tecnico de seguranca" - a Sophie e assistiva.
- "Video em todos os documentos" - hoje video governado e restrito a DDS, RDO e Inspecao.
- "Observabilidade completa por default" - Sentry, OpenTelemetry, Prometheus e Jaeger dependem de configuracao.
- "Todo storage sempre Cloudflare R2" sem contexto - o runtime usa S3 compativel; producao atual aponta para R2 conforme documentacao/variaveis.
- "Anthropic como provedor principal" - o codigo tem caminhos/legado para Anthropic, mas o motor oficial atual da Sophie esta orientado a OpenAI.

## 10. Pontos de atencao antes de publicar o site

1. Atualizar textos antigos que ainda citam Railway como ambiente principal. O desenho atual validado no repo e Render para backend/worker/Redis, Vercel para frontend, Supabase para banco e R2/S3 para storage.
2. Confirmar publicamente quais provedores de email estao ativos em producao antes de citar marca especifica como Brevo ou Resend.
3. Se for citar dominios, usar:
   - Frontend: `https://app.sgsseguranca.com.br`
   - API: `https://api.sgsseguranca.com.br`
4. Evitar expor detalhes sensiveis de infraestrutura, secrets, nomes de env vars e topologia interna em pagina publica.
5. Validar prints reais do produto antes de publicar screenshots, principalmente telas com CPF, nomes, documentos ou dados de trabalhadores.
6. Separar mensagem comercial de mensagem tecnica: o cliente precisa entender valor; detalhes de RLS, CSRF e BullMQ podem ficar em uma pagina tecnica ou de seguranca.

## 11. Base de conteudo pronta para copy

### Hero

SGS e a plataforma de gestao de seguranca do trabalho para empresas que precisam controlar documentos, evidencias, treinamentos, exames, permissoes e indicadores com rastreabilidade.

### Subheadline

Centralize APR, PT, DDS, RDO, CAT, checklists, auditorias, trabalhadores, treinamentos e exames em um ambiente seguro, multi-tenant e preparado para governanca documental.

### Bloco de beneficios

- Controle documentos oficiais com PDF final, assinatura, storage governado e validacao publica.
- Acompanhe pendencias, vencimentos, indicadores e criticidades em dashboards operacionais.
- Reduza retrabalho com importacao documental, modelos, templates e IA assistiva.
- Proteja dados sensiveis com consentimento, isolamento por empresa, RBAC e trilha auditavel.

### Bloco de IA

A Sophie apoia equipes de SST na criacao de rascunhos, analises, DDS, checklists, APRs, PTs e relatorios. O uso da IA respeita consentimento, sanitizacao de dados e limites de seguranca definidos pela plataforma.

### Bloco de governanca documental

No SGS, documento oficial nao e apenas um arquivo anexado. O sistema registra metadados, hash, origem, storage key, assinatura, trilha forense e disponibilidade, permitindo validacao e auditoria dos artefatos.

### Bloco de seguranca

O SGS foi desenvolvido para operacao multi-tenant. Cada empresa opera em contexto isolado, com autorizacao por papeis/permissoes, RLS no banco, controles de sessao, MFA e politicas de LGPD aplicadas aos fluxos sensiveis.

## 12. Fontes internas usadas

- `README.md`
- `render.yaml`
- `backend/src/app.module.ts`
- `backend/src/worker.module.ts`
- `backend/src/mail/mail.service.ts`
- `backend/src/ai`
- `backend/src/sophie`
- `backend/src/consents`
- `docs/architecture/SGS-SYSTEM-ARCHITECTURE-DIAGRAM.md`
- `docs/consulta-rapida/visao-geral.md`
- `docs/consulta-rapida/arquitetura-e-stack.md`
- `docs/consulta-rapida/arquitetura-e-rotas.md`
- `docs/consulta-rapida/mapa-de-modulos.md`
- `docs/consulta-rapida/modulos-e-regras.md`
- `docs/consulta-rapida/fluxos-documentais.md`
- `docs/consulta-rapida/pdfs-finais-e-storage.md`
- `docs/consulta-rapida/seguranca-e-governanca.md`
- `docs/consulta-rapida/implementacoes-recentes.md`
