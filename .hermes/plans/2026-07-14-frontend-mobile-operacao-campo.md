# Frontend Mobile para Operação de Campo — Plano de Implementação

> **Para o Hermes:** usar a skill `subagent-driven-development` para executar este plano tarefa por tarefa, com revisão de aderência à especificação e revisão de qualidade após cada entrega.

**Objetivo:** eliminar riscos de isolamento entre tenants e transformar o frontend SGS em uma interface mobile segura, acessível, previsível e utilizável em operação contínua de campo.

**Arquitetura:** primeiro corrigir o isolamento de tenant e as corridas assíncronas; depois criar fundações compartilhadas para shell mobile, listas responsivas, navegação, imagens, modais e offline; por fim migrar os módulos em ondas e estabelecer testes E2E de regressão. As mudanças devem ser incrementais, test-first, sem reescrever regras de negócio e sem misturar correções estruturais com alterações cosméticas.

**Stack:** Next.js 16, React 19, TypeScript, Tailwind/CSS global, Radix Dialog, Jest 30, Testing Library e Playwright a adicionar para E2E responsivo.

---

## 1. Escopo, prioridades e gates

### P0 — bloqueia qualquer release

1. Corrigir cache de referências do RDO para incluir `companyId` no escopo.
2. Limpar imediatamente obras e usuários quando o tenant mudar.
3. Impedir respostas antigas de atualizarem o estado do RDO e da PT.
4. Cobrir empresa A → empresa B com testes automatizados.

### P1 — próxima entrega mobile

1. Contrato único para rodapé mobile, navegação inferior, Sophie e safe area.
2. Tokens mobile: inputs com 16px e controles operacionais com mínimo de 44px.
3. `ResponsiveDataList` compartilhado e sem `role="grid"` indevido.
4. Migração prioritária: RDO, APR, PT, DID, ARR, DDS e Checklists.
5. Pipeline compartilhado de imagens.
6. Navegação centralizada com permissões e feature flags.

### P2 — consolidação

1. Segunda onda de listas responsivas.
2. Modal/drawer acessível.
3. Matriz formal de capacidade offline.
4. Calendário em visão agenda no mobile.
5. Ajustes das páginas públicas e assinatura DDS.

### Gates obrigatórios por PR

- Gate A: testes novos falham antes da implementação e passam depois.
- Gate B: `npm test -- --runTestsByPath ...` passa para a área alterada.
- Gate C: `npm run lint` passa.
- Gate D: `npm run build` passa.
- Gate E: sem alteração em regras de autorização do backend por inferência do frontend.
- Gate F: sem dados de tenant anterior visíveis após troca de empresa.
- Gate G: nenhuma ação primária fica atrás de navegação, Sophie, teclado ou safe area.
- Gate H: inspeção em 320×568, 360×800, 390×844, 412×915, tablet e landscape.

---

## 2. Evidências confirmadas no código atual

- RDO usa apenas `manage`/`view` no cache de referências: `frontend/app/dashboard/relatorios/rdos/RdoPage.tsx:394-454`.
- PT dispara cargas por empresa sem cancelamento ou request id: `frontend/app/dashboard/pts/components/PtForm.tsx:1477-1574` e continuação para usuários.
- Navegação mobile é fixa, `z-index: 40`: `frontend/app/globals.css:1952-1965`.
- Barra de formulário vira `position: fixed; bottom: 0` em telas pequenas: `frontend/app/globals.css:2537-2569`.
- Navegação mobile possui cinco itens hardcoded e aparece abaixo de `xl`: `frontend/src/components/MobileFieldNav.tsx:8-40`.
- Sidebar considera ativo apenas por igualdade exata: `frontend/src/components/Sidebar.tsx:371-399`.
- Input compartilhado usa altura 40px e fonte 13px: `frontend/src/components/ui/input.tsx:5-9`.
- Tabela compartilhada força `role="grid"`: `frontend/src/components/ui/table.tsx:22-40`.
- Padrão desktop/table + mobile/cards já existe: `frontend/app/dashboard/document-registry/page.tsx:594-659` e bloco móvel subsequente.
- Checklist guarda foto local como Data URL sem processamento: `frontend/app/dashboard/checklists/components/ChecklistForm.tsx:1659-1681`.
- Relatório fotográfico envia `selectedFiles` originais: `frontend/app/dashboard/photographic-reports/components/PhotographicReportWorkspace.tsx:500-521`.
- Service worker retorna apenas `offline.html` quando navegação falha: `frontend/public/sw.js:82-99`.
- `ModalFrame` acessível baseado em Radix já existe: `frontend/src/components/ui/modal-frame.tsx:59-134`.
- Editor RDO ainda é modal manual: `frontend/src/components/rdos/RdoEditorModal.tsx:125-159`.
- Já existe configuração parcial de autorização de rotas: `frontend/src/lib/route-config.ts:18-107`; ela não é ainda um catálogo completo de navegação.
- Há 111 testes Jest no frontend, mas nenhum arquivo Playwright versionado.
- Alterações preexistentes a preservar: backend `consents.seeder.ts`; frontend `AiConsentModal.tsx`, `verify/page.tsx` e `verify/page.test.tsx`.

