# DDS Migration Forensics

Data: 2026-08-16. Escopo isolado de teste; nenhuma migration `down`, drop ou alteração em produção foi executada.

## Resultado

O rebuild limpo do runner oficial foi executado em `sgs_loadtest_rebuild_20260816_299` na VPS de testes. O banco foi criado vazio e recebeu 299 migrations, 135 tabelas públicas e 261 policies públicas. As quatro tabelas DDS críticas (`dds`, `dds_participants`, `signatures` e `forensic_trail_events`) foram criadas com RLS habilitado e FORCE.

Pós-condição SQL confirmada:

```text
migrations: 299
public tables: 135
public policies: 261
critical DDS tables: 4/4
latest: 1709000000374, 1709000000375, 1709000000376, 1709000000377
```

O banco temporário permanece preservado para inspeção posterior. O seed de carga não foi executado nele porque os scripts possuem guarda deliberada que exige exatamente `DATABASE_NAME=sgs_loadtest`; os fluxos HTTP sintéticos já haviam sido provados no banco de teste corrente, não neste banco vazio.

## DR restore do bundle 299

O dump do estado já reconciliado com 299 migrations foi restaurado em `sgs_loadtest_dr_20260816_299_final`, alvo descartável isolado. A validação pós-restore confirmou:

```text
migrations: 299
tables: 135
policies: 261
foreign keys: 255
indexes: 927
critical DDS RLS/FORCE: 4/4
epi governance columns from 0377: 7/7
sgs_app rolbypassrls: false
data: 12 DDS, 10 participants, 130 signatures, 1229 forensic events
```

Os privilégios de `sgs_app` foram preservados no dump/restore (`810` grants de tabela) e a matriz RLS foi executada com o papel de aplicação: same-tenant permitiu CRUD em transação; cross-tenant e contexto ausente retornaram zero/deny; o insert cross/missing retornou `42501`; pós-contagens permaneceram `12/10/130`. A operação ocorreu apenas nos alvos sintéticos; não houve alteração em produção.

## Reconciliação de proveniência

| Fonte | Estado |
| --- | --- |
| Worktree local auditado | 299 arquivos de migration; finais 0374 GDPR, 0375 APR integrity, 0376 forensic RLS e 0377 EPI/PDF |
| VPS/artefato reconciliado | 0374/0375/0376 com SHA256 idêntico ao worktree; 0377 compilada e montada no runner efêmero |
| Banco limpo | 299 migrations aplicadas; latest `AddEpiAssignmentFinalPdfGovernance1709000000377` |
| DR final | dump/restore do estado 299 em `sgs_loadtest_dr_20260816_299_final`; 299 migrations e 7 colunas 0377 |

Conclusão: a fonte de verdade desta certificação é o conjunto local reconciliado de 299 migrations. O rebuild limpo, o restore DR 299, o type-check/build e a validação de RLS no papel de aplicação passaram. O provider externo e o Axe sem violações permanecem gates independentes e bloqueados; o workflow autenticado TST/Supervisor/Admin e o PDF final governado browser passaram.
