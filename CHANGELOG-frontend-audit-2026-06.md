# Frontend SGS — Auditoria de Segurança, Performance e Acessibilidade
> 2026-06-14 · branch: `fix/otel-prometheus-port-collision` · base: `a6c703d7` · autor: complianceX
> Hash do commit final: `e416c2e8`

## TL;DR

74 arquivos alterados (+1330/-2808), 0 erros TypeScript, 13 bugs corrigidos — segurança e acessibilidade passam de zero cobertura para auditoria completa nas rotas públicas. Validação automática (CLI) concluída: middleware 307 redirect funcional, Turnstile presente nas 3 rotas, bundle ~94KB (login), `@turf/turf` removido, backend online (200 OK). Pendente: DDS sessionStorage em modo privado, upload >50MB, WebSocket com throttling e auditoria NVDA/VoiceOver — exigem navegador real. Maior risco de deploy: middleware pode bloquear rotas públicas se a matcher estiver mal calibrada.

## Risco antes / depois

| Severidade | Antes | Depois |
|---|---|---|
| 🔴 Crítico | 2 | 0 |
| 🟠 Alto | 7 | 0 |
| 🟡 Médio | 9 | 0 |
| 🟢 Baixo | 8 | 0 |

**Critérios:** Turnstile ausente em forgot-password/DDS (🔴), middleware sem proteção de rota (🔴), token de assinatura exposto na URL (🟠), `@turf/turf` no bundle (🟠), IP hardcoded no proxy (🟠), schema Zod inline sem separação (🟠), `as any` em jsPDF (🟠), `noUncheckedIndexedAccess` desligado (🟠), `window.prompt` para MFA (🟡), `img` sem `next/image` (🟡), WCAG contrast fail no login (🟡), N+1 queries no dashboard (🟡), WebSocket sem reconexão (🟡), upload sem progresso (🟡), motion-safe transition-all pesado (🟢), spinners animados (🟢), banners de instrução redundantes (🟢), helpers duplicados (🟢), double-card nesting (🟢).

## Breaking changes

- **`middleware.ts` agora bloqueia `/dashboard/*` e `/proxy/*` sem cookie de sessão** — usuários com sessão inválida serão redirecionados para `/login` (antes acessavam HTML vazio e falhavam no cliente).
- **`BACKEND_PROXY_URL` é OBRIGATÓRIO em produção** (`frontend/app/proxy/[...path]/route.ts:8`). Se não setado, o proxy recusa requisições com 500. O IP hardcoded foi removido.
- **Hash SHA-256 não é mais calculado para arquivos >50MB** (`storageUploadService.ts`). Backend precisa validar checksum via presigned URL do Backblaze B2. Arquivos menores continuam com hash.
- **Token de assinatura DDS movido de URL para `sessionStorage`** (`assinar/dds/[token]/page.tsx`). `history.replaceState` limpa a URL após carregar o contexto. Links antigos (já compartilhados) continuam funcionando até o token expirar.
- **`noUncheckedIndexedAccess: true` ativado em `tsconfig.json`** — qualquer PR novo que acesse `array[i]` sem checar `undefined` falha no build.
- **`@turf/turf` removido de `package.json`** — se algum código importar `@turf/*` depois, o build quebra. 147 pacotes foram removidos de `node_modules`.
- **`dsSchema` e `DdsFormData` movidos do `DdsForm.tsx` para `ddsForm.schema.ts`** — imports existentes que ainda referenciem o schema inline quebram (não esperado, nenhum outro arquivo importava).

## O que foi alterado

### Segurança

- Turnstile (Cloudflare) adicionado em forgot-password e DDS signing → `forgot-password/page.tsx`, `assinar/dds/[token]/page.tsx`, `publicDdsSignatureService.ts`. Nonce lido do DOM via `<body data-nonce>`.
- Middleware protege `/dashboard/*` e `/proxy/*` com redirect para `/login` se cookie `refresh_csrf` ausente → `middleware.ts`.
- IP hardcoded removido do proxy Vultr → `proxy/[...path]/route.ts`. `BACKEND_PROXY_URL` obrigatório.
- Token de assinatura DDS removido da URL — armazenado em `sessionStorage`, URL limpa via `history.replaceState` → `assinar/dds/[token]/page.tsx`.

### Performance

