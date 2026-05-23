# Auditoria de Design e Cores do Frontend SGS (Módulo por Módulo)

Data: 23/05/2026  
Escopo: `Dashboard + Auth + Públicas`  
Estratégia: `análise primeiro, correção depois`

## 1) Resumo Executivo

- Auditoria executada em `frontend` com inventário completo de módulos do menu canônico (`Sidebar`) + rotas de `auth` e páginas públicas.
- Score global do frontend (média ponderada por arquivos de módulo): **88.4/100**.
- Não foram encontrados achados `Crítico`.
- Achados `Alto` reais e diretamente acionáveis: **9** (4 por módulo + 5 cross-cutting).
- Maior volume de ocorrências automáticas está em `frontend/app/globals.css` (camada de compatibilidade de classes Tailwind para tokens); esse bloco foi triado como dívida de manutenção, não regressão funcional imediata.

## 2) Método Aplicado

### 2.1 Fontes de verdade usadas

- `frontend/styles/tokens.css`
- `frontend/styles/theme-light.css`
- `frontend/styles/theme-dark.css`
- `frontend/app/globals.css`
- `frontend/components/Sidebar.tsx` (catálogo canônico de módulos)

### 2.2 Varredura técnica automatizada

- Arquivo de dados bruto: `artifacts/frontend-design-audit-data-v3.json`
- Cobertura: arquivos `.tsx/.ts/.css` de rotas por módulo + cross-cutting compartilhado.
- Regras de detecção:
- hardcoded hex (`#...`)
- utilitários não-tokenizados (`bg-white/*`, `bg-black/*`, `text-gray-*`, `bg-slate-*`, etc.)
- sinais de estados interativos (`hover`, `focus`, `active`, `disabled`)
- sinais de responsividade (`sm/md/lg/xl`)

### 2.3 Validação visual (análise primeiro)

- Revisão estática de contraste/paridade light-dark no código e tokens.
- Cruzamento com capturas já existentes do projeto:
- `frontend/audit-dashboard.png`
- `frontend/audit-companies-list.png`
- `frontend/audit-sites-list.png`
- `frontend/audit-apr-list.png`
- `frontend/audit-arr-list.png`
- `frontend/audit-dds-list.png`
- `frontend/audit-did.png`
- `frontend/audit-login.png`
- `frontend/audit-privacidade.png`
- `frontend/audit-termos.png`

## 3) Inventário e Cobertura por Módulo

| Módulo | Rotas cobertas (resumo) | Score | Achados (A/M/B) |
|---|---|---:|---:|
| Estrutura | `/dashboard`, `companies`, `sites`, `employees`, `users`, `calendar` | 87 | 1/0/0 |
| Campo e Operação | `dds`, `dids`, `arrs`, `pts`, `aprs`, `expenses`, `nonconformities`, `audits`, `sst-agent` | 91 | 1/0/0 |
| Relatórios | `relatorios`, `reports`, `rdos`, `photographic-reports` | 98 | 0/0/0 |
| Saúde ocupacional | `trainings`, `medical-exams`, `epi-fichas` | 98 | 0/0/0 |
| Cadastros operacionais | `activities`, `risks`, `epis`, `tools`, `machines` | 98 | 0/0/0 |
| Checklists | `checklist-models`, `checklists`, `checklist-templates` | 72 | 2/1/0 |
| Leitura e Gestão | `cats`, `document-pendencies`, `risk-map`, `corrective-actions`, `documentos/importar`, `kpis`, `executive`, `document-registry` | 98 | 0/0/0 |
| Sistema | `settings` | 98 | 0/0/0 |
| Auth | `login`, `forgot-password`, `reset-password` | 67 | 0/0/0 |
| Públicas | `/`, `onboarding`, `privacidade`, `termos`, `cookies`, `validar`, `verify`, `assinar/dds` | 85 | 0/0/0 |

Notas:
- Os scores acima já refletem ajuste por severidade dos achados triados por módulo.
- A seção `cross-cutting` foi analisada separadamente para não distorcer os módulos de negócio.

## 4) Achados Priorizados (Schema Fixo)

### 4.1 Backlog Priorizado (execução recomendada)

1. 
- modulo: `Checklists`
- rota: `/dashboard/checklists`
- tema: `ambos`
- componente/superficie: `overlay modal de email`
- arquivo:linha: `frontend/app/dashboard/checklists/components/ChecklistForm.tsx:2906`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `UX + consistência de overlay no dark mode`
- acao_recomendada: `trocar bg-black/50 por token semântico de overlay (ex.: var(--component-overlay))`
- esforco_estimado: `P`
- risco_regressao: `baixo`

