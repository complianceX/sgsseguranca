# Security Policy

## Reporting a Vulnerability
Se voce encontrou uma vulnerabilidade, nao abra issue publica.

1. Use o Security Advisory do GitHub (aba Security do repositorio), ou
2. Envie um relato direto ao mantenedor (canal privado).

Inclua:
- Superficie afetada (backend, frontend, worker, infra)
- Passos de reproducao e impacto
- Evidencias (requestId, traceId, timestamps)
- Se envolve multi-tenancy (tenant boundary / RLS / `x-company-id`)

## Supported Versions
O sistema e mantido em producao. Correcoes de seguranca sao aplicadas na branch `main`.

