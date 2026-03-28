# APR / Listing / Desktop

Spec de tela para o SGS, pensada como fila operacional governada de APRs.

## Objetivo

A tela de listagem de APR deve responder, sem abrir o detalhe:

- o que exige atenção agora
- o que está vencendo ou já venceu
- o que está bloqueado
- quem é o responsável
- qual é a próxima ação operacional

Ela não deve parecer um CRUD genérico nem um grid administrativo neutro.

## Direção visual aplicada

- enterprise
- corporate minimal
- foco em operação, prioridade, vencimento, bloqueio e rastreabilidade
- sem gradientes
- sem card decorativo
- densidade controlada
- clareza de estado acima de ornamentação

## Frame base

- Nome: `APR / Listing / Desktop`
- Tamanho: `1440 x 1180`
- Grid: `12 cols`
- Margin: `32`
- Gutter: `24`
- Background: `color.bg.canvas`
- Largura útil do conteúdo: `1376`

## Estrutura da página

```text
Top Bar
Page Header
Listing Toolbar
Active Filters Strip
Table Container
Pagination Footer
```

## 1. Top Bar

Função: contexto global discreto.

### Anatomy

- breadcrumb leve: `SGS / APR`
- contexto atual: empresa / unidade / obra
- notificações
- avatar do usuário

### Specs

- Height: `64`
- Background: `color.bg.surface`
- Border bottom: `color.border.subtle`

## 2. Page Header

Função: abrir a tela com contexto e uma ação principal clara.

### Anatomy

- título: `APRs`
- subtítulo: `fila operacional de análises preliminares de risco com foco em pendências, vencimentos, bloqueios e rastreabilidade`
- CTA: `Nova APR`

### Layout

- alinhamento horizontal
- bloco textual à esquerda
- CTA única à direita

### Specs

- Height total: `104`
- Padding: `24 32 20 32`
- Título: `font.heading.sm`
- Subtítulo: `font.body.md`
- CTA: `Button / Primary / MD`

## 3. Listing Toolbar

Função: controlar busca, filtros, ordenação e leitura da fila.

### Anatomy

Linha principal:

- busca
- filtros rápidos: `Status`, `Obra`, `Responsável`, `Vencimento`
- botão `Mais filtros`
- `Ordenar por`
- `Confortável | Compacta`
- `Exportar`

### Wireframe

```text
[Buscar por número, título, obra ou responsável....................]
[Status] [Obra] [Responsável] [Vencimento] [Mais filtros]
                                              [Ordenar por ▼] [Confortável | Compacta] [Exportar]
```

### Specs

- Height: `72`
- Padding: `16 20`
- Background: `color.bg.surface`
- Border bottom: `color.border.subtle`
- Busca: `320w`
- Densidade: `168w`

### Regras

- manter filtros rápidos visíveis
- filtros avançados devem abrir em drawer
- ordenação padrão: `Prioridade operacional`
- densidade altera altura da linha, não a arquitetura da tabela

## 4. Active Filters Strip

Função: explicitar o recorte da listagem e permitir reversão rápida.

### Anatomy

- total de resultados
- chips de filtros ativos
- ação `Limpar filtros`

### Wireframe

```text
128 APRs encontradas
[Status: Pendente] [Vence em 7 dias] [Obra: Torre Norte]
                                                   [Limpar filtros]
```

### Specs

- Height: `52`
- Padding: `12 20`
- Background: `color.bg.surface-muted`
- Border bottom: `color.border.subtle`

## 5. Table Container

Função: núcleo da fila operacional.

### Specs

- Width: `1376`
- Background: `color.bg.surface`
- Border: `1px color.border.default`
- Radius: `radius.md`
- Shadow: `shadow.xs`
- Sticky header: `sim`

## 6. Colunas da tabela

| Coluna | Largura | Conteúdo |
|---|---:|---|
| Identificação | 240 | código + título |
| Contexto | 220 | obra/unidade + elaborador |
| Status | 140 | badge semântica |
| Responsável | 180 | owner principal + papel opcional |
| Prazo / Vencimento | 160 | data absoluta + leitura relativa |
| Bloqueio / Pendência | 220 | motivo operacional curto |
| Última atualização | 150 | data/hora da última alteração |
| Ações | 120 | 1 CTA + overflow |

## 7. Hierarquia de leitura

Ordem visual dentro da tabela:

1. status
2. vencimento relativo
3. bloqueio / pendência
4. identificação
5. responsável
6. última atualização

## 8. Anatomy da linha

### Identificação

- linha 1: código, por exemplo `APR-2026-014`
- linha 2: título, por exemplo `Montagem de estrutura metálica`

### Contexto

- linha 1: obra ou unidade, por exemplo `Torre Norte`
- linha 2: `Elaborador: Ana Silva`

### Status

Badge compacta e semântica:

