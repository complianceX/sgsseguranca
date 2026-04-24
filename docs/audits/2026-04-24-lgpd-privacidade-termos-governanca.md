# Auditoria LGPD, privacidade, termos e governanca de dados - SGS

Data da auditoria: 2026-04-24  
Escopo: repositorio local `sgs-seguraca`, frontend Next.js, backend NestJS, documentos juridicos publicos, fluxos de consentimento, IA, armazenamento local, exclusao/retencao, APIs, PDFs, uploads e validacao publica.

## Metodologia e limites

Esta auditoria foi feita por leitura estatica do repositorio e cruzamento entre interface, backend, migrations e textos juridicos. Nao houve validacao live de producao, banco real, variaveis de ambiente publicadas, contratos comerciais, DPAs assinados, logs reais, buckets de storage, backups ou rotinas agendadas em infraestrutura. Portanto, quando a conclusao depende dessas provas externas, o status e "nao evidenciado".

Referencias normativas consultadas:

- LGPD - Lei 13.709/2018, texto compilado no Planalto: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- ANPD - Guia orientativo para agentes de tratamento e encarregado: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado
- ANPD - Guia orientativo sobre legitimo interesse: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse

## PARTE 1 - RESUMO EXECUTIVO

### Veredito

O SGS esta **parcialmente adequado**, mas **nao esta pronto para ser apresentado como plenamente conforme a LGPD**. Ha uma base tecnica relevante ja implementada: paginas publicas de privacidade/termos/cookies, configuracao legal obrigatoria para producao, modulo de consentimento versionado, RLS para consentimentos, guard de IA baseado em consentimento versionado, sanitizacao de payload OpenAI, criptografia/hash de CPF, controles de tenant em modulos sensiveis, auditoria e algumas rotas de exportacao/exclusao.

O problema e que essa camada positiva convive com divergencias de alto risco: a UI ainda salva consentimento de IA em flag booleana legada, o modal de consentimento obrigatorio falha aberto quando a API de consentimentos quebra, a prova de aceite persiste resumos e nao necessariamente o texto juridico integral aceito, a Politica promete medidas que nao estao integralmente evidenciadas, CPF aparece em URLs, dados pessoais/sensiveis sao cacheados em `localStorage`, a exclusao LGPD nao cobre o ciclo completo de dados/documentos/arquivos, e a validacao publica de APR expõe metadados por codigo sem token/grant.

### Notas

- Maturidade LGPD/privacidade: **5,0/10**
- Politica de Privacidade: **6,2/10**
- Termos de Uso: **5,8/10**
- Sustentacao tecnica da privacidade: **5,1/10**

### Nivel de risco geral

**Alto.** O sistema trata CPF, dados ocupacionais, documentos de SST, assinaturas, fotos, evidencias, possiveis dados de saude ocupacional, geolocalizacao, logs e dados de trabalhadores. A exposicao e B2B, mas os titulares sao pessoas naturais. A superficie de incidente e relevante.

### Principais achados criticos

1. Consentimento de IA incoerente: backend novo exige `user_consents`, mas UI principal ainda grava `users.ai_processing_consent` via endpoint legado.
2. Consentimento obrigatorio falha aberto no dashboard se `/users/me/consents` der erro.
3. Texto aceito/versionado parece ser resumo operacional, nao o texto integral da Politica/Termos exibido ao usuario.
4. Aviso de IA promete ausencia de dados individuais, mas o servico de IA monta contexto com participantes/opcoes identificaveis antes da camada de sanitizacao.
5. CPF e usado em path de API (`/users/worker-status/cpf/:cpf`), expondo dado pessoal em URL, logs, historico e observabilidade.
6. `localStorage` armazena caches/drafts com dados pessoais e possivelmente sensiveis em varios modulos.
7. Exclusao/anonimizacao LGPD e incompleta: cobre usuario, sessoes, parte de logs/interacoes, mas nao comprova cobertura de exames, treinamentos, CAT, APR/PT, assinaturas, PDFs, uploads, emails, storage e backups.
8. Validacao publica de APR aceita apenas `code`, sem token/grant, e retorna nomes de aprovadores, empresa, obra e hashes.
9. Politica de Privacidade contem promessas fortes demais, como AES-256 para PII sensivel e DPAs com todos os suboperadores, sem evidencia operacional completa.
10. Retencao pratica e insuficiente: ha tabela/funcao parcial, mas nao ha evidencia de job, descarte de arquivos, backups e offboarding completo de cliente.

## PARTE 2 - MATRIZ DE CONFORMIDADE