---

# FASE 0 — Baseline e proteção contra regressão

**Estimativa:** 1–2 dias úteis.

### Tarefa 0.1 — Registrar baseline reproduzível

**Arquivos:**
- Criar: `docs/mobile/BASELINE-MOBILE-2026-07.md`
- Criar: `docs/mobile/module-capability-matrix.ts` ou `.json`
- Não alterar código funcional.

**Passos:**
1. Registrar commit/branch inicial e arquivos já modificados.
2. Executar e registrar `npm run lint`, testes direcionados e build.
3. Catalogar cada módulo com: leitura offline, escrita offline, tabela mobile, modal acessível, fotos processadas e prioridade.
4. Copiar apenas referências das evidências visuais existentes; não sobrescrever imagens.
5. Commit: `docs: registra baseline da operação mobile`.

**Aceite:** baseline contém comando, data, resultado e caminho da evidência; nenhuma modificação preexistente foi incluída no commit.

### Tarefa 0.2 — Criar helper de teste para troca de tenant

**Arquivos:**
- Criar: `frontend/src/test-utils/deferred-promise.ts`
- Criar: `frontend/src/test-utils/company-switch.tsx`

**Comportamento:** permitir controlar a ordem de resolução A/B nos testes e simular troca de `activeCompanyId`.

**Teste:** o helper deve resolver B antes de A sem timers reais.

---

# FASE 1 — Isolamento de tenant e concorrência assíncrona (P0)

**Estimativa:** 3–5 dias úteis.
**Release:** hotfix independente; não esperar as fases de UX.

### Tarefa 1.1 — Escrever regressões do RDO antes da correção

**Arquivos:**
- Criar: `frontend/app/dashboard/relatorios/rdos/RdoPage.test.tsx`
- Opcional, se necessário para testabilidade: criar `frontend/app/dashboard/relatorios/rdos/useRdoReferenceData.test.ts`.

**Cenários RED:**
1. Empresa A carrega sites/usuários A.
2. Ao selecionar B, listas são esvaziadas imediatamente, antes da resposta B.
3. Resposta tardia de A não reaparece após B.
4. Mesmo nível de permissão em A e B ainda dispara nova carga.
5. Mudança `manage → view` limpa usuários administrativos.
6. Desmontagem não produz atualização de estado nem toast tardio.

**Comando:**
`npm test -- --runTestsByPath app/dashboard/relatorios/rdos/RdoPage.test.tsx`

**Esperado antes da correção:** falhas nos cenários 2–4.

### Tarefa 1.2 — Extrair carregamento tenant-safe do RDO

**Arquivos:**
- Criar: `frontend/app/dashboard/relatorios/rdos/useRdoReferenceData.ts`
- Modificar: `frontend/app/dashboard/relatorios/rdos/RdoPage.tsx:394-464`.

**Contrato:**
- `scope = `${activeCompanyId}:${canManageRdo ? 'manage' : 'view'}``.
- Limpar `sites`, `users`, refs de escopo e promise compartilhada no início da mudança.
- Manter um `requestGenerationRef` incremental ou `AbortController` quando o service aceitar `signal`.
- Só aplicar resultado se `generation` e `companyId` ainda forem atuais.
- Não reaproveitar `usersLoadPromiseRef` entre empresas.
- Nunca usar apenas permissão como chave de cache.

**Padrão mínimo:**
```ts
const generation = ++requestGenerationRef.current;
const companyId = activeCompanyId;
setSites([]);
setUsers([]);
const result = await sitesService.findAll(companyId);
if (generation !== requestGenerationRef.current) return;
setSites(result);
```

**Aceite:** todos os testes da tarefa 1.1 passam e o fluxo A → B não mostra um único frame com referências A após a troca.