- `Pendente`
- `Aprovada`
- `Encerrada`
- `Offline pendente`

### Responsável

- nome
- papel opcional

### Prazo / Vencimento

- data absoluta: `27/03/2026`
- relativo:
  - `vence hoje`
  - `vence em 2 dias`
  - `atrasada 2 dias`

### Bloqueio / Pendência

- `Assinatura pendente`
- `PDF final não emitido`
- `Sincronização com falha`
- `Sem bloqueios`

### Última atualização

- `Hoje, 10:42`
- `Ontem, 17:21`

### Ações

- no máximo 1 ação textual visível:
  - `Abrir`
  - `Emitir PDF`
  - `Sincronizar`
- restante em menu overflow

## 9. Estados da linha

### Comfortable

- Height: `76`

### Compact

- Height: `64`

### Estados funcionais

- `pending`
- `approved`
- `closed`
- `offline_failed`
- `expired`

## 10. Exemplo de linhas

```text
APR-2026-014 | Torre Norte / Ana Silva | [Pendente] | Carlos Mendes | 27/03/2026 / vence hoje | Assinatura pendente | Hoje, 10:42 | Abrir [...]

APR-2026-011 | Unidade Centro / Fernanda Rocha | [Aprovada] | Juliana TST | 29/03/2026 / vence em 2 dias | PDF final não emitido | Hoje, 09:18 | Emitir PDF [...]

APR-2026-006 | Torre Sul / Paulo Lima | [Offline pendente] | Camila Nunes | 25/03/2026 / atrasada 2 dias | Sincronização com falha | Ontem, 17:21 | Sincronizar [...]
```

## 11. Estados da página

### Loading

- skeleton da toolbar
- skeleton do header da tabela
- 8 linhas skeleton

### Empty sem dados

- título: `Nenhuma APR cadastrada`
- descrição: `Ainda não existem APRs neste contexto.`
- CTA: `Nova APR`

### Empty com filtros

- título: `Nenhuma APR encontrada`
- descrição: `Não há resultados para os filtros aplicados.`
- CTA: `Limpar filtros`

### Error

- título: `Não foi possível carregar as APRs`
- descrição: `Verifique a conexão ou tente novamente.`
- CTA: `Tentar novamente`

## 12. Paginação

### Anatomy

- esquerda: `Mostrando 1–20 de 128`
- centro: paginação `< 1 2 3 4 >`
- direita: `20 por página`

### Specs

- Height: `56`
- Padding: `12 20`
- Border top: `color.border.subtle`
- Background: `color.bg.surface`

## 13. Tokens a aplicar

- `color.bg.canvas`
- `color.bg.surface`
- `color.bg.surface-muted`
- `color.border.subtle`
- `color.border.default`
- `color.text.primary`
- `color.text.secondary`
- `font.heading.sm`
- `font.body.md`
- `font.body.sm`
- `font.label.md`

Estados:

- `status.pending` → warning
- `status.approved` → success
- `status.closed` → neutral-state
- `status.offline` → info
- `vencido` → danger
- `vence logo` → warning

## 14. Mapeamento com o frontend atual

Hoje a página de APR usa cards em grid em [page.tsx](/c:/Users/User/Documents/trae_projects/sgs-seguraca/frontend/app/dashboard/aprs/page.tsx) e o resumo de item em [AprCard.tsx](/c:/Users/User/Documents/trae_projects/sgs-seguraca/frontend/app/dashboard/aprs/components/AprCard.tsx). A busca/filtro atual está simplificada em [AprFilters.tsx](/c:/Users/User/Documents/trae_projects/sgs-seguraca/frontend/app/dashboard/aprs/components/AprFilters.tsx).

Para migrar ao padrão novo:

- substituir grid de cards por `Table / APR Listing`
- promover vencimento relativo, bloqueio e owner para o primeiro nível de leitura
- manter `AprCard` apenas como fallback para mobile / field mode, não para o desktop principal
- expandir toolbar para filtros rápidos e ordenação operacional

## 15. Erros a evitar

- tabela genérica de CRUD
- coluna demais sem prioridade
- status só por cor
- bloqueio escondido no overflow
- perda do código da APR
- excesso de ícones por linha
- toolbar alta demais
- visual de card dentro da tabela

## 16. Frame tree para Figma

```text
APR / Listing / Desktop
  Shell / Top Bar
  Page Header / Listing
  Toolbar / APR Listing
  Strip / Active Filters
  Table / APR Listing
    Table Header
    Row / APR / Comfortable / Pending
    Row / APR / Comfortable / Approved
    Row / APR / Comfortable / Offline Failed
  Pagination / Default
```

## 17. Próximo passo

Assim que o Figma MCP estiver disponível ou você enviar o link do arquivo, montar no Figma:

1. frame desktop
2. toolbar
3. table header
4. component set da linha APR
5. paginação

