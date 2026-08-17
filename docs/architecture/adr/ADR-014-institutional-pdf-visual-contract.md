# ADR-014 - Contrato visual institucional dos PDFs

## Status

Aceito - migração incremental em andamento.

## Contexto

O SGS possui PDFs oficiais gerados por caminhos diferentes: `jsPDF` no backend, HTML/Puppeteer no backend e previews no frontend. Isso permitiu que documentos novos fossem seguros e governados, mas visualmente divergentes entre si.

## Decisão

Todo PDF oficial ou preview identificável do SGS deve seguir o contrato visual institucional:

- paleta baseada em `pageBg`, `surface`, `brand`, `brandStrong`, `info`, `border` e estados semânticos;
- cabeçalho institucional com título, subtítulo, identificador e status;
- cartões de Empresa, Site/Obra e Data de referência quando o contexto existir;
- títulos de seção e campos em cartões consistentes;
- rodapé SGS com identificação, paginação e estado de governança;
- tipografia, espaçamento, margens e hierarquia compatíveis com `frontend/src/lib/pdf-system`;
- geração oficial no backend, com tenant resolvido no servidor, sanitização, hash e registro documental;
- nenhuma chamada de rede externa durante a renderização e nenhum dado bruto de assinatura no documento.

O frontend `frontend/src/lib/pdf-system` continua sendo a referência visual. Para renderizadores HTML/Puppeteer no backend, o contrato é exposto por `backend/src/shared/services/pdf-institutional-template.ts`. Para renderizadores `jsPDF` no backend, `backend/src/shared/services/pdf-branding.ts` deve ser mantido compatível com os mesmos tokens.

## Consequências

Novos módulos não podem criar CSS, cores, cabeçalho ou rodapé próprios para PDF oficial. A migração dos geradores existentes é incremental e exige golden PDF, renderização visual e teste de segurança antes do aceite.

Diferenças funcionais justificadas por densidade documental, orientação paisagem ou galerias fotográficas podem alterar o corpo do documento, mas não a identidade institucional, governança, tenant, segurança ou rodapé.

## Estado da migração

| Gerador | Caminho | Estado |
|---|---|---|
| EPI | `backend/src/modules/epi-assignments` | Migrado |
| ARR | `backend/src/modules/arrs` | Migrado |
| Checklist/Dossiê | `backend/src/shared/services/pdf-branding.ts` | Compatível, validar golden |
| APR | `backend/src/modules/aprs/services/aprs-pdf.service.ts` | Revisão visual pendente |
| Não conformidade | `backend/src/modules/nonconformities/services/nonconformities-pdf.service.ts` | Revisão visual pendente |
| Relatório fotográfico | `backend/src/modules/photographic-reports` | Revisão visual pendente |
