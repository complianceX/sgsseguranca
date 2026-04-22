# Fase 17 - Auditoria Visual do Modulo EPIs

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo EPIs

## Superficies validadas

- `http://localhost:3000/dashboard/epis`
- `frontend/app/dashboard/epis/page.tsx`
- `frontend/app/dashboard/epis/new/page.tsx`
- `frontend/app/dashboard/epis/edit/[id]/page.tsx`
- `frontend/components/EpiForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/epis` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura da listagem e do `EpiForm`, e pela evidencia observada do shell.

## Achados principais

### 1. EPIs e o modulo mais fora do padrao do bloco atual

- A listagem nao usa `ListPageLayout`.
- Em vez disso, monta a tela com `panelClassName`, header manual, `Badge`, `Input` e seções próprias.
- O resultado nao e necessariamente ruim.
- Mas quebra a consistencia do shell visual adotado no restante dos modulos.

### 2. A listagem mistura visual de painel manual com padrao corporativo parcialmente reaproveitado

- O topo usa um card com `Badge` de total e CTA.
- A faixa de busca tambem e montada manualmente dentro de um segundo painel.
- Isso cria uma experiencia um pouco diferente do restante da plataforma.
- Visualmente, a tela parece mais "ilha" do que parte de um sistema uniforme.

### 3. O formulario repete o pacote de cadastro pesado ja visto em outros modulos

- `EpiForm.tsx` usa `PageHeader`, `StatusPill`, bloco de `Cadastro guiado`, cards internos por secao, helpers persistentes e rodape com spinner.
- Para um cadastro simples de equipamento e CA, sobra moldura.
- A tela comunica mais cerimonia do que a tarefa exige.

### 4. O modulo traz boa objetividade de dominio, mas com muito acabamento visual concorrente

- Campos como empresa, nome, CA, validade e descricao sao claros.
- Mesmo assim, a interface adiciona bastante texto auxiliar e varias camadas visuais.
- Em uso recorrente, isso torna o fluxo menos rapido do que poderia ser.

### 5. Ha residuos claros de motion e hover

- Spinner animado na tabela.
- Hover com transicao nas acoes de editar e excluir.
- `transition-all` e spinner animado no submit do formulario.
- Isso deixa a linguagem visual mais reativa do que o padrao seco desejado.

## Problemas priorizados

### Prioridade alta

#### Problema: o modulo foge do shell visual padrao do frontend

- Por que prejudica: quebra consistencia entre telas administrativas e enfraquece a sensacao de sistema unificado.
- Como deve ficar: EPIs alinhado ao contrato visual de `ListPageLayout`, toolbar e blocos do design system global.
- Sugestao pratica: aproximar `epis/page.tsx` do shell usado em `Activities`, `Tools`, `Machines` e outros modulos de cadastro.

### Prioridade media

#### Problema: o formulario de EPI usa moldura demais para um cadastro simples

- Por que prejudica: aumenta o peso visual e faz o fluxo parecer mais complexo do que realmente e.
- Como deve ficar: header mais curto, menos apoio visual persistente e secoes mais compactas.
- Sugestao pratica: reduzir `Cadastro guiado`, encurtar helpers e simplificar o rodape de acoes.

#### Problema: a listagem parece um painel isolado em vez de uma tela padronizada do sistema

- Por que prejudica: a experiencia visual muda mais do que deveria ao trocar de modulo.
- Como deve ficar: a informacao principal deve aparecer em uma estrutura familiar ao usuario do restante do dashboard.
- Sugestao pratica: harmonizar header, busca, totalizador e tabela com o restante do ecossistema de listagens.

### Prioridade baixa

#### Problema: residuos de motion, hover e spinner permanecem espalhados no modulo

- Por que prejudica: reforcam uma interface mais decorada do que o padrao corporativo simples desejado.
- Como deve ficar: estados visuais mais estaveis e menos chamativos.
- Sugestao pratica: remover `transition-all`, endurecer hover das acoes e trocar spinner animado por feedback estatico.

#### Problema: loading de `new` e `edit` ainda e generico

- Por que prejudica: o carregamento nao antecipa a estrutura final do formulario.
- Como deve ficar: skeleton coerente com header e grupos principais do cadastro.
- Sugestao pratica: substituir o card textual por placeholder alinhado ao `EpiForm`.

## Veredito da Fase 17

EPIs nao e o modulo mais poluido da base, mas e um dos mais inconsistentes em relacao ao shell visual do sistema. O ajuste prioritario aqui e duplo: alinhar a listagem ao padrao global e secar o formulario para que o modulo fique mais uniforme, mais simples e mais profissional.
