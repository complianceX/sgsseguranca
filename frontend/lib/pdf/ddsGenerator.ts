import type { Dds } from '@/services/ddsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  decorateCurrentPage,
  drawDdsBlueprint,
  drawDocumentHeader,
  formatDateTime,
  sanitize,
} from '@/lib/pdf-system';

type PdfOptions = { save?: boolean; output?: 'base64' };

export async function generateDdsPdf(
  dds: Dds,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<string | void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createPdfContext(doc, 'operational');
  const code = buildDocumentCode('DDS', dds.id || dds.tema, dds.data);
  const renderHeader = () => {
    drawDocumentHeader(ctx, {
      title: "RELATORIO DDS",
      subtitle: "Dialogo Diario de Seguranca com rastreabilidade operacional",
      code,
      date: dds.data,
      status: sanitize(dds.status),
      version: "1",
      company: sanitize(dds.company?.razao_social || dds.company_id),
      site: sanitize(dds.site?.nome || dds.site_id),
    });
    return ctx.y;
  };

  ctx.decoratePage = renderHeader;
  ctx.y = decorateCurrentPage(ctx);

  await drawDdsBlueprint(ctx, autoTable, dds, signatures, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename('DDS', sanitize(dds.tema), dds.data);
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as { output: (type: 'datauri' | 'dataurl') => string };
    return pdfDocToBase64(docOutput);
  }
  doc.save(filename);
}
