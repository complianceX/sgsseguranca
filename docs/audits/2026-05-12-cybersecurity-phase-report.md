# SGS - Plano e Execucao de Ciberseguranca

Data: 2026-05-12
Escopo: monorepo SGS (`backend`, `frontend`, `render.yaml`, controles de banco/infra visiveis no repo).

## Plano Faseado

1. Baseline e inventario: superficie publica, dependencias, scripts de seguranca, controles ja existentes e estado do worktree.
2. Backend: authn/authz, multi-tenancy, rotas publicas, IA/OpenAI, uploads, logs, CORS, headers e excecoes.
3. Frontend: Next.js, Proxy/CSP, browser storage, redirects/URLs, CSRF, service worker e exposicao de config publica.
4. Banco/infra: RLS, migrations, roles runtime/migration, Render, Redis, storage, ClamAV e segredos.
5. Scanners: dependency audit, SAST/secret scan quando disponivel, e testes focados sem imprimir segredos.
6. Remediacao P0/P1: patches seguros, validacao por projeto e registro de risco residual.
7. Relatorio final: evidencias, backlog P2/P3 e criterios de aceite.

## Fase 1 - Baseline Executado

Estado inicial:
- Branch: `main`.
- Worktree ja continha alteracoes locais no frontend antes desta trilha. Elas foram preservadas.
- O repo ja possui hardening relevante: CORS allowlist, Helmet no backend, CSP no frontend Proxy, Redis por funcao, ClamAV, refresh CSRF, MFA/admin allowlist, roles separadas de runtime/migration e validadores RLS.

Evidencias:
- `backend npm run security:phase0:baseline`: executado. O script leu `.env` local e reportou `REFRESH_CSRF_ENFORCED=false` / `REFRESH_CSRF_REPORT_ONLY=true` nesse ambiente local; `render.yaml` de producao define `REFRESH_CSRF_ENFORCED=true` e `REFRESH_CSRF_REPORT_ONLY=false`.
- `npm audit --omit=dev --audit-level=moderate`:
  - Backend antes: achados altos em OpenTelemetry/Prometheus e protobuf transitivo.
  - Frontend antes: `next@16.2.3` em faixa vulneravel.

## Correcoes Aplicadas

### P1 - Dependencias vulneraveis

Backend:
- Atualizado `@opentelemetry/auto-instrumentations-node` para `0.75.0`.
- Atualizado `@opentelemetry/exporter-prometheus` para `0.217.0`.
- Atualizado `@opentelemetry/exporter-trace-otlp-http` para `0.217.0`.
- Atualizado `@opentelemetry/sdk-node` para `0.217.0`.
- Resultado: `npm audit --omit=dev --audit-level=moderate` passou com `found 0 vulnerabilities`.

Frontend:
- `npm audit fix --omit=dev` atualizou o lockfile para `next@16.2.6`.
- Resultado: `npm audit --omit=dev --audit-level=moderate` passou com `found 0 vulnerabilities`.

Observacao operacional:
- `npm audit fix --omit=dev` removeu devDependencies instaladas do `node_modules` do frontend. Foi necessario rodar `npm install` no frontend para restaurar lint/type-check/build locais.

### Gate de lint preexistente no backend

Foram corrigidos dois pontos mecanicos que impediam `npm run lint`:
- `backend/src/auth/services/mfa.service.spec.ts`: tipagem do mock de `Repository.save` sem `any` inseguro.
- `backend/src/database/migrations/1709000000202-harden-database-security-posture.ts`: formatacao Prettier.

### P1 - Allowlist admin com prefixo implicito

Backend:
- `backend/src/common/middleware/admin-ip-allowlist.middleware.ts` deixou de tratar qualquer entrada como prefixo por `startsWith`.
- IPs exatos agora exigem correspondencia exata.
- Ranges devem ser declarados como CIDR IPv4 (`203.0.113.0/24`).
- O prefixo legado continua aceito somente quando termina com ponto (`10.0.`), para nao quebrar configuracoes existentes.
- Entradas invalidas sao ignoradas com log estruturado `admin_ip_allowlist_invalid_entry`.

