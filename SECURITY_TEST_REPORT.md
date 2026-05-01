# Relatório Final de Testes e Segurança — SGS

## 1. Resumo Executivo
- Branch analisada: `snyk-fix-axios` (**ver Atualização** ao final)
- Data/hora: 2026-05-01 13:50:36 -03:00 (America/Fortaleza) (**ver Atualização** ao final)
- Resultado final: **APROVADO COM RESSALVAS** (**ver Atualização** ao final)
- Motivo da decisão:
  - **Build/lint/test** passaram (backend e frontend).
  - **Snyk** sem vulnerabilidades críticas/altas (backend usa policy local para 1 finding sem patch upstream).
  - **Semgrep** encontrou diversos achados “Blocking”, porém **nenhum foi verificado como introduzido por esta branch** (a branch está contida na `main`), e vários parecem “hardening/config” ou potenciais falsos positivos (detalhado em Achados).
  - Ressalvas: **E2E do backend foi executado mas pulou parcialmente por infraestrutura indisponível**; e há **arquivos locais grandes de log** detectados pelo Trivy (não versionados), que podem conter conteúdo sensível se compartilhados.

## 2. Escopo da Validação
- Backend (NestJS): lint, build, unit/integration tests (Jest), cobertura, E2E (com skip parcial), dependências, SAST
- Frontend (Next.js): lint, build, tests (Jest), dependências, SAST
- Dependências: Snyk, OSV Scanner, Trivy FS
- Segurança estática: Semgrep (`--config auto`)
- Git/diff: branch/status/diffs, arquivos não rastreados, verificação básica de sensíveis

## 3. Arquivos Alterados na Branch
### 3.1 `git diff --name-only`
- Resultado: **vazio** (working tree limpo)

### 3.2 Diferença da branch vs `origin/main`
- `git diff --name-only origin/main..HEAD`: **vazio**
- Interpretação: a branch `snyk-fix-axios` não contém mudanças exclusivas em relação à `main` (mudanças já incorporadas na `main`).

## 4. Comandos Executados
Ambiente (referência):
- Node: `v24.13.0`
- npm: `11.12.1`
- Snyk: `1.1304.1`
- Semgrep: `1.161.0`
- osv-scanner: `2.3.5`
- Trivy: `0.70.0`

### 4.1 Git / Repo (raiz)
- Comando: `git branch --show-current`
  - Diretório: repo root
  - Resultado: passou
  - Saída: `snyk-fix-axios`
- Comando: `git status`
  - Diretório: repo root
  - Resultado: passou
  - Saída: `working tree clean`
- Comando: `git diff --name-only`
  - Diretório: repo root
  - Resultado: passou
  - Saída: vazio
- Comando: `git diff --stat`
  - Diretório: repo root
  - Resultado: passou
  - Saída: vazio
- Comando: `git ls-files --others --exclude-standard`
  - Diretório: repo root
  - Resultado: passou (com ressalva)
  - Saída (não rastreados): `backend/src/auth/permissions.guard.spec.ts`, `docs/API_INTEGRATION_GUIDE.md`
  - Observação: são arquivos **não versionados** (não aparecem no `git status` nesta máquina), mas foram listados como “others”; revisar se são intencionais antes de qualquer commit futuro.

### 4.2 Backend (C:\Users\User\Documents\trae_projects\sgs-seguraca\backend)
- Comando: `npm run lint`
  - Resultado: passou
  - Saída: `eslint "{src,test}/**/*.ts" --max-warnings=0`
- Comando: `npm run build`
  - Resultado: passou
  - Saída: `nest.js build`
- Comando: `npm test`
  - Resultado: passou
  - Saída: `212 passed / 1565 passed`
- Comando: `npm run test`
  - Resultado: passou
  - Saída: `212 passed / 1565 passed`
- Comando: `npm run test:unit`
  - Resultado: **não aplicável**
  - Motivo: script não existe no `backend/package.json`.
