# ADR-005: Design System and UI State Contracts

## Status
Aceito

## Contexto
Existe base de UI no frontend, mas sem design system maduro. Isso gera inconsistencias de:
- cor
- espacamento
- estado de loading
- comportamento de erro
- acessibilidade

## Decisao
Criar design system oficial baseado em tokens e estados visuais obrigatorios.

## Tokens obrigatorios
- color: `primary`, `secondary`, `success`, `warning`, `danger`, `neutral`
- spacing: escala `4, 8, 12, 16, 24, 32, 48, 64`
- radius: `sm`, `md`, `lg`, `xl`
- shadow: `sm`, `md`, `lg`
- motion: `fast`, `base`, `slow`
- typography: `display`, `heading`, `body`, `caption`

## Componentes base obrigatorios
- `Button`
- `Input`
- `Select`
- `Textarea`
- `Checkbox`
- `Radio`
- `Card`
- `Badge`
- `Tabs`
- `Modal`
- `Drawer`
- `Toast`
- `DataTable`
- `Pagination`
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `PageHeader`
- `FilterBar`

## Estados visuais obrigatorios
- `loading`
- `empty`
- `error`
- `success`

## Regra de composicao
- componente de `ui` nao importa services nem dominio
- componente de dominio pode compor `ui`
- tema claro e escuro devem usar os mesmos tokens
