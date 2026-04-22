# Fase 37 - Auditoria Visual do Modulo RDOs

Data: 2026-04-21
Escopo: listagem principal, filtros, resumo, callout, painel documental, modal multi-etapas, visualizacao detalhada, assinaturas, videos e envio

## Superficies validadas

- `http://localhost:3000/dashboard/rdos`
- `frontend/app/dashboard/rdos/page.tsx`

## Validacao visual real

- A navegacao automatizada para `/dashboard/rdos` abriu apenas o shell do app.
- A superficie autenticada nao chegou a renderizar integralmente no navegador nesta fase.
- O fechamento visual foi feito por leitura integral da tela real e pela evidencia observada do shell.

## Achados principais

### 1. Este e um dos modulos visualmente mais pesados do frontend inteiro

- Header com metricas.
- Filtros.
- Callout.
- Tabela.
- Painel de storage semanal.
- Modal multi-step enorme.
- Modal de visualizacao extremamente detalhado.
- Modal de assinatura.
- Modal de envio por e-mail.
- Painel de videos governados.
- O volume de camadas e muito alto.

### 2. A listagem ja nasce densa e ainda abre para um ecossistema inteiro de fluxos secundarios

- Criar e editar RDO.
- Visualizar completo.
- Imprimir.
- Emitir PDF final.
- Assinar.
- Enviar e-mail.
- Cancelar.
- Excluir.
- Alterar status.
- Isso transforma o modulo em um centro de produto inteiro dentro de uma pagina.

### 3. O modal multi-etapas e funcional, mas visualmente cansativo

- Sete steps.
- Muitos campos.
- Varios grupos dinamicos.
- Links de adicionar item.
- Acoes de remover.
- Navegacao entre etapas.
- O fluxo e poderoso, mas pede muito do operador em termos de concentracao visual.

### 4. A visualizacao detalhada tambem esta extremamente carregada

- Dados basicos.
- Mao de obra.
- Equipamentos.
- Materiais.
- Servicos executados.
- Ocorrencias.
- Observacoes.
- Programa para amanha.
- Assinaturas.
- Videos governados.
- Barra final de acoes.
- Isso praticamente duplica a complexidade do modulo em outra camada.

### 5. Ha excesso de hover, transicao e microefeitos espalhados por toda a superficie

- `motion-safe:animate-pulse` em skeleton.
- `motion-safe:transition-all` em inputs e barras.
- `motion-safe:transition-colors` em botoes, steps e modais.
- Muitos hovers de fundo, cor e underline.
- Para o padrao que voce quer, isso esta muito acima do necessario.

### 6. O modulo sofre de multiplicacao de protagonismo

- Muitos cards.
- Muitos modais.
- Muitos badges/status.
- Muitos botoes em barra.
- Muitos detalhes abertos ao mesmo tempo.
- Falta hierarquia mais dura entre o essencial e o complementar.

## Problemas priorizados

### Prioridade alta

#### Problema: o modulo concentra fluxo demais em uma unica superficie funcional

- Por que prejudica: aumenta fadiga, dificulta onboarding e reduz clareza operacional.
- Como deve ficar: fluxo mais modular, com menos coisas acontecendo ao mesmo tempo.
- Sugestao pratica: separar melhor listagem, edicao detalhada, visualizacao governada e assinatura, reduzindo o acoplamento visual atual.

#### Problema: o modal multi-etapas e a visualizacao detalhada sao densos demais

- Por que prejudica: exigem muito esforco visual e tornam a experiencia burocratica.
- Como deve ficar: passos mais secos, menos texto concorrente e menos detalhe simultaneo.
- Sugestao pratica: rebaixar elementos secundarios em cada etapa, enxugar a visualizacao e reduzir a quantidade de controles exibidos por tela.

#### Problema: ha excesso de acoes visiveis no modulo inteiro

- Por que prejudica: o usuario percebe mais comandos do que informacao principal.
- Como deve ficar: acoes mais bem agrupadas e hierarquizadas.
- Sugestao pratica: limitar botoes visiveis nas barras de listagem e visualizacao, movendo parte das operacoes para menus secundarios.

### Prioridade media

#### Problema: o painel documental e os videos governados aumentam demais o escopo visual da tela

- Por que prejudica: o modulo deixa de ser apenas RDO e vira tambem uma central documental paralela.
- Como deve ficar: documental como apoio, nao como novo centro de gravidade.
- Sugestao pratica: rebaixar o `StoredFilesPanel` e o `DocumentVideoPanel` para camadas mais discretas ou contextuais.

#### Problema: a tela tem muitos elementos destacados competindo entre si

- Por que prejudica: reduz conforto de leitura e faz tudo parecer igualmente importante.
- Como deve ficar: hierarquia visual mais dura entre dado principal, detalhe e excecao.
- Sugestao pratica: neutralizar parte dos destaques cromaticos e reduzir o numero de blocos com borda forte, fundo especial ou CTA visivel ao mesmo tempo.

### Prioridade baixa

#### Problema: hover, transition e pulse estao espalhados por quase todo o modulo

- Por que prejudica: reforcam a sensacao de interface agitada em uma tela que ja e naturalmente complexa.
- Como deve ficar: comportamento mais estavel, direto e corporativo.
- Sugestao pratica: remover `motion-safe:*`, reduzir hovers chamativos e eliminar animacoes perceptiveis dos componentes auxiliares.

## Veredito da Fase 37

RDOs e um dos modulos mais completos e tambem um dos mais visualmente pesados do sistema. O trabalho aqui nao e apenas polir detalhes: e reduzir acoplamento, modularizar melhor a experiencia e endurecer muito a hierarquia para que a tela pare de parecer varios produtos empilhados em um unico fluxo.
