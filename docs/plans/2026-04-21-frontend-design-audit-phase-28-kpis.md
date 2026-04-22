# Fase 28 - Auditoria Visual do Modulo KPIs

Data: 2026-04-21
Escopo: painel de indicadores SST, cards de KPI, secoes de CAT, NC, acoes corretivas, treinamentos e graficos auxiliares

## Superficies validadas

- `http://localhost:3000/dashboard/kpis`
- `frontend/app/dashboard/kpis/page.tsx`
- `frontend/app/dashboard/kpis/components/KpiCharts.tsx`
- `frontend/app/dashboard/kpis/components/KpisVisualSections.tsx`

## Validacao visual real

- Na primeira tentativa, a navegacao automatizada para `/dashboard/kpis` nao fechou o carregamento em 60s.
- Na segunda tentativa, a rota abriu apenas o shell do app.
- O console do navegador continuou registrando erro real de runtime: `ERR_CONNECTION_REFUSED` em `http://localhost:3011/auth/csrf`.
- Tambem apareceram erros transientes de `ERR_CONNECTION_RESET` em assets do frontend durante a tentativa.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. O modulo esta mais organizado por secoes do que muitos outros, mas continua visualmente superpovoado

- Header com iconografia e badges.
- Secao de CAT com cards e tres graficos.
- Secao de NC.
- Secao de acoes corretivas com cards e grafico.
- Secao de treinamentos com cards, badges e grafico.
- A pagina fica longa e com muitos blocos repetindo o mesmo padrao de destaque.

### 2. Ha repeticao excessiva da linguagem de dashboard colorido

- `ds-kpi-card` aparece em varias secoes.
- Badges voltam no header e em treinamentos.
- Graficos entram sempre em cards destacados.
- Visualmente, a pagina se apoia demais na mesma formula de chamar atencao.

### 3. O header ja comeca com sinais visuais que pouco agregam

- O icone grande de `BarChart2` e as badges `Operacao`, `Acoes`, `Incidentes` reforcam tom de dashboard generico.
- Para um sistema empresarial mais limpo, isso parece camada decorativa e nao informacao essencial.

### 4. A secao de CAT e especialmente carregada

- Tres cards KPI.
- Dois graficos principais.
- Mais um grafico por tipo.
- Isso gera uma abertura longa e densa antes mesmo de chegar nas demais secoes do modulo.

### 5. As secoes seguintes mantem o mesmo peso visual e reduzem a sensacao de hierarquia

- NC, Acoes Corretivas e Treinamentos usam a mesma logica de card, titulo e grafico.
- O usuario percorre uma pagina inteira em que quase tudo tenta parecer igualmente importante.
- Falta uma hierarquia mais dura entre indicadores principais e detalhamento secundario.

### 6. O modulo ainda usa animacoes de loading desnecessarias

- A tela usa `motion-safe:animate-spin` no loading inicial.
- Os placeholders do carregamento dinamico usam `motion-safe:animate-pulse`.
- Para o padrao definido, isso deve ser simplificado.

## Problemas priorizados

### Prioridade alta

#### Problema: o modulo apresenta informacao demais com o mesmo peso visual

- Por que prejudica: tudo parece prioridade e a leitura executiva ou operacional perde foco.
- Como deve ficar: destaque maximo apenas para poucos indicadores-chave; o restante entra como aprofundamento.
- Sugestao pratica: reduzir a quantidade de cards fortes por secao e definir uma camada clara de KPI principal versus detalhamento.

#### Problema: a pagina usa repeticao excessiva de cards, badges e graficos destacados

- Por que prejudica: cria cansaco visual e faz o modulo parecer maior e mais complexo do que precisa.
- Como deve ficar: composicao mais economica, com menos redundancia de moldura e menos cor simultanea.
- Sugestao pratica: simplificar o header, neutralizar parte dos `ds-kpi-card` e eliminar badges que nao carregam decisao real.

### Prioridade media

#### Problema: a secao de CAT domina visualmente o inicio da pagina

- Por que prejudica: o modulo demora para distribuir a leitura e parece pesado logo na entrada.
- Como deve ficar: abertura mais compacta, com recorte inicial resumido e aprofundamento posterior.
- Sugestao pratica: condensar o bloco de CAT, priorizando um grafico principal e rebaixando os recortes secundarios.

#### Problema: as secoes seguem um padrao muito uniforme de destaque

- Por que prejudica: a pagina perde ritmo e hierarquia, porque tudo parece montado com a mesma importancia.
- Como deve ficar: secoes principais mais fortes e secoes auxiliares mais discretas.
- Sugestao pratica: variar menos por decoracao e mais por prioridade de conteudo, reduzindo molduras e peso visual das secoes secundarias.

#### Problema: o header usa elementos mais decorativos do que operacionais

- Por que prejudica: adiciona ruido antes do conteudo de valor real.
- Como deve ficar: titulo claro, subtitulo curto e contexto minimo.
- Sugestao pratica: remover badges de cabecalho e reduzir o protagonismo do icone grande da abertura.

### Prioridade baixa

#### Problema: o loading usa spinner e pulse desnecessarios

- Por que prejudica: introduz movimento visual em uma tela que ja tem densidade suficiente.
- Como deve ficar: skeletons estaticos e carregamento discreto.
- Sugestao pratica: substituir `motion-safe:animate-spin` e `motion-safe:animate-pulse` por placeholders estaticos.

## Veredito da Fase 28

KPIs e um modulo com boa organizacao semantica, mas ainda preso ao padrao de dashboard carregado e repetitivo. O ganho real aqui vem de secar a entrada, reduzir a repeticao de cards e diferenciar melhor o que e indicador principal do que e detalhamento secundario.