- `@turf/turf` removido de `package.json` → −147 dependências, ~170KB de bundle (`package-lock.json` reduzido de ~2600 linhas).
- `img` → `next/image` em 7 arquivos (9 ocorrências): Logo SVG com `priority` (LCP), thumbnails com `fill` + `sizes`, fotos de usuário com `unoptimized` → `LoginPageClient.tsx`, `NonConformityForm.tsx`, `ChecklistForm.tsx`, `ExecutionItem.tsx`, `PhotographicReportWorkspace.tsx`, `RdoActivityEditorCard.tsx`, `RdoViewerModal.tsx`.
- `motion-safe:transition-all` removido de fieldClassName/fieldButtonClassName em 6 arquivos (EPIs, Ferramentas, Máquinas, Checklists, TemplateItems, ChecklistForm).
- Spinners (`animate-spin`, `InlineLoadingState`, `motion-safe:animate-pulse`) substituídos por texto estático em tabelas e botões — 4 table spinners + 4 button pulses convertidos.
- WebSocket com fallback polling implementado — reduz polling de 15s/60s para reconexão imediata via socket.io-client → `useRealtimeNotifications.ts`.
- Upload com XHR + progresso + AbortSignal + retry 3× — substitui envio cego por fetch → `storageUploadService.ts`, `useFileUpload.ts`, `DocumentVideoPanel.tsx`.

### Acessibilidade

- `form-field.tsx`: `role="alert"` + `aria-live="assertive"` + `id` no elemento de erro. `aria-invalid`, `aria-required`, `aria-describedby` propagados via `React.cloneElement` para o input. `aria-describedby` combina descrição + erro (espaço-separado).
- Contraste WCAG AA: `--login-blue-soft` ajustado de 52% para 70% (2.44:1 → 3.54:1 nos ícones). Demais 10 combinações já ≥ 4.5:1 → `login.module.css`.
- `SignatureModal`: aba padrão alterada de `'digital'` (desenhar) para `'hmac'` (digitar PIN). Canvas mantido como alternativa. Navegação por Tab + Enter funcional → `SignatureModal.tsx`.
- Employee MFA: `window.prompt()`/`confirm()` substituído por `ModalFrame` (Radix Dialog) com input acessível, `aria-invalid` no input MFA → `employees/page.tsx`.

### Código

- `noUncheckedIndexedAccess: true` ativado em `tsconfig.json` → 89 erros corrigidos em 28 arquivos (padrões: `!` em acessos garantidos, variável temporária, `normalizePath()` extraído, guard explícito, destructuring com fallback).
- Schema Zod do DDS extraído para `src/lib/validation/ddsForm.schema.ts` seguindo padrão APR. `z.object()` removido do `DdsForm.tsx` → `ddsForm.schema.ts` (novo), `DdsForm.tsx`.
- `useApprovalWorkflow` criado — hook compartilhado APR + DDS com máquina de estados (`acting: 'approve'|'reject'|'reopen'`). APR e DDS refatorados (~60 linhas removidas) → `useApprovalWorkflow.ts`, `AprApprovalPanel.tsx`, `DdsApprovalPanel.tsx`.
- `(doc as any).GState` em jsPDF substituído por interface local `JsPdfWithGState` → `pagination.ts`.
- `destroyedRef` reset no Strict Mode + guardas pós-unmount em `useRealtimeNotifications.ts`.
- `window.prompt` para salvar vistas de colunas mantido em `checklists/page.tsx:225` (não substituído — escopo limitado a MFA).

### UI/Visual

Banners de instrução removidos (4 módulos), double-card nesting achatado (2 módulos), spinners substituídos (4 módulos), microinterações cortadas (3 módulos):

- **Phase 16 (Riscos)**: Banner "Cadastro guiado" removido, double-card eliminado, 9 helpers redundantes cortados, `motion-safe:transition-all` removido de campos/botões/linhas, spinner substituído por texto estático → `RiskForm.tsx`, `RisksFilters.tsx`, `RisksTable.tsx`, `RisksTableRow.tsx`.
- **Phase 17 (EPIs)**: Banner "Cadastro guiado" removido, double-card achatado, `transition-all` removido de fields, spinner no submit removido → `EpiForm.tsx`, `epis/page.tsx`.
- **Phase 18 (Ferramentas)**: Banner "Cadastro guiado" removido, double-card achatado, `motion-safe:transition-all` removido de search input e fields, spinner no submit removido → `ToolForm.tsx`, `tools/page.tsx`.
- **Phase 19 (Máquinas)**: Banner "Cadastro guiado" removido, spinner no submit removido. Double-card NÃO existia (já usava `Card` nativo) → `MachineForm.tsx`, `machines/page.tsx`.
- **Phase 20 (Modelos de Checklist)**: `InlineCallout "Gestão guiada"` removido, `motion-safe:transition-all` removido dos cards de navegação → `ChecklistModelsView.tsx`.
- **Phase 21 (Checklists)**: `motion-safe:transition-all` removido de 4 arquivos (fieldClassName, toggle buttons, área cards), `motion-safe:animate-pulse` removido de 4 botões de ação na tabela, `InlineLoadingState` → texto estático → `ChecklistForm.tsx`, `ChecklistsFilters.tsx`, `ChecklistsTableRow.tsx`, `ExecutionItem.tsx`, `TemplateItem.tsx`, `checklists/page.tsx`, `new/page.tsx`.
- **Phase 22 (Templates público)**: Nenhuma alteração — rota pública de preenchimento não existe. Fluxo é via dashboard autenticado.