**Commit:** `fix(rdo): isola referências por tenant`.

### Tarefa 1.3 — Escrever regressões de corrida da PT

**Arquivos:**
- Modificar: `frontend/app/dashboard/pts/components/PtForm.test.tsx`.

**Cenários RED:**
1. APRs A resolvem depois de APRs B: estado final contém apenas B.
2. Sites A resolvem depois de sites B: estado final contém apenas B.
3. Users A resolvem depois de users B: estado final contém apenas B.
4. Troca limpa seleções incompatíveis (`selectedAprId`, `selectedSiteId`, responsáveis) de forma coerente.
5. Erro de request obsoleta não exibe toast no tenant novo.

### Tarefa 1.4 — Aplicar request generation/cancelamento à PT

**Arquivos:**
- Criar: `frontend/app/dashboard/pts/hooks/useCompanyScopedPtReferences.ts`.
- Modificar: `frontend/app/dashboard/pts/components/PtForm.tsx:1477` até o fim dos efeitos de APR/site/user.
- Modificar serviços apenas se necessário: `frontend/src/services/aprsService.ts`, `sitesService.ts`, `usersService.ts`.

**Regras:**
- Um controlador/generation por conjunto ou uma geração única por troca de empresa.
- `AbortError` e resposta obsoleta são silenciosos.
- Limpar dados antes de iniciar B.
- Fallback `findOne` também deve validar tenant e geração.
- Não mesclar `prev` de empresa antiga.

**Aceite:** testes da tarefa 1.3 passam; lint/build passam.

**Commit:** `fix(pt): descarta respostas de tenant obsoletas`.

### Tarefa 1.5 — Reteste de segurança P0

**Validação manual:**
1. Entrar na empresa A e abrir RDO/PT.
2. Confirmar referências A.
3. Simular rede lenta.
4. Trocar para B antes de A terminar.
5. Confirmar listas vazias/loading e depois somente dados B.
6. Repetir B → A e com permissões diferentes.
7. Capturar vídeo/evidência e anexar em `output/playwright/tenant-isolation/`.

**Gate de release:** P0 só fecha com teste automatizado + evidência manual.

---

# FASE 2 — Contrato do shell mobile, safe area e teclado

**Estimativa:** 4–6 dias úteis.

### Tarefa 2.1 — Definir variáveis de layout mobile

**Arquivos:**
- Modificar: `frontend/app/globals.css`.
- Modificar o layout do dashboard que instancia Sidebar/Header/MobileFieldNav.

**Tokens propostos:**
```css
:root {
  --mobile-nav-height: 4.75rem;
  --mobile-action-bar-height: 4.75rem;
  --mobile-safe-bottom: env(safe-area-inset-bottom, 0px);
  --mobile-overlay-gap: 0.75rem;
}
```

**Regras:**
- Exatamente um proprietário do espaço inferior por viewport.
- Conteúdo recebe padding calculado, não margem mágica por módulo.
- `100dvh`/`min-height: 100dvh` substitui `100vh`/`h-screen` em shells interativos.
- Navegação e barra de ação não podem ocupar o mesmo `bottom`.
- Sophie deve usar slot/offset do shell, não coordenada independente.
- Teclado virtual aberto não pode esconder o campo ativo nem a ação principal.

### Tarefa 2.2 — Criar componente compartilhado de barra de ações

**Arquivos:**
- Criar: `frontend/src/components/ui/mobile-action-bar.tsx`.
- Criar: `frontend/src/components/ui/mobile-action-bar.test.tsx`.
- Modificar: `frontend/app/globals.css:2537-2569`.

**API mínima:** ações primária/secundária, estado loading/disabled, região de status/autosave e comportamento com/sem MobileFieldNav.

**Aceite:** sem sobreposição em 320px; safe area aplicada; tab order lógico; botão principal com altura mínima de 44px.

### Tarefa 2.3 — Migrar barras conflitantes

**Arquivos:**
- `frontend/app/dashboard/aprs/components/AprForm.tsx`.
- `frontend/app/dashboard/pts/components/PtForm.tsx`.
- localizar e migrar rodapés equivalentes de ARR e DID.

**Aceite:** APR, ARR, DID e PT usam o mesmo contrato e não possuem `position: fixed` local concorrente.

**Commit:** `feat(mobile): unifica shell e barras de ação`.

---

# FASE 3 — Tokens mobile e semântica de componentes base

**Estimativa:** 4–6 dias úteis.