| Item auditado | Status | Evidencia | Observacao critica |
|---|---:|---|---|
| Pagina publica de Politica de Privacidade | Parcialmente conforme | `frontend/app/privacidade/page.tsx` | Existe e e rica, mas faz promessas nao integralmente comprovadas. |
| Pagina publica de Termos de Uso | Parcialmente conforme | `frontend/app/termos/page.tsx` | Cobre B2B/SaaS, IA e responsabilidade, mas precisa endurecer DPA, documentos emitidos, incidentes e SLA. |
| Politica de Cookies | Parcialmente conforme | `frontend/app/cookies/page.tsx` | Declara cookies essenciais, mas trata `localStorage` de modo brando frente ao uso real. |
| Links juridicos no login | Conforme | `frontend/app/(auth)/login/LoginPageClient.tsx:397-402` | Termos e Privacidade aparecem no fluxo de login. |
| Links juridicos em cadastro publico | Nao evidenciado | Busca nao identificou cadastro publico | Se houver cadastro por convite/admin, precisa aviso contextual no formulario. |
| Rodape publico geral | Parcialmente conforme | Paginas legais tem footer; app institucional nao avaliado live | Login e paginas legais ok; rodape global publico nao ficou evidenciado no app. |
| Identificacao de controlador/DPO | Parcialmente conforme | `frontend/lib/legal.ts:54-118` | Ha guard de config em producao, mas env/producao e dados reais nao foram validados. |
| Registro versionado de consentimentos | Parcialmente conforme | `backend/src/consents/*`, migration `1709000000143` | Estrutura boa; conteudo versionado e integracao UI ainda falhos. |
| Consentimento obrigatorio privacy/terms | Nao conforme | `frontend/hooks/useRequiredConsents.ts:44-46` | Falha aberto em erro da API. |
| Consentimento de IA | Nao conforme | `frontend/components/AiConsentModal.tsx:24`; `frontend/app/dashboard/settings/page.tsx:581` | UI grava flag legada; guard backend usa consentimento versionado. |
| Marketing consent | Nao evidenciado | `backend/src/consents/consents.seeder.ts:62` | Tipo existe no seed, mas nao foi evidenciada UI granular real. |
| Consentimento granular por cookies | Parcialmente conforme | `frontend/app/cookies/page.tsx:295-297` | Dispensa painel por declarar apenas essenciais; precisa alinhar storage local e terceiros. |
| Dados sensiveis de saude ocupacional | Parcialmente conforme | `frontend/app/privacidade/page.tsx:477-503`; medical exams module | Documento reconhece sensibilidade; retencao/exclusao/exportacao ficam incompletas. |
| CPF protegido em banco | Parcialmente conforme | `backend/src/users/users.service.ts:72-89`; `user.entity.ts:24-30` | Hash/cifra existem, mas ha CPF em URL e export/local cache. |
| CPF em URLs | Nao conforme | `backend/src/users/users.controller.ts:201,215`; `frontend/services/usersService.ts:192,199` | Dado pessoal trafega em path. |
| Segregacao por tenant | Parcialmente conforme | Ex.: `medical-exams.service.ts:55-61,98-107`; RLS consentimentos | Bons sinais em modulos, mas auditoria completa de todas as queries nao foi feita. |
| IA/OpenAI minimizada | Parcialmente conforme | `openai-request.util.ts`; `openai-payload-boundary.util.ts`; `ai.service.ts:2544,2900` | Sanitizacao existe, mas prompts ainda montam contexto identificavel; texto legal overpromete. |
| Direitos do titular - exportacao | Parcialmente conforme | `backend/src/users/users.service.ts:905-943` | Exporta perfil do usuario, nao todo historico/dados do titular. |
| Direitos do titular - eliminacao | Nao conforme | `users.service.ts:569-593`; migration `1709000000145` | Cobertura parcial e sem arquivos/backups/documentos sensiveis. |
| Retencao por tipo de dado | Parcialmente conforme | `privacidade/page.tsx:171-178`; migration `1709000000145` | Tabela documental existe, rotina pratica incompleta. |
| Storage/upload com AV | Parcialmente conforme | `file-inspection.service.ts:185-265` | Codigo bloqueia em producao sem provider; infra real nao verificada. |
| Storage de arquivos e links assinados | Parcialmente conforme | `document-storage.service.ts:48,116-127` | Existe controle de download, mas lifecycle/exclusao e nomes PII em chaves precisam revisao. |
| Validacao publica documental | Parcialmente conforme | grants publicos em varios modulos; APR excecao | APR sem token e uma excecao relevante. |
| Logs/observabilidade | Parcialmente conforme | Politica, Sentry PII scrubbing em frontend, logs backend | Retencao, scrubbing backend e payload real de logs nao evidenciados integralmente. |
| Backups e disaster recovery por tenant | Nao evidenciado | Sprint 3 pendente | Politica menciona eliminacao apos contrato, mas sem prova de backup lifecycle. |
| Transferencia internacional e DPAs | Contraditorio/nao evidenciado | `privacidade/page.tsx:584-585`; `featureFlags.ts:2`; `consents.seeder.ts:53` | Documentos dizem DPA vigente; feature flag diz DPA pendente. |

### Matriz resumida de dados pessoais identificados

