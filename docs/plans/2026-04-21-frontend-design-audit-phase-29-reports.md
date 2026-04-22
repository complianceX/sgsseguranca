# Fase 29 - Auditoria Visual do Modulo Reports

Data: 2026-04-21
Escopo: central de relatorios, cards de resumo, fila PDF, historico de geracao, envios por e-mail e cards de relatorios mensais

## Superficies validadas

- `http://localhost:3000/dashboard/reports`
- `frontend/app/dashboard/reports/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/reports` abriu apenas o shell do app.
- O console do navegador continuou registrando erro real de runtime, vinculado ao problema atual de sessao/autenticacao.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. Este e um dos modulos visualmente mais densos do sistema inteiro

- Header com badges e acoes.
- Bloco de resumo com varios `SummaryCard`.
- Central da fila PDF.
- Central de envios por e-mail.
- Grade de relatorios com insight, metricas e acoes.
- Modal de envio.
- O resultado e uma central funcionalmente completa, mas visualmente excessiva.

### 2. O modulo mistura operacao, observabilidade e acervo na mesma tela

- Gera relatorio.
- Monitora fila.
- Monitora falha de job.
- Monitora envio de e-mail.
- Consulta relatorios historicos.
- Aciona impressao, download, email e AI.
- Isso e util, mas transforma a pagina em um centro multifuncional pesado demais.

### 3. Ha excesso de blocos com destaque ao mesmo tempo

- Badge de abertura.
- Summary cards.
- Badges de estado.
- Cards de fila.
- Cards de log.
- Cards de relatorio.
- Insight SGS destacado dentro de cada relatorio.
- Quase tudo tenta chamar atencao.

### 4. A grade final de relatorios tambem esta carregada demais

- Badge de periodo.
- Data.
- Titulo.
- Metricas em grid.
- Box de insight.
- Barra de acoes com icones.
- Excluir no topo.
- Cada card concentra conteudo, status e ferramentas demais.

### 5. O modulo ainda usa transicoes e loading animado em varios pontos

- `motion-safe:animate-spin` em loaders.
- `motion-safe:transition-colors` em links de SOPHIE e acoes.
- Hovers fortes em excluir e action icons.
- Para o padrao que voce quer, isso precisa ser reduzido.

## Problemas priorizados

### Prioridade alta

#### Problema: a tela junta funcoes demais em uma unica superficie

- Por que prejudica: aumenta fadiga visual, dificulta foco e transforma a pagina em cockpit operacional excessivo.
- Como deve ficar: uma central mais hierarquizada, com acervo principal em foco e operacao secundaria mais controlada.
- Sugestao pratica: rebaixar visualmente fila e logs, deixando historico de relatorios como eixo principal da pagina.

#### Problema: ha protagonismo excessivo de cards e badges ao longo de toda a tela

- Por que prejudica: o usuario perde nocao do que e leitura, do que e alerta e do que e acao.
- Como deve ficar: poucos destaques reais e mais neutro no restante.
- Sugestao pratica: reduzir SummaryCards, simplificar badges e neutralizar partes do card de relatorio que hoje parecem outro painel dentro do painel.

### Prioridade media

#### Problema: os cards de relatorio concentram informacao demais por item

- Por que prejudica: cada relatorio exige muita leitura e gera cansaco na varredura da grade.
- Como deve ficar: card mais seco, com titulo, periodo, metrica principal e acoes essenciais.
- Sugestao pratica: compactar o bloco `Insight SGS`, reduzir o numero de metricas expostas e diminuir a quantidade de icones fixos na barra inferior.

#### Problema: fila PDF e envios por e-mail recebem peso visual comparavel ao acervo principal

- Por que prejudica: o usuario entra para ver relatorios, mas encontra duas centrais paralelas de operacao antes do conteudo principal.
- Como deve ficar: monitoramento util, mas subordinado ao fluxo principal.
- Sugestao pratica: comprimir fila e e-mail em secoes colapsadas ou paineis mais discretos, com menos moldura e menor altura percebida.

#### Problema: o uso de AI como call to action visual forte aparece em varios pontos

- Por que prejudica: adiciona mais uma camada chamativa em uma tela ja saturada.
- Como deve ficar: acao disponivel, mas sem competir com a leitura base.
- Sugestao pratica: reduzir peso visual dos links `Analisar com SOPHIE` e limitar o destaque a casos realmente excepcionais.

### Prioridade baixa

#### Problema: loaders, hover e transicoes continuam presentes em excesso

- Por que prejudica: reforcam linguagem visual agitada num modulo que ja e pesado por natureza.
- Como deve ficar: respostas secas e estaticas.
- Sugestao pratica: remover `motion-safe:*` e revisar hovers de acoes para comportamento mais simples.

## Veredito da Fase 29

Reports e uma central poderosa, mas hoje esta tentando ser muitas telas ao mesmo tempo. O ganho real aqui esta em separar melhor acervo, operacao e observabilidade, com menos cor, menos moldura e menos protagonismo simultaneo de elementos concorrentes.