### Tarefa 3.1 — Inputs sem zoom no iOS

**Arquivos:**
- Modificar: `frontend/src/components/ui/input.tsx`.
- Modificar: `frontend/src/components/ui/input.test.tsx`.
- Auditar Select, Textarea e controles equivalentes em `frontend/src/components/ui/`.

**Regras:**
- Em viewport mobile, font-size computado ≥16px.
- Controle operacional ≥44px; preferir 48px no modo campo.
- Desktop pode manter densidade, desde que media query não reduza mobile.

### Tarefa 3.2 — Corrigir semântica da tabela

**Arquivos:**
- Modificar: `frontend/src/components/ui/table.tsx`.
- Criar: `frontend/src/components/ui/table.test.tsx`.

**Correção:** remover `role="grid"` padrão. Só expor modo grid por prop explícita quando houver implementação completa de teclado, foco roving e seleção.

**Aceite:** tabela sem prop usa semântica nativa; leitores de tela recebem caption/label quando necessário.

### Tarefa 3.3 — Corrigir painel de notificações em 320px

**Arquivos:**
- Modificar: `frontend/src/components/Header.tsx` próximo ao painel de notificações.
- Modificar: `frontend/src/components/Header.test.tsx`.

**Aceite:** largura `min(...)`/insets responsivos; nenhum overflow em 320px.

**Commit:** `fix(ui): adota tokens de toque e tipografia mobile`.

---

# FASE 4 — ResponsiveDataList compartilhado

**Estimativa:** 4–6 dias úteis.

### Tarefa 4.1 — Definir API sem acoplar regra de negócio

**Arquivos:**
- Criar: `frontend/src/components/ui/responsive-data-list.tsx`.
- Criar: `frontend/src/components/ui/responsive-data-list.test.tsx`.
- Criar: `frontend/src/components/ui/responsive-data-list.types.ts` somente se a tipagem ficar extensa.

**API recomendada:**
```tsx
<ResponsiveDataList
  items={items}
  getKey={(item) => item.id}
  desktop={(item) => <DesktopRow item={item} />}
  mobile={(item) => <MobileCard item={item} />}
  empty={<EmptyState />}
  loading={loading}
/>
```

**Princípios:**
- Componente controla breakpoints e estados comuns, não conhece domínio.
- Não renderizar simultaneamente duas árvores interativas acessíveis.
- Ações críticas ficam visíveis no card; não esconder apenas em menu overflow.
- Card tem título, estado, metadados principais e ações com nome acessível.
- Preservar paginação, filtros, seleção e autorização existentes.

### Tarefa 4.2 — Converter Document Registry em referência compartilhada

**Arquivos:**
- Modificar: `frontend/app/dashboard/document-registry/page.tsx:594` em diante.

**Aceite:** comportamento e visual atuais são preservados; duplicação desktop/mobile reduz; testes do componente compartilhado passam.

**Commit:** `feat(ui): cria lista responsiva compartilhada`.

---

# FASE 5 — Migração prioritária dos módulos operacionais

**Estimativa:** 12–18 dias úteis.
**Estratégia:** um PR por módulo; não juntar sete módulos em um PR.

### Tarefa 5.1 — RDO

**Arquivos:**
- `frontend/app/dashboard/relatorios/rdos/RdoPage.tsx`.
- `frontend/src/components/rdos/RdoEditorModal.tsx`.
- testes RDO criados na Fase 1.

**Entrega:** cards mobile, ações visíveis, editor em uma coluna no mobile, labels associados e botões icon-only com `aria-label`.

### Tarefa 5.2 — APR

**Arquivos:**
- `frontend/app/dashboard/aprs/components/AprListingTable.tsx`.
- `frontend/app/dashboard/aprs/components/AprForm.tsx`.
- `frontend/app/dashboard/aprs/page.tsx`.

**Entrega:** eliminar dependência de 1280px no mobile; preservar offline e autosave; barra compartilhada.

### Tarefa 5.3 — PT

**Arquivos:**
- `frontend/app/dashboard/pts/components/PtsTable.tsx`.
- `frontend/app/dashboard/pts/components/PtsTableRow.tsx`.
- `frontend/app/dashboard/pts/components/PtForm.tsx`.

**Entrega:** cards e alternativa mobile para tabela atmosférica; preservar modo campo e escrita offline.

### Tarefa 5.4 — DID

