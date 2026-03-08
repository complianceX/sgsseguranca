import type { Checklist } from '@/services/checklistsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';
import {
  applyFooter,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  drawBadge,
  drawHeader,
  drawInfoCard,
  drawModernTable,
  drawSignatureCard,
  drawValidationCard,
  formatDate,
  formatDateTime,
  sanitize,
} from './pdfLayout';

type PdfOptions = { save?: boolean; output?: 'base64' };

function statusLabel(status: boolean | string | undefined): string {
  if (status === true || status === 'ok' || status === 'sim' || status === 'conforme') return 'Conforme';
  if (status === false || status === 'nok' || status === 'nao') return 'Não Conforme';
  if (status === 'na') return 'N/A';
  return sanitize(status as string);
}

function isConforme(status: unknown): boolean {
  return status === true || status === 'ok' || status === 'sim' || status === 'conforme';
}

function isNaoConforme(status: unknown): boolean {
  return status === false || status === 'nok' || status === 'nao';
}

export async function generateChecklistPdf(
  checklist: Checklist,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const code = buildDocumentCode('CHK', (checklist as any).id || checklist.titulo);
  const totalItems = checklist.itens?.length ?? 0;
  const conformes = checklist.itens?.filter((item) => isConforme((item as any).status)).length ?? 0;
  const naoConformes = checklist.itens?.filter((item) => isNaoConforme((item as any).status)).length ?? 0;

  let y = drawHeader(doc, {
    title: 'CHECKLIST DE INSPEÇÃO',
    subtitle: sanitize(checklist.categoria),
    date: formatDate(checklist.data),
    code,
    logoText: 'CX',
  });

  y = drawBadge(doc, y, 'Status geral', sanitize(checklist.status), naoConformes > 0 ? 'secondary' : 'accent');
  y = drawInfoCard(doc, y, 'Informações do checklist', [
    { label: 'Título', value: sanitize(checklist.titulo) },
    { label: 'Categoria', value: sanitize(checklist.categoria) },
    { label: 'Data', value: formatDate(checklist.data) },
    { label: 'Inspetor', value: sanitize(checklist.inspetor?.nome) },
    { label: 'Site / Obra', value: sanitize(checklist.site?.nome) },
    { label: 'Equipamento', value: sanitize(checklist.equipamento || checklist.maquina) },
    { label: 'Periodicidade', value: sanitize(checklist.periodicidade) },
    { label: 'Indicadores', value: `${conformes}/${totalItems} conformes` },
  ]);

  if (checklist.itens?.length) {
    y = drawModernTable(
      doc,
      autoTable,
      y,
      `Itens avaliados (${checklist.itens.length})`,
      [['#', 'Item', 'Tipo', 'Status', 'Observação']],
      checklist.itens.map((item, index) => [
        index + 1,
        sanitize(item.item),
        sanitize(item.tipo_resposta?.replace('_', '/') ?? 'Sim/Não'),
        statusLabel(item.status),
        sanitize(item.observacao),
      ]),
      {
        didParseCell: (data: any) => {
          if (data.column.index === 3 && data.section === 'body') {
            const value = String(data.cell.raw || '');
            if (value === 'Conforme') data.cell.styles.textColor = [5, 150, 105];
            if (value === 'Não Conforme') data.cell.styles.textColor = [220, 38, 38];
          }
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 64 },
          2: { cellWidth: 26 },
          3: { cellWidth: 28 },
        },
      },
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

  const filename = buildPdfFilename('CHECKLIST', checklist.titulo, checklist.data);
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
