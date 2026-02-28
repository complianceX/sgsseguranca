import type { Apr } from '@/services/aprsService';
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

export async function generateAprPdf(
  apr: Apr,
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

  // Header banner
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ANÁLISE PRELIMINAR DE RISCO (APR)', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº ${sanitize(apr.numero)} • Versão ${apr.versao ?? 1}`, pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(apr.titulo), margin, y);
  y += 7;

  // Metadata grid
  const meta: [string, string][] = [
    ['Site / Obra', sanitize(apr.site?.nome)],
    ['Empresa', sanitize(apr.company?.razao_social)],
    ['Elaborador', sanitize(apr.elaborador?.nome)],
    ['Data Início', formatDate(apr.data_inicio)],
    ['Data Fim', formatDate(apr.data_fim)],
    ['Status', sanitize(apr.status)],
  ];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(239, 246, 255);
  doc.rect(margin, y, contentW, 6 * 6 + 4, 'F');
  doc.setDrawColor(219, 234, 254);
  doc.rect(margin, y, contentW, 6 * 6 + 4);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value, xBase + 28, yRow + 4);
  });
  y += 6 * 6 + 4 + 6;

  // Descrição
  if (apr.descricao) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Descrição', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(sanitize(apr.descricao), contentW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  // Risk Items Table
  if (apr.risk_items && apr.risk_items.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Itens de Risco', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Atividade', 'Agente / Perigo', 'Prob.', 'Sev.', 'Score', 'Categoria', 'Medidas de Prevenção']],
      body: apr.risk_items.map((item, idx) => [
        String(idx + 1),
        sanitize(item.atividade),
        sanitize(item.agente_ambiental || item.condicao_perigosa),
        String(item.probabilidade ?? '-'),
        String(item.severidade ?? '-'),
        String(item.score_risco ?? '-'),
        sanitize(item.categoria_risco),
        sanitize(item.medidas_prevencao),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 10 },
        4: { cellWidth: 10 },
        5: { cellWidth: 12 },
        6: { cellWidth: 22 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Participants
  if (apr.participants && apr.participants.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Participantes', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Nome']],
      body: apr.participants.map((p) => [sanitize(p.nome)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Signatures
  if (signatures.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
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
      } catch { /* skip invalid image */ }
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
    doc.text(`APR Nº ${apr.numero} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `APR_${apr.numero}_v${apr.versao ?? 1}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
