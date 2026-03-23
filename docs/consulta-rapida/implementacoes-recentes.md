# Implementacoes Recentes

Este arquivo registra, em linguagem direta, o que foi implementado nas ultimas rodadas e qual foi o passo a passo de endurecimento do sistema.

Use este guia quando a pergunta for:

- "o que ja foi feito recentemente?"
- "qual foi a ordem das mudancas?"
- "onde essa feature foi endurecida?"
- "o que ainda falta depois dessas rodadas?"

## Visao geral

As ultimas rodadas focaram em cinco trilhas principais:

1. governanca documental e lock de dominio
2. storage oficial de PDFs e anexos
3. videos governados
4. assinatura verificavel e dossie governado
5. central de pendencias documentais
6. backup, restore e disaster recovery

O objetivo comum dessas rodadas foi tirar ambiguidade operacional, reduzir fluxo duplo invisivel e deixar o backend como autoridade final.

## Passo a passo das implementacoes

## 1. Lock real da APR

O que foi feito:

- a APR passou a ter modo read-only visual no frontend
- o backend passou a bloquear mutacoes indevidas
- foi criado teste de integracao para provar o lock de ponta a ponta

Passo a passo:

1. o frontend passou a observar status e presenca de PDF final
2. o formulario da APR foi envolvido com `fieldset disabled`
3. caminhos laterais foram bloqueados:
   - duplicar/remover linha
   - import/apply
   - assinatura
   - evidencias
   - acoes por linha
4. o backend passou a bloquear:
   - update comum
   - upload de evidencia
   - mutacao de assinatura
   - remocao indevida
   - mudanca de status indevida com PDF final emitido
5. o fluxo legitimo de `new-version` foi preservado
6. foi criado teste de integracao/E2E do lock da APR

Resultado:

- APR aprovada ou com PDF final emitido nao aceita mutacao comum
- frontend e backend ficaram coerentes
- a operacao consegue confiar no lock

Onde olhar:

- `frontend/app/dashboard/aprs`
- `backend/src/aprs`
- `backend/src/signatures`

## 2. PDFs finais oficiais obrigatoriamente no storage governado

O que foi feito:

- o sistema foi endurecido para nao aceitar PDF final oficial em fallback local
- o storage oficial em producao ficou configurado no Cloudflare R2

Passo a passo:

1. o `DocumentStorageService` virou o caminho oficial para PDF final governado
2. o backend passou a usar bucket/endpoint oficiais do ambiente
3. o R2 foi configurado no Railway com:
   - `AWS_BUCKET_NAME`
   - `AWS_REGION`
   - `AWS_ENDPOINT`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
4. APR, PT, DDS e Auditoria passaram a falhar explicitamente quando o storage oficial estiver indisponivel
5. o sistema deixou de registrar referencia local como se fosse documento final oficial

Resultado:

- documento final oficial precisa existir no storage oficial
- novo PDF governado fica no R2 e nao em fallback local mascarado

Onde olhar:

- `backend/src/common/services/document-storage.service.ts`
- `backend/src/common/storage/s3.service.ts`
- `backend/src/document-registry`
- `docs/consulta-rapida/pdfs-finais-e-storage.md`

## 3. Video governado restrito a DDS, RDO e Inspecao

O que foi feito:

- video virou evidencia governada
- o escopo foi restringido apenas a:
  - DDS
  - RDO
  - Relatorio de Inspecao

Passo a passo:

1. foi mantido um servico compartilhado de video governado
2. o tipo central de modulo suportado foi restringido para:
   - `dds`
   - `rdo`
   - `inspection`
3. foram expostas rotas de video somente nesses tres modulos
4. surfaces de video foram removidos de:
   - CAT
   - Checklist
   - Nao Conformidade
5. o backend passou a validar:
   - MIME type
   - tamanho maximo
   - tenant/company
   - lock/read-only
   - hash e metadados
6. o frontend recebeu painel com:
   - adicionar video
   - lista
   - preview
   - abrir/download
   - erro honesto
   - loading
7. o R2 foi ajustado com credenciais corretas de leitura e gravacao

Resultado:

- video nao e mais URL solta
- upload, acesso e remocao ficam governados
- modulos fora do recorte nao exibem a funcionalidade

Onde olhar:

- `backend/src/document-videos`
- `backend/src/dds`
- `backend/src/rdos`
- `backend/src/inspections`
- `frontend/components/document-videos`

## 4. Assinatura verificavel expandida

O que foi feito:

- o padrao de assinatura server-side foi expandido em modulos compartilhados
- o lock de assinatura ficou mais forte em documentos fechados

Passo a passo:

