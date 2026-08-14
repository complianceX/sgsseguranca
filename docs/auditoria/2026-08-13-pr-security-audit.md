# Auditoria de PRs e segurança — SGS

Data: 2026-08-13
Escopo: PRs abertas, checks do GitHub, dependências Node, histórico Git e superfícies de segredo.

## Resumo executivo

- Foram identificadas 24 PRs abertas.
- O principal bloqueio de segurança é `puppeteer` 24.x → `extract-zip`, com vulnerabilidade high de path traversal por symlink. A atualização para Puppeteer 25.x está sendo tratada na PR #277.
- O frontend antigo tinha vulnerabilidades em `js-yaml`, `@redocly/openapi-core`, `nanoid` e `dompurify`. O lock corrigido no worktree da #277 reporta zero vulnerabilidades em `npm audit --audit-level=high`.
- A PR #209 tinha uma migration incompleta: a entidade usa `verificacao_foto3_key`, mas o `up()` não criava essa coluna. O `up()` e o `down()` foram alinhados localmente.
- Não foi encontrado segredo real confirmado. O Gitleaks histórico encontrou apenas um placeholder documental redigido (`YOUR_RENDER_API_KEY`). A falha de Secret Scanning da #265 é uma ocorrência não verificada causada por URLs PostgreSQL sintéticas em commits intermediários.

## Evidências executadas

- Gitleaks no histórico de `origin/main`: 1 ocorrência, classificada como placeholder documental; segredo redigido.
- Gitleaks no histórico e no diff da PR #277: nenhum leak.
- `npm audit --audit-level=high`: backend e frontend da #277 com 0 vulnerabilidades.
- `npm ci --ignore-scripts`: backend e frontend da #277 concluídos sem vulnerabilidades reportadas.
- Build NestJS da #277: aprovado.
- Lint frontend da #277: aprovado, incluindo verificação de imports de permissão, ESLint e Stylelint.
- `ci:migration:check` da #209: aprovado, 288 migrations.
- YAML do workflow da #277: válido.
- Auditoria textual do workflow da #277: sem senhas PostgreSQL, `PGPASSWORD`, URLs PostgreSQL com credencial ou cláusulas `PASSWORD '...'` literais.
- API do GitHub: nenhum alerta aberto de secret scanning ou code scanning; a API de Dependabot retornou indisponível por permissão administrativa, portanto não é evidência de ausência de alertas.

## Findings

### HIGH — dependência vulnerável de Puppeteer

As PRs #275 e #276 falham no audit backend por `puppeteer`, `puppeteer-core`, `@puppeteer/browsers` e `extract-zip`. O advisory reporta path traversal por symlink em `extract-zip`. A correção deve ser validada junto com o upgrade de runtime Chromium/Puppeteer da #277, sem usar `npm audit fix --force` isoladamente.

### HIGH/MODERATE — lock frontend desatualizado

O frontend antigo reportava `js-yaml` 4.3.0, `@redocly/openapi-core` vulnerável, `nanoid` 3.3.16 e `dompurify` 3.4.12. O lock corrigido atualiza esses pacotes para versões sem vulnerabilidades reportadas pelo audit executado.

### HIGH — E2E crítico com OOM na #277

O wrapper `backend/scripts/run-jest.cjs` descartava `process.execArgv`; por isso o filho Jest não recebia `--max-old-space-size`. A correção local preserva os flags do processo pai. O E2E completo ainda precisa ser reexecutado no runner GitHub; Docker não está disponível neste ambiente local.

### HIGH — migration incompleta na #209

`verificacao_foto3_key` era usada pela entidade e pelos testes, mas não era criada pela migration `1709000000366`. A coluna foi adicionada ao `up()` e ao `down()` no worktree isolado da PR.

### INFO — Secret Scanning da #265

O check falha porque o histórico da PR contém URLs PostgreSQL sintéticas em commits intermediários. Não houve verificação de segredo real e Gitleaks não encontrou leaks. Para zerar esse check é necessário reescrever/squashar o histórico da PR e force-pushar a branch; isso requer autorização explícita antes de executar.

## Gates pendentes

- Commit/push das correções nos branches das PRs.
- Reexecução dos checks no GitHub.
- Reescrita controlada do histórico da #265, se ainda necessária após os demais checks.
- Build Next.js completo: a execução local com URLs sintéticas excedeu três minutos sem conclusão; não foi declarado como aprovado.
- Revalidação de Docker/Trivy e E2E em runner Linux com Docker.

Nenhum teste usou produção, tokens reais, dados reais ou credenciais de banco reais.
