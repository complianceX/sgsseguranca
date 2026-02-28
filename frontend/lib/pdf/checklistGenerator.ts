import type { Checklist } from '@/services/checklistsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';

type PdfOptions = { save?: boolean; output?: 'base64' };

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

function sanitize(text?: string | null): string {
  return text || '-';
}

function statusLabel(status: boolean | string | undefined): string {
  if (status === true || status === 'ok' || status === 'sim' || status === 'conforme') return '✓ Conforme';
  if (status === false || status === 'nok' || status === 'nao') return '✗ Não Conforme';
  if (status === 'na') return '— N/A';
  return sanitize(String(status));
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
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CHECKLIST DE INSPEÇÃO', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitize(checklist.categoria), pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(checklist.titulo), margin, y);
  y += 8;

  // Metadata
  const meta: [string, string][] = [
    ['Data', formatDate(checklist.data)],
    ['Inspetor', sanitize(checklist.inspetor?.nome)],
    ['Site', sanitize(checklist.site?.nome)],
    ['Status Geral', sanitize(checklist.status)],
    ['Equipamento', sanitize(checklist.equipamento || checklist.maquina)],
    ['Periodicidade', sanitize(checklist.periodicidade)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(245, 243, 255);
  doc.rect(margin, y, contentW, 22, 'F');
  doc.setDrawColor(221, 214, 254);
  doc.rect(margin, y, contentW, 22);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(91, 33, 182);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 55), xBase + 26, yRow + 4);
  });
  y += 22 + 6;

  // Items table
  if (checklist.itens && checklist.itens.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(124, 58, 237);
    doc.text('Itens do Checklist', margin, y);
    y += 4;

    const totalItems = checklist.itens.length;
    const conformes = checklist.itens.filter((it) => isConforme((it as any).status)).length;
    const naoConformes = checklist.itens.filter((it) => isNaoConforme((it as any).status)).length;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Total: ${totalItems} itens • Conformes: ${conformes} • Não Conformes: ${naoConformes}`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Item', 'Tipo Resposta', 'Status', 'Observação']],
      body: checklist.itens.map((item, idx) => [
        String(idx + 1),
        sanitize(item.item),
        sanitize(item.tipo_resposta?.replace('_', '/') ?? 'Sim/Não'),
        statusLabel(item.status),
        sanitize(item.observacao),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 65 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.section === 'body') {
          const val = String(data.cell.raw || '');
          if (val.startsWith('✓')) data.cell.styles.textColor = [5, 150, 105];
          else if (val.startsWith('✗')) data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Signatures
  if (signatures.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(124, 58, 237);
    doc.text('Assinaturas', margin, y);
    y += 6;

    const sigPerRow = 3;
    const sigW = contentW / sigPerRow;
    signatures.forEach((sig, idx) => {
      const col = idx % sigPerRow;
      const xSig = margin + col * sigW;
      if (col === 0 && idx > 0) y += 30;
      if (y > 260) { doc.addPage(); y = margin; }
      try {
        if (sig.signature_data && sig.signature_data.startsWith('data:image')) {
          doc.addImage(sig.signature_data, 'PNG', xSig + 2, y, sigW - 8, 18);
        }
      } catch { /* skip */ }
      doc.setDrawColor(180, 180, 180);
      doc.line(xSig + 2, y + 20, xSig + sigW - 6, y + 20);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(sanitize(sig.type), xSig + 2, y + 24);
      doc.text(formatDate(sig.signed_at || sig.created_at), xSig + 2, y + 28);
    });
    y += 32;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Checklist: ${checklist.titulo} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `Checklist_${checklist.titulo.replace(/\s+/g, '_').substring(0, 30)}_${formatDate(checklist.data).replace(/\//g, '-')}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
