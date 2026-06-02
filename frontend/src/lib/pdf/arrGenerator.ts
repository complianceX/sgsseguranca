import type { Arr } from '@/services/arrsService';
import { pdfDocToBase64, type PdfOutputDoc } from './pdfBase64';
import { fetchImageAsDataUrl } from './pdfFile';
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawArrBlueprint,
  formatDateTime,
  sanitize,
} from '@/lib/pdf-system';

type PdfOptions = {
  save?: boolean;
  output?: 'base64';
  draftWatermark?: boolean;
};

export async function generateArrPdf(
  arr: Arr,
  options?: PdfOptions,
): Promise<string | void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createPdfContext(doc, 'operational');
  const code =
    arr.document_code || buildDocumentCode('ARR', arr.id || arr.titulo, arr.data);

  const logoUrl = arr.company?.logo_url ? await fetchImageAsDataUrl(arr.company.logo_url) : null;

  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: 'ANÁLISE DE RISCO RÁPIDA',
    subtitle:
      'Registro simplificado para formalização de condição observada, risco e ação imediata em campo',
    code,
    date: arr.data,
    status: sanitize(arr.status),
    version: '1',
    company: sanitize(arr.company?.razao_social || arr.company_id),
    site: sanitize(arr.site?.nome || arr.site_id),
    logoUrl,
  });

  await drawArrBlueprint(
    ctx,
    autoTable,
    arr,
    code,
    buildValidationUrl(code, null, {
      module: 'arr',
    }),
  );

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(arr.pdf_generated_at || new Date().toISOString()),
    issuer: arr.emitted_by?.nome,
    draft: options?.draftWatermark ?? false,
  });

  const filename = buildPdfFilename('ARR', sanitize(arr.titulo), arr.data);
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as PdfOutputDoc;
    return pdfDocToBase64(docOutput);
  }

  doc.save(filename);
}