| Dado | Captura/uso observado | Armazenamento | Acesso provavel | Base legal provavel | Sensibilidade | Retencao aparente | Cobertura documental |
|---|---|---|---|---|---|---|---|
| Nome de usuario/trabalhador | Usuarios, participantes, aprovadores, PDFs | `users`, APR/PT/CAT/audits/docs | Tenant, admins, perfis autorizados | Contrato/obrigacao legal | Pessoal | Indefinida por entidade | Parcial |
| CPF | Usuarios, consultas worker status | `cpf_hash`, `cpf_ciphertext`, possivel legado `cpf`; URL de status | RH/SST/admin | Obrigacao legal/contrato | Alto risco | Indefinida | Parcial e contraditoria |
| E-mail | Login, usuarios, notificacoes | `users`, logs/email | Admin/sistema/email provider | Contrato/comunicacao | Pessoal | Mail logs 90d se `deleted_at` | Parcial |
| Telefone | Possivel trabalhador/empresa/suporte | Entidades diversas nao exaustivamente mapeadas | Admin/tenant | Contrato/obrigacao | Pessoal | Nao evidenciada | Generica |
| Funcao/cargo/matricula | Usuarios/trabalhadores/SST | `users`, docs/PDFs | Tenant/admin | Obrigacao legal/contrato | Pessoal ocupacional | Indefinida | Parcial |
| Dados de saude ocupacional/ASO/exames | Modulo Exames Medicos | `medical_exams` | Perfis com permissao | Obrigacao legal e tutela da saude | Sensivel | Nao evidenciada de forma granular | Parcial |
| Evidencias/fotos/anexos | APR, PT, inspecoes, CAT, DDS, documentos | Storage/S3/local, document registry | Tenant/admin/public token em validacoes | Obrigacao legal/contrato | Pode ser sensivel | Vaga: lei/instrucao cliente | Parcial |
| Assinaturas e hashes | Signatures, PDFs, approval flows | `signatures`, PDFs, public verify | Tenant/admin/public verify | Contrato/obrigacao/prova | Biometrico? alto risco se imagem | Indefinida | Parcial |
| Geolocalizacao/IP/device | Evidencias APR, logs, auditoria | `apr-risk-evidence`, logs, audit | Admin/sistema | Leg. interesse/seguranca/prova | Alto risco contextual | Logs 2 anos; evidencias indefinidas | Fraca |
| Prompts/interacoes IA | Sophie/APR/PT/analises | `ai_interactions`, logs | Usuario/admin/sistema/OpenAI | Consentimento/contrato? | Pode conter PII/sensivel | 1 ano apos anonimizacao | Contraditoria |
| PDFs finais e hashes | ARR/APR/PT/CAT/DDS/treinamentos | Storage/document registry | Tenant, validacao publica/link | Obrigacao legal/contrato | Pode conter sensivel | Conforme lei/instrucao | Parcial |
| Logs de auditoria/seguranca | Backend, auth, consentimentos | `audit_logs`, forensic, Sentry | Admin/sistema/terceiros | Leg. interesse/obrigacao | Pode conter PII | 2 anos se `deleted_at` | Parcial |
| Preferencias/drafts/cache offline | Frontend local | `localStorage`/`sessionStorage` | Usuario/dispositivo, risco XSS | Conveniencia/contrato | Pode conter sensivel | TTL variavel/indefinido legado | Insuficiente |

## PARTE 3 - ACHADOS DETALHADOS

### A01 - Consentimento de IA esta dividido entre sistema novo e flag legada

- Severidade: **critica**
- Area afetada: IA, consentimento, prova de aceite, LGPD Art. 8 e Art. 11.
- Evidencia observada: `AiConsentGuard` consulta `ConsentsService.hasActiveConsent(..., 'ai_processing')` e exige versao vigente (`backend/src/common/guards/ai-consent.guard.ts:17-51`). Entretanto, o modal de IA chama `usersService.updateAiConsent(true)` (`frontend/components/AiConsentModal.tsx:24`) e Configuracoes faz o mesmo (`frontend/app/dashboard/settings/page.tsx:581`). Esse endpoint apenas atualiza `users.ai_processing_consent` (`backend/src/users/users.service.ts:706-723`).
- Risco gerado: o usuario pode acreditar que consentiu, mas o guard tecnico pode bloquear; ou areas legadas podem aceitar flag sem prova material. A prova de IP/UA/versao fica inconsistente.
- Impacto juridico: fragiliza validade do consentimento e sua demonstrabilidade.
- Impacto tecnico: estado duplicado e divergente.
- Impacto operacional: suporte recebera erros de IA "consentimento ausente" mesmo apos aceite na UI.
- Recomendacao: remover o fluxo legado da UI, fazer modal e settings chamarem `POST /users/me/consents` para `ai_processing`, e transformar `users.ai_processing_consent` em campo derivado/deprecated ou backfill controlado.

### A02 - Consentimento obrigatorio falha aberto se a API falhar

- Severidade: **alta**
- Area afetada: aceite de Politica/Termos, onboarding, accountability.
- Evidencia observada: `useRequiredConsents` retorna `needsConsent: false` no `catch` (`frontend/hooks/useRequiredConsents.ts:44-46`).
- Risco gerado: falha temporaria ou bloqueio da API permite uso do dashboard sem aceite vigente.
- Impacto juridico: perda de prova de ciencia/aceite de termos e politica.
- Impacto tecnico: comportamento inseguro por default.
- Impacto operacional: tenants podem operar sem aceite e sem rastreabilidade.
- Recomendacao: falhar fechado para termos/politica; permitir apenas tela de erro/retry ou modo bloqueado ate confirmar status.

### A03 - Texto versionado aceito nao e necessariamente o texto juridico integral

- Severidade: **alta**
- Area afetada: versionamento juridico, consentimento, contratos.
- Evidencia observada: `consents.seeder.ts` informa que `body_md` e "resumo operacional" e que a "UI completa" esta no frontend; admin UI futura (`backend/src/consents/consents.seeder.ts:14-19`). As paginas completas ficam em `frontend/app/privacidade/page.tsx` e `frontend/app/termos/page.tsx`.
- Risco gerado: em disputa, a plataforma pode provar aceite de um resumo, nao da versao completa exibida.
- Impacto juridico: prova documental fraca; risco em auditoria externa.
- Impacto tecnico: fonte da verdade juridica duplicada.
- Impacto operacional: atualizacao de texto no frontend pode ficar fora do hash aceito.
- Recomendacao: persistir o markdown/HTML canonico completo da Politica, Termos e avisos de consentimento em `consent_versions`, com hash, versao, data efetiva e URL publica arquivada.

### A04 - Versao default de consentimento futura