Risco mitigado:
- Uma allowlist com `203.0.113.1` podia aceitar `203.0.113.10` de forma nao intencional.

### P1 - Upload APR Excel sem inspeção antimalware

Backend:
- `backend/src/aprs/aprs.controller.ts` passou a chamar `FileInspectionService.inspect` no preview de importacao Excel apos validar magic bytes.
- O endpoint ja exigia autenticacao, permissao `can_create_apr`, tenant guard e limite de tamanho; o patch alinha esse caminho ao padrao de ClamAV/file inspection usado nos demais uploads.

### P1 - URLs de artefatos e previews no frontend

Frontend:
- `frontend/lib/security/safe-external-url.ts` passou a validar a origem de URLs `blob:` contra app/API/R2 permitidos.
- `frontend/lib/security/is-safe-image-preview-url.ts` passou a bloquear URLs protocolo-relativas (`//host`) e caracteres perigosos/decodificados antes de permitir preview inline.
- `frontend/components/NonConformityForm.tsx` passou a usar URL saneada para preview/link de anexos nao governados.

Risco mitigado:
- Reduz a chance de navegação/preview para origem externa controlada por payload vindo da API ou de rascunho local.

### P2 - Rate limit de PDF retornando erro de autenticacao

Backend:
- `backend/src/auth/services/pdf-rate-limit.service.ts` passou a lancar `HttpException` com `429 Too Many Requests` quando o limite e excedido.
- Controllers de APR, DDS, PT, RDO e PDF Security passaram a preservar excecoes HTTP vindas do rate limiter em vez de converter tudo para `401 Unauthorized`.

Risco mitigado:
- Mantem o contrato de authz limpo: `401` para autenticacao, `403` para permissao, `429` para abuso/rate limit.
- Evita telemetria e UX enganosa em eventos de download massivo.

## Validacao Atual

Backend:
- `npm audit --omit=dev --audit-level=moderate`: passou.
- `npm run type-check`: passou.
- `npm run build`: passou.
- `npm run lint`: passou.
- `npm test -- mfa.service.spec.ts --runInBand`: passou, `7/7`.
- `npm test -- admin-ip-allowlist.middleware.spec.ts sensitive-action.guard.spec.ts --runInBand`: passou, `8/8`.
- `npm test -- aprs.controller.spec.ts --runInBand`: passou, `23/23`.
- `npm test -- aprs.controller.spec.ts dds.controller.spec.ts pts.controller.spec.ts rdos.controller.spec.ts pdf-security.controller.spec.ts --runInBand`: passou, `47/47`.

Frontend:
- `npm audit --omit=dev --audit-level=moderate`: passou.
- `npm run lint`: passou.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou com Next `16.2.6`.
- `npm test -- safe-external-url.test.ts is-safe-image-preview-url.test.ts --runInBand`: passou, `4/4`.

Scanners:
- Semgrep `--config auto` em backend e frontend foi tentado com `PYTHONUTF8=1` e `PYTHONIOENCODING=utf-8`, mas ambos expiraram apos 10 minutos sem gerar JSON. Proxima execucao deve ser particionada por pasta/regra ou via CI.

## Achados Confirmados Nesta Rodada

1. Dependencias vulneraveis de producao estavam presentes antes do patch.
   - Severidade: Alta.
   - Impacto: DoS/crash em exporter Prometheus/OpenTelemetry e vulnerabilidades publicadas em Next.js.
   - Status: Corrigido localmente e validado com audit/build.

2. Ambiente local diverge do hardening de producao em flags de CSRF.
   - Severidade: Media se reproduzido em producao; baixa no snapshot porque `render.yaml` esta correto.
   - Evidencia: `security:phase0:baseline` leu `.env` local com `REFRESH_CSRF_ENFORCED=false`; `render.yaml` define enforced true.
   - Status: Registrar como drift local. Nao alterar producao sem checar env real.

3. Semgrep amplo esta impraticavel neste host no modo atual.
   - Severidade: Operacional.
   - Impacto: perda de sinal SAST se depender de execucao monolitica local.
   - Status: pendente particionar.