1. o servico compartilhado de assinaturas passou a conhecer melhor o contexto do documento
2. o backend passou a bloquear mutacao de assinatura quando houver documento final governado nos modulos cobertos
3. o envelope de prova/verificacao foi ampliado
4. o fluxo proprio do RDO foi preservado sem forcar migracao indevida

Resultado:

- assinatura nao fica frouxa em documento fechado
- payload, hash e verificacao ficam mais coerentes com a governanca documental

Onde olhar:

- `backend/src/signatures/signatures.service.ts`
- `backend/src/signatures/signatures.service.spec.ts`

## 5. Dossie governado mais maduro

O que foi feito:

- o dossie passou a separar claramente:
  - documento oficial governado
  - pendencia documental oficial
  - anexo complementar

Passo a passo:

1. o dossie passou a consumir melhor o document registry como fonte de verdade
2. o backend passou a montar linhas distintas para:
   - oficiais governados
   - pendentes
   - anexos de apoio
3. o blueprint do PDF do dossie foi ajustado para refletir essa separacao
4. PT deixou de entrar como anexo solto quando existe como documento oficial governado

Resultado:

- o dossie ficou mais auditavel
- a operacao consegue entender o que entrou, o que falta e o que e apenas complementar

Onde olhar:

- `backend/src/dossiers`
- `frontend/lib/pdf-system/blueprints/dossierBlueprint.ts`
- `frontend/services/dossiersService.ts`

## 6. Central de Pendencias Documentais - Story 4.1

O que foi feito:

- foi criada a central operacional de pendencias documentais
- ela agrega informacoes sem obrigar o usuario a abrir modulo por modulo

Passo a passo:

1. foi criado um endpoint agregador no backend
2. a criticidade passou a ser classificada no servidor
3. a central passou a ler fontes reais:
   - documento sem PDF final
   - assinatura faltante
   - disponibilidade degradada
   - importacao falhada
   - video governado indisponivel
   - anexo governado indisponivel
4. a tela operacional foi criada no frontend com:
   - cards de resumo
   - filtros
   - tabela detalhada
   - degraded/failedSources

Resultado:

- a operacao consegue ver gargalos documentais num lugar unico

Onde olhar:

- `backend/src/dashboard/dashboard-document-pendencies.service.ts`
- `backend/src/dashboard/dashboard-document-pendencies.classifier.ts`
- `frontend/app/dashboard/document-pendencies/page.tsx`

## 7. Central de Pendencias Documentais - Story 4.2

O que foi feito:

- a central deixou de ser so leitura e passou a orientar acao segura

Passo a passo:

1. cada item passou a receber `allowedActions` decidido no backend
2. o agregador passou a retornar:
   - `suggestedRoute`
   - `suggestedRouteParams`
   - `publicValidationUrl`
   - `retryAllowed`
   - `replacementDocumentId`
   - `replacementRoute`
3. foi criado endpoint de resolucao segura para:
   - PDF final oficial
   - video oficial
   - anexo oficial
4. foi criado endpoint de retry de importacao controlado pelo backend
5. a tela passou a mostrar acoes contextuais por linha:
   - abrir documento
   - abrir PDF final
   - validar documento
   - reenfileirar importacao
   - ir para nova versao
   - abrir video/anexo oficial
6. a UI passou a desabilitar acoes nao permitidas com motivo claro

Resultado:

- a central virou ferramenta operacional real
- a operacao consegue agir sem burlar lock nem tenant isolation

Onde olhar:

- `backend/src/dashboard/dashboard-document-pendency-operations.service.ts`
- `backend/src/dashboard/dto/resolve-document-pendency-action.dto.ts`
- `backend/src/document-import/services/document-import.service.ts`
- `frontend/app/dashboard/document-pendencies/page.tsx`
- `frontend/services/dashboardService.ts`

## 8. Ajustes visuais e shell enterprise

O que foi feito:

- a paleta branca enterprise foi consolidada
- dashboard, sidebar, topbar e shell ficaram mais maduros visualmente

Passo a passo:

1. foram criados tokens e classes utilitarias de tema
2. o tema claro passou a usar fundo branco dominante
3. sidebar, topbar, cards e KPI ficaram mais fortes e mais legiveis
4. o contraste geral do produto foi reforcado sem abandonar o padrao enterprise

Resultado:

- o sistema ficou mais profissional e menos "lavado"

