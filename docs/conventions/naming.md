# Naming Conventions

## Frontend
- componente: `PascalCase`
- hook: `use<Domain><Action|Query|State>`
- tela: `<Domain><Purpose>Screen`
- provider: `<Domain>Provider`
- schema: `<Domain><Purpose>Schema`
- mapper: `<Domain>Mapper`

## Backend
- controller: `<Domain>Controller`
- service tecnico: `<Purpose>Service`
- use case: `<Verb><Entity>UseCase`
- query: `<Verb><Entity>Query` ou `<Entity><Purpose>Query`
- repository interface: `<Entity>Repository`
- repository implementation: `TypeOrm<Entity>Repository`
- dto: `Create<Entity>Dto`, `Update<Entity>Dto`, `List<Entity>QueryDto`
- entity: `<Entity>`
- enum: `<Entity><Purpose>Enum`
- policy: `<Entity><Purpose>Policy`

## Sufixos proibidos
- `Helper` generico
- `Manager` sem responsabilidade clara
- `UtilService` para regra de negocio
- `DataService` quando for apenas repository disfarçado

## Regras de nomenclatura
- nome deve indicar papel, nao tecnologia
- se e leitura analitica, use `Query`
- se altera estado de negocio, use `UseCase`
- se so encapsula infraestrutura, use `Service`