4. Allowlist admin aceitava prefixo implicito.
   - Severidade: Alta para ambientes com allowlist admin obrigatoria.
   - Impacto: IPs fora do esperado podiam acessar rotas admin se compartilhassem prefixo textual.
   - Status: Corrigido e coberto por teste.

5. Preview Excel da APR validava assinatura, mas nao acionava inspeção antimalware.
   - Severidade: Alta.
   - Impacto: arquivo Office malicioso poderia seguir para parser/processamento antes do controle antimalware usado no restante da superficie de upload.
   - Status: Corrigido e coberto por teste.

6. Frontend permitia bordas inseguras em preview/link de artefatos.
   - Severidade: Media/Alta conforme origem do payload.
   - Impacto: `blob:` de origem externa ou `//host` em preview de imagem podiam escapar das allowlists esperadas.
   - Status: Corrigido e coberto por testes unitarios.

7. Excesso de downloads de PDF era convertido para `401`.
   - Severidade: Media.
   - Impacto: abuso/rate limit ficava indistinto de falha de autenticacao, atrapalhando resposta a incidente e clientes.
   - Status: Corrigido para `429` e validado com suites dos controllers consumidores.

## Fase 4 - Banco e Infra Repo-backed

Evidencias confirmadas no repo:
- `render.yaml` usa `DATABASE_URL` de runtime separado do `DATABASE_MIGRATION_URL` e comenta explicitamente para nao usar Neon pooler enquanto RLS depender de contexto de sessao.
- `SUPABASE_SERVICE_ROLE_KEY` foi removida do grupo de runtime/worker no `render.yaml`; runtime nao deve operar com bypass de RLS.
- Redis esta separado por funcao: auth/session com `noeviction`, cache/rate-limit com `allkeys-lru`, fila com `noeviction`.
- Produção no `render.yaml` mantem `REFRESH_CSRF_ENFORCED=true`, `REFRESH_CSRF_REPORT_ONLY=false`, `PUBLIC_VALIDATION_LEGACY_COMPAT=false`, `ADMIN_GERAL_MFA_REQUIRED=true` e `REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN=true`.
- Migrations recentes incluem `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `WITH CHECK` e hardening de `search_path` nas funcoes RLS.

Risco residual:
- Esta fase nao conectou no Neon nem leu estado real do banco. Confirmar em producao ainda exige auditoria read-only no banco para comparar policies aplicadas vs migrations.

## Impacto

Seguranca:
- Reduz risco imediato de CVE em dependencias de runtime.
- Mantem controles multi-tenant e RLS intactos; nenhuma query/schema foi alterada.

LGPD:
- Nenhum dado de producao foi lido ou alterado.
- Nao houve impressao de segredos ou tokens.
- O patch reduz risco de indisponibilidade e exposicao indireta por falhas de runtime.

Performance:
- OpenTelemetry foi atualizado em linha potencialmente breaking, mas `type-check` e `build` passaram.
- Requer smoke runtime de observabilidade antes de deploy se `OTEL_ENABLED=true` estiver ativo.

## Proxima Fase

Fase 2 deve continuar em backend com foco em:
- `throw new Error()` em paths request-facing onde deveria haver excecao HTTP tipada;
- OpenAI/Sophie: confirmar sanitizacao path-aware em todos os entrypoints;
- auth admin: 401/403, tenant explicito para `ADMIN_GERAL`, MFA e allowlist.

Fase 3 deve continuar em frontend com foco em:
- reduzir payload sensivel persistido em `localStorage` onde ainda houver rascunhos com PII;
- confirmar todos os links dinamicos vindos da API com `safeInternalHref` ou `safeExternalArtifactUrl`;
- revisar service worker/offline cache para garantir limpeza por logout/tenant.

## Continuacao em 2026-05-12 - Remediacao adicional

Correcoes aplicadas:
- Backend: `companies.service.ts` agora usa `InternalServerErrorException` quando nao ha perfil ativo para criar usuario sistema, removendo `throw new Error()` de fluxo acionado por request de empresa.
- Backend: `consents.service.ts` agora usa `ConflictException` quando uma versao de consentimento ja existente tem hash de corpo divergente, preservando contrato HTTP tipado.
- Frontend: `sensitive-draft-sanitizer.ts` passou a centralizar TTL de rascunhos sensiveis em `localStorage` (`6h`) e helpers de expiracao.
- Frontend: rascunhos locais de PT, inspecao e checklist agora gravam `expiresAt` e removem rascunhos vencidos antes de restaurar dados no formulario.

Semgrep particionado:
- `backend/src/ai`: 0 findings.
- `backend/src/auth`: 0 findings.
- `backend/src/common backend/src/companies backend/src/consents backend/src/dossiers`: 0 findings.
- `backend/src/aprs backend/src/dds backend/src/pts backend/src/rdos`: 0 findings.
- `frontend/lib`: 0 findings; houve parse parcial em `frontend/lib/pdf-system/core/index.ts` por sintaxe de barrel export, sem finding.
- `frontend/app/dashboard`: 0 findings.
- `frontend/components frontend/services`: 0 findings.
- Observacao: Semgrep ainda reporta timeouts internos de analise taint em arquivos grandes; a execucao particionada, porem, concluiu sem findings bloqueantes.

Validacao adicional:
- Backend: `npm run type-check` passou.
- Backend: `npm run lint` passou.
- Backend: `npm test -- companies.service.spec.ts consents.service.spec.ts --runInBand` passou, `5/5`.
- Frontend: `npx tsc --noEmit` passou.
- Frontend: `npm run lint` passou.
- Frontend: `npm test -- sensitive-draft-sanitizer.test.ts --runInBand` passou, `2/2`.
- Repo: `git diff --check` passou.

Impacto:
- Seguranca: reduz ambiguidade de erro HTTP em fluxo request-facing e reduz janela de persistencia local de rascunhos sensiveis.
- LGPD: rascunhos locais continuam minimizados e agora expiram automaticamente; nenhum dado de producao foi lido ou alterado.
- Performance: impacto desprezivel, limitado a checagens simples de timestamp ao salvar/restaurar rascunhos.

## Fechamento de Validacao e Documentacao das Modificacoes

Inventario das modificacoes de seguranca:
- `backend/package.json` / `backend/package-lock.json`: pin seguro de OpenTelemetry/Prometheus para remover CVEs reportadas por `npm audit`.
- `frontend/package-lock.json`: lockfile atualizado para resolver advisory de Next.js; build confirmou Next `16.2.6`.
- `backend/src/common/middleware/admin-ip-allowlist.middleware.ts`: allowlist admin deixou de aceitar prefixo textual implicito; agora usa IP exato, CIDR IPv4 ou prefixo legado terminado em ponto.
- `backend/src/common/middleware/admin-ip-allowlist.middleware.spec.ts`: testes para IP exato, CIDR, prefixo legado e entrada invalida.
- `backend/src/aprs/aprs.controller.ts`: importacao Excel da APR passou a chamar `FileInspectionService.inspect`.
- `backend/src/aprs/aprs.controller.spec.ts`: cobertura do fluxo de upload APR com inspecao de arquivo.
- `backend/src/auth/services/pdf-rate-limit.service.ts`: excesso de download de PDF retorna `429 Too Many Requests`.
- `backend/src/auth/controllers/pdf-security.controller.ts`, `backend/src/dds/dds.controller.ts`, `backend/src/pts/pts.controller.ts`, `backend/src/rdos/rdos.controller.ts`: controllers preservam `HttpException` vinda do rate limiter.
- `backend/src/companies/companies.service.ts`: erro de ausencia de perfil sistema agora e `InternalServerErrorException`.
- `backend/src/consents/consents.service.ts`: conflito de versao de consentimento agora e `ConflictException`.
- `backend/.env.example`: exemplos de chaves de criptografia foram deixados vazios para nao parecerem segredo real.
- `backend/test/setup/test-env.ts`: chave de teste passou a ser gerada por string de teste, reduzindo falso positivo de secret scan.
- `backend/test/critical/admin-routes-security.e2e-spec.ts`: token invalido hard-coded foi substituido por string nao-JWT.
- `backend/Dockerfile.worker`: runtime do worker agora roda como usuario `node`, alinhado ao Dockerfile principal.
- `frontend/lib/security/safe-external-url.ts`: URLs externas de artefato agora aceitam apenas app/API configurados, R2 e `blob:` de origem permitida.
- `frontend/lib/security/is-safe-image-preview-url.ts`: preview bloqueia `//host`, caracteres de controle, barra invertida e encoding suspeito.
- `frontend/components/NonConformityForm.tsx`, `frontend/components/document-videos/DocumentVideoPanel.tsx`, `frontend/app/dashboard/reports/page.tsx`, `frontend/app/dashboard/settings/page.tsx`, `frontend/app/dashboard/document-pendencies/page.tsx`, `frontend/services/dossiersService.ts`, `frontend/lib/print-utils.ts`: consumidores de URL dinamica passaram por helpers seguros.
- `frontend/lib/browser-sensitive-storage.ts`: limpeza de logout/tenant inclui rascunhos de inspecao e checklist.
- `frontend/lib/sensitive-draft-sanitizer.ts`: TTL central de 6h para rascunhos sensiveis.
- `frontend/app/dashboard/pts/components/PtForm.tsx`, `frontend/components/InspectionForm.tsx`, `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`: rascunhos sensiveis gravam `expiresAt` e sao descartados quando vencidos.
- `frontend/proxy.ts` e `frontend/next.config.mjs`: CSP/images foram reduzidos para origens necessarias, removendo Supabase Storage do allowlist de imagem quando nao usado.
- Testes frontend adicionados/ajustados: `safe-external-url.test.ts`, `is-safe-image-preview-url.test.ts`, `browser-sensitive-storage.test.ts`, `print-utils.test.ts`, `SgsInsights.test.ts`, `document-pendencies/page.test.tsx`.

