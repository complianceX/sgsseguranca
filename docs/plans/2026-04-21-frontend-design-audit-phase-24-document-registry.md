# Fase 24 - Auditoria Visual do Modulo Document Registry

Data: 2026-04-21
Escopo: listagem do indice central, filtros por empresa/semana/modulo, resumo operacional e tabela consolidada

## Superficies validadas

- `http://localhost:3000/dashboard/document-registry`
- `frontend/app/dashboard/document-registry/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/document-registry` abriu apenas o shell do app.
- O console registrou erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo tem boa intencao operacional, mas a toolbar esta densa demais

- A mesma faixa reune busca de empresa, seletor de empresa, ano, semana ISO, busca textual, atalhos de semana, filtros por modulo e atualizacao.
- Tudo e util.
- Mas o conjunto ja nasce pesado, principalmente para uma tela que deveria funcionar como indice limpo e rapido.

### 2. O filtro de modulos em chips clicaveis aumenta ruido visual

- Os modulos aparecem como varios botoes independentes, com estados ativos e hover.
- Isso cria leitura fragmentada e superficie muito "picotada".
- Para um sistema empresarial, a sensacao fica mais proxima de painel analitico do que de listagem administrativa.

### 3. O resumo operacional acima da tabela reforca mais densidade do que clareza

- Ha metricas no header da pagina.
- Depois ha o bloco `Pacote operacional ativo`.
- Depois entram badges com contagem por modulo.
- O usuario recebe muitos resumos antes de chegar na informacao principal, que e a tabela.

### 4. Existe detalhe decorativo desnecessario para o contexto da tela

- O uso de `Sparkles` no resumo semanal nao agrega valor operacional.
- Para o padrao que voce quer, e um icone com leitura mais promocional do que corporativa.

### 5. A tabela esta mais limpa do que a media do sistema, mas a entrada para ela ainda e burocratica

- A grade principal em si e objetiva.
- O problema maior esta antes dela, no volume de filtros e estados auxiliares.
- O modulo pode ficar mais profissional sem alterar a funcao central da tabela.

## Problemas priorizados

### Prioridade alta

#### Problema: a barra de filtros concentra informacao demais e parece uma subinterface

- Por que prejudica: o usuario precisa decodificar muitos campos antes de enxergar o indice documental.
- Como deve ficar: filtros principais em primeiro plano e ajustes secundarios mais discretos.
- Sugestao pratica: priorizar empresa, periodo e busca textual; rebaixar atalhos de semana, atualizacao manual e selecao de modulos para uma linha secundaria menos protagonista.

#### Problema: o filtro por modulos em varios chips polui visualmente a tela

- Por que prejudica: cria excesso de pequenas superficies clicaveis e reduz a sensacao de ordem.
- Como deve ficar: um controle mais compacto e menos fragmentado.
- Sugestao pratica: substituir os chips por um seletor multiplo simples, menu de filtros ou agrupamento colapsavel de modulos.

### Prioridade media

#### Problema: existe resumo demais antes da tabela principal

- Por que prejudica: o usuario recebe metricas, status do pacote e badges antes de ver os registros.
- Como deve ficar: resumo enxuto, com foco em contexto minimo e nao em camadas sucessivas de sintese.
- Sugestao pratica: manter apenas um bloco curto de contexto ativo e remover contagens redundantes quando a propria tabela ja responde isso.

#### Problema: ha sinal decorativo que destoa da proposta corporativa simples

- Por que prejudica: pequenos detalhes "de efeito" reforcam sensacao de interface menos sobria.
- Como deve ficar: icones apenas quando comunicarem funcao ou status operacional.
- Sugestao pratica: remover `Sparkles` e qualquer badge meramente decorativa desse modulo.

#### Problema: os inputs compartilham o mesmo peso visual independentemente da importancia

- Por que prejudica: ano, semana, busca textual, empresa e modulo competem no mesmo nivel.
- Como deve ficar: hierarquia mais evidente entre filtro principal e filtro auxiliar.
- Sugestao pratica: aumentar a leitura do filtro principal e reduzir peso de campos de recorte secundario com agrupamento visual mais rigido.

### Prioridade baixa

#### Problema: ainda ha transicoes de hover e destaque em filtros e chips

- Por que prejudica: adiciona movimento visual onde bastaria resposta estatica.
- Como deve ficar: clique seco, sem sensacao de microinteracao.
- Sugestao pratica: remover `motion-safe:transition-all`, `motion-safe:transition-colors` e diminuir dependencia de hover nos chips e inputs desta tela.

## Veredito da Fase 24

Document Registry ja tem uma base mais limpa do que muitos modulos do sistema, mas ainda sofre por excesso de toolbar e resumo operacional redundante. O melhor caminho aqui e simples: reduzir a burocracia visual antes da tabela, compactar a selecao de modulos e deixar o indice central assumir o protagonismo real da pagina.
