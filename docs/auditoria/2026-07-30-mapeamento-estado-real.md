# Mapeamento do estado real do SGS

Data da coleta: 2026-07-30  
Escopo: diagnóstico read-only antes de novas implementações  
Fora de escopo: camada APR de consulta, cache e race condition, em trabalho paralelo pelo Claude

## Critério de evidência

As classificações abaixo usam somente evidência observável. Uma rota compilada prova que a superfície existe, mas não prova que o fluxo funciona.

- `pronto`: comportamento verificado e coerente com a regra observável.
- `parcial`: superfície ou regra existe, mas falta prova de ponta a ponta ou há inconsistência.
- `com falha`: comportamento verificado quebra o fluxo esperado.
- `apenas visual`: interface comprovadamente sem integração real.
- `não iniciado`: ausência confirmada no código e nos fluxos.
- `legado`: implementação comprovadamente obsoleta.

Não foi possível classificar item como `apenas visual`, `não iniciado` ou `legado` apenas pela presença ou ausência em bundle. Essas classificações exigem inspeção do fonte, entidades, migrations e testes.

## Referência da coleta

- Deploy de produção do frontend: `dpl_5UKHzzohsLv3HiwjiSZxACWauE3M`
- Commit informado pelo deploy: `0dcf6c24574d533cc5761fecacaf3489b4a2ce6c`
- Branch informada pelo deploy: `test/rls-hardening-auth-e2e`
- Mensagem: `test(e2e): validação de auth pós-hardening RLS (migration 361)`
- Build: Next.js `16.2.11`, Node `24.x`, 88 páginas geradas, TypeScript concluído
- O build executou `prebuild` e `build`; não há evidência de testes executados no pipeline Vercel
- `GET /health/public`: `200`, frontend saudável
- `GET /api/keepalive`: `500`, `{"ok":false,"error":"service_unavailable"}`
- Acesso anônimo a `/dashboard/companies`: resposta efetiva da rota `/login`
- Erros agregados do runtime Vercel nos últimos sete dias: nenhum; essa telemetria não cobre o backend e não invalida o `500` tratado pelo keepalive

## A) Matriz do estado real