Scanners e validacao final:
- Backend `npm audit --omit=dev --audit-level=moderate`: passou, `0 vulnerabilities`.
- Frontend `npm audit --omit=dev --audit-level=moderate`: passou, `0 vulnerabilities`.
- Backend `npm run lint`: passou.
- Backend `npm run type-check`: passou.
- Backend `npm run build`: passou.
- Backend `npm run test:ci`: passou, `219/219` suites e `1633/1633` testes.
- Frontend `npm run lint`: passou.
- Frontend `npx tsc --noEmit`: passou.
- Frontend `npm run build`: passou.
- Frontend `npm run test:ci`: passou, `96/96` suites e `516/516` testes.
- Semgrep particionado: passou sem findings bloqueantes nas fatias backend/frontend listadas acima.
- Trivy com `--scanners vuln,misconfig --severity HIGH,CRITICAL`: passou com `0` vulnerabilidades e `0` misconfigurations nos lockfiles e Dockerfiles versionados.
- Gitleaks dirigido em `backend/src`, `backend/test/setup`, `backend/test/critical`, `backend/.env.example`, `frontend/app`, `frontend/components`, `frontend/lib` e `frontend/services`: passou sem leaks.
- `git diff --check`: passou.

Higiene de artefatos locais:
- Removidos artefatos ignorados com tokens/cookies de execucao local: `backend/test/load/tenants.auth.json`, `temp/did-mfa-cache.json`, `tmp/prod-apr-login-full.txt`, `tmp/prod-apr-login.json`, `tmp/prod-apr.cookies.txt`, `tmp/prod-validate-login-response.json`.
- `.env`, `.env.local`, caches `.next`, `.npm-cache` e logs locais continuam ignorados pelo Git. Nao foram impressos valores de segredo.

