# Fase 19 - Auditoria Visual do Modulo Machines

Data: 2026-04-21
Escopo: listagem, criacao, edicao e componentes centrais do modulo Machines

## Superficies validadas

- `http://localhost:3000/dashboard/machines`
- `frontend/app/dashboard/machines/page.tsx`
- `frontend/app/dashboard/machines/new/page.tsx`
- `frontend/app/dashboard/machines/edit/[id]/page.tsx`
- `frontend/components/MachineForm.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/machines` abriu o shell do app, mas a tela permaneceu presa no loading centralizado.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A captura local desta fase confirmou que a superficie autenticada nao chegou a renderizar integralmente.
- O fechamento visual foi feito por codigo real, pela leitura da listagem e do `MachineForm`, e pela evidencia observada do shell.

## Achados principais

### 1. Machines e o modulo mais consistente deste bloco em termos de primitives

- O formulario usa `Card`, `CardHeader`, `CardContent`, `FormField`, `Input`, `Select` e `Textarea`.
- Isso aproxima a tela de um contrato visual mais organizado e mais previsivel.
- Dentro deste bloco, e o modulo com melhor tentativa de padronizacao estrutural.

### 2. Mesmo assim, ainda sobra moldura e cerimonia

- O form continua usando `PageHeader`, `StatusPill`, bloco de `Cadastro guiado` e cards separados por secao.
- Isso e melhor resolvido aqui do que em `Tools` e `EPIs`.
- Mas ainda deixa o fluxo mais formal do que o necessario para um cadastro operacional.

### 3. A listagem segue o mesmo padrao de topo mais alto do que o essencial

- Metricas, busca e CTA aparecem antes da tabela.
- O layout e limpo e profissional.
- Porem, continua puxando a tela para um tom de painel quando poderia ser um inventario mais direto.

### 4. Acoes e estados ainda carregam residuos de hover e spinner

- Hover destacado na exclusao.
- Spinner animado no submit.
- Link de voltar com transicao visual.
- Isso reduz a sobriedade geral da interface.

### 5. O formulario esta melhor estruturado, mas ainda pode ficar mais seco

- O uso de `FormField` melhora muito a consistencia entre label, descricao e erro.
- Mesmo assim, ainda existem textos de apoio em quase todos os campos.
- A tela fica correta, mas um pouco mais falante do que o necessario.

## Problemas priorizados

### Prioridade media

#### Problema: o formulario ainda usa mais cerimonia do que a tarefa exige

- Por que prejudica: amplia o peso visual de um cadastro que deveria ser operacional e direto.
- Como deve ficar: mesma organizacao por grupos, mas com menos enquadramento e menos texto persistente.
- Sugestao pratica: manter a base de `Card` e `FormField`, mas reduzir `Cadastro guiado` e simplificar descricoes onde o campo ja se explica.

#### Problema: a listagem ainda se comporta mais como painel do que como inventario direto

- Por que prejudica: retarda a leitura da grade principal.
- Como deve ficar: tabela assumindo o protagonismo mais cedo, com metricas discretas.
- Sugestao pratica: condensar o topo para que busca e inventario fiquem mais imediatos.

### Prioridade baixa

#### Problema: residuos de hover, transicao e spinner permanecem no modulo

- Por que prejudica: mantem uma linguagem visual mais reativa do que o padrao simples e corporativo desejado.
- Como deve ficar: feedbacks estaveis, secos e menos chamativos.
- Sugestao pratica: endurecer hover das acoes, reduzir transicoes visiveis e trocar spinner animado por estado textual ou indicador fixo.

#### Problema: a validacao final da superficie segue mascarada pelo loading do shell

- Por que prejudica: impede confirmar acabamento real da experiencia autenticada.
- Como deve ficar: rota renderizando normalmente para revisao visual completa.
- Sugestao pratica: recuperar a conectividade do backend em `localhost:3011` antes da consolidacao final da auditoria.

## Veredito da Fase 19

Machines e o melhor modulo deste bloco em consistencia de primitives e organizacao do formulario. Mesmo assim, ainda compartilha o refinamento pendente do restante do frontend: menos cerimonia, menos texto persistente e menos motion. O caminho certo aqui nao e refazer a base, e sim endurecer o acabamento para deixá-lo mais seco, mais direto e mais corporativo.