| Área | Arquivo/tela/endpoints envolvidos | Status | Evidência encontrada | Risco | Observação | Tarefa/fase |
|---|---|---|---|---|---|---|
| Build do frontend | 88 rotas App Router no log do deploy | pronto | Compilação e TypeScript concluídos; deploy `READY` | baixo | Prova apenas que a superfície compila | F0 |
| Saúde do frontend | `/health/public` | pronto | HTTP 200, `no-store`, CSP, HSTS, COOP/CORP e `nosniff` | baixo | Não prova saúde do backend | F4 |
| Dependência do backend | `/api/keepalive` | com falha | HTTP 500 `service_unavailable` em 2026-07-30 | crítico | Bloqueia validação funcional de todos os módulos integrados | F4 |
| Proteção de tela autenticada | `/dashboard/companies` → `/login` | pronto | Requisição anônima foi resolvida pela rota `/login` | médio | Ainda falta testar autorização entre perfis autenticados | F1/F2 |
| Login | `/login`; `/auth/login`; `/auth/me`; `/auth/logout` | parcial | Formulário CPF/senha e clientes reais no bundle | alto | Login real não testado porque o backend está indisponível e não foram usadas credenciais | F1/F5 |
| MFA e step-up | `/auth/login/mfa/verify`; `/auth/login/mfa/bootstrap/activate`; `/auth/step-up/verify` | parcial | Fluxos presentes no cliente publicado | alto | Faltam entidades/configuração e testes positivos/negativos | F1/F5 |
| Renovação de sessão | `/auth/refresh`; `/auth/csrf` | parcial | Refresh com lock entre abas, cookies CSRF e renovação antes da expiração | alto | Falta confirmar cookie flags, TTLs e revogação no backend | F1 |
| Troca inicial de senha | `/trocar-senha-inicial`; `/auth/change-password` | parcial | `must_change_password` redireciona para tela dedicada | médio | Falta teste com usuário novo/inativo | F1/F5 |
| Recuperação de senha | `/forgot-password`; `/auth/forgot-password`; `/auth/reset-password` | parcial | Tela por CPF e endpoints no cliente | alto | Depende de e-mail; entrega e anti-enumeração não verificados | F1/F4/F5 |
| Cadastro de empresa por convite | `/onboarding/[token]`; `/tenant-lifecycle/invites`; `/tenant-lifecycle/onboarding/:token`; `.../complete` | parcial | Tela coleta empresa, CNPJ, responsável, admin, senha e aceite de termos; trial de 30 dias | alto | Criação do convite exige fluxo autenticado não testado; transação e rollback não verificados | F1/F2/F5 |
| Empresas | `/dashboard/companies`, `/new`, `/edit/[id]`; `/companies`; `/companies/current/logo` | parcial | Rotas e serviços publicados | crítico | Isolamento backend, status ativo e autorização por perfil não verificados | F2/F5 |
| Usuários | `/dashboard/users`, `/new`, `/edit/[id]`; `/users`; `/users/module-access-options` | parcial | CRUD e opções de acesso presentes | crítico | Falta matriz backend por perfil e prova de tenant | F1/F2/F5 |
| Exportação do titular | `/users/me/export` | parcial | Endpoint publicado no cliente | alto | Formato, minimização, auditoria e prazo LGPD não verificados | F3/F5 |
| Consentimento de IA | `/users/me/ai-consent`; `/users/me/consents` | parcial | Leitura/escrita de consentimento no cliente | crítico | Guard backend e bloqueio antes de OpenAI não foram verificados | F2/F5 |
| Funcionários/trabalhadores | `/dashboard/employees`, `/employees/[id]`, `/employees/new`; `/users/worker-status/by-cpf`; `/timeline` | parcial | Telas de cadastro/detalhe e consulta de vínculo/timeline presentes | crítico | Entidade, validação CPF, escopo por obra e tenant não verificados | F2/F5 |
| Obras | `/dashboard/sites`, `/new`, `/edit/[id]`; `/sites` | parcial | CRUD de obras presente e `siteId` aparece nos módulos | alto | Não foi encontrada regra comum que obrigue obra ativa; precisa decisão por ação | F2 |
| Empresa ativa | `cx_selected_tenant`; `x-company-id` | parcial | Seleção exige `companyId` e `companyName`; header é injetado nas requisições privadas | crítico | Backend precisa rejeitar empresa ausente, inativa, removida ou divergente sem confiar no header | F2/F5 |
| Limite de paginação | interceptor HTTP, parâmetro `limit` | pronto | Cliente normaliza `limit` para `1..100` | médio | Não substitui limite e índice no backend | F0/F2 |
| APR | `/dashboard/aprs`, `/new`, `/edit/[id]`; validação pública APR | parcial | Rotas existem | crítico | Consulta/cache/race explicitamente preservados para o Claude; nenhuma conclusão funcional foi feita aqui | APR-CLAUDE |
| PT | `/dashboard/pts`, `/new`, `/edit/[id]`; `/pts/export/all`; analytics; files; approval-rules | parcial | CRUD, exportação, arquivos semanais e regras de aprovação publicados | alto | Geração PDF, trava, assinatura e escopo tenant não testados | F3/F5 |
| DDS | `/dashboard/dds`, `/new`, `/edit/[id]`; `/dds`; people; observability; files | parcial | CRUD, pessoas, observabilidade, arquivos e hashes históricos presentes | alto | Backend indisponível; consistência de participantes/assinaturas não testada | F3/F5 |
| Assinatura pública DDS | `/assinar/dds/[token]`; `/public/dds/signature/:token` | parcial | Tela pública valida token e possui submissão de assinatura/consentimento | crítico | Expiração, replay, vínculo com pessoa e não repúdio não verificados | F3/F5 |
| Validação pública DDS | `/validar/[code]`; `/public/dds/validate?code=&token=` | parcial | Cliente publicado consulta com `no-store` | alto | Backend indisponível; resposta válida/expirada não testada | F3/F5 |
| Validação documental pública | `/verify`; checklists, CAT, dossiês, APR e documentos | parcial | Roteamento por prefixos `CHK-`, `CAT-`, `DOS-`, `APR-` e fallback documental | alto | Falta contrato unificado e teste de enumeração de códigos | F3/F5 |
| Evidência/assinatura por hash | `/public/evidence/verify?hash=`; `/public/signature/verify?hash=` | parcial | Validação SHA-256 de 64 caracteres no cliente | alto | Prova criptográfica, canonicalização e persistência não verificadas | F3/F5 |
| Checklists | telas de modelos, templates, preenchimento e edição; `/checklists/*` | parcial | Bootstrap, importação Word, preenchimento, arquivos e bundle semanal presentes | alto | Convivência entre `checklist-models` e `checklist-templates` pode gerar duplicidade de domínio | F3 |
| Assinaturas autenticadas | `/signatures`; `/signatures/document`; `/signatures/verify`; PIN de assinatura | parcial | Serviço e PIN publicados | crítico | Política por perfil, hash, revogação e auditoria não verificados | F3/F5 |
| Não conformidades | telas CRUD; `/nonconformities`; `/attachments`; analytics; files | parcial | Anexos, analytics mensal/overview e bundles semanais presentes | alto | CAPA, e-mail e exportação são marcados como online; filas não verificadas | F3/F4/F5 |
| CAT | `/dashboard/cats`; validação pública `CAT-` | parcial | Tela e endpoint público publicados | alto | Emissão, histórico, assinatura e PDF não testados | F3/F5 |
| Dossiês | `/dashboard/dossiers`; validação pública `DOS-` | parcial | Tela e endpoint público publicados | alto | Composição, versionamento e anexos não verificados | F3/F5 |
| Registro documental | `/dashboard/document-registry`; `/documentos/novo`; `/documentos/importar`; `/document-pendencies` | parcial | Superfícies distintas publicadas | alto | Pode haver sobreposição entre registro, importação e pendências; precisa regra canônica | F3 |
| Relatórios | `/dashboard/reports`; `/dashboard/relatorios`; mensal, RDO e fotográfico | parcial | Duas famílias de rotas coexistem | alto | Possível duplicidade/legado, ainda não comprovada | F3 |
| Relatório fotográfico | `/dashboard/photographic-reports/*` e `/dashboard/relatorios/fotografico/*` | parcial | Duas superfícies publicadas | alto | Definir fluxo canônico antes de nova implementação | F3 |
| Treinamentos | `/dashboard/trainings`, `/new`, `/edit/[id]`; `/trainings` | parcial | CRUD publicado | alto | Certificados, anexos, vencimentos e e-mail não verificados | F3/F5 |
| Exames médicos | `/dashboard/medical-exams`; `/medical-exams` | parcial | Tela e cliente do módulo publicados | crítico | Dados de saúde, ASO, retenção, anexos e permissões LGPD não verificados | F2/F3/F5 |
| Fichas de EPI | `/dashboard/epi-fichas`; `/dashboard/epis/*` | parcial | Telas publicadas | alto | Entrega, assinatura, histórico e PDF não verificados | F3/F5 |
| RDO, ARR e DID | `/dashboard/rdos`; `/arrs/*`; `/dids/*` | parcial | Rotas publicadas | médio | Profundidade funcional e documentos emitidos não verificados | F3 |
| Máquinas/ferramentas/atividades | CRUDs de machines, tools e activities | parcial | Rotas e serviços publicados | médio | Vínculo com obra, checklists e permissões não verificados | F2/F3 |
| IA/Sophie | `/ai/status`; chat/history; analyze/generate/create | parcial | Endpoints de análise, geração e criação aparecem no cliente | crítico | Sanitização PII, consentimento, rate limit e circuit breaker não verificados nesta coleta | F2/F4/F5 |
| Armazenamento de objetos | CSP permite R2 e Backblaze; bundles citam R2/Backblaze e anexos | parcial | Dependência cliente observável | alto | S3 pode ser compatibilidade ou legado; decisão exige fonte/configuração | F4 |
| E-mail | recuperação de senha, alertas DDS, CAPA e convites | parcial | Fluxos consumidores identificados | alto | Provider, fila, retry, DLQ e idempotência não verificados | F4 |
| Filas | operações online e referências de queue/fila nos bundles | parcial | Dependência sugerida no cliente | alto | Não comprova worker, broker ou garantia de entrega | F4 |
| Redis | declarado na arquitetura do projeto | parcial | Sem prova direta no artefato publicado | crítico | Confirmar usos, namespaces por tenant, TTLs e comportamento sem Redis | F4 |
| Geração de PDF | PT, DDS, checklists, relatórios, assinaturas e exportações | parcial | Superfícies e endpoints existem | alto | Geradores, templates, filas, armazenamento e testes visuais não inspecionados | F3/F4 |
| Testes de autenticação | commit menciona E2E auth/RLS e migration 361 | parcial | Evidência nominal no metadado do deploy | crítico | Arquivos, cenários, resultado e execução em CI não inspecionados | F0/F5 |
| Entidades TypeORM | backend | sem classificação | Acesso ao fonte local não retornou conteúdo nesta coleta | crítico | Não inferir entidade a partir de tela | F0 |
| Migrations TypeORM | backend; referência nominal a migration 361 | sem classificação | Somente referência no commit do deploy | crítico | Não alterar migration antiga; inventário cronológico é gate | F0 |

