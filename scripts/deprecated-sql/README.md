# Scripts SQL Deprecados

Estes arquivos foram criados durante a fase inicial do projeto e **não precisam ser executados**.
Foram movidos para cá para preservar histórico sem confundir o runner de migrations.

## Por que estão deprecados?

| Arquivo | Motivo |
|---|---|
| `add-pdf-file-key-to-pts.sql` | Coberto por `1709000000001-add-pdf-columns-to-modules.ts` (`pts` está na lista de tabelas) |
| `add-performance-indexes.sql` | Coberto por `1709000000023-performance-indexes.ts`, `1709000000116-bank-integrity-hardening.ts` e `1709000000124-align-identity-session-schema.ts` |
| `add-critical-indexes.sql` | Índices de `company_id` cobertos por `1709000000023`; notificações por `1709000000097`; o restante usa nomes de tabelas genéricos (`documents`, `sessions`) que não existem no schema final |

## O que executar no Neon em produção?

Apenas o comando padrão de migrations:

```bash
npm run migration:run
```

O Render executa isso automaticamente via `preDeployCommand` no `render.yaml`.