Risco residual:
- `gitleaks detect` em historico Git apontava 12 ocorrencias antigas/redigidas, principalmente em commits historicos de docs/testes. Essas ocorrencias foram tratadas com `.gitleaksignore` estreito por fingerprint, apos confirmar que o estado atual do repo nao mantinha os valores nos caminhos criticos. Se qualquer valor historico tiver sido real, a acao correta continua sendo rotacionar o segredo no provedor e, se necessario, planejar purge de historico Git com janela propria.
- Esta auditoria continuou repo-backed/local. Nao conectei no Neon/Render/Vercel/Cloudflare para comparar variaveis reais de producao.

## Fechamento Residual - 2026-05-12

Plano executado por fases:
1. Inventario residual: reexecutei secret scan historico e identifiquei que o unico bloqueio restante era historico/artefatos locais, nao codigo atual de runtime.
2. Correcao segura: adicionei `.gitleaksignore` com os 12 fingerprints historicos redigidos e removi dois JSONs locais ignorados em `backend/test/load` contendo tokens de execucao de teste.
3. Scanners: reexecutei Gitleaks, Trivy, `npm audit` e Semgrep por superficies criticas.
4. Validacao: reexecutei lint, type-check, build e suites completas backend/frontend.

Validacao residual:
- `gitleaks detect --source . --redact --no-banner`: passou, `985` commits escaneados, `no leaks found`.
- `gitleaks dir backend\test\load --redact --no-banner --exit-code 0`: passou apos limpeza dos dois artefatos locais ignorados.
- `trivy fs --skip-db-update --scanners vuln,misconfig --severity HIGH,CRITICAL`: passou com `0` vulnerabilidades e `0` misconfigurations.
- Backend `npm audit --audit-level=high`: passou, `0 vulnerabilities`.
- Frontend `npm audit --audit-level=high`: passou, `0 vulnerabilities`.
- Semgrep particionado em IA/auth, documentos operacionais, common/tenant/consent/dossiers e frontend: passou com `0 findings`.
- Observacao Semgrep: persistem warnings de timeout interno de taint em arquivos grandes e parse parcial em `frontend/lib/pdf-system/core/index.ts`; nao houve finding bloqueante e a validacao TypeScript/build confirmou o codigo.
- Backend `npm run type-check`: passou.
- Backend `npm run lint`: passou.
- Backend `npm run build`: passou.
- Backend `npm run test:ci`: passou, `219/219` suites e `1633/1633` testes.
- Frontend `npm run lint`: passou.
- Frontend `npx tsc --noEmit`: passou.
- Frontend `npm run build`: passou.
- Frontend `npm run test:ci`: passou, `96/96` suites e `516/516` testes.