2. 
- modulo: `Checklists`
- rota: `/dashboard/checklists`
- tema: `ambos`
- componente/superficie: `badge de remoção de foto`
- arquivo:linha: `frontend/app/dashboard/checklists/components/ExecutionItem.tsx:543`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `contraste inconsistente entre temas`
- acao_recomendada: `migrar bg-black/70 e text-white para tokens de badge/overlay`
- esforco_estimado: `P`
- risco_regressao: `baixo`

3. 
- modulo: `Estrutura`
- rota: `/dashboard/sites`
- tema: `ambos`
- componente/superficie: `overlay do modal QR`
- arquivo:linha: `frontend/app/dashboard/sites/page.tsx:268`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `inconsistência visual do modal no shell dark`
- acao_recomendada: `substituir bg-black/50 por token de overlay do DS`
- esforco_estimado: `P`
- risco_regressao: `baixo`

4. 
- modulo: `Campo e Operação`
- rota: `/dashboard/aprs`
- tema: `ambos`
- componente/superficie: `overlay modal de reabertura`
- arquivo:linha: `frontend/app/dashboard/aprs/components/AprReopenModal.tsx:41`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `desalinhamento com padrão de modal global`
- acao_recomendada: `usar token de overlay compartilhado`
- esforco_estimado: `P`
- risco_regressao: `baixo`

5. 
- modulo: `Cross-cutting`
- rota: `global`
- tema: `ambos`
- componente/superficie: `avatar do botão flutuante Sophie`
- arquivo:linha: `frontend/components/AIButton.tsx:250`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `contraste e aparência variam fora do DS`
- acao_recomendada: `migrar bg-white/14 para token semântico de superfície translúcida`
- esforco_estimado: `P`
- risco_regressao: `baixo`

6. 
- modulo: `Cross-cutting`
- rota: `global`
- tema: `ambos`
- componente/superficie: `header do chat Sophie (ícone e close)`
- arquivo:linha: `frontend/components/AIChatPanel.tsx:213`, `frontend/components/AIChatPanel.tsx:227`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `falta de paridade light/dark em estado hover/focus`
- acao_recomendada: `trocar border/bg/focus white opacity por tokens de superfície/header`
- esforco_estimado: `P`
- risco_regressao: `baixo`

7. 
- modulo: `Cross-cutting`
- rota: `global`
- tema: `ambos`
- componente/superficie: `avatar do card de usuário na sidebar`
- arquivo:linha: `frontend/components/Sidebar.tsx:438`
- tipo_falha: `hardcoded-color`
- severidade: `Alto`
- impacto: `inconsistência com tokens do chrome da sidebar`
- acao_recomendada: `substituir bg-white/8 e ring-white/10 por tokens chrome-sidebar`
- esforco_estimado: `P`
- risco_regressao: `baixo`

8. 
- modulo: `Checklists`
- rota: `/dashboard/checklists`
- tema: `ambos`
- componente/superficie: `fallback de tinta da assinatura`
- arquivo:linha: `frontend/app/dashboard/checklists/components/SignatureModal.tsx:35`
- tipo_falha: `hardcoded-color`
- severidade: `Médio`
- impacto: `fallback fixo pode quebrar consistência se token mudar`
- acao_recomendada: `usar fallback tokenizado (ex.: var de tema já resolvida no runtime sem hex literal)`
- esforco_estimado: `P`
- risco_regressao: `baixo`

9. 
- modulo: `Cross-cutting`
- rota: `global`
- tema: `ambos`
- componente/superficie: `regras de print da APR`
- arquivo:linha: `frontend/app/globals.css:1376` (contexto `apr-sheet`)
- tipo_falha: `hardcoded-color`
- severidade: `Médio`
- impacto: `baixa flexibilidade para evolução da paleta`
- acao_recomendada: `documentar exceção de impressão ou mover para tokens específicos de print`
- esforco_estimado: `M`
- risco_regressao: `medio`

### 4.2 Achados triados como intencionais (não entram no backlog imediato)

- `frontend/styles/tokens.css`, `theme-light.css`, `theme-dark.css`: uso de hex é esperado, pois são a definição da paleta.
- `frontend/tailwind.config.ts`: mapeamento estático de cor é parte da infraestrutura de tema atual.
- `frontend/app/globals.css` (grande bloco `.text-gray-*`, `.bg-gray-*`, `.text-slate-*`): camada de compatibilidade para telas legadas; tratar como dívida técnica planejada, não correção emergencial.

## 5) Matriz por Módulo (Status)

