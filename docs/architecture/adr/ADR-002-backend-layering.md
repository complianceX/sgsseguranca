# ADR-002: Backend Layering

## Status
Aceito

## Contexto
O backend atual ja possui boas capacidades operacionais e de seguranca, mas muitos modulos ainda seguem o formato:
- controller
- service grande
- repository TypeORM direto

Isso mistura:
- regra de negocio
- leitura analitica
- exportacao
- persistencia
- preocupacoes multi-tenant

## Decisao
Adotar camadas explicitas por dominio.

### Estrutura alvo
```txt
backend/src/modules/<domain>/
  api/
    controllers/
    dto/
    mappers/
  application/
    use-cases/
    queries/
    services/
  domain/
    entities/
    value-objects/
    enums/
    policies/
  infrastructure/
    persistence/
      repositories/
      typeorm/
    jobs/
    exports/
```

## Regras
- `controllers` recebem request, validam DTO e delegam.
- `use-cases` tratam comandos com efeito colateral.
- `queries` tratam leitura, busca, dashboard e exportacao.
- `domain` nao conhece NestJS nem TypeORM.
- `repositories` sao interfaces no dominio/aplicacao e implementacoes na infraestrutura.
- `services` tecnicos de apoio ficam em `shared`.

## Estrategia
- Nao migrar tudo de uma vez.
- Modulos novos seguem esse formato.
- Modulos existentes migram ao serem tocados.