## Inventário de telas compiladas

### Identidade e contexto

- `/login`
- `/forgot-password`
- `/trocar-senha-inicial`
- `/onboarding/[token]`
- `/dashboard/companies`, `/new`, `/edit/[id]`
- `/dashboard/users`, `/new`, `/edit/[id]`
- `/dashboard/employees`, `/employees/[id]`, `/employees/new`
- `/dashboard/workers/timeline`
- `/dashboard/sites`, `/new`, `/edit/[id]`

### Documentais e operacionais

- APR, ARR, PT, DDS, DID e RDO
- checklists, modelos, templates e preenchimento
- CAT, dossiês, registro documental, importação e pendências
- relatórios geral, mensal, RDO e fotográfico
- treinamentos, exames médicos, EPI e fichas de EPI
- auditorias, não conformidades e ações corretivas
- atividades, riscos, mapa de risco, máquinas e ferramentas

### Públicos

- `/verify`
- `/validar/[code]`
- `/assinar/dds/[token]`
- `/health/public`

## B) Regras fundamentais

### Confirmadas pela evidência observável

1. Páginas de dashboard exigem autenticação.
2. Requisições privadas usam token de acesso e contexto de empresa.
3. O contexto de empresa é transmitido por `x-company-id`.
4. A empresa selecionada no cliente precisa ter `companyId` e `companyName`.
5. Endpoints de auth, onboarding, health e public não exigem o header de empresa.
6. Mutações usam token CSRF; refresh também usa proteção CSRF específica.
7. Sessão perto da expiração tenta refresh antes da requisição.
8. A troca de empresa limpa estado tenant-scoped do cliente.
9. Listagens do cliente limitam `limit` a no máximo 100.
10. Usuário pode receber `roles`, `permissions`, `profileName`, `company_id` e `isAdminGeral`.
11. MFA, step-up e troca inicial de senha fazem parte do contrato publicado.
12. Consentimento de IA possui endpoints dedicados.
13. Validação pública documental usa código e/ou hash, com cache desabilitado.
14. Dados sensíveis são removidos do cache/telemetria cliente por chaves e padrões de CPF, documento, assinatura, saúde, anexos, tokens, senha, PDF e URL privada.

