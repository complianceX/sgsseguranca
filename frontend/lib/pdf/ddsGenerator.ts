import type { Dds } from '@/services/ddsService';
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

// Note: returns raw base64 string (not object) when output === 'base64'
export async function generateDdsPdf(
  dds: Dds,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<string | void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DIÁLOGO DIÁRIO DE SEGURANÇA (DDS)', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(dds.data), pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title (Tema)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(dds.tema), margin, y);
  y += 8;

  // Metadata
  const meta: [string, string][] = [
    ['Data', formatDate(dds.data)],
    ['Facilitador', sanitize(dds.facilitador?.nome)],
    ['Site / Obra', sanitize(dds.site?.nome)],
    ['Empresa', sanitize(dds.company?.razao_social)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(255, 251, 235);
  doc.rect(margin, y, contentW, 16, 'F');
  doc.setDrawColor(253, 230, 138);
  doc.rect(margin, y, contentW, 16);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 70), xBase + 22, yRow + 4);
  });
  y += 16 + 6;

  // Conteúdo
  if (dds.conteudo) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text('Conteúdo do DDS', margin, y);
    doc.setDrawColor(253, 230, 138);
    doc.line(margin + doc.getTextWidth('Conteúdo do DDS') + 2, y, margin + contentW, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(dds.conteudo, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 8;
  }

  // Participants
  if (dds.participants && dds.participants.length > 0) {
    if (y > 200) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`Participantes (${dds.participants.length})`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Nome']],
      body: dds.participants.map((p, idx) => [String(idx + 1), sanitize(p.nome)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      columnStyles: { 0: { cellWidth: 12 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Signatures
  if (signatures.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
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
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`DDS: ${dds.tema} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `DDS_${dds.tema.replace(/\s+/g, '_').substring(0, 30)}_${formatDate(dds.data).replace(/\//g, '-')}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return pdfDocToBase64(doc as any);
  }
  doc.save(filename);
}