- Severidade: **media**
- Area afetada: governanca documental.
- Evidencia observada: `consents.seeder.ts` usa `2026-05-01` como default para versoes de politica/termos/IA/cookies/marketing. A auditoria ocorreu em 2026-04-24.
- Risco gerado: aceite pode registrar uma versao ainda nao vigente se env nao estiver configurada.
- Impacto juridico: questionamento sobre validade temporal do texto.
- Impacto tecnico: seed fragil por data hardcoded.
- Impacto operacional: confusao em suporte/auditoria.
- Recomendacao: usar versao publicada real por env obrigatoria ou data efetiva <= data de publicacao.

### A05 - Aviso de IA promete mais minimizacao do que o codigo comprova

- Severidade: **alta**
- Area afetada: IA, transparencia, minimizacao.
- Evidencia observada: o modal afirma que a OpenAI recebe dados agregados/estatisticos e "nao enviamos nome, CPF ou dados individuais" (`frontend/components/AiConsentModal.tsx:50-53`). O servico de IA monta prompts com "Participantes disponiveis" usando `buildAiContextOptions(draftContext.participants, 'participant')` (`backend/src/ai/ai.service.ts:2544,2900`), e `buildDraftContextOption` cria label a partir de `nome`/funcao/descricao.
- Risco gerado: mesmo com sanitizacao posterior, a promessa e absoluta demais e desalinhada ao fluxo real de contexto operacional.
- Impacto juridico: transparencia enganosa e consentimento informado fragil.
- Impacto tecnico: dependencia excessiva de sanitizador como ultima linha.
- Impacto operacional: incidente se prompt/log/provider receber identificador pessoal.
- Recomendacao: reduzir contexto antes de montar prompt; nunca incluir nomes em opcoes de participantes; revisar texto para "dados podem ser pseudonimizados/minimizados" e nao "nenhum dado individual".

### A06 - Contradicao documental sobre DPA da OpenAI

- Severidade: **alta**
- Area afetada: terceiros, transferencia internacional, IA.
- Evidencia observada: `featureFlags.ts` comenta que IA fica default OFF ate DPA OpenAI assinado (`frontend/lib/featureFlags.ts:2`). O modal diz que OpenAI opera "sob ... DPA" (`frontend/components/AiConsentModal.tsx:57-59`) e o seed diz "sob DPA vigente" (`backend/src/consents/consents.seeder.ts:53`).
- Risco gerado: documento juridico declara contrato que o proprio codigo sugere estar pendente.
- Impacto juridico: risco alto em auditoria, reclamacao ou incidente envolvendo transferencia internacional.
- Impacto tecnico: feature flag e documento divergem.
- Impacto operacional: produto pode habilitar IA sem lastro contratual comprovado.
- Recomendacao: alinhar imediatamente o texto ao status real. Se DPA nao estiver assinado, nao afirmar que esta vigente.

### A07 - CPF trafega em URL

- Severidade: **alta**
- Area afetada: APIs, logs, observabilidade, historico de navegador.
- Evidencia observada: backend expoe `GET /users/worker-status/cpf/:cpf` e `/timeline` (`backend/src/users/users.controller.ts:201,215`); frontend chama esses paths (`frontend/services/usersService.ts:192,199`).
- Risco gerado: CPF pode aparecer em access logs, Sentry, proxies, historico, bookmarks e referers.
- Impacto juridico: dado pessoal identificador exposto desnecessariamente.
- Impacto tecnico: path e mais dificil de mascarar do que body.
- Impacto operacional: aumenta impacto de vazamento de logs.
- Recomendacao: trocar por `POST /users/worker-status` com CPF no body, mascarar logs, aplicar rate limit e considerar hash server-side.

### A08 - Cache local armazena dados pessoais/sensiveis em `localStorage`

- Severidade: **alta**
- Area afetada: frontend, offline, privacidade por design.
- Evidencia observada: `offline-cache` serializa payload cru em `localStorage` (`frontend/lib/offline-cache.ts:124-145`) e retorna stale offline (`frontend/lib/offline-cache.ts:189-216`). `usersService` cacheia listas/registros de usuarios; PT, inspecoes e nao conformidades tambem usam cache/drafts. `sophie-draft-storage` grava rascunhos com assinaturas/evidencias opcionais em `localStorage` (`frontend/lib/sophie-draft-storage.ts:60,102`).
- Risco gerado: dados sensiveis ficam expostos a XSS, extensoes, perfis compartilhados, backup do navegador e suporte remoto.
- Impacto juridico: minimizacao e seguranca insuficientes para CPF, saude ocupacional, evidencias e assinaturas.
- Impacto tecnico: superficie client-side amplia muito.
- Impacto operacional: incidente local pode virar incidente LGPD.
- Recomendacao: classificar caches por sensibilidade, proibir CPF/saude/assinaturas/evidencias em `localStorage`, usar IndexedDB criptografado com chave nao persistida apenas quando indispensavel, e limpar agressivamente no logout.

### A09 - Criptografia da fila offline falha para plaintext se WebCrypto indisponivel

- Severidade: **media**
- Area afetada: offline sync.
- Evidencia observada: `encryptPayload` retorna `plaintext` se nao houver chave (`frontend/lib/offline-sync.ts:188-190`), e a chave AES e exportada para `sessionStorage` (`frontend/lib/offline-sync.ts:161-183`).
- Risco gerado: protecao e melhor que nada, mas nao sustenta promessa forte de criptografia client-side.
- Impacto juridico: medida pode ser apresentada de forma exagerada.
- Impacto tecnico: XSS le a chave e o payload.
- Impacto operacional: falsa sensacao de seguranca.
- Recomendacao: para payload sensivel, falhar fechado se nao houver WebCrypto; manter chaves nao exportaveis quando viavel; nao usar offline para dados de alta sensibilidade.