**Arquivos:**
- `frontend/app/dashboard/dids/page.tsx`.
- componentes de formulário em `frontend/app/dashboard/dids/components/`.

**Entrega:** cards e fluxo guiado com uma etapa operacional por vez no mobile; resumo/progresso persistente.

### Tarefa 5.5 — ARR

**Arquivos:**
- `frontend/app/dashboard/arrs/page.tsx`.
- componentes associados localizados no diretório ARR.

**Entrega:** cards, barra compartilhada e substituição de confirmação nativa por `ConfirmModal`.

### Tarefa 5.6 — DDS

**Arquivos:**
- `frontend/app/dashboard/dds/page.tsx`.
- `frontend/src/components/DdsForm.tsx` e componentes DDS.

**Entrega:** cards para as três tabelas; reduzir densidade da página; manter pipeline de foto existente como referência.

### Tarefa 5.7 — Checklists

**Arquivos:**
- `frontend/app/dashboard/checklists/components/ChecklistsTable.tsx`.
- `frontend/app/dashboard/checklists/components/ChecklistsTableRow.tsx`.
- `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`.

**Entrega:** cards, formulário dividido em blocos operacionais e integração com pipeline de fotos da Fase 8.

**Critérios comuns:**
- 320px sem overflow de página.
- Scroll horizontal só é aceito para dado intrinsecamente matricial e com alternativa resumida.
- Ações sensíveis não ficam fora da primeira visão do card.
- Filtros podem recolher, mas estado aplicado permanece visível.
- Testes de autorização e regra de negócio existentes continuam passando.

---

# FASE 6 — Navegação única, permissões e acessibilidade do drawer

**Estimativa:** 4–6 dias úteis.

### Tarefa 6.1 — Criar catálogo único de navegação

**Arquivos:**
- Expandir ou criar ao lado de `frontend/src/lib/route-config.ts`.
- Criar: `frontend/src/lib/navigation-config.ts`.
- Criar: `frontend/src/lib/navigation-config.test.ts`.
- Modificar: `frontend/src/components/Sidebar.tsx`.
- Modificar: `frontend/src/components/MobileFieldNav.tsx`.
- Modificar componente da paleta de comandos localizado durante a implementação.

**Modelo mínimo por item:** id, label, href canônico, match prefixes, icon, section, permission, admin-only, feature flag, surfaces (`sidebar`, `mobile`, `command`).

**Regras:**
- `/new`, `/edit/[id]` e detalhes herdam item ativo pelo maior prefixo válido.
- MobileNav filtra pela mesma permissão/flag da Sidebar.
- A configuração é apresentação; os guards de rota continuam sendo a barreira de segurança.
- Cinco atalhos mobile podem continuar, mas devem ser derivados por prioridade, não hardcoded.

### Tarefa 6.2 — Tornar drawer acessível

**Arquivos:**
- Modificar: `frontend/src/components/Sidebar.tsx`.
- Modificar: `frontend/src/components/Sidebar.test.tsx`.

**Aceite:** Escape fecha; foco fica contido; foco retorna ao gatilho; conteúdo externo fica inert/isolado; overlay não é botão com `tabIndex=-1` como único mecanismo.

**Commit:** `refactor(nav): centraliza rotas e acessibilidade`.

---

# FASE 7 — Pipeline compartilhado de imagens

**Estimativa:** 4–6 dias úteis.

### Tarefa 7.1 — Extrair processamento já validado no DDS

**Arquivos:**
- Criar: `frontend/src/lib/images/process-mobile-image.ts`.
- Criar: `frontend/src/lib/images/process-mobile-image.test.ts`.
- Criar: `frontend/src/components/ui/image-upload-status.tsx`.

**Contrato:**
- Validar MIME real/suportado e tamanho de entrada.
- Corrigir orientação EXIF ou normalizar via decode/canvas.
- Redimensionar com limite configurável; padrão alinhado ao DDS (máximo aproximado 1600×1200).
- Converter para JPEG/WebP conforme compatibilidade, com qualidade configurável.
- Aplicar limite de quantidade e peso pós-processamento.
- Retornar dimensões, tamanho original/final e motivo de rejeição.
- Processar sequencialmente ou com concorrência limitada para evitar pico de memória.
- Revogar object URLs e liberar canvas/referências.

### Tarefa 7.2 — Integrar Checklist

**Arquivos:**
- Modificar: `frontend/app/dashboard/checklists/components/ChecklistForm.tsx:1659-1689`.
- Modificar serialização/offline relevante em `frontend/app/dashboard/checklists/form-serialization.ts` e `frontend/src/lib/offline-*` se aplicável.

