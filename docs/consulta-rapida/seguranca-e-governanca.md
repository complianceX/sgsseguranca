# Seguranca e Governanca

## Tenant e company scoping

Essa e uma regra estrutural do sistema:

- toda operacao relevante precisa respeitar tenant/company
- backend e a fonte de verdade
- frontend pode refletir tenant atual, mas nao decide autorizacao sozinho

## RBAC

Autorizacao deve passar por:

- guards
- papeis
- permissoes
- contexto do usuario autenticado

Evite criar logica de permissao espalhada por string solta no frontend.

## Backend como autoridade final

Sempre que o fluxo envolver:

- lock
- assinatura
- storage
- video
- PDF final
- tenant

o backend precisa validar de novo.

## Locks documentais

Padrao esperado:

- frontend bloqueia experiencia de edicao
- backend bloqueia mutacao real
- excecao legitima deve ser pequena, explicita e auditavel

## Storage governado

Arquivos e evidencias relevantes nao devem depender de caminho local improvisado.

Esperado:

- storage key persistida
- acesso assinado quando necessario
- cleanup/compensacao em falha
- metadados auditaveis

## Trilha forense

Eventos criticos devem ir para trilha append-only.

Casos importantes:

- emissao final
- assinatura
- cancelamento
- upload governado
- remocao de artefato

## O que evitar

- confiar so no frontend para lock
- armazenar referencia solta sem storage governado
- criar bypass de permissao para "facilitar"
- usar `404` como contrato normal de ausencia documental
- fazer upload em modulo fora do escopo permitido

## Video governado

Suporte atual restrito a:

- `dds`
- `rdo`
- `inspection`

Se aparecer video em outro modulo, isso deve ser tratado como divergencia do escopo atual.