### A10 - Exclusao LGPD nao cobre todo o ciclo de vida

- Severidade: **critica**
- Area afetada: direitos do titular, retencao, storage.
- Evidencia observada: `UsersService.gdprErasure` anonimiza e soft-delete somente o usuario (`backend/src/users/users.service.ts:569-593`). A funcao `gdpr_delete_user_data` cobre activities, audit_logs, sessions, document_registry, ai_interactions e user_consents (`backend/src/database/migrations/1709000000145-ai-interactions-gdpr-and-retention-fixes.ts:34-88`), mas seu comentario afirma "todos os dados" sem cobrir exames, treinamentos, CAT, APR/PT, participantes, assinaturas, PDFs, anexos, emails, notificacoes, storage e backups.
- Risco gerado: promessa de eliminacao/anonimizacao nao executavel de ponta a ponta.
- Impacto juridico: descumprimento potencial de Art. 18, IV/VI, quando cabivel.
- Impacto tecnico: dados remanescentes por referencias transversais.
- Impacto operacional: atendimento manual complexo e sujeito a erro.
- Recomendacao: criar inventario por entidade e implementar orquestrador de DSR com coverage report, fila, revisao humana e exclusao/anonimizacao de storage.

### A11 - Exportacao de dados do titular e incompleta

- Severidade: **media**
- Area afetada: direitos do titular, portabilidade/acesso.
- Evidencia observada: `exportMyData` retorna dados basicos de perfil, site e `ai_processing_consent` (`backend/src/users/users.service.ts:905-943`).
- Risco gerado: titular pode pedir acesso/portabilidade e receber apenas fragmento.
- Impacto juridico: Art. 18/19 exigem acesso claro a dados tratados, observados limites legais.
- Impacto tecnico: falta agregador cross-domain.
- Impacto operacional: atendimento depende de SQL/manual.
- Recomendacao: ampliar export para consentimentos, logs relevantes, documentos assinados, treinamentos, exames quando aplicavel, interacoes IA, anexos e compartilhamentos.

### A12 - Validacao publica de APR nao exige token/grant

- Severidade: **alta**
- Area afetada: documentos, validacao publica, metadados de SST.
- Evidencia observada: `PublicAprVerificationController` e `@Public` e recebe apenas `code` (`backend/src/aprs/public-apr-verification.controller.ts:9-26`). O service retorna empresa, obra, titulo, nomes de aprovadores, datas e hashes (`backend/src/aprs/aprs.service.ts:2133-2228`). Outros fluxos publicos foram endurecidos com token/grant.
- Risco gerado: qualquer pessoa com codigo consegue consultar metadados de documento.
- Impacto juridico: divulgacao indevida de dados pessoais/empresariais.
- Impacto tecnico: excecao inconsistente ao modelo de grants.
- Impacto operacional: risco em PDFs encaminhados fora do tenant.
- Recomendacao: exigir token/grant com portal, expiracao, revogacao e rate limit, igual aos demais fluxos publicos.

### A13 - Politica promete AES-256 para PII sensivel de forma ampla

- Severidade: **media**
- Area afetada: Politica de Privacidade, seguranca.
- Evidencia observada: Politica afirma "criptografia AES-256 em repouso para dados sensiveis (CPF, PII)" (`frontend/app/privacidade/page.tsx:153-157`). O codigo comprova protecao forte para CPF (`field-encryption.util.ts`, `users.service.ts:72-89`), mas nao para todos os PII em tabelas, PDFs, uploads, caches locais e logs.
- Risco gerado: promessa absoluta nao comprovada.
- Impacto juridico: propaganda de seguranca potencialmente enganosa.
- Impacto tecnico: controles heterogeneos por camada.
- Impacto operacional: expectativa de cliente maior que a realidade.
- Recomendacao: reescrever para medidas especificas e verificaveis: TLS, criptografia gerenciada do provedor, CPF cifrado/app-level, controles de acesso, storage privado, sem afirmar PII universalmente AES-256 se nao for verdade.

### A14 - Politica afirma DPAs com todos os suboperadores sem evidencia

- Severidade: **alta**
- Area afetada: terceiros, transferencia internacional.
- Evidencia observada: Politica diz haver DPAs firmados com todos os suboperadores, incluindo OpenAI, Supabase, Cloudflare, Sentry e New Relic (`frontend/app/privacidade/page.tsx:584-585`).
- Risco gerado: se qualquer contrato estiver ausente, ha contradicao documental.
- Impacto juridico: fragiliza transparencia e governanca de operadores.
- Impacto tecnico: nao e verificavel no repo.
- Impacto operacional: necessidade de dossie contratual externo.
- Recomendacao: manter registro de suboperadores com status real: ativo, pendente, nao aplicavel, pais, finalidade, base, DPA, SCC/transferencia.

### A15 - Politica de Cookies subestima uso de storage local

- Severidade: **media**
- Area afetada: cookies/storage, transparencia.
- Evidencia observada: Cookies page diz que `localStorage`/`sessionStorage` sao usados para preferencias, drafts e sincronizacao offline e que dados permanecem no dispositivo (`frontend/app/cookies/page.tsx:326-336`). O codigo tem caches de usuarios, PT, inspecoes, nao conformidades e filas que podem ser transmitidas depois.
- Risco gerado: titular/cliente nao entende que dados operacionais podem ser persistidos localmente e sincronizados.
- Impacto juridico: transparencia incompleta.
- Impacto tecnico: documentacao nao reflete fluxos offline.
- Impacto operacional: risco em dispositivos compartilhados.
- Recomendacao: detalhar categorias de dados locais, TTL, limpeza, riscos, revogacao/offline, e restringir dados sensiveis.

