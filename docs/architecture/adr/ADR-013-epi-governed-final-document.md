# ADR-013 — Documento final governado da ficha de entrega de EPI

**Status:** Aceito para implementação
**Data:** 2026-08-16

## Contexto

O módulo de fichas de EPI registra entrega, trabalhador, equipamento, CA,
validade e assinatura eletrônica, mas ainda não possuía um documento final
gerado pelo backend e registrado no catálogo documental. Um PDF criado apenas
no navegador não é evidência suficiente de integridade, tenant ou autoria.

## Decisão

O artefato oficial será a **Ficha de Entrega de EPI**. Ele será um snapshot da
entrega no momento da emissão e conterá, no mínimo:

- identificador da ficha e código documental;
- empresa e obra resolvidas pelo tenant autenticado;
- trabalhador e equipamento;
- quantidade, CA, validade do CA e data/hora de entrega;
- observações operacionais;
- nome do signatário, tipo de assinatura, hash da assinatura, carimbo de
  tempo e autoridade do carimbo.

O PDF será produzido exclusivamente no backend pelo `PdfService`, com HTML
escapado e sem recursos de rede. O arquivo será enviado ao storage governado,
terá SHA-256 calculado server-side e será registrado pelo
`DocumentGovernanceService` no módulo `epi`. O cliente apenas solicita a
emissão e recebe a resposta canônica de acesso.

## Segurança e LGPD

- `company_id` e `site_id` não serão autoridade do browser; o serviço resolve
  o escopo do tenant/site autenticado.
- A ficha só será emitida para um registro que o usuário consegue consultar no
  escopo atual.
- O PDF não incorporará `signature_data` bruto. A prova documental usará hash,
  carimbo, autoridade e nome do signatário, reduzindo exposição de biometria,
  imagem ou material sensível.
- O download usará URL temporária emitida pelo storage governado e permanecerá
  sujeito à autorização do tenant.
- O documento emitido não poderá ser substituído por uma nova versão pela
  mesma rota. Alterações posteriores de ciclo de vida (devolução/substituição)
  permanecem eventos separados e não reescrevem o snapshot da entrega.
- Falha no upload, hash ou registro relacional remove o arquivo compensatório e
  falha fechada; não haverá PDF oficial parcialmente registrado.

## Consequências

Será necessária uma migração compatível adicionando os metadados do PDF à
ficha. O Golden EPI deverá ser gerado pelo mesmo serviço usado em produção e
validar texto mínimo, integridade, tenant, ausência de `signature_data` bruto
e acesso cross-tenant negado.