- Comando: `npm run test:e2e`
  - Resultado: passou **com skip parcial**
  - Saída relevante:
    - `⚠️  E2E: infraestrutura indisponível (DB=✗ Redis=✗). Testes E2E serão ignorados.`
    - `Test Suites: 9 skipped, 2 passed`
- Comando: `npm run test:cov`
  - Resultado: passou
  - Saída: `212 passed / 1565 passed` + tabela de cobertura (aprox. 53% statements)

### 4.3 Segurança — Backend
- Comando: `snyk test`
  - Resultado: passou
  - Saída: `✔ Tested 1102 dependencies ... no vulnerable paths found. (Local Snyk policy: found)`
- Comando: `semgrep scan --config auto`
  - Resultado: passou **com achados**
  - Observação: primeira execução falhou por encoding (`UnicodeEncodeError` / `cp1252`); reexecução com `PYTHONUTF8=1` e `PYTHONIOENCODING=utf-8` concluiu.
  - Saída (resumo): `Findings: 61 (61 blocking)`
- Comando: `osv-scanner scan source -r .`
  - Resultado: passou
  - Saída: `No issues found`
- Comando: `trivy fs .`
  - Resultado: passou
  - Saída (resumo): `Vulnerabilities: 0`
  - Warnings relevantes:
    - arquivos grandes de log detectados (ex.: `.codex-backend-live.out.log`, `logs/combined2.log`, `logs/combined3.log`) com recomendação de `--skip-files` para evitar alto consumo de memória.

### 4.4 Frontend (C:\Users\User\Documents\trae_projects\sgs-seguraca\frontend)
- Comando: `npm run lint`
  - Resultado: passou **com warning**
  - Warning: `ESLintRCWarning` (uso de `.eslintrc`, deprecado para ESLint v10)
- Comando: `npm run build`
  - Resultado: passou **com warnings não-bloqueantes**
  - Warnings:
    - `middleware file convention is deprecated` (Next)
    - `No Sentry auth token provided` (release não criado)
    - `Custom Cache-Control headers detected for /_next/static/(.*)` (atenção a comportamento em dev)
- Comando: `npm test`
  - Resultado: **falhou na 1ª tentativa** e **passou na repetição**
  - Erro observado (1ª tentativa): `EPERM: operation not permitted, open ... frontend\\.next\\static\\chunks\\...`
  - Reexecução:
    - `npm run test`: passou (`84 passed / 467 passed`)
    - execução adicional com `--no-haste --detectOpenHandles`: passou
- Comando: `npm run test`
  - Resultado: passou (com aviso padrão do Jest sobre open handles; confirmado “limpo” com `--detectOpenHandles`)

### 4.5 Segurança — Frontend
- Comando: `snyk test`
  - Resultado: passou
  - Saída: `✔ Tested 568 dependencies ... no vulnerable paths found.`
- Comando: `semgrep scan --config auto`
  - Resultado: passou **com achados**
  - Saída (resumo): `Findings: 16 (16 blocking)`

## 5. Resultado do Backend
- Lint: **OK**
- Build: **OK**
- Testes (`npm test`, `npm run test`): **OK**
- E2E: **OK com skip parcial** (infra de teste DB/Redis indisponível no momento)
- Cobertura (`test:cov`): **OK** (cobertura média ~53% statements; não é falha, mas indica espaço para melhoria)
- Snyk: **OK** (com policy local)
- Semgrep: **OK com achados blocking** (principalmente hardening/config e padrões de “audit”)
- OSV: **OK**
- Trivy FS: **OK** (0 vulns em lockfile; warnings por arquivos grandes)

## 6. Resultado do Frontend
- Lint: **OK** (warning de depreciação de `.eslintrc` no ESLint)
- Build: **OK** (warnings de Next/Sentry/Cache-Control)
- Testes: **OK** (1 erro transitório de permissão em `.next` na primeira tentativa do `npm test`)
- Snyk: **OK**
- Semgrep: **OK com achados blocking**