### A16 - Retencao pratica depende de `deleted_at` e nao comprova execucao

- Severidade: **alta**
- Area afetada: lifecycle, retencao, descarte.
- Evidencia observada: `cleanup_expired_data()` exclui `mail_logs`, `audit_logs`, `ai_interactions` e outros apenas quando `deleted_at IS NOT NULL` em varias tabelas (`1709000000145...:97-141`). Nao ha evidencia aqui de job agendado e cobertura de arquivos/backups.
- Risco gerado: dados podem permanecer indefinidamente se nunca marcados como deletados.
- Impacto juridico: retencao excessiva e promessa documental fraca.
- Impacto tecnico: dependencia de estado previo.
- Impacto operacional: offboarding incompleto.
- Recomendacao: jobs agendados, painel de retencao, metricas de descarte, testes e relatorio por tenant.

### A17 - Exclusao hard delete de exames medicos pode conflitar com obrigacao de retencao

- Severidade: **media**
- Area afetada: saude ocupacional, prontuarios/ASO.
- Evidencia observada: `medical-exams.service.ts` usa filtros por tenant, mas `remove` executa remocao do exame (`medical-exams.service.ts:286`).
- Risco gerado: perda de registro que pode ter dever legal/regulatorio de retencao.
- Impacto juridico: conflito entre LGPD e obrigações trabalhistas/regulatorias se nao houver politica.
- Impacto tecnico: ausencia de trilha/soft delete especifica.
- Impacto operacional: fragilidade probatoria para cliente.
- Recomendacao: definir matriz legal de retencao por documento SST e usar soft delete/arquivamento com base legal.

### A18 - Storage de documentos pode carregar PII em chave/nome de arquivo

- Severidade: **media**
- Area afetada: uploads, storage, logs.
- Evidencia observada: `DocumentStorageService` gera chave com `companyId`, `documentType`, `documentId`, timestamp e filename sanitizado (`backend/src/common/services/document-storage.service.ts:48`). Se nome original contem CPF/nome/laudo, pode aparecer em storage/logs.
- Risco gerado: PII em metadados de storage e logs.
- Impacto juridico: minimizacao insuficiente.
- Impacto tecnico: chaves de objeto sao metadados persistentes.
- Impacto operacional: dificil limpar logs historicos.
- Recomendacao: substituir nome original por UUID na chave e manter nome original cifrado/controlado em banco.

### A19 - Canal de direitos do titular existe no texto, mas fluxo operacional e fraco

- Severidade: **media**
- Area afetada: atendimento LGPD.
- Evidencia observada: Politica lista direitos (`frontend/app/privacidade/page.tsx:163-168`) e DPO/canal por env (`frontend/app/privacidade/page.tsx:732+`). O backend tem exportacao e exclusao parciais, mas nao ha SLA interno, autenticacao de requisicao externa, workflow de DSR completo, evidencias de resposta e revisao.
- Risco gerado: promessa que depende de processo manual nao documentado.
- Impacto juridico: dificuldade de cumprir prazos e comprovar atendimento.
- Impacto tecnico: falta entidade/estado de requisicao do titular ampla.
- Impacto operacional: atendimento ad hoc.
- Recomendacao: criar modulo/processo DSR com protocolo, autenticacao, SLA, aprovacoes, anexos, resposta, auditoria e cobertura de sistemas.

### A20 - Termos de Uso precisam endurecer operacao B2B/SaaS de SST

- Severidade: **media**
- Area afetada: contrato, produto, suporte.
- Evidencia observada: Termos cobrem responsabilidades, IA, suspensao, foro e responsabilidade (`frontend/app/termos/page.tsx:387-536`). Mas regras para documentos emitidos, evidencias de campo, guarda por obrigacao legal, revisao humana, suporte, indisponibilidade, DPA, offboarding e tratamento de dados do cliente ainda ficam genericas.
- Risco gerado: conflito entre promessa comercial, uso de documentos SST e limitacao juridica.
- Impacto juridico: lacunas contratuais em incidente ou disputa.
- Impacto tecnico: produto gera documentos com peso operacional.
- Impacto operacional: cliente pode usar PDF/IA como decisao sem governanca.
- Recomendacao: criar clausulas especificas para documentos, IA, logs/auditoria, responsabilidades do cliente-controlador, validade operacional e suporte.

## PARTE 4 - GAPS DOCUMENTAIS

### Politica de Privacidade

- Falta alinhar status real dos DPAs, especialmente OpenAI.
- Falta explicar com precisao `localStorage`, drafts, cache offline e filas de sincronizacao.
- Falta tabela real de dados por modulo: APR, PT, CAT, DDS, treinamentos, exames, assinaturas, fotos, geolocalizacao, uploads e PDFs.
- Falta retencao granular por tipo de documento SST, arquivo, log, email, backup e tenant encerrado.
- Falta explicar public validation links: quem pode acessar, por quanto tempo, quais metadados aparecem e como revogar.
- Falta diferenciar controlador/operador em cenarios B2B: cliente como controlador dos dados dos trabalhadores; SGS como operador, salvo dados de conta, seguranca, faturamento e melhoria do servico.
- Ha promessa forte demais de criptografia AES-256 para toda PII sensivel.
- Ha promessa forte demais de DPAs firmados com todos os suboperadores.
- Ha risco em dizer que dados de IA sao anonimizados se o fluxo real usa pseudonimizacao/sanitizacao com contexto operacional.
- Falta fluxo claro de verificacao de identidade para direitos do titular.

