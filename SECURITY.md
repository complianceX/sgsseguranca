# Security Policy

O SGS lida com dados pessoais e operacionais sensiveis. Vulnerabilidades devem ser tratadas de forma privada e responsavel.

## Reportando vulnerabilidades

Nao abra issue publica para reportar vulnerabilidade.

Use uma das opcoes abaixo:

1. GitHub Security Advisory, pela aba **Security** do repositorio.
2. Canal privado direto com o mantenedor.

Inclua, sempre que possivel:

- superficie afetada: backend, frontend, worker, banco, storage, IA ou infra;
- passos de reproducao;
- impacto tecnico e impacto em negocio;
- evidencias redigidas: `requestId`, `traceId`, timestamps, status codes e logs sem PII;
- indicacao se envolve boundary de tenant, RLS, `x-company-id`, auth/session ou permissao.

## O que nao enviar publicamente

- CPF, dados medicos, documentos pessoais ou dados de trabalhadores;
- tokens, cookies, chaves ou segredos;
- dumps de banco;
- payloads completos de tenants reais;
- screenshots com informacao pessoal identificavel.

## Versoes suportadas

O sistema e mantido em producao. Correcoes de seguranca sao aplicadas a partir da branch `main` e priorizadas conforme impacto em confidencialidade, integridade, disponibilidade, LGPD e isolamento por tenant.

## Prioridade de resposta

- Critico: exposicao cross-tenant, bypass de auth/RBAC, vazamento de PII, execucao remota ou segredo exposto.
- Alto: escalada de privilegio, falha de isolamento, write indevido, bypass de fluxo sensivel.
- Medio: informacao sensivel em logs, validacao insuficiente, degradacao operacional exploravel.
- Baixo: hardening, inconsistencias de configuracao ou defesa em profundidade.