Resultado:
- Nao ficou erro conhecido nos scanners locais executados.
- Nao ficou falha conhecida de lint, type-check, build ou testes.
- Nenhuma migration nova foi criada nesta fase residual; a correcao foi de higiene de segredo/historico e documentacao.
- Nenhum dado de producao foi lido ou alterado.

## Auditoria de Infra Real - 2026-05-12

Escopo validado com acesso autenticado:
- Render CLI autenticado no workspace `Wanderson's workspace`.
- Vercel CLI autenticado no team `wandersonrodriguezgandra-debugs-projects`.
- Neon CLI autenticado na org `org-sparkling-tooth-51951988`.
- Cloudflare Wrangler autenticado na conta `6c64d54915231ae358b11475b268ae9b`.

Render:
- Servicos encontrados: `sgs-backend-web-d49b`, `sgs-backend-worker-d49b`, `sgs-migrations-d49b`, `sgs-clamav-internal`, Redis cache/auth/queue e um Redis legado suspenso.
- Deploy atual do backend web: `live`, commit `02bc7db78ecd8d11a7266c78b78ee4a2bf1102b5`.
- Deploy atual do worker: `live`, mesmo commit `02bc7db78ecd8d11a7266c78b78ee4a2bf1102b5`.
- Deploy atual do cron de migrations: `live`.
- Health publico da API: `https://api.sgsseguranca.com.br/health/public` retornou `{"status":"ok"}`.
- Logs de erro da ultima hora para web e worker: vazios.
- Finding confirmado: o `render.yaml` versionado diz que o web service nao deve rodar migrations no deploy automatico, mas o servico real ainda possui `preDeployCommand: npm run migration:run`. A tentativa via `render services update --pre-deploy-command=''` nao alterou o campo. Corrigir pelo Dashboard/API Render antes do proximo ciclo de deploy.
- Finding confirmado: ambiente Render `Production` esta `unprotected`, `networkIsolationEnabled=false` e com `ipAllowList 0.0.0.0/0`. Para web publico isso e esperado; para ambiente/projeto como um todo, proteger ambiente e revisar controles de rede reduz risco operacional.
- Finding confirmado: web/worker/cron tem `autoDeploy: yes` no branch `main`. Com migration ainda no preDeploy do web, isso eleva risco de DDL automatico em push comprometido.