### Termos de Uso

- Falta clausula robusta sobre documentos emitidos: revisao humana, responsabilidade tecnica, validade, assinatura, guarda e uso fora do SGS.
- Falta clausula de IA mais forte: IA assistiva, sem decisao automatizada exclusiva, sem substituicao de profissional habilitado, revisao obrigatoria.
- Falta clausula de DPA/anexo de tratamento de dados como documento prevalente para clientes B2B.
- Falta regra granular de offboarding: export, janela, exclusao, excecoes legais, arquivos e backups.
- Falta SLA/suporte com linguagem mais operacional.
- Falta excepcionar limitacao de responsabilidade para dolo, culpa grave, violacao de confidencialidade/protecao de dados quando juridicamente aplicavel.

### Avisos de consentimento

- O aviso de IA precisa parar de afirmar que nao envia "nenhum dado individual" se o codigo ainda monta contexto com participantes/opcoes.
- Consentimento de IA deve informar versao, fornecedor, pais, categorias, finalidade, revogacao e consequencia da recusa.
- Aceite de Termos/Privacidade nao deve ser chamado de consentimento LGPD quando a base for contrato/obrigacao legal.
- Marketing precisa de consentimento separado e nao pre-marcado, se usado.
- Cookies/storage precisam separar cookie essencial, preferencia, offline/draft e telemetry/observability.

### Telas e fluxos

- Login tem links juridicos.
- Cadastro publico nao foi evidenciado; se existir, precisa links e aviso.
- Settings deve mostrar historico/versionamento de consentimentos e revogar via `consentsService`, nao via flag.
- Rodape global/publico fora das paginas legais nao ficou comprovado.

## PARTE 5 - GAPS TECNICOS E DE PRODUTO

1. Unificar consentimento de IA no modulo `consents` e remover escrita direta em `users.ai_processing_consent`.
2. Alterar `useRequiredConsents` para falhar fechado.
3. Persistir texto juridico integral em `consent_versions`, com hash e versao publicados.
4. Substituir CPF em path por POST/body ou identificador pseudonimo.
5. Restringir `localStorage` para dados nao sensiveis; limpar no logout e no troca de tenant.
6. Revisar prompts IA para nunca montar nome/CPF/dados individuais antes da sanitizacao.
7. Exigir token/grant na validacao publica de APR.
8. Expandir exportacao de dados para cobertura cross-domain.
9. Criar orquestrador de eliminacao/anonimizacao por entidade e storage.
10. Implementar retencao por tipo de dado com job real e relatorio auditavel.
11. Criar inventario de suboperadores e status de DPA/transferencia.
12. Criar workflow de requisicao LGPD com SLA, protocolo, autenticacao e trilha.
13. Revisar storage keys para nao conter nome original/PII.
14. Criar testes e2e para consentimento, revogacao, IA bloqueada, exportacao, exclusao e validacao publica.
15. Validar infra: TLS, bucket privado, criptografia provider-managed, backups, logs e mascaramento.

## PARTE 6 - PLANO DE ACAO PRIORIZADO

### Fase 1 - Correcoes criticas imediatas

1. Corrigir IA: modal/settings devem registrar `ai_processing` em `user_consents`; remover dependencia da flag legada.
2. Corrigir `useRequiredConsents` para fail-closed.
3. Trocar CPF em URL por endpoint sem dado pessoal no path.
4. Bloquear/remover cache local de usuarios/CPF/saude/evidencias/assinaturas.
5. Exigir token/grant em `/public/aprs/verify`.
6. Ajustar textos que afirmam DPA OpenAI vigente, anonimização absoluta e AES-256 universal.
7. Publicar versoes juridicas reais e integrais em `consent_versions`.

### Fase 2 - Correcoes importantes de curto prazo

1. Expandir exportacao LGPD para dados reais do titular.
2. Expandir erasure/anonimizacao para modulos SST, documentos, anexos, PDFs, emails e storage.
3. Criar matriz de retencao por documento/dado e job auditavel.
4. Reescrever Politica de Cookies/storage.
5. Criar DSR workflow interno com SLA e evidencias.
6. Revisar Termos para documentos SST, IA e responsabilidades B2B.

### Fase 3 - Melhorias estruturais

1. Criar inventario de dados/ROPA por modulo.
2. Criar registro de suboperadores e transferencias internacionais.
3. Criar RIPD/DPIA para IA, dados de saude ocupacional, geolocalizacao e assinaturas.
4. Criar painel admin de versoes juridicas e consentimentos.
5. Automatizar testes de privacidade por release.

### Fase 4 - Governanca continua

1. Revisao trimestral de Politica/Termos/suboperadores.
2. Exercicios de incidente de privacidade.
3. Relatorio periodico de retencao/exclusao por tenant.
4. Auditoria de logs e storage.
5. Processo formal de aprovacao juridica antes de ativar novos terceiros.

## PARTE 7 - TEXTO PRONTO PARA CORRECAO

### Aviso de IA - versao sugerida

> A SOPHIE e um recurso assistivo de apoio operacional em SST. Ao ativar este recurso, voce autoriza o SGS a processar dados estritamente necessarios do seu contexto de uso para gerar respostas, sugestoes e rascunhos. Antes do envio ao provedor de IA, o SGS aplica minimizacao, pseudonimizacao e filtros para reduzir dados pessoais, mas determinadas informacoes operacionais podem ser necessarias para produzir a resposta. Nao utilize a SOPHIE para inserir dados de saude individual, CPF, documentos pessoais ou informacoes excessivas. O provedor atual de IA, quando habilitado contratualmente, pode processar dados fora do Brasil. Voce pode revogar este consentimento a qualquer momento em Configuracoes > Privacidade; a revogacao bloqueia novos usos da SOPHIE, sem afetar tratamentos anteriores realizados validamente.

