import type { Dds } from '@/services/ddsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawDdsBlueprint,
  drawPageBackground,
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
  drawPageBackground(ctx);
  const code = buildDocumentCode('DDS', dds.id || dds.tema, dds.data);
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
