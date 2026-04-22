# Fase 7 - Auditoria Visual do Modulo PT

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Permissao de Trabalho

## Superficies validadas

- `http://localhost:3000/dashboard/pts`
- `http://localhost:3000/dashboard/pts/new`
- `frontend/app/dashboard/pts/page.tsx`
- `frontend/app/dashboard/pts/components/PtForm.tsx`
- `frontend/app/dashboard/pts/components/PtsFilters.tsx`
- `frontend/app/dashboard/pts/components/PtsTable.tsx`
- `frontend/app/dashboard/pts/components/PtsTableRow.tsx`
- `frontend/app/dashboard/pts/components/PtReadinessPanel.tsx`
- `frontend/app/dashboard/pts/new/page.tsx`
- `frontend/app/dashboard/pts/edit/[id]/page.tsx`

## Validacao visual real

- As rotas `/dashboard/pts` e `/dashboard/pts/new` responderam `200`.
- A leitura visual direta desta fase foi fechada principalmente por codigo, porque o shell autenticado continua caindo em loading centralizado nas capturas dessas areas protegidas.

## Achados principais

### 1. O PT e o modulo mais pesado de governanca entre os auditados ate agora

- O form concentra etapas, foco de aprovacao, paines de prontidao, historico de pre-liberação, regras de aprovacao, checklists mandatórios, integrações com APR e assinaturas.
- O resultado funcional e forte, mas visualmente a tela fica muito mais proxima de um sistema de compliance do que de uma operacao direta.

### 2. O formulario principal disputa atencao com paines laterais e blocos obrigatorios

- `PtForm.tsx` combina o corpo do preenchimento com readiness panel, checklist obrigatório, pre-liberação, aprovações e observabilidade de bloqueios.
- Isso prejudica a leitura sequencial: o usuario deixa de perceber facilmente o que e preenchimento base, o que e verificacao e o que e governanca final.

### 3. A listagem tambem tende a excesso de camada operacional

- Os componentes `PtsFilters`, `PtsTable` e `PtsTableRow` reúnem busca, filtro, insights, pré-liberação, reprovação, encerramento, assinatura e PDF.
- A tela fica poderosa, mas visualmente pesada para uso cotidiano.

### 4. A linguagem visual do PT esta corporativa, mas ainda pouco enxuta

- O problema nao e falta de padrao.
- O problema e concentracao demais de ferramentas, badges, blocos explicativos e estados obrigatorios no mesmo plano.
- Em termos visuais, o modulo pede mais hierarquia e menos simultaneidade.

### 5. Existem residuos claros de motion e transicao

- O PT ainda usa varios estados guiados e superficies interativas com foco em movimento e destaque.
- Isso se soma a um modulo que ja e denso por natureza.
- No conjunto, a tela fica mais cansativa do que precisa.

## Problemas priorizados

### Prioridade alta

#### Problema: o PT mistura preenchimento, verificação e aprovação no mesmo nível visual

- Por que prejudica: o usuário perde clareza sobre a tarefa principal de cada momento.
- Como deve ficar: preenchimento como eixo principal; verificação e aprovação como camadas secundárias e progressivas.
- Sugestao pratica: rebaixar visualmente os painéis laterais e concentrar o foco inicial no formulário base, deixando bloqueios e readiness mais discretos até a etapa final.

#### Problema: checklists mandatórios e blocos de governança pesam demais no fluxo

- Por que prejudica: a tela entra em tom burocrático muito cedo e reduz a sensação de controle operacional.
- Como deve ficar: checklists obrigatórios sim, mas com organização mais limpa e previsível.
- Sugestao pratica: agrupar checklists por prioridade real, reduzir textos longos repetitivos e evitar que todos os grupos tenham o mesmo peso de card e descrição.

#### Problema: o módulo exige muita leitura paralela

- Por que prejudica: o usuário precisa cruzar vários blocos para entender se a PT está pronta.
- Como deve ficar: um caminho claro de “preencher, validar, aprovar”.
- Sugestao pratica: reforçar a progressão entre etapas e reduzir sinais simultâneos de status, bloqueio e pendência fora da etapa atual.

### Prioridade media

#### Problema: a listagem do PT é funcionalmente rica, mas visualmente carregada

- Por que prejudica: filtros, insights, ações e status tornam o primeiro contato mais lento.
- Como deve ficar: listagem com foco em identificar PT, status, obra, responsável e próxima ação.
- Sugestao pratica: esconder parte das funções avançadas atrás de ações contextuais e diminuir o número de elementos visíveis por linha.

#### Problema: painéis como `PtReadinessPanel`, `PtApprovalRulesPanel` e `PtPreApprovalHistoryPanel` elevam muito a massa visual

- Por que prejudica: todos parecem igualmente urgentes.
- Como deve ficar: alguns desses blocos devem ser apoio, não protagonistas.
- Sugestao pratica: usar uma hierarquia mais rígida entre painel crítico, painel informativo e histórico.

### Prioridade baixa

#### Problema: estados de loading de `new` e `edit` ainda usam fallback genérico

- Por que prejudica: não comunicam a estrutura real do módulo.
- Como deve ficar: skeleton coerente com a malha do PT.
- Sugestao pratica: trocar os cards textuais por placeholders alinhados à estrutura de etapas.

#### Problema: resíduos de motion permanecem em um módulo já muito denso

- Por que prejudica: amplificam a sensação de excesso.
- Como deve ficar: foco e mudança de estado claros, mas estáticos.
- Sugestao pratica: remover animações e transições residuais das áreas de etapa, checklist, tabela e ações de linha.

## Veredito da Fase 7

O PT está forte em governança e cobertura operacional, mas visualmente ainda sofre de excesso de camadas. Até aqui, ele é o módulo com maior risco de parecer burocrático e pesado demais para uso diário. O caminho certo não é empobrecer o fluxo, e sim endurecer a hierarquia: destacar o que é preenchimento, rebaixar o que é auditoria e organizar a aprovação como etapa final, não como ruído permanente.
