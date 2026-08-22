# SGS — Operação Canônica

Status: documento operacional único do repositório. Atualizado em 2026-08-21.

Este é o guia que deve ser seguido para analisar, corrigir, testar e promover mudanças no SGS. Ele define a ordem do trabalho e a autoridade de cada tipo de informação; não substitui as evidências detalhadas nem os contratos do código.

## 1. Hierarquia de verdade

1. Código, testes e migrações versionados definem o comportamento real.
2. Este documento define o processo operacional e os gates.
3. [`deploy/INFRAESTRUTURA-ATUAL.md`](./deploy/INFRAESTRUTURA-ATUAL.md) define ambientes, topologia e alvos autorizados.
4. [`testing/README.md`](./testing/README.md) define o formato mínimo da evidência de testes.
5. [`audits/`](./audits/) contém evidências históricas e decisões de auditoria; não é um manual para inventar um novo fluxo.
6. [`MEMORY.md`](../MEMORY.md) contém continuidade curta. Não usar memória para afirmar que um teste, deploy ou gate passou.

Quando houver conflito, confirmar no código e no ambiente autorizado; registrar a divergência antes de prosseguir.

## 2. Regra absoluta de ambientes

Todo trabalho de validação começa na VPS de teste isolada. Isso inclui migrations, smoke, E2E, RLS, tenant/site, RBAC, storage, PDF, Axe, carga e disaster recovery.

Não alterar produção durante a validação. Não usar credenciais, banco, bucket, domínio ou dados de produção em testes. A promoção só pode ocorrer depois de todos os gates verdes e de autorização explícita do usuário para a publicação.

Os dados do ambiente de teste devem ser sintéticos. Tokens, cookies, senhas, chaves, CPF, URLs presigned e valores de ambiente nunca entram em logs, commits, relatórios ou mensagens.

## 3. Fluxo obrigatório

### Fase A — Preparar e proteger

- Confirmar branch, SHA, worktree e ambiente-alvo.
- Ler este guia, a infraestrutura atual e o README de testes.
- Verificar se há mudanças do usuário; preservá-las.
- Conferir que o alvo é a VPS de teste e que há guardrail contra produção.
- Criar um `run-id` e uma pasta de evidência fora do Git, conforme o contrato de testes.
- Nunca exibir ou copiar valores de `.env`; relatórios devem ser redigidos.

### Fase B — Corrigir localmente

- Reproduzir o erro com teste ou evidência mínima.
- Corrigir na camada correta, mantendo tenant, site, RBAC, LGPD e compatibilidade.
- Alteração de schema exige migration TypeORM reversível/compatível.
- Não remover filtros de tenant nem confiar em autorização somente no frontend.
- Executar os checks locais proporcionais à mudança: TypeScript, lint, testes unitários e build.

### Fase C — Validar na VPS de teste

Executar, na ordem adequada ao módulo:

1. health, readiness, versão/SHA e migrations pendentes;
2. autenticação, CSRF, sessão e `/auth/me`;
3. isolamento cross-tenant e cross-site, incluindo RLS quando aplicável;
4. permissões e fluxos de aprovação;
5. concorrência, replay, expiração e locks;
6. upload, inspeção, hash/magic bytes, download autorizado, IDOR, tamper, ACL/TLS e cleanup do storage;
7. geração, registry, integridade e renderização visual de PDF;
8. E2E autenticado e Axe nos viewports móveis e desktop relevantes;
9. backup, restore e recuperação quando o gate exigir;
10. carga somente com perfil e dados sintéticos autorizados.

Cada resultado deve registrar comando, ambiente, SHA, perfil, resultado e evidência redigida. Um teste não executado é `INCOMPLETE` ou `BLOCKED`, nunca `PASS` por inferência.

### Fase D — Segurança e release

- Rodar scan de secrets no source, diff, worktree e histórico.
- Classificar cada finding; qualquer credencial plausível deve ser revogada/rotacionada pelo owner.
- Repetir o scan após a correção e guardar apenas relatório redigido.
- Confirmar worktree limpo ou separar explicitamente mudanças não relacionadas.
- Executar CI e revisar os checks terminais.
- Atualizar o relatório de evidências e o veredito. `NO-GO` permanece se qualquer gate obrigatório estiver incompleto.

### Fase E — Promoção controlada

Somente com gates verdes e autorização explícita:

- confirmar que o commit publicado é o SHA validado na VPS de teste;
- executar migrations antes da aplicação, quando houver pendências;
- publicar web e worker sequencialmente, nunca em deploy concorrente;
- confirmar deploy concluído, health, readiness, versão, logs e heartbeat;
- executar smoke pós-deploy sem dados reais desnecessários;
- registrar rollback conhecido e parar diante de qualquer regressão.

Este guia não autoriza produção por si só. A decisão final precisa estar documentada no relatório da rodada.

## 4. Estados dos gates

- `PASS`: evidência executada e reproduzível na camada correta.
- `FAIL`: controle executado e falhou.
- `INCOMPLETE`: começou, mas não cobriu o escopo exigido.
- `BLOCKED`: depende de acesso, infraestrutura, owner ou condição externa ausente.
- `NO-GO`: não promover enquanto houver gate obrigatório diferente de `PASS`.

## 5. Organização de documentos

- Processo único: este arquivo.
- Infraestrutura e alvos: [`deploy/INFRAESTRUTURA-ATUAL.md`](./deploy/INFRAESTRUTURA-ATUAL.md) e [`deploy/hostinger-coolify-infra-atual.md`](./deploy/hostinger-coolify-infra-atual.md).
- Testes e evidências: [`testing/README.md`](./testing/README.md), `backend/test/`, `frontend/e2e/`, `ops/test/` e `artifacts/test-runs/` fora do Git.
- Deploy/rollback: [`deploy/COMO-COLOCAR-EM-PRODUCAO.md`](./deploy/COMO-COLOCAR-EM-PRODUCAO.md).
- Auditorias: `docs/audits/`; preservar para rastreabilidade e superseder por addendum, não apagar só por repetição textual.
- Histórico de implementação: [`consulta-rapida/implementacoes-recentes.md`](./consulta-rapida/implementacoes-recentes.md); consultar apenas para contexto, não como autorização operacional.
- Prompts, skills e checklists especializados: manter em suas pastas e usar somente quando o escopo exigir.

## 6. Checklist curto antes de responder “está pronto”

- [ ] VPS de teste foi o primeiro e único alvo da validação.
- [ ] Código, migration, testes e build foram verificados conforme o risco.
- [ ] Auth, tenant/site, RBAC, storage, PDF, accessibility e DR foram cobertos quando aplicáveis.
- [ ] Nenhum segredo ou dado pessoal foi exposto na evidência.
- [ ] Findings de secrets foram classificados e credenciais plausíveis revogadas/rotacionadas.
- [ ] Worktree, SHA e checks finais foram confirmados.
- [ ] Relatório contém lacunas explícitas; não há `INCOMPLETE`/`BLOCKED` escondido como `PASS`.
- [ ] Produção só será tocada após autorização explícita do usuário.