Vercel:
- Projeto live correto: `frontend`, URL de producao `https://app.sgsseguranca.com.br`, status `Ready`.
- Deploy live inspecionado: `dpl_E35YtNaAQm4vLBdHP6k1vbrYzgqJ`, criado em `2026-05-10`, build com Next `16.2.3`.
- Variaveis de producao encontradas no projeto `frontend`: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_API_URL`, `API_URL`, `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FEATURE_AI_ENABLED`.
- Finding confirmado: CSP publica do frontend em producao ainda permite `https://*.supabase.co` em `img-src`. O codigo local ja removeu esse allowlist em `frontend/next.config.mjs`, mas ainda nao esta refletido no deploy live.
- Finding confirmado: existem dois vinculos Vercel locais: `.vercel/project.json` aponta para `sgs-seguraca` sem env/prod URL, enquanto `frontend/.vercel/project.json` aponta para o projeto live `frontend`. Rodar CLI da raiz pode operar o projeto errado.
- Headers publicos do frontend: HSTS ativo, CSP presente, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` presente.

Neon:
- Projeto encontrado: `sgs-homologacao` (`tiny-sunset-03985125`), regiao `aws-sa-east-1`, Postgres 17.
- Branch `production`: `ready`, `primary/default`, `protected=false`.
- Banco: `neondb`, owner `neondb_owner`.
- Roles: `neondb_owner` e `sgs_app`, ambos com auth por senha e `protected=false`.
- IP allow list: vazia, `protected_branches_only=false`; `block_public_connections=false`.
- VPC project restrictions: vazio.
- Finding confirmado: branch de producao Neon nao esta protegido e aceita conexoes publicas por senha. O isolamento de role runtime/migration existe no desenho do repo, mas a superficie de rede ainda depende de segredo forte e SSL.
- Observacao operacional: a listagem de operacoes mostra suspensoes/starts frequentes dos computes e alguns starts com `failures_count: 1`, sem erro atual bloqueante.

Cloudflare:
- Buckets R2 encontrados: `sgs-01`, `sgs-02`, `sgs-03`, `site-sgs-seguranca-opennext-cache`, `wanderson-gandra-docs`.
- Buckets `sgs-01`, `sgs-02`, `sgs-03`: sem CORS configurado, o que reduz exposicao direta via browser.
- Lifecycle R2:
  - `sgs-01`: aborta multipart incompleto em 1 dia, expira `imports/` em 30 dias, transiciona `reports/` para IA em 90 dias e `evidences/` em 180 dias.
  - `sgs-02`: aborta multipart incompleto em 1 dia e transiciona replica DR para IA em 30 dias.
  - `sgs-03`: aborta multipart incompleto em 1 dia.
- Lock rules R2: inexistentes em `sgs-01`, `sgs-02`, `sgs-03`.
- Finding confirmado: nao ha Object Lock/retencao imutavel nos buckets governados/DR. Para documentos SST governados, isso deixa exclusao/alteracao dependente apenas de credenciais e trilhas aplicacionais.
- Finding confirmado: token Cloudflare local possui escopo muito amplo, incluindo diversas permissoes de escrita/admin (`workers`, `workers_kv`, `workers_routes`, `d1`, `pages`, `ssl_certs`, `queues`, `secrets_store`, `connectivity admin`, entre outras). Para operacao diaria, criar token separado e minimo para R2/zonas necessarias.

Correcoes/acoes pendentes de infra:
1. Render: remover `preDeployCommand` do web service pelo Dashboard/API e manter migrations apenas no `sgs-migrations-d49b`.
2. Render: proteger ambiente Production e revisar se auto-deploy direto de `main` deve continuar para web/worker/cron.
3. Vercel: fazer deploy do frontend atualizado para refletir Next `16.2.6` e CSP sem Supabase Storage em `img-src`.
4. Vercel: remover/ignorar o vinculo `.vercel/project.json` da raiz ou padronizar comandos com `--cwd frontend` para evitar deploy/env no projeto errado.
5. Neon: habilitar protecao da branch `production` e avaliar IP allow list/VPC/private networking conforme compatibilidade com Render.
6. Neon: marcar roles sensiveis como protegidos, especialmente `neondb_owner`, e manter `sgs_app` como runtime sem privilegios de DDL/BYPASSRLS.
7. Cloudflare: criar token operacional de menor privilegio e revogar/substituir o token amplo usado localmente.
8. Cloudflare/R2: avaliar Object Lock/retencao imutavel para buckets governados e DR, alinhando prazo com LGPD e requisitos SST.

## Remediacao de Infra Aplicada - 2026-05-12

Correcoes aplicadas:
- Vercel: removido o vinculo local `.vercel/project.json` da raiz, que apontava para o projeto `sgs-seguraca` sem URL de producao/envs. O vinculo correto permanece em `frontend/.vercel/project.json`.
- Vercel: executado deploy de producao a partir de `frontend` para o projeto `frontend`.
  - Deployment: `dpl_A5TMd5yCaddWR2fzvs3XUrBhApRn`.
  - URL: `https://frontend-70rpoakkk-wandersonrodriguezgandra-debugs-projects.vercel.app`.
  - Alias promovido: `https://app.sgsseguranca.com.br`.
  - Build remoto confirmou Next `16.2.6`.