### Checkbox de IA

> Li o aviso de IA e autorizo o processamento dos dados necessarios para uso da SOPHIE, incluindo transferencia internacional quando aplicavel, conforme a Politica de Privacidade vigente.

### Aviso de aceite de Termos e Privacidade

> Declaro que li e aceito os Termos de Uso e estou ciente da Politica de Privacidade vigente. Este aceite sera registrado com data, hora, usuario, IP, versao dos documentos e hash do texto aceito.

### Clausula de storage local

> Para continuidade de sessao, rascunhos e operacao offline limitada, o SGS pode armazenar temporariamente dados no dispositivo do usuario. Dados sensiveis, documentos, assinaturas, evidencias e identificadores como CPF devem ser evitados ou minimizados nesses recursos. O uso em computadores compartilhados exige logout e limpeza do navegador. A plataforma podera limpar automaticamente caches locais por seguranca, expiracao ou troca de tenant.

### Clausula de documentos SST

> Documentos, relatorios, PDFs, evidencias e validacoes emitidos pelo SGS sao instrumentos operacionais de apoio ao cliente. A responsabilidade pela revisao tecnica, veracidade das informacoes inseridas, cumprimento de normas aplicaveis, guarda documental e uso externo dos documentos permanece com o Cliente, salvo falha comprovada da plataforma. Recursos de assinatura, hash e validacao publica indicam integridade tecnica do documento, mas nao substituem requisitos legais especificos de assinatura, ART, laudo, prontuario ou responsabilidade profissional quando exigidos por norma aplicavel.

### Clausula de direitos do titular

> Requisicoes de titulares podem ser encaminhadas ao canal de privacidade indicado nesta Politica. Para proteger os titulares, o SGS podera exigir verificacao de identidade e validacao junto ao Cliente controlador antes de executar acesso, correcao, portabilidade, anonimizacao, bloqueio ou eliminacao. Quando houver obrigacao legal, regulatoria, contratual ou necessidade de preservacao de prova, determinados dados poderao ser mantidos pelo prazo necessario, com acesso restrito.

### Clausula de suboperadores

> O SGS utiliza suboperadores para hospedagem, banco de dados, seguranca, observabilidade, email, armazenamento e IA, conforme lista mantida nesta Politica. A inclusao de novos suboperadores relevantes sera documentada. Quando houver transferencia internacional, o SGS adotara salvaguardas contratuais e tecnicas cabiveis, de acordo com a legislacao aplicavel e com os contratos vigentes.

## PARTE 8 - CHECKLIST FINAL DE APROVACAO

- [ ] Politica, Termos e Cookies publicados com versao, data efetiva, controlador, DPO e canal real.
- [ ] Texto integral aceito salvo em `consent_versions` com hash.
- [ ] Login, cadastro e primeiro acesso exibem links juridicos e prova de aceite.
- [ ] `useRequiredConsents` falha fechado.
- [ ] IA usa somente `user_consents` versionado e nao flag legada.
- [ ] Texto de IA alinhado ao fluxo real e ao status real de DPA/transferencia.
- [ ] CPF removido de URLs e logs mascarados.
- [ ] `localStorage` nao guarda CPF, saude, assinaturas, evidencias ou documentos sensiveis.
- [ ] Validacao publica de APR exige token/grant, expiracao e revogacao.
- [ ] Exportacao LGPD cobre todos os dominios relevantes do titular.
- [ ] Exclusao/anonimizacao cobre usuario, modulos, documentos, PDFs, anexos, emails, storage e logs.
- [ ] Retencao por tipo de dado implementada com job, logs e relatorio.
- [ ] Backups e offboarding por tenant possuem procedimento documentado.
- [ ] Registro de suboperadores contem finalidade, pais, DPA/SCC/status.
- [ ] Termos incluem documentos SST, IA, suporte, SLA, offboarding, DPA e responsabilidade do cliente.
- [ ] Testes e2e cobrem consentimento, revogacao, IA bloqueada, DSR, export, delete e validacao publica.
- [ ] Incidente de privacidade tem plano, responsaveis e template de comunicacao.

## Top 10 problemas mais graves

1. Consentimento de IA duplicado/incoerente entre `user_consents` e flag legada.
2. Consentimento obrigatorio falha aberto.
3. Prova de aceite nao arquiva texto juridico integral.
4. Aviso de IA contradiz contexto real enviado/montado.
5. DPA OpenAI/documentos em contradicao.
6. CPF em URL.
7. Dados sensiveis em `localStorage`/drafts/caches.
8. Erasure incompleto.
9. APR publica sem token/grant.
10. Retencao/storage/backups sem evidencia operacional completa.

## Top 10 acoes mais urgentes

1. Migrar UI de IA para `consentsService.accept('ai_processing')`.
2. Fazer consentimento obrigatorio fail-closed.
3. Remover CPF dos paths.
4. Bloquear caches locais sensiveis.
5. Tokenizar validacao publica de APR.
6. Publicar textos integrais versionados em `consent_versions`.
7. Corrigir Politica/Termos para nao prometer DPA/criptografia/anonimizacao sem prova.
8. Expandir exportacao/exclusao LGPD cross-domain.
9. Criar matriz de retencao e job auditavel.
10. Montar dossie de suboperadores, DPAs, transferencias e backups.
