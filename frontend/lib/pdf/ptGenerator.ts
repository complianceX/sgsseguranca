import type { Pt } from '@/services/ptsService';
import type { Signature } from '@/services/signaturesService';
import { pdfDocToBase64 } from './pdfBase64';

type PdfOptions = { save?: boolean; output?: 'base64' };

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('pt-BR');
}

function sanitize(text?: string | null): string {
  return text || '-';
}

function checkbox(value: boolean): string {
  return value ? '[X]' : '[ ]';
}

export async function generatePtPdf(
  pt: Pt,
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
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PERMISSÃO DE TRABALHO (PT)', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº ${pt.numero} — ${sanitize(pt.status)}`, pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(pt.titulo), margin, y);
  y += 8;

  // Metadata
  const meta: [string, string][] = [
    ['Nº PT', sanitize(pt.numero)],
    ['Status', sanitize(pt.status)],
    ['Responsável', sanitize(pt.responsavel?.nome)],
    ['Site', sanitize(pt.site?.nome)],
    ['Início', formatDate(pt.data_hora_inicio)],
    ['Fim', formatDate(pt.data_hora_fim)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(240, 253, 250);
  doc.rect(margin, y, contentW, 22, 'F');
  doc.setDrawColor(153, 246, 228);
  doc.rect(margin, y, contentW, 22);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 65), xBase + 24, yRow + 4);
  });
  y += 22 + 6;

  // Tipos de trabalho
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 118, 110);
  doc.text('Tipos de Trabalho Envolvidos', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const tipos = [
    ['Trabalho em Altura', pt.trabalho_altura],
    ['Espaço Confinado', pt.espaco_confinado],
    ['Trabalho a Quente', pt.trabalho_quente],
    ['Eletricidade', pt.eletricidade],
    ['Escavação', pt.escavacao],
  ] as [string, boolean][];

  tipos.forEach((tipo, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const xPos = margin + col * (contentW / 3);
    doc.text(`${checkbox(tipo[1])} ${tipo[0]}`, xPos, y + row * 6);
  });
  y += Math.ceil(tipos.length / 3) * 6 + 6;

  // Descrição
  if (pt.descricao) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text('Descrição', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(pt.descricao, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 5;
  }

  // Executantes
  if (pt.executantes && pt.executantes.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text(`Executantes (${pt.executantes.length})`, margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Nome']],
      body: pt.executantes.map((e, idx) => [String(idx + 1), sanitize(e.nome)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: { 0: { cellWidth: 12 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Checklists por tipo
  const checklists: [string, typeof pt.trabalho_altura_checklist][] = [
    ['Trabalho em Altura', pt.trabalho_altura_checklist],
    ['Trabalho Elétrico', pt.trabalho_eletrico_checklist],
    ['Trabalho a Quente', pt.trabalho_quente_checklist],
    ['Espaço Confinado', pt.trabalho_espaco_confinado_checklist],
    ['Escavação', pt.trabalho_escavacao_checklist],
  ];

  for (const [titulo, items] of checklists) {
    if (!items || items.length === 0) continue;
    if (y > 200) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text(`Checklist: ${titulo}`, margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Pergunta', 'Resposta', 'Justificativa']],
      body: items.map((item) => [sanitize(item.pergunta), sanitize(item.resposta), sanitize(item.justificativa)]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 25 } },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // Signatures
  if (signatures.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
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
    doc.text(`PT Nº ${pt.numero} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `PT_${pt.numero}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