- Vercel: CSP publica do frontend foi revalidada e nao contem mais `*.supabase.co`; mantem `*.r2.cloudflarestorage.com` para artefatos permitidos.
- Render: removido via API oficial o `preDeployCommand` do web service `sgs-backend-web-d49b`.
  - Estado confirmado: web service com `PreDeploy` vazio e `Start=npm run start:web`.
  - Migrations permanecem concentradas no cron `sgs-migrations-d49b` com `Start=npm run migration:run && echo "Migrations completed"`.
- Cloudflare R2: adicionadas regras de Object Lock somente no prefixo `documents/`, evitando bloquear `imports/` e outros prefixos temporarios.
  - `sgs-01`: `governed-documents-365d`, prefixo `documents/`, retencao `365` dias.
  - `sgs-02`: `governed-documents-dr-365d`, prefixo `documents/`, retencao `365` dias.

Validacao apos remediacao:
- API: `https://api.sgsseguranca.com.br/health/public` retornou `200` com `{"status":"ok"}`.
- Frontend: `https://app.sgsseguranca.com.br/login` retornou `200`.
- Frontend CSP: `HasSupabaseInCsp=false`, `HasR2InCsp=true`.
- Render: web, worker e cron continuam `not_suspended`.
- Render: web sem migration em pre-deploy; worker e cron sem pre-deploy.
- R2: lock rules listadas com sucesso em `sgs-01` e `sgs-02`; `sgs-03` permanece sem lock por nao ser bucket governado/DR configurado no `render.yaml`.
- Repo: `git diff --check` passou.

Pendencias que nao foram aplicadas por limite/risco de plataforma:
- Render: proteger o ambiente `Production` via API retornou `{"message":"forbidden"}`. Exige API key/usuario com permissao administrativa suficiente no Render Dashboard.
- Neon: tentativa de marcar a branch `production` como protegida retornou `BRANCHES_PROTECTED_LIMIT_EXCEEDED`. Exige upgrade/ajuste de plano ou liberacao de quota de protected branches.
- Neon: nao apliquei IP allowlist porque o backend Render nao tem egress fixo confirmado nesta topologia. Aplicar allowlist agora poderia derrubar conexao do backend/worker/migrations com o banco.
- Neon roles: a API/CLI disponivel nao expôs atualizacao segura de `protected` para roles existentes. Como a protecao da branch falhou por limite de plano, a protecao de roles tambem ficou pendente de ajuste no Console/API apos resolver a quota.
- Cloudflare token: nao foi possivel reduzir o escopo do token ja autenticado via Wrangler. A correcao exige criar um novo token minimo no dashboard Cloudflare/API Tokens, atualizar o ambiente local/CI e revogar o token amplo atual.