**Aceite:** nunca persistir foto bruta 12–48 MP como Data URL sem limite; informar quota e redução ao usuário; falha parcial não perde fotos válidas.

### Tarefa 7.3 — Integrar relatório fotográfico

**Arquivos:**
- Modificar: `frontend/app/dashboard/photographic-reports/components/PhotographicReportWorkspace.tsx:500-521`.
- Modificar/criar teste do workspace.

**Aceite:** preview, progresso por arquivo, cancelamento/retry, limite de quantidade e upload apenas de arquivos processados.

**Commit:** `feat(images): padroniza fotos para operação mobile`.

---

# FASE 8 — Modais, calendário e acessibilidade operacional

**Estimativa:** 8–12 dias úteis.

### Tarefa 8.1 — Migrar RDO para ModalFrame

**Arquivos:**
- `frontend/src/components/rdos/RdoEditorModal.tsx`.
- `frontend/src/components/ui/modal-frame.tsx` apenas se surgir requisito compartilhado comprovado.
- criar teste do RDO modal.

**Aceite:** `role=dialog`, título/descrição associados, Escape, focus trap, restauração de foco e layout com `dvh`.

### Tarefa 8.2 — Inventariar e migrar modais manuais

**Alvos iniciais:**
- `frontend/src/components/CompanyInviteModal.tsx`.
- `CompanySelectorModal.tsx`.
- `DdsThemeLibraryModal.tsx`.
- `OnboardingModal.tsx`.
- `SignatureModal.tsx`.
- modal QR de Sites.

**Regra:** migrar em PRs pequenos; não modificar `AiConsentModal.tsx` enquanto houver alteração preexistente sem primeiro reconciliar o diff.

### Tarefa 8.3 — Calendário acessível e visão agenda

**Arquivos:**
- `frontend/app/dashboard/calendar/page.tsx`.
- `frontend/src/services/calendarService.test.ts` se contratos mudarem.
- criar teste de interação da página.

**Aceite:** dias usam `button` ou semântica apropriada; setas têm nome; teclado funciona; mobile usa visão agenda/lista por padrão e grade de sete colunas fica opcional.

### Tarefa 8.4 — Dropzone acessível

**Arquivos:**
- `frontend/app/dashboard/documentos/importar/page.tsx`.
- `frontend/app/dashboard/documentos/importar/page.test.tsx`.

**Aceite:** elemento focável e semântico; Enter/Espaço abrem seletor; drag/drop preservado; instruções e erros associados.

### Tarefa 8.5 — Assinatura pública DDS

**Arquivos:** localizar página/componente da assinatura pública DDS.

**Aceite:** backing store do canvas acompanha tamanho CSS × DPR; recalibra em resize/orientação sem apagar assinatura inesperadamente; teste em portrait/landscape.

**Commit:** `fix(a11y): padroniza diálogos e fluxos por teclado`.

---

# FASE 9 — Política offline explícita

**Estimativa:** 5–8 dias úteis.

### Tarefa 9.1 — Formalizar matriz de capacidades

**Arquivos:**
- Consolidar: `docs/mobile/offline-capability-matrix.md`.
- Criar: `frontend/src/lib/offline-capabilities.ts`.
- Criar: `frontend/src/lib/offline-capabilities.test.ts`.

**Estados por módulo:** `read-write`, `read-only`, `online-required`, `unsupported`.

**Baseline esperado:**
- Escrita offline: APR, PT, Checklists, Não conformidades.
- Leitura/fallback parcial: ARR, DID, Sites.
- Online: DDS, RDO, Treinamentos, Exames médicos, salvo implementação futura explícita.

### Tarefa 9.2 — Expor estado de rede/capacidade na UI

**Arquivos:**
- Criar: `frontend/src/components/offline/OfflineCapabilityBanner.tsx`.
- Integrar no shell e nos módulos conforme matriz.

**Aceite:** ação não suportada offline é bloqueada antes da digitação longa/upload, com mensagem clara; módulos com fila mostram quantidade, status e retry.

### Tarefa 9.3 — Decidir escopo real do service worker

**Arquivos:**
- `frontend/public/sw.js`.
- `frontend/public/offline.html`.

**Decisão arquitetural:** não cachear respostas autenticadas/tenant-scoped indiscriminadamente. Preferir IndexedDB governado e criptografado para dados de negócio; service worker permanece restrito a shell/assets seguros até existir threat model específico.

