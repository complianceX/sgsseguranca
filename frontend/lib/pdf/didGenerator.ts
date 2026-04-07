import type { Did } from '@/services/didsService';
import { pdfDocToBase64, type PdfOutputDoc } from './pdfBase64';
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawDidBlueprint,
  formatDateTime,
  sanitize,
} from '@/lib/pdf-system';

type PdfOptions = {
  save?: boolean;
  output?: 'base64';
  draftWatermark?: boolean;
};

export async function generateDidPdf(
  did: Did,
  options?: PdfOptions,
): Promise<string | void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createPdfContext(doc, 'operational');
  const code = buildDocumentCode('DID', did.id || did.titulo, did.data);

  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: 'DIÁLOGO DO INÍCIO DO DIA',
    subtitle: 'Documento operacional de alinhamento da atividade programada para o início do turno',
    code,
    date: did.data,
    status: sanitize(did.status),
    version: '1',
    company: sanitize(did.company?.razao_social || did.company_id),
    site: sanitize(did.site?.nome || did.site_id),
  });

  await drawDidBlueprint(
    ctx,
    autoTable,
    did,
    code,
    buildValidationUrl(code),
  );

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
    draft: options?.draftWatermark ?? false,
  });

  const filename = buildPdfFilename('DID', sanitize(did.titulo), did.data);
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as PdfOutputDoc;
    return pdfDocToBase64(docOutput);
  }

  doc.save(filename);
}