### Precisam de decisão ou prova de backend

1. Código canônico dos perfis: `ADMIN_GERAL`, `ADMIN_EMPRESA`, `TST`, `GESTOR`, `COLABORADOR` ou nomes humanizados.
2. Matriz exata de permissão por módulo e ação.
3. Quais ações exigem empresa ativa e como usuário global seleciona tenant.
4. Quais ações exigem obra ativa; não há regra comum observável para `siteId`.
5. Comportamento de usuário inativo, empresa inativa, obra inativa e vínculo expirado.
6. Se colaborador pode acessar dashboard ou apenas fluxos públicos/de assinatura.
7. Regra canônica entre modelos e templates de checklist.
8. Regra canônica entre `reports`, `relatorios` e as duas famílias de relatório fotográfico.
9. Regra canônica entre registro documental, criação, importação e pendências.
10. Escopo e retenção de dados médicos, anexos e exportação LGPD.
11. Fonte de verdade de assinaturas: PIN, token público, hash e trilha de auditoria.
12. Provider canônico de objetos: R2, Backblaze ou API S3-compatible.
13. Garantias de e-mail/fila: retry, idempotência, DLQ e observabilidade.

## C) Lacunas críticas

| Lacuna | Tipo | Por que bloqueia | Fase |
|---|---|---|---|
| Backend indisponível no keepalive | funcional/infraestrutura | Impede validar qualquer fluxo integrado | F4 |
| Entidades e relações não inventariadas | backend/dado | Não é seguro planejar cadastro ou documentos sem fonte de verdade | F0 |
| Migrations não inventariadas | backend/dado | Risco de schema duplicado e quebra de tenants existentes | F0 |
| Testes auth/RLS não inspecionados nem executados | teste/segurança | A mensagem do commit não prova cobertura ou sucesso | F0/F5 |
| Matriz perfil × permissão × módulo ausente | permissão/segurança | Pode gerar escalada horizontal ou bloqueio indevido | F2 |
| Regras de empresa/usuário/obra ativos incompletas | funcional/permissão | Contexto inválido pode contaminar operações multi-tenant | F2 |
| Fluxos documentais duplicados sem canonicidade | funcional/visual/backend | Nova implementação pode reforçar caminho obsoleto | F3 |
| Pipeline PDF não inventariado | backend/infraestrutura/teste | Emissão, hash, assinatura e armazenamento podem divergir | F3/F4 |
| E-mail/fila/storage sem contrato verificado | infraestrutura | Falhas silenciosas e duplicidade de efeitos | F4 |
| Dados médicos e anexos sem política comprovada | LGPD/segurança | Alto risco regulatório e de exposição | F2/F3 |
| Fixture de homologação ainda não ligada a seed transacional | dado/teste | Dataset declarativo não valida banco sozinho | DATA-HML/F5 |