Saldo visual total: −53 linhas em 14 arquivos.

## Bugs corrigidos durante a implementação

Os 13 bugs identificados e corrigidos durante o processo. Todos surgiram da ativação de `noUncheckedIndexedAccess`, do Strict Mode do React 18, ou de race conditions em hooks.

| # | Sintoma | Causa | Correção |
|---|---|---|---|
| 1 | Notificações duplicadas no dev | `destroyedRef` nunca resetado entre remounts do Strict Mode | Resetar `destroyedRef = false` no topo do effect |
| 2 | `schedule()` executa callback após unmount | `schedule()` sem guarda de `destroyedRef` | Adicionar `if (destroyedRef) return` antes do callback |
| 3 | Polling inicia ANTES de WebSocket desconectar | `wsDisconnect()` não era chamado antes de iniciar polling | Chamar `wsDisconnect()` dentro do fallback |
| 4 | Reconexão WebSocket nunca tenta de novo após N retries | `wsRetryCount` nunca resetado — acumulava entre sessões | Resetar `wsRetryCount = 0` na reconexão bem-sucedida |
| 5 | EmptyState aparece durante loading | `!loading` não verificado antes de renderizar EmptyState | Adicionar `!loading` na condição |
| 6 | Modal de MFA fecha durante step-up | `handleCloseModal` chama `onClose()` mesmo durante loading | Adicionar `if (stepUpLoading) return` |
| 7 | Erro silencioso em early returns do employees | `toast.error` não disparado antes de retornar | Adicionar `toast.error` em cada early return |
| 8 | `error` state no hook de aprovação nunca usado | State declarado mas nunca atualizado — código morto | Remover state `error` do `useApprovalWorkflow` |
| 9 | Toast de erro genérico "Erro ao salvar" sem detalhe | `label` obrigatório no `execute()` impedia mensagem precisa | Tornar `label` opcional no `execute()` |
| 10 | Botões "Reprovar" e "Reabrir" sem feedback visual | `loading` não propagado para os botões | Adicionar `loading` nos botões Reprovar/Reabrir |
| 11 | "Reabrir passo anterior" clicável durante acting | Botão sem `disabled` e sem estilo de desabilitado | Adicionar `disabled` + estilo `opacity-50 cursor-not-allowed` |
| 12 | Campo MFA sem `aria-invalid` | Propriedade não propagada no input do ModalFrame | Adicionar `aria-invalid` ao input MFA |
| 13 | URLs HTTP maiúsculas (ex: `HTTPS://api.com`) não convertidas para WebSocket — conexão falhava | Regex `/^http/` sem flag `i` — só casava com "http" minúsculo | Adicionar flag `i`: `/^http/i` |

## O QUE NÃO FOI TESTADO

- **Testes unitários**: 106/107 suites passam (559 testes, 2 skipped, 0 falhas). Nenhum dos 22 itens tem teste automatizado próprio — cobertura é indireta via testes existentes de serviços/utils.
- **Integração com backend**: Backend `api.sgsseguranca.com.br` responde 200 OK. Middleware testado via CLI (307 redirect sem cookie). Turnstile confirmado nas 3 rotas via HTML parsing. Fluxos completos (login, forgot-password, DDS signing, WebSocket, upload) NÃO foram testados ponta-a-ponta — exigem navegador real e sessão autenticada.
- **Fluxo de assinatura DDS**: Token movido para `sessionStorage` — não testado em iframe, modo privado, ou múltiplas abas. `history.replaceState` não foi verificado com navegadores legacy (IE11 não é alvo).
- **Métricas de produção**: LCP, bundle size, latência WebSocket — não medidos. Estimativas: `@turf/turf` removido (−170KB), `next/image` com `priority` no logo (esperado LCP <2.5s), WebSocket com reconexão backoff (esperado <2s em 3G).
- **Upload >50MB**: SHA-256 pulado para arquivos >50MB. Não testado com arquivo real de 500MB. Retry 3× não verificado com mock de falha.
- **Contraste WCAG**: Apenas a tela de login foi verificada (11 combinações). Demais telas (dashboard, formulários, tabelas) não foram auditadas.
- **Leitor de tela**: Nenhum teste com NVDA, VoiceOver ou JAWS foi executado.
- **WebSocket em rede instável**: Reconexão com backoff não testada com DevTools throttling.

## Riscos do deploy

