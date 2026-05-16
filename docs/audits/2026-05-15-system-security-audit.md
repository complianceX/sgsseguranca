# SGS - Auditoria de Seguranca do Sistema

Data: 2026-05-15  
Escopo: `backend`, `frontend`, `render.yaml`, controles de storage, auth, tenant isolation e superfícies de PDF/URL.

## Resumo Executivo

Fiz uma varredura focada nas superfícies de maior risco do SGS. O sistema já tem controles fortes de base em vários pontos, mas encontrei 2 problemas relevantes:

1. O endpoint de verificação de integridade de PDF consulta hashes globalmente e devolve metadados de documento sem impor tenant no endpoint.
2. O workspace de relatórios fotográficos ainda abre `download_url` cru no browser e o renderer de PDF também usa a URL sem passar pelo mesmo helper de allowlist usado em outras partes do frontend.

Não encontrei, nesta passada, um bypass crítico generalizado de tenant/RLS ou um reset de segurança óbvio no backend principal.

## Metodologia

- Leitura dirigida por superfícies: auth, tenant, PDF, storage, URLs externas, admin e relatórios.
- Cruzamento com o relatório consolidado já existente no repo e com o estado atual do código.
- Priorização por impacto em exfiltração, cross-tenant e abuso de sinks de URL.

## Findings

### 1. Verificação de PDF faz lookup global por hash e expõe metadados de outro tenant

- Severidade: alta
- Status: confirmado
- Arquivos:
  - [backend/src/auth/controllers/pdf-security.controller.ts](../../backend/src/auth/controllers/pdf-security.controller.ts:133)
  - [backend/src/common/services/pdf.service.ts](../../backend/src/common/services/pdf.service.ts:190)
- Falha:
  - `verifyPdf()` aceita qualquer `hash` com `@Authorize('can_view_signatures')` e chama `pdfService.verify(hash)` sem `TenantGuard`.
  - `PdfService.verify()` busca o registro por `hash` globalmente e, se existir, devolve `originalName`, `signedAt` e `document.fileKey/documentCode`.
- Vetor de risco:
  - Um usuário autenticado com permissão de visualização de assinaturas pode consultar hashes fora do próprio tenant e obter metadados internos de documentos de outro tenant.
  - O `fileKey` é especialmente sensível porque revela estrutura interna de storage/document registry.
- Correção recomendada:
  - Amarrar a verificação ao tenant do request ou ao tenant explicitamente vinculado ao documento.
  - Filtrar a lookup inicial por `company_id`/`tenantId` e remover `fileKey` do contrato público, a menos que haja necessidade operacional comprovada.
  - Se o objetivo for validação pública, mover para um fluxo tokenizado com escopo explícito, como o padrão já usado em outros portais públicos.

### 2. Relatórios fotográficos usam URL externa crua em sink de browser e no renderer de PDF

- Severidade: média
- Status: confirmado como sink; impacto final depende da garantia de origem do `download_url`
- Arquivos:
  - [frontend/app/dashboard/photographic-reports/components/PhotographicReportWorkspace.tsx](../../frontend/app/dashboard/photographic-reports/components/PhotographicReportWorkspace.tsx:768)
  - [backend/src/photographic-reports/photographic-reports.renderer.ts](../../backend/src/photographic-reports/photographic-reports.renderer.ts:155)
- Falha:
  - No frontend, `window.open(entry.download_url, "_blank", "noopener,noreferrer")` é usado diretamente quando `download_url` existe.
  - No renderer do PDF, `image.data_url || image.download_url || image.image_url` é injetado como `src` do `<img>` sem passar pelo helper central de allowlist de URLs.
- Vetor de risco:
  - O padrão do projeto já centraliza proteção de URL em helpers de allowlist, mas esse fluxo os ignora.
  - Se a origem do `download_url` for comprometida ou se a camada de storage/regra de assinatura aceitar valor inesperado, o browser do usuário ou o processo de geração de PDF podem buscar conteúdo fora da política esperada.
- Correção recomendada:
  - Trocar o `window.open` direto pelo helper de URL segura já usado em outros módulos.
  - No renderer, normalizar fontes de imagem para um tipo permitido explicitamente e rejeitar qualquer URL fora da allowlist.
  - Se o backend já garante URL assinada de storage, documentar essa garantia e testar isso de forma explícita para evitar regressão.

## Riscos Residuais

- O sistema possui muitos controles corretos de tenant, RBAC, MFA e hardening de storage, então o risco mais relevante nesta passada ficou concentrado em duas bordas de dados/documentos.
- Se você quiser, a próxima fase deve ser correção do achado 1 primeiro, porque ele mistura autorização e vazamento de metadados.