**Aceite:** documentação não chama o produto de “offline completo”; dados de A não reaparecem em B via cache.

**Commit:** `feat(offline): declara capacidades e bloqueios por módulo`.

---

# FASE 10 — Segunda onda de módulos

**Estimativa:** 15–22 dias úteis.

### Ordem A — operação e segurança

1. Atividades — `frontend/app/dashboard/activities/page.tsx`.
2. Riscos — `frontend/app/dashboard/risks/components/RisksTable.tsx`.
3. EPIs — `frontend/app/dashboard/epis/page.tsx`.
4. Ferramentas — `frontend/app/dashboard/tools/page.tsx`.
5. Máquinas — `frontend/app/dashboard/machines/page.tsx`.
6. Funcionários — `frontend/app/dashboard/employees/page.tsx`.
7. Auditorias — `frontend/app/dashboard/audits/page.tsx`.
8. Não conformidades — `frontend/app/dashboard/nonconformities/page.tsx`.
9. Ordens de serviço — `frontend/app/dashboard/service-orders/page.tsx`.

### Ordem B — administrativo

1. Empresas — `frontend/app/dashboard/companies/page.tsx`.
2. Sites — `frontend/app/dashboard/sites/page.tsx`.
3. Usuários — `frontend/app/dashboard/users/components/UsersTable.tsx`.
4. CAT — `frontend/app/dashboard/cats/page.tsx`; substituir `window.prompt`.
5. Ações corretivas — `frontend/app/dashboard/corrective-actions/page.tsx`.
6. Treinamentos — `frontend/app/dashboard/trainings/page.tsx`.
7. Exames médicos — `frontend/app/dashboard/medical-exams/page.tsx`.
8. Fichas EPI — `frontend/app/dashboard/epi-fichas/page.tsx`; substituir confirmações nativas.
9. Despesas — `frontend/app/dashboard/expenses/page.tsx` e detalhe.
10. Pendências documentais — `frontend/app/dashboard/document-pendencies/page.tsx`.
11. Modelos de checklist e aliases, herdando componentes compartilhados.

### Regras de execução

- Um módulo por PR.
- Usar `ResponsiveDataList`, tokens, `MobileActionBar`, `ModalFrame` e catálogo de navegação; não criar novas variantes locais.
- Priorizar os 3–5 dados essenciais no card.
- Manter ação destrutiva com confirmação acessível.
- Adicionar ao menos um teste mobile/semântico por módulo.

---

# FASE 11 — E2E responsivo e critérios finais

**Estimativa:** 6–10 dias úteis.

### Tarefa 11.1 — Introduzir Playwright versionado

**Arquivos:**
- Modificar: `frontend/package.json` e lockfile.
- Criar: `frontend/playwright.config.ts`.
- Criar: `frontend/e2e/fixtures/auth.ts`.
- Criar: `frontend/e2e/fixtures/tenant-data.ts`.

**Projetos/viewports:**
- 320×568.
- 360×800.
- 390×844.
- 412×915.
- Tablet 768×1024.
- Landscape 844×390.

**Observação:** autenticação E2E deve usar fixture/ambiente de teste próprio, sem credenciais reais versionadas.

### Tarefa 11.2 — Suites P0/P1

**Arquivos:**
- `frontend/e2e/tenant-switch.spec.ts`.
- `frontend/e2e/mobile-shell.spec.ts`.
- `frontend/e2e/responsive-lists.spec.ts`.
- `frontend/e2e/mobile-keyboard.spec.ts`.
- `frontend/e2e/offline-capabilities.spec.ts`.
- `frontend/e2e/accessibility-dialogs.spec.ts`.
- `frontend/e2e/image-upload.spec.ts`.

**Cenários obrigatórios:**
1. A → B com respostas fora de ordem.
2. Barra salvar/avançar visível com navegação e Sophie.
3. Input focado sem zoom/layout quebrado.
4. Teclado virtual simulado sem ação encoberta.
5. Sem overflow horizontal de página.
6. Drawer fecha com Escape e restaura foco.
7. Offline bloqueia/encaminha conforme matriz.
8. Foto grande é reduzida/rejeitada de forma previsível.

### Tarefa 11.3 — Quality gate automatizado

**Pipeline mínimo:**
```bash
cd frontend
npm run lint
npm run test:ci
npm run build
npx playwright test
```

