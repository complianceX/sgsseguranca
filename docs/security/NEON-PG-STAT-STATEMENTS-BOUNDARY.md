# Neon `pg_stat_statements` — fronteira operacional

No Neon, a extensão `pg_stat_statements` pode ser owned por `neondb_owner`,
enquanto `pg_stat_statements` e `pg_stat_statements_info` permanecem owned por
`cloud_admin` com `SELECT` para `PUBLIC`. Esses domínios são independentes: a
auditoria deve provar separadamente o owner da extensão, o owner das relações,
o grantor dos ACLs, a ausência de membership privilegiado ou ACL direto para
`sgs_app`, e a impossibilidade do papel customer-manageable assumir
`cloud_admin`.

O controle obrigatório é comportamental: cada role vê suas próprias consultas,
roles diferentes não veem SQL/queryid umas das outras, sessões da mesma role
compartilham somente a visibilidade daquela role, literais sensíveis não são
persistidos porque o SQL da aplicação é parametrizado, e
`pg_stat_statements_reset()` é negado ao runtime. O resultado esperado para o
ACL inevitável é `MANAGED_PROVIDER_CONSTRAINT`, nunca uma supressão de finding.

A migration 0401 remove somente ACLs customer-manageable: `sgs_app` não recebe
SELECT direto e `sgs_admin` fica com SELECT direto apenas em
`pg_stat_statements`. Se owner, grantor, ACL PUBLIC, membership ou
comportamento divergir do contrato, o gate falha fechado. Não usar Cloudflare
CIDRs, `/0` ou uma faixa de rede como substituto dessa prova.
