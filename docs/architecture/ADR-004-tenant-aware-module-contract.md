# ADR-004: Tenant-Aware Module Contract

## Status
Aceito

## Contexto
O `Compliance X` e um SaaS multi-tenant. O contexto de tenant ja existe no backend, mas o padrao precisa ser institucionalizado por modulo.

## Decisao
Todo modulo tenant-aware deve seguir o mesmo contrato tecnico.

## Contrato minimo
- entidade com `company_id` obrigatorio
- relacionamento com `Company`
- indice por `company_id`
- DTO nao aceita `company_id` do client
- `company_id` preenchido pelo backend via tenant context
- repository ou query sempre tenant-scoped
- cache keys incluem tenant
- jobs e eventos propagam `companyId`
- storage usa prefixo de tenant
- logs e auditoria incluem `companyId`

## Regras para super-admin
- em producao, operacao cross-tenant implicita e proibida
- tenant explicito deve ser informado quando necessario
- a ausencia de tenant em rota tenant-scoped e falha de seguranca

## Criterio de aceite
Um modulo so e considerado tenant-aware completo quando passar no checklist operacional oficial.