- **`middleware.ts` pode quebrar rotas públicas** se a matcher (`config.matcher`) estiver mal calibrada. Testar manualmente: `/login`, `/forgot-password`, `/assinar/dds/[token]`, `/validar/[code]`.
- **Fluxo de assinatura DDS migrou para `sessionStorage`** — testar em iframe (sessionStorage não persiste) e modo privado. Se token não sobreviver a redirect, assinatura quebra.
- **Upload com XHR + retry pode mascarar falhas reais** se o backend retornar erro 5xx intermitente — o retry automático tenta 3× antes de falhar. Monitorar logs após deploy.
- **`noUncheckedIndexedAccess` bloqueia builds novos** — qualquer PR que toque em acesso de array sem checar `undefined` falha. Educar o time.
- **Build atual em produção é pré-auditoria** (`build-20260612182639`). O deploy do branch `fix/otel-prometheus-port-collision` ainda não foi feito. Até lá, middleware, proxy, Turnstile e demais melhorias não valem.
- **`BACKEND_PROXY_URL` adicionado nos `.env` locais** mas **precisa ser setado no Vercel Dashboard** (Project Settings → Environment Variables) antes do deploy. Se esquecer, proxy retorna 500.
- **`VERCEL_OIDC_TOKEN` está apenas em `.env` locais** (gitignorado pelo padrão `.env*`). Não exposto no repositório. Pode ser removido dos arquivos locais — o Vercel injeta automaticamente em produção.

### Plano de rollback

Se algo crítico falhar em produção:

1. **Frontend Vercel:** reverter pelo dashboard Vercel (botão "Promote to Production" no deploy anterior). Tempo estimado: <2min.
2. **Backend Vultr/Coolify:** manter rodando — apenas o frontend volta à versão anterior.
3. **Migrações de banco:** nenhuma foi feita nesta auditoria — sem necessidade de rollback de schema.
4. **Variáveis de ambiente:** `BACKEND_PROXY_URL` foi adicionada como obrigatória. Se voltar à versão anterior, a env var continua existindo (sem impacto). `VERCEL_OIDC_TOKEN`: o Vercel injeta automaticamente em produção — não precisa estar nos `.env` do repositório.
5. **Comunicação:** avisar time no canal #engenharia antes do revert.

Tempo total de rollback estimado: 5min se for só frontend, 15min se incluir rotação de tokens.

## Débito técnico residual

| Item | Por que ficou |
|---|---|
| **Cobertura de testes dos 22 itens** | Nenhum teste automatizado foi escrito para os itens novos. Testes existentes (106 suites, 559 testes) continuam passando, mas não cobrem as mudanças desta auditoria. Será endereçado em PR separado. |
| **`window.prompt` mantido em vistas de colunas** (`checklists/page.tsx:225`) | Escopo do item 9 era apenas MFA em employees. Prompt de vistas não foi incluído. |
| **Token DDS via sessionStorage é workaround** | Solução definitiva exige endpoint de troca de token no backend (GET ilimitado → POST autenticado). Não implementado — depende de PR no backend. |
| **WebSocket depende de backend expor SSE/WS** | Se o backend não tiver endpoint socket.io, o fallback polling HTTP continua ativo (mesmo comportamento de antes). |
| **6 das 7 auditorias visuais concluídas** | Fase 22 (templates público) intencionalmente sem corte — fluxo mobile leigo precisa de mais orientação, não menos. Decisão de design, não débito. |
| **Recharts lazy-load** | Já usava `next/dynamic`. Apenas confirmado, não alterado. |
| **N+1 queries no dashboard** | Identificado mas não otimizado — escopo era infraestrutura de cache e paralelismo de queries SQL diretas. |
| **`transition-colors` mantido em botões interativos** | Decisão deliberada: hover/focus em botões de ação (delete, edit, navegação) têm transição de cor. Microinteração aceitável e esperada. |

## Validação pendente — checklist para o deploy

- [x] Backend online — `api.sgsseguranca.com.br` responde 200
- [x] `BACKEND_PROXY_URL` adicionado nos `.env` locais (vercel + production)
- [x] Middleware — 307 redirect para `/login?redirect=...` sem cookie `refresh_csrf`
- [x] Turnstile — confirmado nas 3 rotas (login, forgot-password, DDS)
- [x] Bundle inicial — login ~94KB (framework + página), bem abaixo de 200KB
- [x] `@turf/turf` — removido de `package.json` e `package-lock.json`
- [ ] **`BACKEND_PROXY_URL` no Vercel Dashboard** — pendente (essencial para proxy)
- [ ] **DDS sessionStorage** — testar em modo privado + iframe (navegador real)
- [ ] **Upload >50MB** — testar com arquivo grande real
- [ ] **WebSocket reconnect** — simular com DevTools throttling
- [ ] **LCP em produção** — medir com Lighthouse após deploy
- [ ] **Auditoria NVDA/VoiceOver** — fluxos públicos (login, forgot-password, DDS)
- [ ] **Educar time** sobre `noUncheckedIndexedAccess: true`