Onde olhar:

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/app/globals.css`
- `frontend/components/Sidebar.tsx`
- `frontend/components/Header.tsx`

## 9. Configuracao operacional no Railway e Cloudflare

O que foi feito:

- o projeto foi alinhado no Railway
- storage oficial ficou coerente com o Cloudflare R2

Passo a passo:

1. o grafo do Railway foi alinhado para refletir:
   - Frontend -> Backend
   - Backend -> Postgres
   - Backend -> Redis
2. variaveis redundantes foram removidas
3. bucket e credenciais do R2 foram ajustados
4. ambiente passou a suportar upload governado sem `AccessDenied`

Resultado:

- o ambiente de producao ficou mais limpo e mais previsivel

Onde olhar:

- `docs/consulta-rapida/variaveis-ambiente-railway.md`
- `docs/consulta-rapida/pdfs-finais-e-storage.md`

## 10. Backup, restore e disaster recovery

O que foi feito:

- foi criada uma base real de disaster recovery dentro do repositório
- backup, restore e integridade passaram a ter scripts e runbook próprios

Passo a passo:

1. foi criado um modulo de disaster recovery no backend
2. passou a existir tabela de execucao:
   - `disaster_recovery_executions`
3. o sistema ganhou servico para registrar:
   - backup
   - restore
   - scanner de integridade
4. foram criados scripts:
   - `dr-backup`
   - `dr-restore`
   - `dr-integrity-scan`
5. o storage governado passou a expor operacoes de:
   - `fileExists`
   - `listKeys`
6. foi implementado scanner para detectar:
   - documento oficial no registry sem artefato
   - hash divergente
   - video governado ausente
   - anexo governado ausente
   - evidencia da APR ausente
   - artefato orfao nos prefixes suportados
7. o restore passou a ter:
   - dry-run
   - bloqueio forte para producao
   - validacao SQL pos-restore
   - integridade pos-restore opcional/automatizavel
8. foi criado workflow agendado de backup no GitHub Actions
9. foi criado runbook de disaster recovery com RPO/RTO iniciais

Resultado:

- o sistema ficou mais resiliente e mais auditavel
- agora existe prova operacional de backup/restore, e nao apenas ideia ou documento solto

Onde olhar:

- `backend/src/disaster-recovery`
- `backend/scripts/dr-backup.ts`
- `backend/scripts/dr-restore.ts`
- `backend/scripts/dr-integrity-scan.ts`
- `.github/workflows/disaster-recovery-backup.yml`
- `docs/consulta-rapida/disaster-recovery-e-backup.md`

## 11. Protecao do storage governado e recovery em ambiente separado

O que foi feito:

- o DR ganhou protecao real de artefatos oficiais via bucket secundario
- o sistema passou a ter orquestrador de recovery validado em ambiente separado

Passo a passo:

1. foi escolhida uma estrategia realista de:
   - replicacao para bucket secundario compativel com S3/R2
2. foi criado servico para storage de replica
3. foi criado servico para copiar artefatos governados da origem para a replica
4. a copia passou a:
   - preservar a mesma `storage key`
   - calcular `sha256`
   - evitar overwrite por padrao
5. foi criado comando:
   - `dr:protect-storage`
6. foi criado orquestrador:
   - `dr:recover-environment`
7. o recovery passou a:
   - restaurar banco alvo
   - apontar scanner para storage primario ou replica
   - validar hashes e orfaos pos-restore
8. o runtime de recovery passou a mapear ambientes como `recovery` para `NODE_ENV=staging`, preservando o rotulo real em `DR_ENVIRONMENT_NAME`
9. o workflow de backup foi evoluido para poder acionar tambem a replicacao de storage

Resultado:

- documentos oficiais, videos e anexos governados podem ser protegidos fora do bucket principal
- o restore em ambiente separado ficou orquestravel de ponta a ponta
- a prova de integridade pos-restore ficou mais forte

Onde olhar:

- `backend/src/disaster-recovery/disaster-recovery-replica-storage.service.ts`
- `backend/src/disaster-recovery/disaster-recovery-storage-protection.service.ts`
- `backend/scripts/dr-protect-storage.ts`
- `backend/scripts/dr-recover-environment.ts`
- `.github/workflows/disaster-recovery-backup.yml`
- `docs/consulta-rapida/disaster-recovery-e-backup.md`

## Como consultar rapidamente o que foi feito

- se a pergunta for sobre documento final oficial: `pdfs-finais-e-storage.md`
- se a pergunta for sobre pendencias e acoes operacionais: `implementacoes-recentes.md` e `fluxos-documentais.md`
- se a pergunta for sobre tenant, RBAC, lock e trilha: `seguranca-e-governanca.md`
- se a pergunta for sobre ambiente/infra: `variaveis-ambiente-railway.md`

## O que ainda pode vir depois

Proximos passos naturais:

- Centro de Pendencias Documentais com mais automacoes
- Dossie governado com pacote ZIP/manifest
- Politica de retencao e expurgo governado
- locks padronizados em outros modulos que ainda precisem de consolidacao
