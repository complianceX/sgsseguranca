# Backend Conventions

## Estrutura oficial
```txt
backend/src/
  shared/
    api/
    auth/
    tenant/
    observability/
    cache/
    storage/
    database/
    errors/
    utils/
  modules/
    <domain>/
      api/
      application/
      domain/
      infrastructure/
```

## Regras
- `controller` nao acessa repository diretamente
- `use-case` trata comandos
- `query` trata leitura, dashboard, exportacao e relatórios
- `domain` nao depende de NestJS nem TypeORM
- `infrastructure` adapta banco, filas, storage e integracoes
- services tecnicos compartilhados devem viver em `shared`

## DTOs
- `Create<Entity>Dto`
- `Update<Entity>Dto`
- `List<Entity>QueryDto`
- `EntityResponseDto`
- `EntityListItemDto`

## Mapeamento
- controller recebe DTO
- mapper traduz DTO para comando ou query
- use case retorna resultado de aplicacao
- presenter ou mapper monta response DTO