**Artefatos:** screenshots apenas em falha, trace em retry e relatório HTML não versionado salvo no CI.

**Commit:** `test(e2e): cobre operação mobile e troca de tenant`.

---

## 3. Estimativa e estratégia de entrega

Estimativa técnica total: **66–101 dias-pessoa**. Esse intervalo não representa prazo corrido; fases independentes podem ser paralelizadas após a conclusão do P0 e das fundações compartilhadas.

### Marcos recomendados

- **Marco 1 — Segurança:** Fases 0 e 1. Release hotfix.
- **Marco 2 — Fundação mobile:** Fases 2, 3 e 4.
- **Marco 3 — Campo prioritário:** Fases 5, 7 e os itens críticos da Fase 8.
- **Marco 4 — Governança:** Fases 6 e 9.
- **Marco 5 — Cobertura completa:** Fases 10 e 11.

### Paralelização segura

Após Marco 1:
- Trilha A: shell/tokens/listas (Fases 2–4).
- Trilha B: pipeline de fotos (Fase 7).
- Trilha C: catálogo de navegação (Fase 6).
- Trilha D: matriz offline documental (parte da Fase 9).

A migração dos módulos só começa após estabilizar `ResponsiveDataList`, tokens e barra mobile.

---

## 4. Critérios de aceite globais

### Segurança/LGPD

- Nenhuma referência, nome, obra, usuário ou seleção do tenant anterior permanece após troca.
- Respostas obsoletas nunca atualizam estado nem mostram toast no tenant atual.
- Caches client-side de negócio possuem tenant no escopo.
- Backend continua validando autorização e pertencimento; frontend não é tratado como controle de segurança suficiente.

### Mobile/UX

- Nenhuma tela crítica exige scroll horizontal para executar a tarefa principal.
- Nenhuma ação primária fica encoberta por nav, Sophie, safe area ou teclado.
- Inputs mobile têm fonte computada ≥16px.
- Controles operacionais têm alvo mínimo de 44×44px; preferencial 48px no modo campo.
- Shell usa unidades dinâmicas de viewport.

### Acessibilidade

- HTML semântico; tabela nativa sem `role=grid` falso.
- Todas as ações icon-only têm nome acessível.
- Modais e drawers suportam Escape, trap e restauração de foco.
- Calendário e dropzone funcionam por teclado.
- Estados loading/erro/sucesso são anunciáveis quando necessário.

### Offline e mídia

- Cada módulo declara claramente sua capacidade offline.
- Nenhuma foto bruta enorme é persistida como base64 sem limite.
- Imagens têm resize, compressão, orientação, limite, progresso e erro recuperável.
- Cache offline nunca cruza tenant.

### Qualidade

- Lint, testes Jest, build e E2E passam.
- Cada bug corrigido possui teste de regressão.
- Cada PR é pequeno, reversível e não inclui arquivos preexistentes não relacionados.
- Evidência final contém viewport, cenário, resultado e caminho do artefato.

---

## 5. Rollback e controle de risco

1. P0 em commit/PR separado para rollback independente.
2. Componentes compartilhados entram primeiro sem remover imediatamente o padrão antigo; migrar um módulo piloto e estabilizar.
3. `ResponsiveDataList` não altera APIs nem services.
4. Pipeline de imagem pode usar flag temporária de rollout, mas sem manter foto bruta offline como fallback inseguro.
5. Mudanças de navegação preservam guards atuais e têm testes de paridade de itens/permissões.
6. Alteração de service worker exige incremento de versão de cache e teste de atualização; nunca cachear API autenticada como solução rápida.
7. Antes de cada commit, conferir `git diff --name-only` para excluir `consents.seeder.ts`, `AiConsentModal.tsx`, `verify/page.tsx` e `verify/page.test.tsx`, salvo trabalho explicitamente aprovado nesses arquivos.

---

## 6. Definição de concluído do programa

O programa só está concluído quando:

- P0 RDO/PT está corrigido e retestado.
- Os 28 módulos identificados não dependem exclusivamente de tabela horizontal no mobile.
- Há um único contrato para espaço inferior e safe area.
- Navegação deriva de catálogo único com permissão/flag.
- Fotos usam pipeline único.
- Modais/drawers prioritários são acessíveis.
- Matriz offline corresponde ao comportamento real.
- A suíte E2E cobre todos os viewports definidos.
- Relatório de reteste compara cada achado original como `corrigido`, `mitigado`, `aceito` ou `pendente`, sempre com evidência.
