# Fase 36 - Auditoria Visual do Modulo Service Orders

Data: 2026-04-21
Escopo: listagem principal, filtros, metricas, modal de criacao/edicao e mudanca de status das ordens de servico

## Superficies validadas

- `http://localhost:3000/dashboard/service-orders`
- `frontend/app/dashboard/service-orders/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/service-orders` abriu apenas o shell do app.
- O console do navegador continuou sinalizando erro de runtime ligado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo esta mais organizado do que varios outros, mas ainda com densidade acumulada

- Header com metricas.
- Filtros por status e obra.
- Tabela com status editavel.
- Modal grande para criacao e edicao.
- A base e boa, mas ainda existe carga visual acima do ideal.

### 2. As metricas do topo podem ser mais contidas

- Total.
- Ativas.
- Concluidas.
- Canceladas.
- Para uma listagem administrativa, esse topo pode ser mais leve e menos protagonista.

### 3. A coluna de status mistura leitura e controle

- `StatusPill` para leitura.
- `StatusSelect` para transicao.
- Isso e funcional.
- Mas visualmente quebra a linha e adiciona outro microfluxo dentro da tabela.

### 4. O modal de OS e muito extenso e tecnicamente verboso

- Campos operacionais.
- Datas.
- Responsabilidades.
- JSON de riscos.
- JSON de EPIs.
- A estrutura entrega poder, mas puxa a experiencia para algo mais tecnico do que corporativo.

### 5. A tabela em si esta mais limpa do que a media

- Acoes por linha sao apenas editar e excluir.
- Isso e positivo.
- O principal ponto fraco da listagem esta mais na hierarquia do topo e no peso do modal.

### 6. Ainda ha hover e transicoes desnecessarias

- Inputs usam `motion-safe:transition-all`.
- Excluir usa hover forte.
- Isso foge do padrao mais estavel que voce quer.

## Problemas priorizados

### Prioridade media

#### Problema: a coluna de status mistura demais leitura e interacao

- Por que prejudica: a tabela fica mais parecida com planilha editavel e menos com listagem limpa.
- Como deve ficar: leitura mais simples, com alteracao menos intrusiva.
- Sugestao pratica: reduzir o peso do `StatusSelect` ou deslocar a mudanca de status para acao secundaria.

#### Problema: o modal de criacao/edicao esta pesado e tecnico demais

- Por que prejudica: aumenta a sensacao de complexidade e exige muito esforco visual em um unico fluxo.
- Como deve ficar: formulario mais progressivo e menos verboso.
- Sugestao pratica: reestruturar o modal em grupos mais claros e reduzir a exposicao imediata de campos JSON tecnicos.

#### Problema: as metricas do topo ainda podem ser menos protagonistas

- Por que prejudica: criam mais uma camada de destaque antes da tabela, sem necessidade critica.
- Como deve ficar: abertura mais discreta e mais orientada a base operacional.
- Sugestao pratica: rebaixar visualmente as metricas ou condensa-las em resumo mais curto.

### Prioridade baixa

#### Problema: permanecem transicoes e hover fortes em pontos localizados

- Por que prejudica: adicionam ruido sem ganho real de usabilidade.
- Como deve ficar: interacao mais seca, com menos variacao visual.
- Sugestao pratica: remover `motion-safe:*` dos campos e reduzir hovers de acoes destrutivas e secundarias.

## Veredito da Fase 36

Service Orders esta entre os modulos mais equilibrados da auditoria ate aqui. O que precisa melhorar nao e a estrutura principal da listagem, e sim a sobriedade do topo e a simplificacao do modal, especialmente no tratamento dos campos tecnicos.
