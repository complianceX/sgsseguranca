# SGS — Auditoria Extrema 360° dos Módulos Operacionais — Rodada 2

**Data:** 2026-08-22
**Branch:** `hotfix/backend-web-boot-fix`
**Escopo:** Frontend, Design System, UX, Responsividade, Acessibilidade (FASES 11-17 do plano original) para os 7 módulos operacionais.
**Rodada 1 (backend/DB/segurança):** ver `project-auditoria-modulos-operacionais-2026-08-14` na memória, relatórios em `docs/audits/operational-modules/` na branch `fix/rls-fail-open-company-delete-guard` (nunca mergeada).

> **Status:** rodada 2 **parcial**. Cobertura: Design System, UX de fluxo, Acessibilidade estática (leitura de código) e uma primeira passada de responsividade (classes Tailwind) nos 7 módulos. **NÃO coberto**: inspeção visual real (contraste renderizado, foco visível, comportamento em viewport real), FASE 13 (aprofundamento dedicado ao design da PT além do que segue abaixo) além do que a leitura de código permite, e FASES 49-51 (Golden Documents / inspeção visual de PDF). Nenhum achado abaixo foi corrigido — só reportado, igual à rodada 1.

---

## Resumo por severidade

| Severidade | Quantidade | IDs |
|---|---:|---|
| CRITICAL | 1 | `SGS-CHK-A11Y-001` |
| HIGH | 5 | `SGS-PT-A11Y-001`, `SGS-PT-A11Y-002`, `SGS-RDO-UX-001`, `SGS-EPI-UX-021`, `SGS-RF-UX-025` |
| MEDIUM | 8 | `SGS-PT-A11Y-003`, `SGS-DDS-A11Y-002`, `SGS-DDS-A11Y-004`, `SGS-RDO-UX-002`, `SGS-EPI-DS-020`, `SGS-EPI-RESP-022`, `SGS-EPI-DS-023`, `SGS-RF-UX-026` |
| LOW | 5 | `SGS-PT-DS-001`, `SGS-DDS-UX-003`, `SGS-CHK-UX-004`, `SGS-ARR-A11Y-001`, `SGS-EPI-UX-024` |
| Não verificado (precisa UI real) | 1 | `SGS-PT-UX-001` |

**Os dois achados mais graves combinam com CRITICALs já conhecidos do backend (rodada 1)** — não são bugs novos isolados, são a manifestação de UI de falhas de segurança já documentadas:

- `SGS-EPI-UX-021` — a interface permite escolher qualquer colaborador e assinar por ele sem verificação nenhuma, **agravando** `SGS-EPI-SEC-003` (backend aceita assinatura de terceiro).
- `SGS-CHK-A11Y-001` — bloqueia por completo o preenchimento de checklists de segurança por teclado/leitor de tela.

---

## PT (Permissão de Trabalho) — maior risco do escopo

### SGS-PT-A11Y-001 (HIGH)
Botões de ação só-ícone na tabela desktop usam `title`, sem `aria-label`.
**Onde:** `frontend/app/dashboard/pts/components/PtsTableRow.tsx:184-296` — Imprimir/E-mail/Baixar PDF/Editar/Excluir.
**Falha:** `title` não é lido de forma confiável por leitores de tela e não substitui o nome acessível (WCAG 4.1.2). Usuário de leitor de tela ouve só "botão" sem saber qual ação.
**Contraste:** a versão mobile (`PtMobileCard.tsx`) já faz certo (texto visível ao lado do ícone).
**Confiança:** verificado lendo o código.

### SGS-PT-A11Y-002 (HIGH)
`<label>` sem `htmlFor`/`id` associando ao campo, em 3 dos 8 arquivos de seção do formulário.
**Onde:** `EmergencyRescueSection.tsx:73,92,103,131,155`, `AtmosphericReadingsSection.tsx:194,227`, `ChecklistSection.tsx:182,202,224`.
**Falha:** sem associação programática, leitor de tela não anuncia o rótulo ao focar o campo; clicar no texto do label não foca o input.
**Contraste:** `BasicInfoSection.tsx` (mesmo formulário) faz certo em 100% dos casos — inconsistência entre arquivos, não falta de padrão conhecido.
**Confiança:** verificado lendo código e inputs correspondentes.

### SGS-PT-A11Y-003 (MEDIUM)
Campos obrigatórios marcados só com asterisco visual, sem `required`/`aria-required`.
**Onde:** `EmergencyRescueSection.tsx:73-77` (contato/plano de resgate quando `espacoConfinado`), vigia designado (NR-33).
**Contraste:** `PtRejectModal.tsx:57` usa `aria-required="true"` corretamente — padrão conhecido, não aplicado aqui.
**Confiança:** verificado lendo o código.

### SGS-PT-DS-001 (LOW/observação)
`PtForm.tsx` tem 2637 linhas — é um orquestrador de wizard/submit/rascunho/preview de PDF (não um "god component" de campos brutos; campos vêm de `FormProvider` compartilhado), mas o tamanho ainda dificulta revisão/teste isolado.
**Confiança:** verificado (contagem de linhas + grep).