- Estrutura: 1 achado Alto em modal de QR (`sites`), restante aderente a tokens.
- Campo e Operação: 1 achado Alto em overlay de modal APR, restante consistente.
- Relatórios: sem achados alto/médio triados.
- Saúde ocupacional: sem achados alto/médio triados.
- Cadastros operacionais: sem achados alto/médio triados.
- Checklists: maior risco funcional visual (2 altos + 1 médio), prioridade imediata.
- Leitura e Gestão: sem achados alto/médio triados.
- Sistema: sem achados alto/médio triados.
- Auth: sem hardcodes relevantes; ponto de atenção é baixa cobertura de classes responsivas no código atual.
- Públicas: sem hardcodes relevantes nas páginas auditadas.

## 6) Quick Wins (baixo esforço / alto impacto)

1. Unificar overlays de modal para token único (`--component-overlay`) nos 3 pontos identificados (`sites`, `aprs`, `checklists`).
2. Remover opacidades `white/*` do ecossistema Sophie (`AIButton`, `AIChatPanel`) e migrar para tokens de superfície.
3. Trocar fallback hex da assinatura por resolução tokenizada sem literal.
4. Normalizar avatar da Sidebar para tokens de `chrome-sidebar`.

## 7) Critérios de Aceite do Relatório

- [x] Cobertura de módulos visíveis no menu + auth + públicas.
- [x] Seção própria por módulo (sem relatório monolítico).
- [x] Evidências reproduzíveis com `arquivo:linha`.
- [x] Score por módulo + score global.
- [x] Backlog priorizado e executável sem redefinir critérios.
- [x] Distinção entre achado real vs. regra intencional do design system.

## 8) Próxima Fase Recomendada (implementação)

Ordem sugerida de correção:
1. `Checklists` (itens 1, 2, 8)
2. `Estrutura` + `Campo e Operação` overlays (itens 3, 4)
3. `Cross-cutting` Sophie + Sidebar (itens 5, 6, 7)
4. decisão de governança para `globals.css` legado e print APR (item 9 + dívida técnica)

## 9) Remediação Executada

Data: 23/05/2026

Itens corrigidos nesta passada:

- `Checklists`: overlay do modal de email, badge de remoção de foto e fallback da tinta de assinatura.
- `Estrutura`: overlay do modal de QR Code em `sites`.
- `Campo e Operação`: overlay do modal de reabertura de APR.
- `Cross-cutting`: botão flutuante Sophie, header do chat Sophie e avatar da sidebar.

Arquivos alterados:

- `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`
- `frontend/app/dashboard/checklists/components/ExecutionItem.tsx`
- `frontend/app/dashboard/checklists/components/SignatureModal.tsx`
- `frontend/app/dashboard/sites/page.tsx`
- `frontend/app/dashboard/aprs/components/AprReopenModal.tsx`
- `frontend/components/AIButton.tsx`
- `frontend/components/AIChatPanel.tsx`
- `frontend/components/Sidebar.tsx`

Validação executada:

- `rg` nos padrões críticos do backlog: sem ocorrências restantes nos arquivos corrigidos.
- `npm run lint` em `frontend`: aprovado (`eslint` + `stylelint`).

Pendência deliberada:

- `frontend/app/globals.css` em regras de impressão/compatibilidade legado permanece como decisão de governança, porque mexer ali tem risco visual maior e deve ser tratado em PR próprio.

## 10) Remediação Executada - Impressão APR/PT

Data: 23/05/2026

Item corrigido nesta passada:

- `frontend/app/globals.css`: regras `.apr-sheet` de impressão APR/PT trocaram hex diretos (`#0F1923`, `#1f2937`, `#ffffff`, `#f8fafc`, `#e2e8f0`) por tokens `brand-*` e `color-mix`.

Validação executada:

- `rg` nos hex removidos: sem ocorrências restantes em `frontend/app/globals.css`.
- `npm run lint` em `frontend`: aprovado (`eslint` + `stylelint`).

Pendência restante:

- Blocos globais de compatibilidade `.text-gray-*`, `.bg-gray-*`, `.text-slate-*` continuam intencionais para telas legadas. A correção recomendada é migrar os componentes consumidores para classes DS em ciclos por módulo, não remover esses seletores globais abruptamente.

## 11) Reanalise Final

Data: 23/05/2026

Validacoes executadas apos a remediacao:

- `rg` nos padroes criticos removidos: sem ocorrencias nos arquivos corrigidos.
- `git diff --check` nos arquivos de frontend/documentacao tocados: aprovado.
- `npm run build` em `frontend`: aprovado, incluindo compilacao Next.js, TypeScript e geracao de 88 rotas.
- `npm run lint` em `frontend`: aprovado (`eslint` + `stylelint`).

Conclusao:

- Nao ha erro de lint, stylelint, TypeScript ou build nas mudancas de frontend desta auditoria.
- As alteracoes de backend atualmente no worktree nao fazem parte desta auditoria visual e nao foram alteradas nesta remediacao.
