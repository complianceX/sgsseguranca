import type { Audit } from '@/services/auditsService';
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

export async function generateAuditPdf(
  audit: Audit,
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
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE AUDITORIA HSE', pageW / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitize(audit.tipo_auditoria), pageW / 2, 22, { align: 'center' });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(audit.titulo), margin, y);
  y += 8;

  // Metadata
  const meta: [string, string][] = [
    ['Data', formatDate(audit.data_auditoria)],
    ['Auditor', sanitize(audit.auditor?.nome)],
    ['Site', sanitize(audit.site?.nome)],
    ['Representantes', sanitize(audit.representantes_empresa)],
  ];

  doc.setFontSize(9);
  doc.setFillColor(236, 253, 245);
  doc.rect(margin, y, contentW, 4 * 7 + 4, 'F');
  doc.setDrawColor(167, 243, 208);
  doc.rect(margin, y, contentW, 4 * 7 + 4);

  meta.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const xBase = margin + col * (contentW / 2) + 3;
    const yRow = y + 2 + row * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(`${label}:`, xBase, yRow + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(value).substring(0, 70), xBase + 26, yRow + 4);
  });
  y += 4 * 7 + 4 + 6;

  // Objective
  const sections: [string, string | undefined][] = [
    ['Objetivo', audit.objetivo],
    ['Escopo', audit.escopo],
    ['Metodologia', audit.metodologia],
    ['Conclusão', audit.conclusao],
  ];

  for (const [label, content] of sections) {
    if (!content) continue;
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(label, margin, y);
    doc.setDrawColor(167, 243, 208);
    doc.line(margin + doc.getTextWidth(label) + 2, y, margin + contentW, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(content, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 5;
  }

  // Non-conformities table
  if (audit.resultados_nao_conformidades && audit.resultados_nao_conformidades.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('Não Conformidades', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Descrição', 'Requisito', 'Evidência', 'Classificação']],
      body: audit.resultados_nao_conformidades.map((nc) => [
        sanitize(nc.descricao),
        sanitize(nc.requisito),
        sanitize(nc.evidencia),
        sanitize(nc.classificacao),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [236, 253, 245] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Plano de ação
  if (audit.plano_acao && audit.plano_acao.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('Plano de Ação', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Item', 'Ação', 'Responsável', 'Prazo', 'Status']],
      body: audit.plano_acao.map((item) => [
        sanitize(item.item),
        sanitize(item.acao),
        sanitize(item.responsavel),
        sanitize(item.prazo),
        sanitize(item.status),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [236, 253, 245] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Auditoria: ${audit.titulo} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, 292);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, 292, { align: 'right' });
  }

  const filename = `Auditoria_${audit.titulo.replace(/\s+/g, '_').substring(0, 30)}_${formatDate(audit.data_auditoria).replace(/\//g, '-')}.pdf`;
  if (options?.save === false && options?.output === 'base64') {
    return { base64: pdfDocToBase64(doc as any), filename };
  }
  doc.save(filename);
}
