# Frontend Conventions

## Estrutura oficial
```txt
frontend/
  app/
    (auth)/
    (app)/
  components/
    ui/
    shared/
  modules/
    <domain>/
      api/
      components/
      hooks/
      model/
      schemas/
      screens/
      mappers/
  hooks/
  lib/
  providers/
  styles/
  types/
```

## Regras
- `page.tsx` apenas compoe a tela e conecta providers/guards.
- `modules/<domain>/screens` deve ser o ponto principal de montagem do dominio.
- `modules/<domain>/api` adapta chamadas HTTP e nao trata estado visual.
- `modules/<domain>/hooks` encapsula fetch, mutation e regras de interacao.
- `components/ui` so pode depender de `react`, `lib/utils` e tokens.
- `components/shared` pode conhecer shell, layout e composicao cross-domain.
- `lib` concentra `api`, `auth`, `tenant`, `query`, `format`, `telemetry`, `pdf`.

## Estados visuais obrigatorios por tela
- loading
- empty
- error
- success quando aplicavel

## Regras de pagina
- nenhuma pagina deve ter mais de uma responsabilidade principal
- telas complexas devem ser quebradas em `Screen`, `Section`, `Panel`
- tabelas e filtros devem ser reutilizaveis
