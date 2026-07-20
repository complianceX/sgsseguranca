# ADR-003: API Result and Error Contracts

## Status
Aceito

## Contexto
O sistema precisa de respostas de API consistentes para:
- reduzir acoplamento do frontend
- padronizar logs
- permitir error mapping previsivel
- dar suporte a dashboards, auditoria e observabilidade

## Decisao
Toda resposta JSON de negocio deve seguir envelope padrao.

## Contrato de sucesso
```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-08T12:00:00.000Z"
  }
}
```

## Contrato de lista paginada
```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "lastPage": 6,
    "requestId": "uuid",
    "timestamp": "2026-03-08T12:00:00.000Z"
  }
}
```

## Contrato de erro
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados invalidos",
    "details": [],
    "fieldErrors": {
      "cpf": ["CPF invalido"]
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-08T12:00:00.000Z"
  }
}
```

## Error codes padrao
- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `TENANT_CONTEXT_REQUIRED`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `EXTERNAL_INTEGRATION_ERROR`
- `INTERNAL_ERROR`

## Excecoes
- `download`, `stream`, `health` e `webhook` podem ter contrato proprio.
- Mesmo sem envelope JSON, devem preservar logging e `requestId`.
