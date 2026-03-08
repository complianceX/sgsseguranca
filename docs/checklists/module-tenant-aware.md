# Checklist: Tenant-Aware Module

Um modulo tenant-aware so pode ser considerado pronto quando todos os itens abaixo forem atendidos.

## Entidade e banco
- [ ] possui `company_id` obrigatorio
- [ ] possui FK para `companies`
- [ ] possui indice por `company_id`
- [ ] possui regras de delete/archive consistentes

## API e DTO
- [ ] DTO nao aceita `company_id` vindo do client
- [ ] controller nao usa tenant manual do request quando o `TenantService` ja fornece contexto
- [ ] responses nao vazam dados de outro tenant

## Regras de aplicacao
- [ ] `company_id` e preenchido no backend
- [ ] queries sao tenant-scoped
- [ ] exports sao tenant-scoped
- [ ] analytics sao tenant-scoped
- [ ] jobs/eventos carregam `companyId`

## Cache e storage
- [ ] cache key inclui tenant
- [ ] caminho de arquivo inclui tenant
- [ ] download respeita tenant

## Seguranca e auditoria
- [ ] logs incluem `companyId`
- [ ] auditoria inclui `companyId`
- [ ] testes validam isolamento entre empresas
- [ ] super-admin exige tenant explicito quando a operacao e tenant-scoped