### SGS-PT-UX-001 (não verificado)
Modo "PT em campo" (`/dashboard/pts/new?field=1`, `page.tsx:227`) — clareza da distinção visual em relação à PT normal não foi confirmada sem rodar a UI.

---

## DDS e Checklist

### 🔴 SGS-CHK-A11Y-001 (CRITICAL)
Botões Sim/Não/Conforme/NC do checklist são **inacessíveis por teclado e leitor de tela**.
**Onde:** `frontend/app/dashboard/checklists/components/ExecutionItem.tsx:228-233` (`choiceBtn`) e subitens (linha 451).
**Causa:** o rádio nativo tem `className="hidden"` (`display:none`) dentro de um `<label>`. `display:none` remove o elemento da árvore de acessibilidade **e** da ordem de tabulação — não é o padrão correto "visualmente oculto mas acessível" (`sr-only`/clip).
**Falha:** usuário de teclado ou leitor de tela abre um checklist de segurança pra preencher e não consegue selecionar nenhuma resposta em nenhum item — só funciona com clique/toque direto.
**Confiança:** alta — é semântica HTML/CSS documentada, não precisa rodar a UI pra confirmar.

### SGS-DDS-A11Y-002 (MEDIUM)
Botão ícone-apenas com `title` mas sem `aria-label` (copiar caminho da pasta).
**Onde:** `frontend/app/dashboard/dds/page.tsx:1850-1861`.
**Contraste:** outros botões ícone-apenas no mesmo arquivo já usam `aria-label` corretamente — inconsistência pontual, fácil de corrigir.

### SGS-DDS-UX-003 / SGS-CHK-UX-004 (LOW/MEDIUM)
Diálogos nativos do browser misturados com UI própria.
**Onde:** `dds/page.tsx:720` (`window.confirm` pra operacionalizar modelo, enquanto exclusão usa `ConfirmModal` estilizado); `checklists/page.tsx:226` (`window.prompt` pra nomear "vista salva", sem estilo/validação/i18n).
**Falha:** quebra o padrão visual do app; `confirm`/`prompt` bloqueiam a thread de render e são inconsistentes entre navegadores/mobile.

### SGS-DDS-A11Y-004 (MEDIUM)
`ActionMenu` (`frontend/src/components/ActionMenu.tsx`) usa `role="menu"`/`role="menuitem"` corretamente rotulado (aria-label, aria-haspopup, aria-expanded, Escape fecha), mas não move foco pro primeiro item ao abrir nem implementa navegação por setas (Home/End/↑/↓) — o padrão ARIA que o componente declara pressupõe isso. Funciona via Tab sequencial, mas diverge do comportamento esperado por usuários de leitor de tela habituados ao padrão de menu.

**Positivo, vale registrar:** ambos os módulos usam tokens de design consistentes, têm `ResponsiveDataList` com views mobile/desktop distintas (não é responsividade "encolhe a tabela"), estados de loading/erro/vazio bem cobertos, e a maioria dos botões ícone-apenas já usa `aria-label` corretamente.

**Não coberto nesta passada:** `docs/component-library.md` não foi comparado (existência não verificada); navegação por teclado ponta-a-ponta no fluxo de assinatura pública do DDS; contraste real em dark mode; viewport 390px renderizado.

---

## RDO e ARR

### SGS-RDO-UX-001 (HIGH)
`RdoPage.tsx:1155` usa `confirm("Deseja excluir este RDO?")` nativo, e `:1118` usa `window.prompt(...)` pra cancelar — apesar do módulo TER um sistema de modal próprio, acessível, com focus-trap (`RdoActionModals.tsx`, `useFocusTrap`), usado só pra assinar/enviar e-mail.
**Agravante:** a rodada 1 (backend) já achou que `remove()` faz hard delete e a trilha `rdo_audit_events` é destruída por CASCADE, sem evento `REMOVED`. O texto do `confirm()` não menciona nada disso — usuário não sabe que a exclusão é irreversível e apaga o histórico de auditoria junto.
**Confiança:** alta.

### SGS-RDO-UX-002 (MEDIUM)
Campo de e-mail pra envio (`RdoPage.tsx:287,1784`) é um `<input>` de texto livre, split por vírgula/`;`/espaço, sem chips visuais, contador ou validação em tempo real.
**Agravante:** combinado com `SGS-RDO-SEC-001` do backend (sem `@ArrayMaxSize`/allowlist no servidor), a UI convida colar uma lista grande de e-mails sem atrito.

### SGS-ARR-A11Y-001 (LOW)
`arrs/page.tsx:644` renderiza a tabela sem `aria-label`, enquanto `RdoPage.tsx:2060` usa `aria-label="RDOs em tabela"` no mesmo componente compartilhado — inconsistência de baixo esforço.

**Hipótese refutada:** contagem baixa de breakpoints Tailwind no ARR/RDO sugeria risco de quebra mobile — refutado, o `Table` compartilhado já embrulha com `overflow-auto`.

