# Frontend Visual/Usability Hardening Plan

> For Hermes: executar em lotes pequenos, priorizando consistência visual, legibilidade e simplicidade operacional. Sem adicionar animações.

Goal
- Deixar o SGS visualmente simples, profissional, padronizado e fácil de operar no dia a dia.

Architecture
- Consolidar uso obrigatório de componentes do design system (`components/ui/*` + `components/layout/*`), reduzir estilos locais ad hoc e remover ornamentação desnecessária de telas críticas.
- Aplicar em ondas: P0 (consistência mínima obrigatória), P1 (harmonização estrutural), P2 (escala e governança contínua).

Tech Stack
- Next.js 15, React 19, Tailwind utility classes + CSS tokens (`styles/tokens.css`, `styles/theme-*.css`), Jest/RTL.

---

## Escopo e critérios de aceite

Critérios obrigatórios
1) Sem animações novas e sem efeitos decorativos desnecessários.
2) Botões, campos e modais em telas novas/retrabalhadas devem usar primitives do DS.
3) Tipografia operacional mínima: 12px para metadado e 13px para corpo.
4) Header/listagem devem seguir layout padrão (`PageHeader`, `ListPageLayout`) nas páginas alvo de cada lote.
5) Contraste e legibilidade preservados em tema claro/escuro com tokens semânticos.

Fora de escopo imediato
- Redesenho completo de todas as 90+ páginas em uma única entrega.
- Reescrita funcional de regras de negócio.

---

## Fase P0 (urgente) — Consistência mínima visual

### Lote P0.1 — Modal de consentimento IA no padrão DS
Objective
- Eliminar inline styles e aparência desalinhada do `AiConsentModal`.

Files
- Modify: `frontend/components/AiConsentModal.tsx`
- Test: `frontend/components/AiConsentModal.test.tsx` (novo)

Tasks
1. Criar teste de interação do modal (cancelar/aceitar/erro).
2. Validar falha inicial (RED).
3. Reescrever modal usando `ModalFrame`, `ModalHeader`, `ModalBody`, `ModalFooter` e `Button`.
4. Remover todos `style={{...}}` do arquivo.
5. Rodar teste focal + lint do arquivo.

Definition of done
- `AiConsentModal.tsx` sem inline style.
- Mesmo comportamento funcional (aceite salva consentimento, erro exibe toast, dismiss funciona).

### Lote P0.2 — Login “flat enterprise”
Objective
- Reduzir poluição visual da tela de login mantendo usabilidade.

Files
- Modify: `frontend/app/(auth)/login/login.module.css`

Tasks
1. Remover glows/blob backgrounds e efeitos decorativos não funcionais.
2. Reduzir uso de blur e sombras excessivas.
3. Manter hierarquia visual (título, subtítulo, formulário, CTA).
4. Validar render da rota `/login` em dev.

Definition of done
- Login mais limpo, sem ornamentos pesados, mantendo contraste e foco nas ações.

### Lote P0.3 — Regras de adoção de componentes DS
Objective
- Evitar regressão de inconsistência visual.

Files
- Modify: `docs/consulta-rapida/frontend-operacional.md` (ou doc equivalente)

Tasks
1. Documentar regra objetiva: não usar `<button>/<input>/<select>/<textarea>` cru em telas novas quando houver primitive DS.
2. Incluir checklist de PR visual (5 itens curtos).

Definition of done
- Regra explícita para time e revisores.

---

## Fase P1 (curto prazo) — Harmonização estrutural

### Lote P1.1 — Layout padrão em páginas de maior tráfego
Targets iniciais
- `dashboard/page.tsx`
- `dashboard/rdos/page.tsx`
- `dashboard/aprs/new|edit`
- `dashboard/checklists/page.tsx`

Tasks
1. Migrar header e toolbar para `PageHeader`/`ListPageLayout`.
2. Normalizar botões para `Button`.
3. Normalizar tabela para `components/ui/table` quando aplicável.

### Lote P1.2 — Tipografia e densidade
Tasks
1. Reduzir tokens extremos (`text-[9px]`, `text-[10px]` em conteúdo operacional).
2. Reduzir uppercase/tracking em blocos extensos.
3. Padronizar respiros verticais em seções de formulário.

### Lote P1.3 — Modais/overlays
Tasks
1. Migrar overlays custom para `ModalFrame` (ou variante padronizada).
2. Uniformizar header/body/footer de modal.

---

## Fase P2 (estabilização) — Governança contínua

1) Checklist visual obrigatório em PR.
2) Triagem mensal de inconsistências (amostragem de telas críticas).
3) Backlog contínuo de conversão de páginas legadas para layout padrão.

---

## Sequência de execução recomendada

Sprint atual
- P0.1 + P0.2 + P0.3

Sprint seguinte
- P1.1 (4 páginas-alvo) + P1.2 parcial

Sprint posterior
- P1.3 + P2 baseline

---

## Métricas de sucesso

1) % páginas com `ListPageLayout` nos módulos alvo.
2) % botões via `components/ui/button` nas páginas alvo.
3) redução de ocorrências de `text-[9px]/text-[10px]` nas páginas alvo.
4) redução de `style={{...}}` em componentes de UI compartilhada.

---

## Riscos e mitigação

Risco
- Mudanças visuais em lote grande causarem regressão de layout.

Mitigação
- Entrega incremental por lote + validação focal (testes/lint + smoke manual de rotas).

Risco
- Conflito com refactors paralelos em telas grandes (APR/RDO).

Mitigação
- Começar por componentes compartilhados (modal/login/layout) e evitar alteração de regra de negócio.