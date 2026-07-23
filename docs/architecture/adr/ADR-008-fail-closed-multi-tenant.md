# ADR-008: Estratégia Fail-Closed para Isolamento Multi-Tenant
Status: Accepted | Date: 2026-03-24

## Contexto
Em um produto SST multi-tenant, vazamento de dados entre empresas é risco crítico. O sistema precisa bloquear por padrão quando o contexto de tenant está ausente, inconsistente ou spoofado.

## Decisão
Adotamos fail-closed em toda a cadeia de autorização:

- `TenantMiddleware` valida `x-company-id` contra JWT (anti-spoofing)
- `TenantGuard` nega request sem contexto de tenant (exceto casos explícitos)
- RLS com `FORCE ROW LEVEL SECURITY` bloqueia leitura/escrita fora do tenant
- Rotas sensíveis usam padrão anti-oracle com `404` em acesso cross-tenant

### Operações cross-tenant de super-admin (fonte confiável, autorização e limites)

O bypass de tenant é a única exceção ao fail-closed e é fortemente restrito:

- **Fonte confiável:** o flag `isSuperAdmin` do contexto é derivado **no servidor**, a partir do papel do usuário no JWT validado (RBAC) — nunca de um header do cliente. O cliente não consegue se auto-declarar super-admin.
- **Autorização:** apenas o papel `ADMIN_GERAL`. Em produção, `ADMIN_GERAL` exige MFA (TOTP).
- **Limite de ativação:** o bypass de RLS só liga quando `isSuperAdmin && !companyId` (super-admin operando **sem** empresa selecionada). Requisições de tenant normais nunca recebem bypass, mesmo de um super-admin — ao selecionar uma empresa, ele opera dentro dela.
- **Enforcement no banco:** `is_super_admin()` (migration 1709000000346) só concede bypass se, além do flag de sessão, a conexão estiver autenticada com um papel membro de `sgs_rls_bypass` — conhecer/alterar a variável de sessão não é suficiente.
- **Operações cobertas:** login (busca de usuário por CPF sem tenant), exclusão LGPD de empresa/titular, trilha forense e jobs sem contexto de tenant. **Roadmap de hardening:** mover essas operações para uma conexão dedicada privilegiada (`sgs_admin`), permitindo remover o bypass do papel de runtime comum.
Testes e2e críticos reforçam a decisão:
- `backend/test/critical/multi-tenant-apr.e2e-spec.ts`
- `backend/test/critical/role-permissions.e2e-spec.ts`
- `backend/test/idor-security.e2e-spec.ts`
- `backend/test/critical/apr-lifecycle.e2e-spec.ts`

## Consequências (prós e contras)
Prós:
- Menor superfície de IDOR/BOLA
- Erro de configuração tende a bloquear acesso em vez de vazar dado
- Comportamento previsível para auditoria de segurança

Contras:
- Requer disciplina de contexto em jobs e integrações internas
- Pode gerar falsos bloqueios quando cliente não envia tenant corretamente
- Complexidade adicional para fluxos de super-admin

## Alternativas consideradas
- Fail-open em ausência de tenant
: rejeitado por risco de vazamento.
- Responder `403` em todo cross-tenant
: aumenta risco de enumeração de recursos; `404` foi preferido em rotas de negócio.