## 7. Achados de Segurança
### 7.1 Críticos
- Nenhum achado crítico confirmado como introduzido por esta branch.

### 7.2 Altos
- **Semgrep (backend)** apontou:
  - `src/worker.module.ts`: `rejectUnauthorized: false` (risco real **alto** se usado em produção para conexões TLS; pode permitir MITM).
  - `src/disaster-recovery/tenant-backup.service.ts`: AES-GCM sem `authTagLength` no `createDecipheriv` (pode ser risco criptográfico dependendo do fluxo/validação do tag).
  - Observação: estes itens parecem **preexistentes** (a branch não contém diff exclusivo vs `main`), então **não bloqueiam o merge do fix de dependências**, mas **são candidatos a bloqueio de deploy** dependendo da política de hardening.

### 7.3 Médios
- **Snyk (backend)**: resolvido via policy local (`backend/.snyk`) para `SNYK-JS-INFLIGHT-6095116` (sem patch upstream). Risco residual: dependência transitiva com leak potencial; mitigação é manter versões sob vigilância e reavaliar antes do vencimento do ignore.
- **Trivy (backend)**: warnings de arquivos grandes de log (risco operacional de vazamento se logs forem compartilhados/copied para tickets).

### 7.4 Baixos
- **Semgrep (frontend)**: múltiplos achados de “unsafe format string” em `console.*` e logs (geralmente baixo risco; potencial de log forging se entrada não confiável controlar format string).
- **Semgrep (frontend)**: “insecure websocket” (uso de `ws://` em código que aparentemente alterna `wss://` quando `https://`; pode ser falso positivo dependendo do fluxo).
- Warnings de build (Next middleware deprecation / Sentry token ausente): baixo risco de segurança, mas afeta observabilidade/roadmap.

### 7.5 Falsos Positivos
- **Semgrep (frontend)** `unsafe-formatstring` em `console.warn/error` com template strings:
  - Ferramenta: Semgrep auto rules
  - Arquivos: `lib/error-handler.ts`, `lib/offline-cache.ts`, `lib/storage.ts`, `lib/pdf/aprGenerator.ts`, `app/.../AprForm.tsx`
  - Motivo técnico: template strings em `console.*` não usam `util.format` diretamente; risco prático tende a ser baixo (ainda assim, manter cuidado para não logar PII).
  - Confiança: média (depende do runtime/transport de logs e se valores são controlados por atacante).

## 8. Comparação com os achados anteriores
Ainda aparecem (via Semgrep):
- Dockerfile sem `USER` não-root (backend/frontend)
- `rejectUnauthorized: false` (backend)
- pontos envolvendo criptografia AES-GCM (backend)
- possíveis “audit warnings” em logs e template strings (backend/frontend)

Evolução com esta branch:
- Achados de dependências do `axios` e `next` reportados anteriormente pelo Snyk **não aparecem mais** (Snyk limpo em backend e frontend).

## 9. Riscos Residuais
- Hardening de containers (Dockerfile sem `USER` não-root) se esses Dockerfiles forem usados em produção.
- Config TLS potencialmente insegura (`rejectUnauthorized: false`) — confirmar se está em caminho de produção.
- E2E do backend depende de DB/Redis em `docker-compose.test.yml`; sem isso, parte dos E2E é pulada.
- Logs locais grandes (não versionados) podem conter dados sensíveis.

## 10. Recomendações
### 10.1 Ações obrigatórias antes do merge
- Nenhuma ação obrigatória para merge desta branch, **pois ela não introduz novos achados críticos/altos** e os testes/build/lint passaram.

### 10.2 Ações recomendadas antes do deploy
- Confirmar uso dos Dockerfiles em produção e aplicar `USER` não-root onde aplicável.
- Revisar `rejectUnauthorized: false` em `backend/src/worker.module.ts` (remover/condicionar por ambiente).
- Revisar implementação AES-GCM no DR (`tenant-backup.service.ts`) e garantir validação de tag (ou `authTagLength`) adequada.
- Rodar E2E com infraestrutura ligada: `docker compose -f docker-compose.test.yml up -d` e reexecutar `npm run test:e2e`.

