import type { Dds } from '@/services/ddsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfDoc,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawModernTable,
  drawSignatureCard,
  drawTextCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from './pdfLayout';

type PdfOptions = { save?: boolean; output?: 'base64' };

export async function generateDdsPdf(
  dds: Dds,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<string | void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { margin } = createPdfDoc();
  const code = buildDocumentCode('DDS', (dds as any).id || dds.tema);
  let y = drawHeader(doc, {
    title: 'RELATÓRIO DDS',
    subtitle: 'DIÁLOGO DIÁRIO DE SEGURANÇA',
    date: formatDate(dds.data),
    code,
    logoText: 'GST',
  });

  y = drawBadge(doc, y, 'Tema DDS', sanitize(dds.tema), 'secondary');
  y = drawInfoCard(doc, y, 'Informações do DDS', [
    { label: 'Data', value: formatDate(dds.data) },
    { label: 'Facilitador', value: sanitize(dds.facilitador?.nome) },
    { label: 'Site / Obra', value: sanitize(dds.site?.nome) },
    { label: 'Empresa', value: sanitize(dds.company?.razao_social) },
  ]);
  y = drawTextCard(doc, y, 'Conteúdo do DDS', dds.conteudo);

  if (dds.participants?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      `Participantes (${dds.participants.length})`,
      [['#', 'Nome']],
      dds.participants.map((participant, index) => [index + 1, sanitize(participant.nome)]),
      { columnStyles: { 0: { cellWidth: 12 } } },
    );
  }

  y = drawSignatureCard(
    doc,
    y,
    signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize((signature as any).user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
  );

  y = await drawValidationCard(doc, y, code, buildValidationUrl(code));
  applyFooter(doc, { code, generatedAt: formatDateTime(new Date().toISOString()) });

  const filename = buildPdfFilename('DDS', sanitize(dds.tema), dds.data);
  if (options?.save === false && options?.output === 'base64') {
    return pdfDocToBase64(doc as any);
  }
  doc.save(filename);
}
