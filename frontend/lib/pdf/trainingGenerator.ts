import type { Training } from '@/services/trainingsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawPageBackground,
  drawTrainingBlueprint,
  formatDateTime,
} from '@/lib/pdf-system';

type PdfOptions = { save?: boolean; output?: 'base64' };

export async function generateTrainingPdf(
  training: Training,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createPdfContext(doc, 'training');
  const code = buildDocumentCode('TRN', training.id || training.nr_codigo || training.nome);
  drawPageBackground(ctx);
  await drawTrainingBlueprint(ctx, autoTable, training, signatures, code, buildValidationUrl(code));
  applyFooterGovernance(ctx, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = buildPdfFilename('TREINAMENTO', `${training.nome}_${training.user?.nome ?? 'colaborador'}`, training.data_conclusao);
  if (options?.save === false && options?.output === 'base64') {
    const docOutput = doc as unknown as { output: (type: 'datauri' | 'dataurl') => string };
    return { base64: pdfDocToBase64(docOutput), filename };
  }
  doc.save(filename);
}
