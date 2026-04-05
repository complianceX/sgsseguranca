import type { Dds } from '@/services/ddsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64, type PdfOutputDoc } from './pdfBase64';
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawDdsBlueprint,
  formatDateTime,
  sanitize,
} from '@/lib/pdf-system';

type PdfOptions = {
  save?: boolean;
  output?: 'base64';
  draftWatermark?: boolean;
};

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
  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: "DIALOGO DIARIO DE SEGURANCA",
    subtitle: "Documento oficial de alinhamento preventivo e participacao operacional",
    code,
    date: dds.data,
    status: sanitize(dds.status),
    version: "1",
    company: sanitize(dds.company?.razao_social || dds.company_id),
    site: sanitize(dds.site?.nome || dds.site_id),
  });

  await drawDdsBlueprint(ctx, autoTable, dds, signatures, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
    draft: options?.draftWatermark ?? true,
  });

  const filename = buildPdfFilename('DDS', sanitize(dds.tema), dds.data);
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as PdfOutputDoc;
    return pdfDocToBase64(docOutput);
  }
  doc.save(filename);
}