### 10.3 Melhorias futuras
- Reduzir “noise” do Semgrep com config/ignore cuidadosamente documentado (sem ocultar achados reais).
- Padronizar logs sem interpolação de entradas não confiáveis e sem PII.
- Tratar warnings do build (Sentry releases, migração `middleware -> proxy` no Next).

## 11. Conclusão Final
- Posso fazer merge desta branch?
  - **SIM**, com ressalvas (os achados do Semgrep parecem preexistentes e não impedem o merge do bump de dependências).
- Posso fazer deploy?
  - **SIM, com ressalvas**, desde que você aceite os riscos residuais descritos (principalmente hardening de Docker/TLS e necessidade de E2E completo com infraestrutura).
- Existe risco crítico ou alto pendente?
  - **Alto potencial** (Semgrep) em TLS e hardening de container **se** esses trechos forem usados em produção; não foi confirmado como introduzido pela branch.
- O que precisa ser feito agora?
  - Se o objetivo imediato é apenas aplicar o patch de dependências: prosseguir.
  - Se o objetivo é “hardening” total: tratar os itens de TLS/Docker/AES-GCM em um rollout separado.

## 12. Evidências
### 12.1 Backend — testes
```text
> backend@0.0.1 test
Test Suites: 212 passed, 212 total
Tests:       1565 passed, 1565 total
```

### 12.2 Backend — E2E (skip parcial)
```text
⚠️  E2E: infraestrutura indisponível (DB=✗ Redis=✗). Testes E2E serão ignorados.
Test Suites: 9 skipped, 2 passed, 2 of 11 total
```

### 12.3 Backend — Snyk
```text
✔ Tested 1102 dependencies for known issues, no vulnerable paths found.
Local Snyk policy: found
```

### 12.4 Backend — Semgrep (resumo)
```text
Findings: 61 (61 blocking)
```

### 12.5 Frontend — build
```text
▲ Next.js 16.2.3 (Turbopack)
✓ Compiled successfully
```

### 12.6 Frontend — Snyk
```text
✔ Tested 568 dependencies for known issues, no vulnerable paths found.
```

---

# Atualização (execução adicional) — 2026-05-01 14:42:04 -03:00

Esta atualização foi feita após o pedido “rodar o teste semgrep”.

## A. Git / Branch (raiz)
- `git branch --show-current` → `test/security-coverage`
- `git status --porcelain=v1` → arquivos não rastreados:
  - `SECURITY_TEST_REPORT.md`
  - `backend/src/auth/permissions.guard.spec.ts`
  - `docs/API_INTEGRATION_GUIDE.md`
- `git diff --name-only` → vazio

## B. Semgrep — Backend
- Diretório: `backend`
- Comando (PowerShell):
  - `semgrep scan --config auto` (com `PYTHONUTF8=1` e `PYTHONIOENCODING=utf-8`)
- Resultado: **passou com achados**
  - `Findings: 61 (61 blocking)`
- Evidências (trechos relevantes):
  - `backend/src/worker.module.ts`: `ssl: { rejectUnauthorized: false }`
  - `backend/src/disaster-recovery/tenant-backup.service.ts`: `aes-256-gcm` sem validação explícita de tamanho esperado da tag (rule `gcm-no-tag-length`)

## C. Conclusão desta atualização
- Este relatório **não pode mais ser tratado como “validação final” da branch `snyk-fix-axios`**, pois a branch atual no repo está em `test/security-coverage`.
- Para concluir “segura para merge/deploy” da `snyk-fix-axios`, é necessário:
  1. voltar para a branch correta; e
  2. reexecutar o checklist (lint/build/tests + scanners) na branch correta.