**Positivo:** ARR está mais alinhado ao design system que o RDO nesta amostra — usa `usePermissions()`/`Permission.*` tipado, tem `EmptyState`/loading, e zero `confirm()`/`prompt()`/`alert()` nativo. A "simplicidade" do ARR (achado da rodada 1, backend) não se traduz em débito de UX equivalente.

**Não coberto nesta passada:** responsividade real do `RdoEditorModal.tsx` (918 linhas) em viewport ≤390px; padrão exato de confirmação do `handleDelete` do ARR (confirmado que não é `window.confirm`, padrão exato não identificado); contraste real dos estados destrutivos.

---

## EPI e Relatório Fotográfico

### SGS-EPI-DS-020 (MEDIUM)
`epi-fichas/page.tsx` e `epis/page.tsx` não importam `useAuth`/`Permission.*` nem usam `ListPageLayout`/`FormPageLayout` (exigido pelo `CLAUDE.md`). Sem isso, controles como "Nova ficha"/"Substituir" não são escondidos de usuários sem `can_manage_epi_assignments` na UI — a única barreira é o backend, depois do usuário já tentar.
**Contraste:** `photographic-reports/page.tsx:52-63` faz certo (`hasPermission(...)`).
**Ressalva:** não confirmado se `route-config.ts` já bloqueia a rota inteira por papel (reduziria mas não eliminaria o achado).

### 🟠 SGS-EPI-UX-021 (HIGH)
`epi-fichas/page.tsx:512-523,683-719` — o botão "Assinar entrega"/"Devolver" abre `SignatureModal` **sem nenhuma verificação** de que quem está desenhando a assinatura é a pessoa selecionada no dropdown de colaborador.
**Gravidade real:** é a manifestação de UI do `SGS-EPI-SEC-003` do backend (qualquer ator autenticado carimba assinatura de terceiro) — a interface ativamente convida esse uso incorreto, sem PIN, convite, ou confirmação de presença. **Reportar junto com a correção do backend, não isoladamente.**

### SGS-EPI-RESP-022 (MEDIUM)
Card mobile (`epi-fichas/page.tsx:570`) mostra a data de validade do CA mas nunca chama `resolveCaStatus()` (usado só no desktop, linha 618) — no mobile o usuário vê a data crua, não "CA expirado". A informação mais crítica de compliance do módulo desaparece na visão mais provável de ser usada em campo/obra.

### SGS-EPI-DS-023 (LOW/MEDIUM)
Mesmo no desktop (linha 618), status de CA expirado é texto plano na célula da tabela, sem cor/ícone de alerta — fácil de passar batido numa lista longa.

### SGS-EPI-UX-024 (LOW)
Busca de EPI/colaborador é um input de texto separado de um `<select>` nativo — não é um combobox/autocomplete integrado.

### 🟠 SGS-RF-UX-025 (HIGH)
`PhotoCard.tsx:177-185` — excluir uma foto dispara direto, **sem confirmação**. É ação destrutiva sobre evidência que pode já ter classificação de não-conformidade e análise de IA anexada.
**Contraste:** `epi-fichas` pelo menos exige motivo pra substituir uma ficha.

### SGS-RF-UX-026 (MEDIUM)
Nenhum `PhotoCard` individual mostra se aquela foto tem geolocalização/hash — só existe um banner global e transitório em `WizardStep2Photos.tsx:115-124`, que reflete apenas o lote mais recente. Depois de navegar, não há como saber pela UI se uma foto já enviada tem geo válida — só aparece no PDF final.

**Positivo, vale registrar:** `WizardStep2Photos.tsx:111-134` trata geolocalização muito bem — avisa antes do que será gravado (arredondamento ~1km, propósito de privacidade) e avisa depois se alguma foto foi enviada sem geo. Barra de progresso com `role="progressbar"`/`aria-value*` corretos. Status por foto (otimizando/pronta/erro + retry) é um padrão de feedback sólido.

**Não coberto nesta passada:** contraste real de cores (`success/info/warning/danger`), foco/teclado em todos os componentes.

---

## O que ainda falta pra fechar a rodada 2 de verdade

1. **Inspeção visual real** — tudo acima foi lido em código estático. Contraste renderizado, foco visível ao navegar por teclado, e comportamento em viewport real (390px/768px/1440px) precisam de Axe + captura de tela ou navegação manual.
2. **FASE 13 aprofundada** — o achado da PT cobre acessibilidade e um ponto de tamanho de arquivo; não cobre clareza semântica dos campos NR-33/35 nem nomenclatura, que exigiria comparar com um usuário real do domínio (técnico de segurança).
3. **FASES 49-51 (Golden Documents / PDF visual)** — nenhum PDF foi gerado e inspecionado visualmente nesta rodada. Requer rodar a geração real (Puppeteer) contra dados sintéticos e comparar visualmente.
4. **`docs/component-library.md`** — não confirmado se existe e se os módulos realmente seguem o catálogo declarado; comparação pendente.
5. **Rodada 3** (já era plano original): confrontar adversarialmente os 68 achados da rodada 1 (backend) que seguem ⏳, E2E de lifecycle, e performance com volume.
