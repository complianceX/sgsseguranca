# Fase 21 - Auditoria Visual do Modulo Checklists

Data: 2026-04-21
Escopo: listagem principal, filtros, insights, tabela, formulario, preenchimento e superficies centrais do modulo Checklists

## Superficies validadas

- `http://localhost:3000/dashboard/checklists`
- `frontend/app/dashboard/checklists/page.tsx`
- `frontend/app/dashboard/checklists/new/page.tsx`
- `frontend/app/dashboard/checklists/edit/[id]/page.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistForm.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistInsights.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistsFilters.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistsTable.tsx`
- `frontend/app/dashboard/checklists/components/ChecklistsTableRow.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/checklists` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por leitura integral do codigo real e pela evidencia observada do shell.

## Achados principais

### 1. Checklists e uma das superfícies mais densas do frontend inteiro

- A listagem reúne hero em `Card`, grade de segmentos, insights, callout de atenção, filtros avançados, vistas salvas, seleção em massa, tabela, arquivos salvos e modal de e-mail.
- O formulário é ainda mais pesado: estrutura em múltiplos modos, tópicos, itens, subitens, fotos, assinaturas, IA, impressão, envio e finalização.
- Funcionalmente é forte.
- Visualmente é uma superfície de alta carga cognitiva.

### 2. A listagem mistura operação, análise e configuração em um único fluxo

- O usuário encontra, na mesma tela, segmentação de área, indicadores, filtros, gestão de colunas, gestão de vistas, ações em massa e governança documental.
- Isso torna a página poderosa.
- Mas também aproxima a tela de um cockpit em vez de um fluxo administrativo limpo.

### 3. O `ChecklistForm` concentra peso visual e funcional em excesso

- Há muitos controles, muitos modos e muitos estados coexistindo.
- O formulário não parece uma única tarefa; parece um sistema inteiro dentro da página.
- A combinação de `StatusPill`, toggles, painéis, botões de contexto, mídia, assinaturas e IA amplia muito a massa visual.

### 4. A faixa de filtros ja e praticamente uma subinterface própria

- `ChecklistsFilters` agrega busca, filtro por tipo, configuração de colunas, exportação, vistas salvas e controles de reset/exclusão.
- Isso ultrapassa o papel de uma toolbar simples.
- Visualmente, a faixa vira uma camada de produto inteira antes da tabela.

### 5. A tabela tambem e mais carregada do que a média

- Seleção por checkbox, colunas variáveis, status em pill, múltiplas ações por linha e estado de template.
- O resultado é rico, mas com forte concorrência visual entre conteúdo e ações.

### 6. Ha muitos residuos de motion, hover e microestados reativos

- Cards de segmento com `motion-safe:transition-all`.
- Skeleton do `StoredFilesPanel` com `animate-pulse`.
- Ações de linha com `motion-safe:animate-pulse`.
- Vários botões e toggles com hover e transição destacados.
- Para o padrão que você quer, isso está acima do necessário.

## Problemas priorizados

### Prioridade alta

#### Problema: a listagem mistura contexto demais antes da área principal de trabalho

- Por que prejudica: o usuário precisa atravessar várias camadas para chegar ao que realmente quer fazer.
- Como deve ficar: uma hierarquia mais dura entre navegação, leitura operacional e configuração da tela.
- Sugestao pratica: rebaixar visualmente segmentos, insights e alertas, deixando a faixa de filtro e a tabela como eixo principal da página.

#### Problema: o `ChecklistForm` esta visualmente saturado

- Por que prejudica: aumenta fadiga visual, reduz clareza de progresso e torna o preenchimento mais burocrático do que precisa ser.
- Como deve ficar: um fluxo mais sequencial, com agrupamentos mais rígidos e menos elementos competindo ao mesmo tempo.
- Sugestao pratica: separar melhor contexto, estrutura do checklist, evidências e finalização, reduzindo a simultaneidade visual entre esses blocos.

#### Problema: a faixa de filtros funciona como uma segunda interface inteira

- Por que prejudica: a toolbar vira outra tela dentro da tela, especialmente com vistas salvas, colunas e exportação.
- Como deve ficar: filtro principal simples à frente; customizações avançadas como camada secundária e menos protagonista.
- Sugestao pratica: rebaixar o peso visual de `Colunas` e `Vistas`, deixando essas funções como utilitários mais discretos.

### Prioridade media

#### Problema: a tabela e as ações por linha estão carregadas demais

- Por que prejudica: conteúdo, status e ações competem no mesmo plano e a leitura perde conforto.
- Como deve ficar: linha mais focada em status e identificação, com ações secundárias menos agressivas.
- Sugestao pratica: reduzir o protagonismo visual dos botões de linha e rever o acúmulo de ícones e estados por registro.

#### Problema: o módulo usa muitos textos, badges e microestados de apoio

- Por que prejudica: a interface parece permanentemente explicando tudo ao mesmo tempo.
- Como deve ficar: apoio textual apenas onde houver ambiguidade real, não como camada contínua do fluxo.
- Sugestao pratica: revisar callouts, descrições, pills e mensagens persistentes para deixar apenas o que for realmente crítico.

### Prioridade baixa

#### Problema: residuos de motion, hover e pulse continuam espalhados pelo modulo

- Por que prejudica: ampliam a sensação de “superfície ativa” em uma tela que já é naturalmente pesada.
- Como deve ficar: interações mais estáveis, com menos variação visual e sem animação perceptível.
- Sugestao pratica: remover `motion-safe:*`, `animate-pulse` e outros feedbacks animados de cards, skeletons e ações de tabela.

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: o carregamento não antecipa a estrutura real do formulário.
- Como deve ficar: skeleton coerente com a malha do `ChecklistForm`.
- Sugestao pratica: trocar os cards textuais por placeholders alinhados ao fluxo de checklist.

## Veredito da Fase 21

Checklists e, junto com PT e APR, uma das superfícies mais pesadas do frontend. O problema não é falta de capacidade funcional; é excesso de camadas visuais e concorrência de elementos. O caminho certo aqui é endurecer radicalmente a hierarquia, reduzir simultaneidade e transformar a tela em um fluxo mais legível e mais operacional.