## D) Itens que não devem ser mexidos agora

1. APR: consulta, cache e race condition em trabalho pelo Claude.
2. Migrations antigas, inclusive qualquer artefato relacionado à referência 361.
3. Header e seleção de tenant sem antes provar o contrato backend.
4. Fluxos públicos de validação e assinatura antes de fechar ameaça de enumeração/replay.
5. Famílias duplicadas de relatórios, checklists e documentos antes de decidir o caminho canônico.
6. Providers de R2/Backblaze/S3 antes de inventariar configuração e dados existentes.
7. Regras de perfis por comparação textual antes de definir códigos canônicos.
8. Dados médicos, CPF, anexos e exportações LGPD sem testes de isolamento.
9. Cache cliente comum; qualquer alteração pode cruzar a frente APR em andamento.
10. Novas features até concluir F0, F2 e restaurar o gate F4.

## Fases futuras vinculadas

- `F0 — Fechamento de evidência`: fonte local, entidades, migrations, controllers, testes e CI.
- `F1 — Identidade`: login, MFA, convite, recuperação e ciclo de vida do usuário.
- `F2 — Contexto e autorização`: tenant, empresa/obra ativas, perfis e permissões.
- `F3 — Governança documental`: emissão, PDF, anexos, histórico, assinatura e validação.
- `F4 — Infraestrutura`: backend, e-mail, filas, Redis, storage, PDF e circuit breakers.
- `F5 — Homologação/E2E`: matriz positiva/negativa por perfil, tenant e documento.
- `F6 — Banco/DR`: cursor pagination, backup por tenant e disaster recovery.
- `DATA-HML`: transformar o fixture declarativo em seed idempotente após conhecer schema e constraints.
- `APR-CLAUDE`: frente preservada de consulta/cache/race do APR.

## Resumo executivo

- Pronto e verificado: build do frontend, health público, bloqueio anônimo de dashboard e limite cliente de paginação.
- Parcial: autenticação, empresas, usuários, trabalhadores, obras e todos os módulos documentais observados.
- Com falha: conectividade/saúde funcional do backend via keepalive.
- Sem classificação segura: entidades, migrations, testes, itens visuais, não iniciados e legados.
- Gate para avançar: restaurar backend e concluir F0/F2 antes de implementar novas regras.

